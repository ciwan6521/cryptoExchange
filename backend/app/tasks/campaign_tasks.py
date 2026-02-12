"""
Campaign background tasks — event processing and reward distribution.
Runs as Celery workers consuming events from Redis.
"""

import json
import asyncio
from typing import Optional

from app.tasks.celery_app import celery_app
from app.database import async_session_factory
from app.services.reward_engine import RewardEngine


def run_async(coro):
    """Helper to run async code in sync Celery tasks."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def evaluate_campaign_event(self, event_json: str):
    """
    Evaluate a campaign event and distribute rewards if eligible.
    Called when events are published to the event queue.
    """
    try:
        event = json.loads(event_json)
        run_async(_evaluate(event))
    except Exception as exc:
        self.retry(exc=exc)


async def _evaluate(event: dict):
    """Async campaign evaluation."""
    async with async_session_factory() as db:
        async with db.begin():
            engine = RewardEngine(db)
            claims = await engine.evaluate(event)
            if claims:
                for claim in claims:
                    print(
                        f"[REWARD] Campaign={claim.campaign_id} "
                        f"User={claim.user_id} "
                        f"Amount={claim.reward_amount} {claim.reward_asset} "
                        f"Event={claim.trigger_event}"
                    )


@celery_app.task
def process_event_queue():
    """
    Periodic task: drain the Redis event queue and process each event.
    Runs every 5 seconds via Celery beat.
    """
    run_async(_drain_queue())


async def _drain_queue():
    """Drain Redis event queue and evaluate each event."""
    import redis.asyncio as aioredis
    from app.config import settings

    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        # Process up to 100 events per cycle
        for _ in range(100):
            event_json = await r.rpop("nexus:event_queue")
            if not event_json:
                break

            try:
                event = json.loads(event_json)
                async with async_session_factory() as db:
                    async with db.begin():
                        engine = RewardEngine(db)
                        await engine.evaluate(event)
            except Exception as e:
                # Push back to queue for retry (dead letter after 3 attempts)
                print(f"[REWARD ERROR] {e}")
                # Could push to a dead-letter queue here
    finally:
        await r.close()


# Celery beat schedule
celery_app.conf.beat_schedule = {
    "process-event-queue": {
        "task": "app.tasks.campaign_tasks.process_event_queue",
        "schedule": 5.0,  # Every 5 seconds
    },
}
