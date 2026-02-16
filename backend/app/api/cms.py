"""Public CMS routes — active content for user-facing pages."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cms import CMSContent

router = APIRouter(prefix="/api/cms", tags=["cms"])


@router.get("/active")
async def get_active_cms(db: AsyncSession = Depends(get_db)):
    """Get all currently active CMS content (public endpoint)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(CMSContent).where(
            CMSContent.is_active == True,
            CMSContent.start_date <= now,
        ).order_by(CMSContent.created_at.desc())
    )
    items = list(result.scalars().all())

    # Filter out expired items
    active = []
    for c in items:
        if c.end_date and c.end_date.replace(tzinfo=None) < now:
            continue
        active.append({
            "id": str(c.id),
            "type": c.content_type,
            "title": c.title,
            "body": c.body,
            "priority": c.priority,
            "start_date": c.start_date.isoformat(),
            "end_date": c.end_date.isoformat() if c.end_date else None,
        })

    return {"content": active}
