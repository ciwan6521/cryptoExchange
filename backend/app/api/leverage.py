"""Leverage / futures trading API — USDT-margined positions."""

import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.leverage import LeveragePosition
from app.models.trading import TradingPair
from app.api.deps import get_current_user
from app.api.deps_flags import require_trading_enabled
from app.middleware.rate_limit import rate_limit_orders
from app.schemas.leverage import OpenLeverageRequest, PartialCloseRequest, AddMarginRequest
from app.services.leverage_service import (
    LeverageService,
    LeverageError,
    get_mark_price,
    position_to_dict,
    calc_liquidation_price,
    resolve_trading_pair,
)

router = APIRouter(prefix="/api/leverage", tags=["leverage"])
logger = logging.getLogger("crypto4pro.leverage")

PAIR_LEVERAGE_CAPS: dict[str, int] = {
    "BTC": 125,
    "ETH": 100,
    "SOL": 50,
    "XRP": 50,
    "DOGE": 25,
    "AVAX": 50,
    "BNB": 50,
    "ADA": 25,
    "TRX": 25,
}
DEFAULT_PAIR_LEVERAGE_CAP = 20


async def require_futures_enabled() -> None:
    if not settings.ENABLE_FUTURES:
        raise HTTPException(status_code=503, detail="Leverage trading is currently disabled")


def _check_user_eligibility(user: User) -> None:
    if user.kyc_status != "approved":
        raise HTTPException(
            status_code=403,
            detail="KYC verification is required for leverage trading.",
        )
    if user.deposit_cooldown_until and user.deposit_cooldown_until > datetime.now(timezone.utc):
        remaining = int((user.deposit_cooldown_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(
            status_code=403,
            detail=f"Deposit is being processed. Please wait {remaining} seconds.",
        )


@router.get("/config")
async def get_leverage_config(db: AsyncSession = Depends(get_db)):
    """Public leverage configuration and supported pairs."""
    result = await db.execute(
        select(TradingPair)
        .where(TradingPair.is_enabled == True, TradingPair.quote_asset == "USDT")
        .order_by(TradingPair.symbol)
    )
    pairs = list(result.scalars().all())
    return {
        "enabled": settings.ENABLE_FUTURES,
        "max_leverage": settings.LEVERAGE_MAX,
        "min_margin_usdt": settings.LEVERAGE_MIN_MARGIN_USDT,
        "maintenance_margin_rate": settings.LEVERAGE_MAINTENANCE_MARGIN_RATE,
        "funding_rate": "0.0001",
        "funding_interval_hours": 8,
        "disclaimer": "Synthetic USDT-margined positions — not connected to external perpetual venues.",
        "pairs": [
            {
                "symbol": p.symbol,
                "base_asset": p.base_asset,
                "quote_asset": p.quote_asset,
                "max_leverage": PAIR_LEVERAGE_CAPS.get(
                    p.base_asset, DEFAULT_PAIR_LEVERAGE_CAP
                ),
            }
            for p in pairs
        ],
    }


@router.get("/positions")
async def list_positions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """User leverage positions with live mark prices and unrealized PnL."""
    result = await db.execute(
        select(LeveragePosition)
        .where(LeveragePosition.user_id == user.id)
        .order_by(desc(LeveragePosition.opened_at))
    )
    positions = list(result.scalars().all())

    service = LeverageService(db)
    changed = False
    for pos in positions:
        if pos.status == "open":
            if await service.maybe_liquidate(pos):
                changed = True

    if changed:
        await db.commit()
        result = await db.execute(
            select(LeveragePosition)
            .where(LeveragePosition.user_id == user.id)
            .order_by(desc(LeveragePosition.opened_at))
        )
        positions = list(result.scalars().all())

    mark_cache: dict[str, Decimal | None] = {}
    serialized = []
    for pos in positions:
        mark = None
        if pos.base_asset not in mark_cache:
            try:
                mark_cache[pos.base_asset] = await get_mark_price(pos.base_asset)
            except LeverageError:
                mark_cache[pos.base_asset] = None
        mark = mark_cache[pos.base_asset]
        serialized.append(position_to_dict(pos, mark))

    open_count = sum(1 for p in positions if p.status == "open")
    return {"positions": serialized, "open_count": open_count}


@router.post("/open", dependencies=[Depends(require_futures_enabled), Depends(require_trading_enabled), Depends(rate_limit_orders)])
async def open_position(
    body: OpenLeverageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_user_eligibility(user)

    try:
        margin = Decimal(body.margin_usdt)
        if margin <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid margin amount")

    service = LeverageService(db)
    try:
        position = await service.open_position(
            user_id=user.id,
            symbol=body.symbol,
            side=body.side,
            leverage=body.leverage,
            margin_usdt=margin,
        )
        await db.commit()
        await db.refresh(position)
        mark = await get_mark_price(position.base_asset)
    except LeverageError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=e.message)

    return {
        "ok": True,
        "position": position_to_dict(position, mark),
        "liquidation_price": str(position.liquidation_price),
    }


@router.post("/positions/{position_id}/close", dependencies=[Depends(require_futures_enabled), Depends(require_trading_enabled), Depends(rate_limit_orders)])
async def close_position(
    position_id: uuid.UUID,
    body: PartialCloseRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    percent = body.percent if body else 100
    service = LeverageService(db)
    try:
        position = await service.close_position(user.id, position_id, percent=percent)
        await db.commit()
        await db.refresh(position)
        mark = position.close_price
    except LeverageError as e:
        await db.rollback()
        status = 404 if "not found" in e.message.lower() else 400
        raise HTTPException(status_code=status, detail=e.message)

    return {
        "ok": True,
        "position": position_to_dict(position, mark),
    }


@router.post("/positions/{position_id}/add-margin", dependencies=[Depends(require_futures_enabled), Depends(require_trading_enabled)])
async def add_margin(
    position_id: uuid.UUID,
    body: AddMarginRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_user_eligibility(user)
    try:
        amount = Decimal(body.margin_usdt)
        if amount <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid margin amount")

    service = LeverageService(db)
    try:
        position = await service.add_margin(user.id, position_id, amount)
        await db.commit()
        await db.refresh(position)
        mark = await get_mark_price(position.base_asset)
    except LeverageError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=e.message)

    return {"ok": True, "position": position_to_dict(position, mark)}


@router.get("/preview")
async def preview_position(
    symbol: str,
    side: str,
    leverage: int,
    margin_usdt: str,
    db: AsyncSession = Depends(get_db),
):
    """Preview entry, notional and liquidation price without opening."""
    try:
        margin = Decimal(margin_usdt)
        if margin <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid margin amount")

    try:
        trading_pair = await resolve_trading_pair(db, symbol)
        mark = await get_mark_price(trading_pair.base_asset)
        notional = margin * Decimal(leverage)
        liq = calc_liquidation_price(mark, side.lower(), leverage)
    except LeverageError as e:
        raise HTTPException(status_code=400, detail=e.message)

    return {
        "symbol": trading_pair.symbol,
        "base_asset": trading_pair.base_asset,
        "mark_price": str(mark),
        "notional_usdt": str(notional),
        "quantity": str(notional / mark),
        "liquidation_price": str(liq),
        "leverage": leverage,
        "margin_usdt": str(margin),
        "side": side.lower(),
    }
