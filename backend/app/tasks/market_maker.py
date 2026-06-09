"""Simple market maker — places spread limit orders around mark price."""

import asyncio
import logging
import os
import uuid
from decimal import Decimal

from sqlalchemy import select, and_

from app.celery_app import celery
from app.database import async_session_factory
from app.models.trading import TradingPair, Order
from app.models.user import User
from app.services.market_data import get_market_data_service
from app.services.matching_engine import MatchingEngine

logger = logging.getLogger("crypto4pro.market_maker")

MM_EMAIL = os.environ.get("MARKET_MAKER_EMAIL", "mm@crypto4pro.io")
SPREAD_BPS = Decimal(os.environ.get("MARKET_MAKER_SPREAD_BPS", "50"))  # 0.50%
ORDER_SIZE_USDT = Decimal(os.environ.get("MARKET_MAKER_SIZE_USDT", "100"))


async def _run_market_maker() -> dict:
    market = get_market_data_service()
    prices = await market.fetch_prices()
    placed = 0
    cancelled = 0

    async with async_session_factory() as db:
        user_result = await db.execute(select(User).where(User.email == MM_EMAIL))
        mm_user = user_result.scalar_one_or_none()
        if not mm_user:
            logger.warning("Market maker user %s not found — run seed with MARKET_MAKER", MM_EMAIL)
            return {"placed": 0, "cancelled": 0, "error": "no_mm_user"}

        pairs_result = await db.execute(
            select(TradingPair).where(TradingPair.is_enabled == True, TradingPair.quote_asset == "USDT")
        )
        pairs = list(pairs_result.scalars().all())

        # Cancel stale MM orders older than 2 cycles
        old_orders = await db.execute(
            select(Order).where(
                and_(
                    Order.user_id == mm_user.id,
                    Order.status.in_(["open", "partially_filled"]),
                )
            )
        )
        for o in old_orders.scalars().all():
            engine = MatchingEngine(db)
            try:
                await engine.cancel_order(mm_user, o.id)
                cancelled += 1
            except Exception:
                pass

        engine = MatchingEngine(db)
        for pair in pairs:
            mark_raw = prices.get(pair.base_asset)
            if not mark_raw:
                continue
            mark = Decimal(mark_raw)
            if mark <= 0:
                continue

            spread = mark * SPREAD_BPS / Decimal("10000")
            bid_price = (mark - spread).quantize(Decimal("0.01"))
            ask_price = (mark + spread).quantize(Decimal("0.01"))
            qty = (ORDER_SIZE_USDT / mark).quantize(Decimal("0.000001"))

            for side, price in [("buy", bid_price), ("sell", ask_price)]:
                try:
                    await engine.place_order(
                        user=mm_user,
                        symbol=pair.symbol,
                        side=side,
                        order_type="limit",
                        quantity=qty,
                        price=price,
                    )
                    placed += 1
                except Exception as e:
                    logger.debug("MM order skip %s %s: %s", pair.symbol, side, e)

        await db.commit()

    return {"placed": placed, "cancelled": cancelled}


@celery.task(name="app.tasks.market_maker.refresh_quotes", bind=True, max_retries=1)
def refresh_quotes(self):
    try:
        result = asyncio.run(_run_market_maker())
        logger.info("Market maker: %s", result)
        return result
    except Exception as exc:
        logger.exception("Market maker failed")
        raise self.retry(exc=exc, countdown=120)
