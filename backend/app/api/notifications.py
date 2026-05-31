"""User notification preferences API."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.platform import UserNotificationPreference
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationPrefsUpdate(BaseModel):
    email_enabled: bool | None = None
    push_enabled: bool | None = None
    trades_enabled: bool | None = None
    price_alerts_enabled: bool | None = None
    news_enabled: bool | None = None
    security_enabled: bool | None = None
    language: str | None = None


async def _get_or_create(db: AsyncSession, user_id) -> UserNotificationPreference:
    result = await db.execute(
        select(UserNotificationPreference).where(UserNotificationPreference.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = UserNotificationPreference(user_id=user_id)
        db.add(prefs)
        await db.flush()
    return prefs


def _serialize(p: UserNotificationPreference) -> dict:
    return {
        "email_enabled": p.email_enabled,
        "push_enabled": p.push_enabled,
        "trades_enabled": p.trades_enabled,
        "price_alerts_enabled": p.price_alerts_enabled,
        "news_enabled": p.news_enabled,
        "security_enabled": p.security_enabled,
        "language": p.language,
    }


@router.get("/preferences")
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await _get_or_create(db, user.id)
    await db.commit()
    return _serialize(prefs)


@router.put("/preferences")
async def update_preferences(
    body: NotificationPrefsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await _get_or_create(db, user.id)
    for field in ("email_enabled", "push_enabled", "trades_enabled", "price_alerts_enabled", "news_enabled", "security_enabled", "language"):
        val = getattr(body, field)
        if val is not None:
            setattr(prefs, field, val)
    await db.commit()
    return {"ok": True, "preferences": _serialize(prefs)}
