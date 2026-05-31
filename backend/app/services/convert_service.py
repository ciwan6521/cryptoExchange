"""Instant convert / swap between assets using mark prices."""

import uuid
import logging
from decimal import Decimal, ROUND_DOWN

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.ledger_service import LedgerService, InsufficientBalanceError
from app.services.market_data import get_market_data_service

logger = logging.getLogger("crypto4pro.convert")


class ConvertError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _spread_multiplier() -> Decimal:
    return Decimal("1") + Decimal(settings.CONVERT_SPREAD_RATE)


def _quantize(value: Decimal, places: int = 8) -> Decimal:
    exp = Decimal("1").scaleb(-places)
    return value.quantize(exp, rounding=ROUND_DOWN)


async def get_convert_quote(from_asset: str, to_asset: str, from_amount: Decimal) -> dict:
    from_asset = from_asset.upper()
    to_asset = to_asset.upper()
    if from_asset == to_asset:
        raise ConvertError("Cannot convert to the same asset")
    if from_amount <= 0:
        raise ConvertError("Amount must be positive")

    market = get_market_data_service()
    prices = await market.fetch_prices()
    from_price = Decimal(prices.get(from_asset) or "0")
    to_price = Decimal(prices.get(to_asset) or "0")
    if from_price <= 0 or to_price <= 0:
        raise ConvertError(f"Price unavailable for {from_asset}/{to_asset}")

    spread = _spread_multiplier()
    usd_value = from_amount * from_price
    to_amount = _quantize(usd_value / to_price / spread)
    rate = _quantize(to_amount / from_amount, 8)
    fee_usd = _quantize(usd_value * Decimal(settings.CONVERT_SPREAD_RATE), 4)

    return {
        "from_asset": from_asset,
        "to_asset": to_asset,
        "from_amount": str(from_amount),
        "to_amount": str(to_amount),
        "rate": str(rate),
        "fee_usd": str(fee_usd),
        "from_price_usd": str(from_price),
        "to_price_usd": str(to_price),
        "spread_percent": settings.CONVERT_SPREAD_RATE,
    }


async def execute_convert(
    db: AsyncSession,
    user_id: uuid.UUID,
    from_asset: str,
    to_asset: str,
    from_amount: Decimal,
) -> dict:
    quote = await get_convert_quote(from_asset, to_asset, from_amount)
    to_amount = Decimal(quote["to_amount"])
    convert_id = uuid.uuid4()
    ledger = LedgerService(db)

    try:
        await ledger.debit(
            user_id=user_id,
            asset=from_asset.upper(),
            amount=from_amount,
            category="convert",
            idempotency_key=f"convert_debit:{convert_id}",
            reference_type="convert",
            reference_id=convert_id,
            description=f"Convert {from_amount} {from_asset} → {to_asset}",
        )
        await ledger.credit(
            user_id=user_id,
            asset=to_asset.upper(),
            amount=to_amount,
            category="convert",
            idempotency_key=f"convert_credit:{convert_id}",
            reference_type="convert",
            reference_id=convert_id,
            description=f"Convert received {to_amount} {to_asset}",
        )
    except InsufficientBalanceError:
        raise ConvertError(f"Insufficient {from_asset} balance")

    logger.info("Convert: user=%s %s %s -> %s %s", user_id, from_amount, from_asset, to_amount, to_asset)
    return {"ok": True, "convert_id": str(convert_id), **quote}
