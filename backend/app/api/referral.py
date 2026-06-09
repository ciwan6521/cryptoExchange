"""Referral program API."""

import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/referral", tags=["referral"])
logger = logging.getLogger("crypto4pro.referral")


def _generate_code() -> str:
    return secrets.token_hex(4).upper()


async def ensure_referral_code(db: AsyncSession, user: User) -> str:
    if user.referral_code:
        return user.referral_code
    for _ in range(10):
        code = _generate_code()
        existing = await db.execute(select(User).where(User.referral_code == code))
        if not existing.scalar_one_or_none():
            user.referral_code = code
            await db.flush()
            return code
    raise HTTPException(status_code=500, detail="Could not generate referral code")


@router.get("/me")
async def my_referral(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = await ensure_referral_code(db, user)
    await db.commit()

    count_q = select(func.count(User.id)).where(User.referred_by_user_id == user.id)
    total = (await db.execute(count_q)).scalar() or 0

    return {
        "referral_code": code,
        "referral_link": f"/auth/register?ref={code}",
        "total_referrals": total,
    }


@router.get("/history")
async def referral_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Users referred by the current user."""
    result = await db.execute(
        select(User.id, User.username, User.email, User.created_at, User.kyc_status)
        .where(User.referred_by_user_id == user.id)
        .order_by(desc(User.created_at))
        .limit(100)
    )
    rows = result.all()
    return {
        "referrals": [
            {
                "user_id": str(r.id),
                "username": r.username,
                "email": r.email[:3] + "***" if r.email else "",
                "kyc_status": r.kyc_status,
                "joined_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.get("/validate/{code}")
async def validate_code(code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.referral_code == code.upper()))
    referrer = result.scalar_one_or_none()
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    return {"valid": True, "referrer_username": referrer.username}
