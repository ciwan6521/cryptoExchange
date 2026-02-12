"""
Celery application configuration.
Workers process background tasks: campaign evaluation, wallet processing, cleanup.
"""

from celery import Celery
from app.config import settings

celery_app = Celery(
    "nexus",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Retry policy
    task_default_retry_delay=5,
    task_max_retries=3,
)

celery_app.autodiscover_tasks(["app.tasks"])
