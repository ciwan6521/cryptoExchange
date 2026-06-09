"""Background checks for price alerts and stop orders."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.database import async_session_factory
from app.models.platform import PriceAlert, UserNotificationPreference
from app.models.trading import Order
from app.models.user import User
from app.services.market_data import get_market_data_service
from app.services.email_service import send_email
from app.services.matching_engine import MatchingEngine

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

            user_result = await db.execute(select(User).where(User.id == alert.user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                continue

            prefs_result = await db.execute(
                select(UserNotificationPreference).where(
                    UserNotificationPreference.user_id == user.id
                )
            )
            prefs = prefs_result.scalar_one_or_none()
            if prefs and (not prefs.email_enabled or not prefs.price_alerts_enabled):
                continue

            direction = "risen above" if alert.condition == "above" else "fallen below"
            subject = f"Price Alert: {alert.asset} {direction} {alert.target_price}"
            html = f"""
            <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 16px;">Price Alert Triggered</h2>
            <p style="color: #9ca3af; line-height: 1.6;">
                <strong style="color: #e5e7eb;">{alert.asset}</strong> has {direction}
                <strong style="color: #a78bfa;">{alert.target_price}</strong>.
            </p>
            <p style="color: #9ca3af; line-height: 1.6;">
                Current price: <strong style="color: #e5e7eb;">{mark}</strong>
            </p>
            """
            try:
                send_email(user.email, subject, html)
            except Exception:
                logger.exception("Failed to send price alert email to user %s", user.id)

        if triggered:
            await db.commit()
    return triggered


async def activate_stop_orders() -> int:
    """Convert triggered stop orders to active limit orders and match each."""
    market = get_market_data_service()
    prices = await market.fetch_prices()
    activated = 0
    activated_ids: list = []

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
            activated_ids.append(order.id)
            activated += 1

        if activated:
            await db.flush()
            engine = MatchingEngine(db)
            for order_id in activated_ids:
                order_result = await db.execute(
                    select(Order).where(Order.id == order_id).with_for_update()
                )
                order = order_result.scalar_one()
                user_result = await db.execute(select(User).where(User.id == order.user_id))
                user = user_result.scalar_one_or_none()
                if not user:
                    continue
                await engine.match_open_order(order)
            await db.commit()
    return activated
