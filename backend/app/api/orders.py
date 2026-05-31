"""
Order placement and cancellation API routes.

All order operations go through the MatchingEngine which ensures:
- Funds are locked before the order enters the book
- Matching is atomic with ledger settlement
- Price-time priority for limit orders
"""

import uuid
import logging
import traceback as tb_module
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

logger = logging.getLogger("crypto4pro.orders")

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.api.deps_flags import require_trading_enabled
from app.middleware.rate_limit import rate_limit_orders
from app.services.matching_engine import MatchingEngine, OrderError
from app.models.trading import Order, TradingPair
from app.services.ledger_service import InsufficientBalanceError

router = APIRouter(prefix="/api/orders", tags=["orders"])


class PlaceOrderRequest(BaseModel):
    symbol: str = Field(min_length=3, max_length=20)
    side: str = Field(min_length=3, max_length=4)  # buy/sell
    order_type: str = Field(default="limit", max_length=15)
    quantity: str  # String for Decimal precision
    price: Optional[str] = None  # Required for limit orders
    stop_price: Optional[str] = None


def _serialize_order(o) -> dict:
    return {
        "id": str(o.id),
        "symbol": o.symbol,
        "side": o.side,
        "order_type": o.order_type,
        "status": o.status,
        "price": str(o.price) if o.price else None,
        "stop_price": str(o.stop_price) if o.stop_price else None,
        "quantity": str(o.quantity),
        "filled_quantity": str(o.filled_quantity),
        "remaining": str(o.remaining),
        "fee_asset": o.fee_asset,
        "fee_total": str(o.fee_total),
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        "filled_at": o.filled_at.isoformat() if o.filled_at else None,
        "cancelled_at": o.cancelled_at.isoformat() if o.cancelled_at else None,
    }


def _serialize_trade(t) -> dict:
    return {
        "id": str(t.id),
        "symbol": t.symbol,
        "side": t.side,
        "price": str(t.price),
        "quantity": str(t.quantity),
        "quote_quantity": str(t.quote_quantity),
        "maker_fee": str(t.maker_fee),
        "taker_fee": str(t.taker_fee),
        "executed_at": t.executed_at.isoformat() if t.executed_at else None,
    }


@router.post("/place", dependencies=[Depends(require_trading_enabled), Depends(rate_limit_orders)])
async def place_order(
    body: PlaceOrderRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Place a new order. Funds are locked immediately.
    If matches exist, fills are executed atomically.
    """
    if user.kyc_status != "approved":
        raise HTTPException(
            status_code=403,
            detail="KYC verification is required for trading. Please complete identity verification first.",
        )

    if user.deposit_cooldown_until and user.deposit_cooldown_until > datetime.now(timezone.utc):
        remaining = int((user.deposit_cooldown_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(
            status_code=403,
            detail=f"Deposit is being processed. Please wait {remaining} seconds.",
            headers={"X-Cooldown-Remaining": str(remaining)},
        )

    try:
        quantity = Decimal(body.quantity)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid quantity format")

    price = None
    stop_price = None
    if body.price is not None:
        try:
            price = Decimal(body.price)
        except (InvalidOperation, ValueError):
            raise HTTPException(status_code=400, detail="Invalid price format")
    if body.stop_price is not None:
        try:
            stop_price = Decimal(body.stop_price)
        except (InvalidOperation, ValueError):
            raise HTTPException(status_code=400, detail="Invalid stop price format")

    order_type = body.order_type.lower().replace("-", "_")

    engine = MatchingEngine(db)
    try:
        if order_type == "stop_limit":
            if stop_price is None or price is None:
                raise HTTPException(status_code=400, detail="Stop-limit requires price and stop_price")
            pair = await engine._get_pair(body.symbol)
            engine._validate_order_params(pair, body.side.lower(), "limit", quantity, price)
            order_id = uuid.uuid4()
            order = Order(
                id=order_id,
                user_id=user.id,
                pair_id=pair.id,
                symbol=pair.symbol,
                side=body.side.lower(),
                order_type="stop_limit",
                status="pending_stop",
                price=price,
                stop_price=stop_price,
                quantity=quantity,
                filled_quantity=Decimal("0"),
                remaining=quantity,
            )
            db.add(order)
            await db.flush()
            await engine._lock_order_funds(user.id, pair, body.side.lower(), "limit", quantity, price, order.id)
            await db.commit()
            await db.refresh(order)
            return {"ok": True, "order": _serialize_order(order), "fills": [], "fills_count": 0}

        result = await engine.place_order(
            user=user,
            symbol=body.symbol,
            side=body.side.lower(),
            order_type=order_type,
            quantity=quantity,
            price=price,
        )
        await db.commit()

        # Refresh to load server-generated timestamps (created_at, updated_at)
        # that are expired after commit due to server_default / onupdate
        order = result["order"]
        trades = result["trades"]
        await db.refresh(order)
        for t in trades:
            await db.refresh(t)
    except OrderError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=e.message)
    except Exception as e:
        logger.exception("place_order FAILED: %s", e)
        await db.rollback()
        raise

    return {
        "ok": True,
        "order": _serialize_order(order),
        "fills": [_serialize_trade(t) for t in trades],
        "fills_count": len(trades),
    }


@router.post("/{order_id}/cancel", dependencies=[Depends(require_trading_enabled), Depends(rate_limit_orders)])
async def cancel_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an open or partially filled order. Unlocks remaining funds."""
    engine = MatchingEngine(db)
    try:
        order = await engine.cancel_order(user, order_id)
        await db.commit()
        await db.refresh(order)
    except OrderError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=e.message)
    except Exception:
        await db.rollback()
        raise

    return {"ok": True, "order": _serialize_order(order)}
