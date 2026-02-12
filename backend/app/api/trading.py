"""
Trading read-only routes — order book, recent trades, user open orders, user trade history.
No order placement or mutation endpoints in this module.
"""

from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.trading import Order, Trade, TradingPair
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/trading", tags=["trading"])


# ─── Public endpoints (no auth required) ───────────────────────


@router.get("/orderbook/{symbol}")
async def get_orderbook(
    symbol: str,
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregated order book for a trading pair.
    Returns open limit orders grouped by price level, sorted by best price.
    """
    # Validate pair exists
    pair = await _get_pair_or_404(db, symbol)

    # Bids: open buy orders, best (highest) price first
    bid_q = (
        select(
            Order.price,
            func.sum(Order.remaining).label("quantity"),
            func.count(Order.id).label("order_count"),
        )
        .where(
            and_(
                Order.symbol == pair.symbol,
                Order.side == "buy",
                Order.status.in_(["open", "partially_filled"]),
                Order.price.isnot(None),
            )
        )
        .group_by(Order.price)
        .order_by(desc(Order.price))
        .limit(limit)
    )

    # Asks: open sell orders, best (lowest) price first
    ask_q = (
        select(
            Order.price,
            func.sum(Order.remaining).label("quantity"),
            func.count(Order.id).label("order_count"),
        )
        .where(
            and_(
                Order.symbol == pair.symbol,
                Order.side == "sell",
                Order.status.in_(["open", "partially_filled"]),
                Order.price.isnot(None),
            )
        )
        .group_by(Order.price)
        .order_by(Order.price)
        .limit(limit)
    )

    bid_rows = (await db.execute(bid_q)).all()
    ask_rows = (await db.execute(ask_q)).all()

    def _to_levels(rows):
        levels = []
        cumulative = Decimal("0")
        for row in rows:
            cumulative += row.quantity
            levels.append({
                "price": str(row.price),
                "quantity": str(row.quantity),
                "total": str(cumulative),
                "order_count": row.order_count,
            })
        return levels

    bids = _to_levels(bid_rows)
    asks = _to_levels(ask_rows)

    return {
        "symbol": pair.symbol,
        "bids": bids,
        "asks": asks,
        "bid_count": len(bids),
        "ask_count": len(asks),
    }


@router.get("/trades/{symbol}")
async def get_recent_trades(
    symbol: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Recent executed trades for a trading pair (public)."""
    pair = await _get_pair_or_404(db, symbol)

    q = (
        select(Trade)
        .where(Trade.symbol == pair.symbol)
        .order_by(desc(Trade.executed_at))
        .limit(limit)
    )
    result = await db.execute(q)
    trades = list(result.scalars().all())

    return {
        "symbol": pair.symbol,
        "trades": [
            {
                "id": str(t.id),
                "price": str(t.price),
                "quantity": str(t.quantity),
                "quote_quantity": str(t.quote_quantity),
                "side": t.side,
                "executed_at": t.executed_at.isoformat(),
            }
            for t in trades
        ],
    }


# ─── Authenticated endpoints ───────────────────────────────────


@router.get("/orders/open")
async def get_my_open_orders(
    symbol: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Current user's open orders (read-only)."""
    conditions = [
        Order.user_id == user.id,
        Order.status.in_(["open", "partially_filled"]),
    ]
    if symbol:
        conditions.append(Order.symbol == symbol.upper().replace("/", "-"))

    q = (
        select(Order)
        .where(and_(*conditions))
        .order_by(desc(Order.created_at))
        .limit(limit)
    )
    result = await db.execute(q)
    orders = list(result.scalars().all())

    return {
        "orders": [_serialize_order(o) for o in orders],
        "total": len(orders),
    }


@router.get("/orders/history")
async def get_my_order_history(
    symbol: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Current user's order history — all statuses (read-only)."""
    conditions = [Order.user_id == user.id]
    if symbol:
        conditions.append(Order.symbol == symbol.upper().replace("/", "-"))

    # Count
    count_q = select(func.count(Order.id)).where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch
    q = (
        select(Order)
        .where(and_(*conditions))
        .order_by(desc(Order.created_at))
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(q)
    orders = list(result.scalars().all())

    return {
        "orders": [_serialize_order(o) for o in orders],
        "total": total,
    }


@router.get("/trades/my")
async def get_my_trades(
    symbol: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Current user's executed trades (read-only)."""
    conditions = [
        or_(Trade.maker_user_id == user.id, Trade.taker_user_id == user.id)
    ]
    if symbol:
        conditions.append(Trade.symbol == symbol.upper().replace("/", "-"))

    count_q = select(func.count(Trade.id)).where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(Trade)
        .where(and_(*conditions))
        .order_by(desc(Trade.executed_at))
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(q)
    trades = list(result.scalars().all())

    return {
        "trades": [
            {
                "id": str(t.id),
                "symbol": t.symbol,
                "side": t.side,
                "price": str(t.price),
                "quantity": str(t.quantity),
                "quote_quantity": str(t.quote_quantity),
                "maker_fee": str(t.maker_fee),
                "taker_fee": str(t.taker_fee),
                "executed_at": t.executed_at.isoformat(),
                "role": "maker" if t.maker_user_id == user.id else "taker",
            }
            for t in trades
        ],
        "total": total,
    }


# ─── Helpers ────────────────────────────────────────────────────


async def _get_pair_or_404(db: AsyncSession, symbol: str) -> TradingPair:
    """Resolve symbol (accepts BTC-USDT or BTC/USDT) and return pair or 404."""
    normalized = symbol.upper().replace("/", "-")
    result = await db.execute(
        select(TradingPair).where(TradingPair.symbol == normalized)
    )
    pair = result.scalar_one_or_none()
    if not pair:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trading pair '{symbol}' not found",
        )
    return pair


def _serialize_order(o: Order) -> dict:
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
        "created_at": o.created_at.isoformat(),
        "updated_at": o.updated_at.isoformat(),
        "filled_at": o.filled_at.isoformat() if o.filled_at else None,
        "cancelled_at": o.cancelled_at.isoformat() if o.cancelled_at else None,
    }
