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

router = APIRouter(prefix="/api/orders", tags=["orders"])


class PlaceOrderRequest(BaseModel):
    symbol: str = Field(min_length=3, max_length=20)
    side: str = Field(min_length=3, max_length=4)  # buy/sell
    order_type: str = Field(default="limit", max_length=15)
    quantity: str  # String for Decimal precision
    price: Optional[str] = None  # Required for limit orders


def _serialize_order(o) -> dict:
    return {
        "id": str(o.id),
        "symbol": o.symbol,
        "side": o.side,
        "order_type": o.order_type,
        "status": o.status,
        "price": str(o.price) if o.price else None,
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
    try:
        quantity = Decimal(body.quantity)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid quantity format")

    price = None
    if body.price is not None:
        try:
            price = Decimal(body.price)
        except (InvalidOperation, ValueError):
            raise HTTPException(status_code=400, detail="Invalid price format")

    engine = MatchingEngine(db)
    try:
        result = await engine.place_order(
            user=user,
            symbol=body.symbol,
            side=body.side.lower(),
            order_type=body.order_type.lower(),
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
