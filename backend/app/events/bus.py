"""
Event Bus — Redis pub/sub for inter-service communication.

Events are published when significant actions occur:
- user_registered
- deposit_completed
- trade_executed
- withdrawal_requested
- campaign_evaluated

Celery workers subscribe to these events and trigger campaign evaluation.
"""

import json
from typing import Optional
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.config import settings


class EventBus:
    _instance: Optional["EventBus"] = None
    _redis: Optional[aioredis.Redis] = None

    @classmethod
    async def get_instance(cls) -> "EventBus":
        if cls._instance is None:
            cls._instance = EventBus()
            cls._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return cls._instance

    @classmethod
    async def close(cls):
        if cls._redis:
            await cls._redis.close()
            cls._redis = None
            cls._instance = None

    async def publish(self, event_type: str, data: dict) -> None:
        """Publish an event to Redis pub/sub channel."""
        if not self._redis:
            return

        event = {
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data,
        }
        # Publish to channel
        await self._redis.publish(f"nexus:events:{event_type}", json.dumps(event, default=str))
        # Also push to a list for Celery consumption (reliable delivery)
        await self._redis.lpush("nexus:event_queue", json.dumps(event, default=str))

    async def publish_user_registered(self, user_id: str, email: str) -> None:
        await self.publish("user_registered", {
            "user_id": user_id,
            "data": {"email": email},
        })

    async def publish_deposit_completed(
        self, user_id: str, deposit_id: str, amount: str, asset: str
    ) -> None:
        await self.publish("deposit_completed", {
            "user_id": user_id,
            "data": {
                "deposit_id": deposit_id,
                "amount": amount,
                "asset": asset,
            },
        })

    async def publish_trade_executed(
        self,
        user_id: str,
        trade_id: str,
        symbol: str,
        side: str,
        quantity: str,
        quote_quantity: str,
        fee: str,
        fee_asset: str,
    ) -> None:
        await self.publish("trade_executed", {
            "user_id": user_id,
            "data": {
                "trade_id": trade_id,
                "symbol": symbol,
                "side": side,
                "quantity": quantity,
                "quote_quantity": quote_quantity,
                "fee": fee,
                "fee_asset": fee_asset,
            },
        })
