"""Admin user management routes."""

import uuid
import hashlib
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, AdminUser
from app.models.cms import AuditLog
from app.api.deps import get_current_admin, get_ledger_service, require_admin_role
from app.services.ledger_service import LedgerService
from app.schemas.ledger import AdminCreditDebitRequest
from app.config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


class UserListResponse(BaseModel):
    users: list[dict]
    total: int


class UpdateUserFlagsRequest(BaseModel):
    is_active: Optional[bool] = None
    trading_enabled: Optional[bool] = None
    withdrawals_enabled: Optional[bool] = None
    kyc_status: Optional[str] = None
    member_tier: Optional[str] = None


@router.get("", response_model=UserListResponse)
async def list_users(
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if search:
        # Sanitize: limit length, strip SQL wildcards
        search = search[:100].replace("%", "").replace("_", "")
        query = query.where(
            User.email.ilike(f"%{search}%") | User.username.ilike(f"%{search}%")
        )
    result = await db.execute(query)
    users = list(result.scalars().all())

    count_q = select(func.count(User.id))
    if search:
        count_q = count_q.where(
            User.email.ilike(f"%{search}%") | User.username.ilike(f"%{search}%")
        )
    total = (await db.execute(count_q)).scalar() or 0

    return UserListResponse(
        users=[
            {
                "id": str(u.id), "email": u.email, "username": u.username,
                "is_active": u.is_active, "is_verified": u.is_verified,
                "kyc_status": u.kyc_status, "member_tier": u.member_tier,
                "trading_enabled": u.trading_enabled, "withdrawals_enabled": u.withdrawals_enabled,
                "created_at": u.created_at.isoformat(),
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in users
        ],
        total=total,
    )


@router.patch("/{user_id}")
async def update_user_flags(
    user_id: uuid.UUID,
    body: UpdateUserFlagsRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes = {}
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        changes["is_active"] = body.is_active
    if body.trading_enabled is not None and body.trading_enabled != user.trading_enabled:
        user.trading_enabled = body.trading_enabled
        changes["trading_enabled"] = body.trading_enabled
    if body.withdrawals_enabled is not None and body.withdrawals_enabled != user.withdrawals_enabled:
        user.withdrawals_enabled = body.withdrawals_enabled
        changes["withdrawals_enabled"] = body.withdrawals_enabled
    if body.kyc_status is not None:
        user.kyc_status = body.kyc_status
        changes["kyc_status"] = body.kyc_status
    if body.member_tier is not None:
        user.member_tier = body.member_tier
        changes["member_tier"] = body.member_tier

    if changes:
        log = AuditLog(
            admin_id=admin.id, action="update_user_flags",
            target_type="user", target_id=user.id,
            details=changes,
            ip_address=request.client.host if request.client else None,
        )
        db.add(log)
        await db.commit()

    return {"ok": True, "changes": changes}


@router.post("/{user_id}/credit")
async def admin_credit_user(
    user_id: uuid.UUID,
    body: AdminCreditDebitRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """Manual balance credit by admin. Creates ledger entry."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    amount = Decimal(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Admin self-protection: large credits require super_admin
    large_threshold = Decimal(settings.ADMIN_LARGE_CREDIT_THRESHOLD)
    is_large = amount >= large_threshold
    if is_large and admin.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail=f"Credits >= {large_threshold} USDT require super_admin role",
        )

    ledger = LedgerService(db)
    # Deterministic idempotency key — prevents double-credit on retry
    key_input = f"admin_credit:{admin.id}:{user_id}:{body.asset}:{body.amount}:{body.reason}"
    idempotency_key = f"admin_credit:{hashlib.sha256(key_input.encode()).hexdigest()[:32]}"

    async with db.begin_nested():
        entry = await ledger.credit(
            user_id=user_id,
            asset=body.asset.upper(),
            amount=amount,
            category="admin_credit",
            idempotency_key=idempotency_key,
            reference_type="admin_action",
            reference_id=admin.id,
            description=f"Admin credit: {body.reason}",
        )

    log = AuditLog(
        admin_id=admin.id, action="admin_credit",
        target_type="user", target_id=user_id,
        details={
            "asset": body.asset, "amount": body.amount, "reason": body.reason,
            "large_operation": is_large,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {"ok": True, "amount": body.amount, "asset": body.asset, "large_operation": is_large}


@router.post("/{user_id}/debit")
async def admin_debit_user(
    user_id: uuid.UUID,
    body: AdminCreditDebitRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """Manual balance debit by admin. Creates ledger entry."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    amount = Decimal(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Admin self-protection: large debits require super_admin
    large_threshold = Decimal(settings.ADMIN_LARGE_CREDIT_THRESHOLD)
    is_large = amount >= large_threshold
    if is_large and admin.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail=f"Debits >= {large_threshold} USDT require super_admin role",
        )

    ledger = LedgerService(db)
    # Deterministic idempotency key — prevents double-debit on retry
    key_input = f"admin_debit:{admin.id}:{user_id}:{body.asset}:{body.amount}:{body.reason}"
    idempotency_key = f"admin_debit:{hashlib.sha256(key_input.encode()).hexdigest()[:32]}"

    try:
        async with db.begin_nested():
            entry = await ledger.debit(
                user_id=user_id,
                asset=body.asset.upper(),
                amount=amount,
                category="admin_debit",
                idempotency_key=idempotency_key,
                reference_type="admin_action",
                reference_id=admin.id,
                description=f"Admin debit: {body.reason}",
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    log = AuditLog(
        admin_id=admin.id, action="admin_debit",
        target_type="user", target_id=user_id,
        details={
            "asset": body.asset, "amount": body.amount, "reason": body.reason,
            "large_operation": is_large,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {"ok": True, "amount": body.amount, "asset": body.asset, "large_operation": is_large}
