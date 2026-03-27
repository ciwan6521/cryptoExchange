"""
Celery application — single unified configuration.

Usage:
  celery -A app.celery_app worker --loglevel=info
  celery -A app.celery_app beat --loglevel=info
"""

from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery = Celery(
    "crypto4pro",
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
    task_default_retry_delay=5,
    task_max_retries=3,
)

celery.autodiscover_tasks(["app.tasks"])

celery.conf.beat_schedule = {
    "daily-ledger-reconciliation": {
        "task": "app.tasks.celery_tasks.run_daily_reconciliation",
        "schedule": crontab(hour=3, minute=0),
    },
    "hourly-health-log": {
        "task": "app.tasks.celery_tasks.log_system_health",
        "schedule": crontab(minute=0),
    },
    "pay4pro-reconciliation": {
        "task": "app.tasks.pay4pro_tasks.reconcile_pay4pro_balances",
        "schedule": crontab(hour="*/6", minute=15),
    },
    "pay4pro-poll-withdrawals": {
        "task": "app.tasks.pay4pro_tasks.poll_pending_withdrawals",
        "schedule": 300,
    },
}
