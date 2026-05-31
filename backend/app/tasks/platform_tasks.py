"""Background checks for price alerts and stop orders."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, and_

from app.database import async_session_factory
from app.models.platform import PriceAlert
from app.models.trading import Order
from app.services.market_data import get_market_data_service
from app.services.email_service import send_email

logger = logging.getLogger("crypto4pro.platform_tasks")


async def check_price_alerts() -> int:
    """Evaluate active price alerts against current marks. Returns count triggered."""
    market = get_market_data_service()
    prices = await market.fetch_prices()
    triggered = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(PriceAlert).where(PriceAlert.is_active == True, PriceAlert.triggered_at.is_(None))
        )
        alerts = list(result.scalars().all())

        for alert in alerts:
            raw = prices.get(alert.asset)
            if not raw:
                continue
            mark = Decimal(raw)
            hit = (alert.condition == "above" and mark >= alert.target_price) or (
                alert.condition == "below" and mark <= alert.target_price
            )
            if not hit:
                continue

            alert.is_active = False
            alert.triggered_at = datetime.now(timezone.utc)
            triggered += 1
            logger.info("Price alert triggered: %s %s %s", alert.asset, alert.condition, alert.target_price)

        if triggered:
            await db.commit()
    return triggered


async def activate_stop_orders() -> int:
    """Convert triggered stop orders to active limit orders."""
    market = get_market_data_service()
    prices = await market.fetch_prices()
    activated = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(Order).where(Order.status == "pending_stop", Order.stop_price.isnot(None))
        )
        orders = list(result.scalars().all())

        for order in orders:
            base = order.symbol.split("-")[0]
            raw = prices.get(base)
            if not raw or not order.stop_price:
                continue
            mark = Decimal(raw)
            triggered = (
                (order.side == "buy" and mark >= order.stop_price)
                or (order.side == "sell" and mark <= order.stop_price)
            )
            if not triggered:
                continue
            order.status = "open"
            order.order_type = "limit"
            activated += 1

        if activated:
            await db.commit()
    return activated
