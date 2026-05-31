"""Synthetic options trading API."""

import uuid
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.platform import OptionPosition
from app.api.deps import get_current_user
from app.api.deps_flags import require_trading_enabled
from app.services.ledger_service import LedgerService, InsufficientBalanceError
from app.services.market_data import get_market_data_service

router = APIRouter(prefix="/api/options", tags=["options"])
logger = logging.getLogger("crypto4pro.options")


class OpenOptionRequest(BaseModel):
    asset: str = Field(min_length=2, max_length=20)
    option_type: str = Field(pattern="^(call|put)$")
    strike_price: str
    quantity: str
    duration_days: int = Field(default=7, ge=1, le=90)


async def _mark(asset: str) -> Decimal:
    market = get_market_data_service()
    prices = await market.fetch_prices()
    raw = prices.get(asset.upper())
    if not raw:
        raise HTTPException(status_code=400, detail=f"Price unavailable for {asset}")
    return Decimal(raw)


def _premium(mark: Decimal, strike: Decimal, opt_type: str, qty: Decimal) -> Decimal:
    if opt_type == "call":
        intrinsic = max(mark - strike, Decimal("0"))
    else:
        intrinsic = max(strike - mark, Decimal("0"))
    time_value = mark * Decimal("0.02") * qty
    return (intrinsic * qty + time_value).quantize(Decimal("0.00000001"))


def _pnl(opt: OptionPosition, mark: Decimal) -> Decimal:
    if opt.option_type == "call":
        payoff = max(mark - opt.strike_price, Decimal("0")) * opt.quantity
    else:
        payoff = max(opt.strike_price - mark, Decimal("0")) * opt.quantity
    return payoff - opt.premium_usdt


@router.get("/positions")
async def list_positions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OptionPosition)
        .where(OptionPosition.user_id == user.id)
        .order_by(desc(OptionPosition.opened_at))
    )
    positions = list(result.scalars().all())
    out = []
    for p in positions:
        mark = None
        unrealized = None
        if p.status == "open":
            try:
                mark = await _mark(p.asset)
                unrealized = _pnl(p, mark)
            except HTTPException:
                pass
        out.append({
            "id": str(p.id),
            "asset": p.asset,
            "option_type": p.option_type,
            "strike_price": str(p.strike_price),
            "premium_usdt": str(p.premium_usdt),
            "quantity": str(p.quantity),
            "expiry_at": p.expiry_at.isoformat(),
            "status": p.status,
            "mark_price": str(mark) if mark else None,
            "unrealized_pnl": str(unrealized) if unrealized is not None else None,
            "realized_pnl": str(p.realized_pnl) if p.realized_pnl is not None else None,
        })
    return {"positions": out}


@router.post("/open", dependencies=[Depends(require_trading_enabled)])
async def open_option(
    body: OpenOptionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC required for options.")

    try:
        strike = Decimal(body.strike_price)
        qty = Decimal(body.quantity)
        if strike <= 0 or qty <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid parameters")

    mark = await _mark(body.asset)
    premium = _premium(mark, strike, body.option_type, qty)
    now = datetime.now(timezone.utc)
    pos_id = uuid.uuid4()

    ledger = LedgerService(db)
    try:
        await ledger.debit(
            user_id=user.id,
            asset="USDT",
            amount=premium,
            category="options_premium",
            idempotency_key=f"opt_debit:{pos_id}",
            reference_type="option",
            reference_id=pos_id,
            description=f"Option premium {body.option_type} {body.asset}",
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=400, detail="Insufficient USDT for premium")

    pos = OptionPosition(
        id=pos_id,
        user_id=user.id,
        asset=body.asset.upper(),
        option_type=body.option_type,
        strike_price=strike,
        premium_usdt=premium,
        quantity=qty,
        expiry_at=now + timedelta(days=body.duration_days),
        entry_mark=mark,
        opened_at=now,
    )
    db.add(pos)
    await db.commit()
    return {"ok": True, "position_id": str(pos_id), "premium_usdt": str(premium)}


@router.post("/positions/{position_id}/close")
async def close_option(
    position_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OptionPosition).where(OptionPosition.id == position_id, OptionPosition.user_id == user.id)
    )
    pos = result.scalar_one_or_none()
    if not pos or pos.status != "open":
        raise HTTPException(status_code=404, detail="Position not found")

    mark = await _mark(pos.asset)
    pnl = _pnl(pos, mark)
    ledger = LedgerService(db)
    payout = max(pnl + pos.premium_usdt, Decimal("0"))

    if payout > 0:
        await ledger.credit(
            user_id=user.id,
            asset="USDT",
            amount=payout,
            category="options_pnl",
            idempotency_key=f"opt_payout:{pos.id}",
            reference_type="option",
            reference_id=pos.id,
            description="Option close payout",
        )

    pos.status = "closed"
    pos.realized_pnl = pnl
    pos.closed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "realized_pnl": str(pnl)}
