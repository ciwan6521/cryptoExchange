"""
Leverage / futures position service.

USDT-margined synthetic positions priced off external mark data.
Margin is locked via LedgerService; PnL settled on close or liquidation.
"""

import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.leverage import LeveragePosition
from app.models.trading import TradingPair
from app.services.ledger_service import LedgerService, InsufficientBalanceError
from app.services.market_data import get_market_data_service

logger = logging.getLogger("crypto4pro.leverage")

MARGIN_ASSET = "USDT"


class LeverageError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _quantize(value: Decimal, places: int = 8) -> Decimal:
    exp = Decimal("1").scaleb(-places)
    return value.quantize(exp, rounding=ROUND_DOWN)


def _maintenance_rate() -> Decimal:
    return Decimal(settings.LEVERAGE_MAINTENANCE_MARGIN_RATE)


def calc_liquidation_price(entry: Decimal, side: str, leverage: int) -> Decimal:
    lev = Decimal(leverage)
    maint = _maintenance_rate()
    if side == "long":
        return _quantize(entry * (Decimal("1") - (Decimal("1") / lev) + maint))
    return _quantize(entry * (Decimal("1") + (Decimal("1") / lev) - maint))


def calc_unrealized_pnl(
    side: str,
    entry: Decimal,
    mark: Decimal,
    notional: Decimal,
) -> Decimal:
    if entry <= 0:
        return Decimal("0")
    if side == "long":
        return _quantize((mark - entry) / entry * notional)
    return _quantize((entry - mark) / entry * notional)


def is_liquidated(side: str, mark: Decimal, liquidation_price: Decimal) -> bool:
    if side == "long":
        return mark <= liquidation_price
    return mark >= liquidation_price


async def get_mark_price(base_asset: str) -> Decimal:
    market = get_market_data_service()
    prices = await market.fetch_prices()
    raw = prices.get(base_asset.upper())
    if not raw:
        raise LeverageError(f"Mark price unavailable for {base_asset}")
    price = Decimal(raw)
    if price <= 0:
        raise LeverageError(f"Invalid mark price for {base_asset}")
    return price


async def resolve_trading_pair(db: AsyncSession, symbol: str) -> TradingPair:
    normalized = symbol.upper().replace("/", "-")
    result = await db.execute(
        select(TradingPair).where(
            TradingPair.symbol == normalized,
            TradingPair.is_enabled == True,
        )
    )
    pair = result.scalar_one_or_none()
    if not pair:
        raise LeverageError(f"Trading pair '{symbol}' is not available for leverage")
    return pair


def position_to_dict(
    pos: LeveragePosition,
    mark_price: Decimal | None = None,
) -> dict:
    unrealized = None
    roi = None
    if pos.status == "open" and mark_price is not None:
        unrealized = calc_unrealized_pnl(pos.side, pos.entry_price, mark_price, pos.notional_usdt)
        if pos.margin_usdt > 0:
            roi = _quantize(unrealized / pos.margin_usdt * Decimal("100"), 4)

    return {
        "id": str(pos.id),
        "symbol": pos.symbol,
        "base_asset": pos.base_asset,
        "quote_asset": pos.quote_asset,
        "side": pos.side,
        "leverage": pos.leverage,
        "margin_usdt": str(pos.margin_usdt),
        "notional_usdt": str(pos.notional_usdt),
        "quantity": str(pos.quantity),
        "entry_price": str(pos.entry_price),
        "liquidation_price": str(pos.liquidation_price),
        "mark_price": str(mark_price) if mark_price is not None else None,
        "unrealized_pnl": str(unrealized) if unrealized is not None else None,
        "roi_percent": str(roi) if roi is not None else None,
        "status": pos.status,
        "opened_at": pos.opened_at.isoformat(),
        "closed_at": pos.closed_at.isoformat() if pos.closed_at else None,
        "close_price": str(pos.close_price) if pos.close_price else None,
        "realized_pnl": str(pos.realized_pnl) if pos.realized_pnl is not None else None,
    }


class LeverageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

    async def open_position(
        self,
        user_id: uuid.UUID,
        symbol: str,
        side: str,
        leverage: int,
        margin_usdt: Decimal,
    ) -> LeveragePosition:
        if not settings.ENABLE_FUTURES:
            raise LeverageError("Leverage trading is currently disabled")

        side = side.lower()
        if side not in ("long", "short"):
            raise LeverageError("Side must be 'long' or 'short'")

        max_lev = settings.LEVERAGE_MAX
        if leverage < 1 or leverage > max_lev:
            raise LeverageError(f"Leverage must be between 1 and {max_lev}")

        min_margin = Decimal(settings.LEVERAGE_MIN_MARGIN_USDT)
        if margin_usdt < min_margin:
            raise LeverageError(f"Minimum margin is {min_margin} {MARGIN_ASSET}")

        pair = await resolve_trading_pair(self.db, symbol)
        if pair.quote_asset != MARGIN_ASSET:
            raise LeverageError("Only USDT-margined pairs are supported")

        mark = await get_mark_price(pair.base_asset)
        notional = _quantize(margin_usdt * Decimal(leverage), 2)
        quantity = _quantize(notional / mark)
        liq = calc_liquidation_price(mark, side, leverage)
        now = datetime.now(timezone.utc)
        position_id = uuid.uuid4()

        try:
            await self.ledger.lock_funds(
                user_id=user_id,
                asset=MARGIN_ASSET,
                amount=margin_usdt,
                idempotency_key=f"lev_lock:{position_id}",
                reference_type="leverage",
                reference_id=position_id,
                description=f"Leverage margin {side} {pair.symbol} {leverage}x",
            )
        except InsufficientBalanceError:
            raise LeverageError(f"Insufficient {MARGIN_ASSET} balance for margin")

        position = LeveragePosition(
            id=position_id,
            user_id=user_id,
            symbol=pair.symbol,
            base_asset=pair.base_asset,
            quote_asset=pair.quote_asset,
            side=side,
            leverage=leverage,
            margin_usdt=margin_usdt,
            notional_usdt=notional,
            quantity=quantity,
            entry_price=mark,
            liquidation_price=liq,
            status="open",
            opened_at=now,
        )
        self.db.add(position)
        await self.db.flush()
        logger.info(
            "Leverage opened: user=%s %s %s %sx margin=%s",
            user_id, side, pair.symbol, leverage, margin_usdt,
        )
        return position

    async def _settle_position(
        self,
        position: LeveragePosition,
        mark: Decimal,
        status: str,
    ) -> Decimal:
        pnl = calc_unrealized_pnl(position.side, position.entry_price, mark, position.notional_usdt)
        if status == "liquidated":
            pnl = -position.margin_usdt
        elif pnl < -position.margin_usdt:
            pnl = -position.margin_usdt

        await self.ledger.unlock_funds(
            user_id=position.user_id,
            asset=MARGIN_ASSET,
            amount=position.margin_usdt,
            idempotency_key=f"lev_unlock:{position.id}:{status}",
            reference_type="leverage",
            reference_id=position.id,
            description=f"Leverage margin released ({status})",
        )

        if pnl > 0:
            await self.ledger.credit(
                user_id=position.user_id,
                asset=MARGIN_ASSET,
                amount=pnl,
                category="leverage_pnl",
                idempotency_key=f"lev_pnl_credit:{position.id}:{status}",
                reference_type="leverage",
                reference_id=position.id,
                description=f"Leverage profit ({position.side} {position.symbol})",
            )
        elif pnl < 0:
            loss = min(abs(pnl), position.margin_usdt)
            await self.ledger.debit(
                user_id=position.user_id,
                asset=MARGIN_ASSET,
                amount=loss,
                category="leverage_pnl",
                idempotency_key=f"lev_pnl_debit:{position.id}:{status}",
                reference_type="leverage",
                reference_id=position.id,
                description=f"Leverage loss ({position.side} {position.symbol})",
            )

        position.status = status
        position.close_price = mark
        position.realized_pnl = pnl
        position.closed_at = datetime.now(timezone.utc)
        return pnl

    async def close_position(self, user_id: uuid.UUID, position_id: uuid.UUID) -> LeveragePosition:
        result = await self.db.execute(
            select(LeveragePosition).where(
                LeveragePosition.id == position_id,
                LeveragePosition.user_id == user_id,
            )
        )
        position = result.scalar_one_or_none()
        if not position:
            raise LeverageError("Position not found")
        if position.status != "open":
            raise LeverageError("Position is already closed")

        mark = await get_mark_price(position.base_asset)
        if is_liquidated(position.side, mark, position.liquidation_price):
            await self._settle_position(position, mark, "liquidated")
        else:
            await self._settle_position(position, mark, "closed")

        logger.info("Leverage closed: user=%s position=%s status=%s", user_id, position_id, position.status)
        return position

    async def maybe_liquidate(self, position: LeveragePosition) -> bool:
        if position.status != "open":
            return False
        try:
            mark = await get_mark_price(position.base_asset)
        except LeverageError:
            return False
        if not is_liquidated(position.side, mark, position.liquidation_price):
            return False
        await self._settle_position(position, mark, "liquidated")
        logger.warning("Leverage liquidated: user=%s position=%s", position.user_id, position.id)
        return True
