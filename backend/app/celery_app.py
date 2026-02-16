"""
Celery application configuration with beat schedule.

Tasks:
- Daily ledger reconciliation
- Periodic health check logging

Usage:
  celery -A app.celery_app worker --loglevel=info
  celery -A app.celery_app beat --loglevel=info
"""

from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery = Celery(
    "nexus",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Beat schedule — recurring tasks
celery.conf.beat_schedule = {
    "daily-ledger-reconciliation": {
        "task": "app.tasks.celery_tasks.run_daily_reconciliation",
        "schedule": crontab(hour=3, minute=0),  # 3:00 AM UTC daily
    },
    "hourly-health-log": {
        "task": "app.tasks.celery_tasks.log_system_health",
        "schedule": crontab(minute=0),  # Every hour on the hour
    },
}
