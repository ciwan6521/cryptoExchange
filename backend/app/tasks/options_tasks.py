"""Celery tasks for options expiry settlement."""

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.celery_app import celery
from app.database import async_session_factory
from app.models.platform import OptionPosition
from app.services.ledger_service import LedgerService
from app.services.market_data import get_market_data_service

logger = logging.getLogger("crypto4pro.options_tasks")


async def _expire_options() -> int:
    now = datetime.now(timezone.utc)
    market = get_market_data_service()
    prices = await market.fetch_prices()
    expired = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(OptionPosition).where(
                OptionPosition.status == "open",
                OptionPosition.expiry_at <= now,
            )
        )
        positions = list(result.scalars().all())
        ledger = LedgerService(db)

        for pos in positions:
            mark_raw = prices.get(pos.asset.upper())
            mark = Decimal(mark_raw) if mark_raw else pos.strike_price

            if pos.option_type == "call":
                payoff = max(mark - pos.strike_price, Decimal("0")) * pos.quantity
            else:
                payoff = max(pos.strike_price - mark, Decimal("0")) * pos.quantity

            pnl = payoff - pos.premium_usdt
            pos.realized_pnl = pnl
            pos.status = "expired"

            if pnl > 0:
                await ledger.credit(
                    user_id=pos.user_id,
                    asset="USDT",
                    amount=pnl,
                    category="options_pnl",
                    idempotency_key=f"opt_expiry_credit:{pos.id}",
                    reference_type="option",
                    reference_id=pos.id,
                    description=f"Option expired {pos.asset} {pos.option_type}",
                )
            elif pnl < 0:
                loss = min(abs(pnl), pos.premium_usdt)
                if loss > 0:
                    await ledger.debit(
                        user_id=pos.user_id,
                        asset="USDT",
                        amount=loss,
                        category="options_pnl",
                        idempotency_key=f"opt_expiry_debit:{pos.id}",
                        reference_type="option",
                        reference_id=pos.id,
                        description=f"Option expired loss {pos.asset}",
                    )
            expired += 1

        if expired:
            await db.commit()
    return expired


@celery.task(name="app.tasks.options_tasks.expire_options", bind=True, max_retries=2)
def expire_options(self):
    try:
        count = asyncio.run(_expire_options())
        logger.info("Expired %s option positions", count)
        return {"expired": count}
    except Exception as exc:
        logger.exception("Options expiry task failed")
        raise self.retry(exc=exc, countdown=60)
