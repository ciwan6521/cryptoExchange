"""Admin referral overview."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, AdminUser
from app.api.deps import get_current_admin

router = APIRouter(prefix="/api/admin/referral", tags=["admin-referral"])


@router.get("/stats")
async def referral_stats(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total_referred = (await db.execute(
        select(func.count(User.id)).where(User.referred_by_user_id.isnot(None))
    )).scalar() or 0

    referrers_result = await db.execute(
        select(User).where(User.referral_code.isnot(None)).limit(100)
    )
    top = []
    for ref in referrers_result.scalars().all():
        cnt = (await db.execute(
            select(func.count(User.id)).where(User.referred_by_user_id == ref.id)
        )).scalar() or 0
        if cnt > 0:
            top.append({
                "username": ref.username,
                "referral_code": ref.referral_code,
                "referrals": cnt,
            })
    top.sort(key=lambda x: x["referrals"], reverse=True)

    return {
        "total_referred_users": total_referred,
        "top_referrers": top[:20],
    }
