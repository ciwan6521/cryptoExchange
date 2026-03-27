"""Admin order listing."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.trading import Order
from app.api.deps import get_current_admin

router = APIRouter(prefix="/api/admin/orders", tags=["admin-orders"])


def _serialize_order(o: Order) -> dict:
    return {
        "id": str(o.id),
        "user_id": str(o.user_id),
        "pair_id": str(o.pair_id),
        "symbol": o.symbol,
        "side": o.side,
        "order_type": o.order_type,
        "status": o.status,
        "price": str(o.price) if o.price is not None else None,
        "stop_price": str(o.stop_price) if o.stop_price is not None else None,
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


@router.get("")
async def list_orders(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, max_length=20),
    symbol: Optional[str] = Query(None, max_length=20),
    user_id: Optional[uuid.UUID] = Query(None),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).order_by(Order.created_at.desc())
    count_q = select(func.count(Order.id))
    if status:
        q = q.where(Order.status == status)
        count_q = count_q.where(Order.status == status)
    if symbol:
        sym = symbol.strip().upper()
        q = q.where(Order.symbol == sym)
        count_q = count_q.where(Order.symbol == sym)
    if user_id:
        q = q.where(Order.user_id == user_id)
        count_q = count_q.where(Order.user_id == user_id)

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(q.limit(limit).offset(offset))
    orders = list(result.scalars().all())
    return {"orders": [_serialize_order(o) for o in orders], "total": total}
