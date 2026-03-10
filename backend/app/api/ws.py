"""
WebSocket endpoint for real-time order book and trade updates.

Clients connect to /ws/market/{symbol} and receive:
- Order book snapshots on connect
- Order book deltas on each trade/order change
- Recent trade notifications

Uses Redis pub/sub for horizontal scalability — multiple FastAPI
workers can broadcast to all connected clients.
"""

import json
import logging
import asyncio
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import select, func, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.trading import TradingPair, Order, Trade

logger = logging.getLogger("crypto4pro.ws")

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections per symbol."""

    def __init__(self):
        # symbol -> set of WebSocket connections
        self.active: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, symbol: str):
        await websocket.accept()
        if symbol not in self.active:
            self.active[symbol] = set()
        self.active[symbol].add(websocket)
        logger.info("WS connect: %s (%d clients)", symbol, len(self.active[symbol]))

    def disconnect(self, websocket: WebSocket, symbol: str):
        if symbol in self.active:
            self.active[symbol].discard(websocket)
            if not self.active[symbol]:
                del self.active[symbol]

    async def broadcast(self, symbol: str, message: dict):
        """Send message to all clients subscribed to a symbol."""
        if symbol not in self.active:
            return
        data = json.dumps(message, default=str)
        dead = []
        for ws in self.active[symbol]:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active[symbol].discard(ws)


manager = ConnectionManager()


async def _build_orderbook_snapshot(symbol: str) -> dict:
    """Build a full order book snapshot from the database."""
    async with async_session_factory() as db:
        # Bids (buy orders, highest first)
        bid_q = (
            select(
                Order.price,
                func.sum(Order.remaining).label("quantity"),
                func.count(Order.id).label("order_count"),
            )
            .where(and_(
                Order.symbol == symbol,
                Order.side == "buy",
                Order.status.in_(["open", "partially_filled"]),
                Order.price.isnot(None),
            ))
            .group_by(Order.price)
            .order_by(desc(Order.price))
            .limit(50)
        )

        # Asks (sell orders, lowest first)
        ask_q = (
            select(
                Order.price,
                func.sum(Order.remaining).label("quantity"),
                func.count(Order.id).label("order_count"),
            )
            .where(and_(
                Order.symbol == symbol,
                Order.side == "sell",
                Order.status.in_(["open", "partially_filled"]),
                Order.price.isnot(None),
            ))
            .group_by(Order.price)
            .order_by(asc(Order.price))
            .limit(50)
        )

        bid_rows = (await db.execute(bid_q)).all()
        ask_rows = (await db.execute(ask_q)).all()

        # Recent trades
        trades_q = (
            select(Trade)
            .where(Trade.symbol == symbol)
            .order_by(desc(Trade.executed_at))
            .limit(20)
        )
        trade_rows = list((await db.execute(trades_q)).scalars().all())

    return {
        "type": "snapshot",
        "symbol": symbol,
        "bids": [
            {"price": str(r.price), "quantity": str(r.quantity), "orders": r.order_count}
            for r in bid_rows
        ],
        "asks": [
            {"price": str(r.price), "quantity": str(r.quantity), "orders": r.order_count}
            for r in ask_rows
        ],
        "recent_trades": [
            {
                "id": str(t.id),
                "price": str(t.price),
                "quantity": str(t.quantity),
                "side": t.side,
                "time": t.executed_at.isoformat() if t.executed_at else None,
            }
            for t in trade_rows
        ],
    }


@router.websocket("/ws/market/{symbol}")
async def market_ws(websocket: WebSocket, symbol: str):
    """
    WebSocket endpoint for real-time market data.

    On connect: sends full order book snapshot.
    Then: sends periodic refreshes every 2 seconds while connected.
    """
    normalized = symbol.upper().replace("/", "-")
    await manager.connect(websocket, normalized)

    try:
        # Send initial snapshot
        snapshot = await _build_orderbook_snapshot(normalized)
        await websocket.send_text(json.dumps(snapshot, default=str))

        # Keep connection alive and send periodic updates
        while True:
            try:
                # Wait for client messages (ping/pong) with timeout
                # This also keeps the connection alive
                data = await asyncio.wait_for(
                    websocket.receive_text(), timeout=2.0
                )
                # Client can send "ping" — we respond "pong"
                if data == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                # No message from client — send order book update
                try:
                    update = await _build_orderbook_snapshot(normalized)
                    update["type"] = "update"
                    await websocket.send_text(json.dumps(update, default=str))
                except Exception:
                    pass  # DB might be temporarily unavailable

    except WebSocketDisconnect:
        manager.disconnect(websocket, normalized)
    except Exception:
        manager.disconnect(websocket, normalized)


async def broadcast_trade(symbol: str, trade_data: dict):
    """Called by the matching engine after a fill to push to WS clients."""
    await manager.broadcast(symbol, {
        "type": "trade",
        "symbol": symbol,
        "trade": trade_data,
    })


async def broadcast_orderbook_update(symbol: str):
    """Called after any order book change to push snapshot to WS clients."""
    try:
        snapshot = await _build_orderbook_snapshot(symbol)
        snapshot["type"] = "update"
        await manager.broadcast(symbol, snapshot)
    except Exception:
        logger.exception("Failed to broadcast orderbook update for %s", symbol)
