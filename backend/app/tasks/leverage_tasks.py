"""
Leverage background tasks — periodic liquidation sweep.
"""

import asyncio
import logging

from app.celery_app import celery

logger = logging.getLogger("crypto4pro.tasks.leverage")


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(name="app.tasks.leverage_tasks.sweep_liquidations", bind=True, max_retries=2)
def sweep_liquidations(self):
    """Check all open leverage positions and liquidate those past maintenance margin."""
    logger.info("Starting leverage liquidation sweep...")

    async def _run():
        from app.database import async_session_factory
        from app.services.leverage_service import LeverageService

        async with async_session_factory() as db:
            service = LeverageService(db)
            count = await service.sweep_liquidations()
            if count:
                await db.commit()
            return count

    try:
        count = _run_async(_run())
        if count:
            logger.warning("Liquidated %d leverage position(s)", count)
        else:
            logger.debug("Leverage liquidation sweep: no positions liquidated")
        return {"liquidated": count}
    except Exception as exc:
        logger.exception("Leverage liquidation sweep failed")
        raise self.retry(exc=exc, countdown=30)
