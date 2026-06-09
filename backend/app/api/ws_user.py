"""Private WebSocket for authenticated users — balances and open orders."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, and_

from app.database import async_session_factory
from app.models.ledger import Account
from app.models.trading import Order
from app.utils.security import decode_token

logger = logging.getLogger("crypto4pro.ws_user")
router = APIRouter()


async def _user_snapshot(user_id: uuid.UUID) -> dict:
    async with async_session_factory() as db:
        acc_result = await db.execute(
            select(Account).where(Account.user_id == user_id)
        )
        accounts = list(acc_result.scalars().all())

        ord_result = await db.execute(
            select(Order)
            .where(
                and_(
                    Order.user_id == user_id,
                    Order.status.in_(["open", "partially_filled", "pending_stop"]),
                )
            )
            .order_by(Order.created_at.desc())
            .limit(50)
        )
        orders = list(ord_result.scalars().all())

    return {
        "type": "user_snapshot",
        "balances": [
            {
                "asset": a.asset,
                "available": str(a.available_balance),
                "locked": str(a.locked_balance),
            }
            for a in accounts
            if a.available_balance > 0 or a.locked_balance > 0
        ],
        "open_orders": [
            {
                "id": str(o.id),
                "symbol": o.symbol,
                "side": o.side,
                "status": o.status,
                "price": str(o.price) if o.price else None,
                "quantity": str(o.quantity),
                "remaining": str(o.remaining),
            }
            for o in orders
        ],
    }


def _user_id_from_ws(websocket: WebSocket) -> uuid.UUID | None:
    token = websocket.cookies.get("access_token")
    if not token:
        return None
    payload = decode_token(token, token_type="user")
    if not payload or payload.get("type") != "user":
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        return uuid.UUID(sub)
    except ValueError:
        return None


@router.websocket("/ws/user")
async def user_private_ws(websocket: WebSocket):
    """Push balance and order updates every 3 seconds for logged-in users."""
    user_id = _user_id_from_ws(websocket)
    if not user_id:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    logger.info("User WS connect: %s", user_id)

    try:
        while True:
            try:
                snapshot = await _user_snapshot(user_id)
                await websocket.send_text(json.dumps(snapshot, default=str))
                data = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
                if data == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                continue
    except WebSocketDisconnect:
        logger.info("User WS disconnect: %s", user_id)
    except Exception:
        logger.exception("User WS error for %s", user_id)


async def notify_user_update(user_id: uuid.UUID) -> None:
    """Hook for matching engine — reserved for future push via connection map."""
    pass
