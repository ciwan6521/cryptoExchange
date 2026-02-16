"""
Celery tasks for scheduled operations.

Tasks:
- run_daily_reconciliation: Verify ledger integrity daily
- log_system_health: Log system component status hourly
"""

import logging
import asyncio
from app.celery_app import celery

logger = logging.getLogger("nexus.tasks")


def _run_async(coro):
    """Helper to run async code from sync Celery tasks."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(name="app.tasks.celery_tasks.run_daily_reconciliation", bind=True, max_retries=3)
def run_daily_reconciliation(self):
    """
    Daily ledger reconciliation — verifies account balances match ledger entries.
    Sets ledger_mismatch_detected flag if any discrepancy found.
    """
    logger.info("Starting daily ledger reconciliation...")

    async def _run():
        from app.database import async_session_factory
        from app.tasks.reconciliation import run_reconciliation

        async with async_session_factory() as db:
            report = await run_reconciliation(db)
            return report

    try:
        report = _run_async(_run())
        if report["status"] == "MISMATCH":
            logger.critical("RECONCILIATION FAILED: %s", report["mismatches"])
        else:
            logger.info("Reconciliation passed: %d assets verified", len(report["assets"]))
        return report
    except Exception as exc:
        logger.exception("Reconciliation task failed")
        raise self.retry(exc=exc, countdown=300)  # Retry in 5 minutes


@celery.task(name="app.tasks.celery_tasks.log_system_health")
def log_system_health():
    """
    Hourly health check — logs system component status.
    Useful for monitoring dashboards and alerting.
    """
    import redis
    from sqlalchemy import create_engine, text

    health = {"db": "ok", "redis": "ok"}

    # Check DB (sync for Celery)
    try:
        from app.config import settings
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        eng = create_engine(sync_url)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
    except Exception as e:
        health["db"] = f"error: {str(e)[:100]}"

    # Check Redis
    try:
        from app.config import settings
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        r.close()
    except Exception as e:
        health["redis"] = f"error: {str(e)[:100]}"

    if all(v == "ok" for v in health.values()):
        logger.info("System health OK: %s", health)
    else:
        logger.warning("System health DEGRADED: %s", health)

    return health
