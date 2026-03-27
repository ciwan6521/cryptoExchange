"""Re-export for backwards compatibility."""
from app.celery_app import celery as celery_app

__all__ = ["celery_app"]
