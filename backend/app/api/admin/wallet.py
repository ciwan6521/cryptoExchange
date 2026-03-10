"""Admin wallet management — credit/debit user balances via LedgerService."""

import uuid
import hashlib
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User, AdminUser
from app.models.cms import AuditLog
from app.api.deps import require_admin_role
from app.services.ledger_service import LedgerService
from app.config import settings

router = APIRouter(prefix="/api/admin/wallet", tags=["admin-wallet"])


class WalletCreditDebitRequest(BaseModel):
    user_id: str
    asset: str
    amount: str
    reason: str


@router.post("/credit")
async def admin_wallet_credit(
    body: WalletCreditDebitRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """Credit balance to a user's wallet via LedgerService."""
    # Validate user
    try:
        uid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate amount (Decimal only, no float)
    try:
        amount = Decimal(body.amount)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount format")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    asset = body.asset.upper().strip()
    if not asset:
        raise HTTPException(status_code=400, detail="Asset symbol required")

    # Large credit protection
    large_threshold = Decimal(settings.ADMIN_LARGE_CREDIT_THRESHOLD)
    is_large = amount >= large_threshold
    if is_large and admin.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail=f"Credits >= {large_threshold} require super_admin role",
        )

    # Deterministic idempotency key
    key_input = f"admin_wallet_credit:{admin.id}:{uid}:{asset}:{body.amount}:{body.reason}"
    idempotency_key = f"awc:{hashlib.sha256(key_input.encode()).hexdigest()[:32]}"

    ledger = LedgerService(db)
    entry = await ledger.credit(
        user_id=uid,
        asset=asset,
        amount=amount,
        category="admin_credit",
        idempotency_key=idempotency_key,
        reference_type="admin_action",
        reference_id=admin.id,
        description=f"Admin wallet credit: {body.reason}",
    )

    # Audit log
    log = AuditLog(
        admin_id=admin.id,
        action="admin_wallet_credit",
        target_type="user",
        target_id=uid,
        details={
            "asset": asset,
            "amount": body.amount,
            "reason": body.reason,
            "large_operation": is_large,
            "idempotent_skip": entry is None,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {
        "ok": True,
        "amount": body.amount,
        "asset": asset,
        "large_operation": is_large,
        "idempotent_skip": entry is None,
    }


@router.post("/debit")
async def admin_wallet_debit(
    body: WalletCreditDebitRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """Debit balance from a user's wallet via LedgerService."""
    try:
        uid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        amount = Decimal(body.amount)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount format")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    asset = body.asset.upper().strip()
    if not asset:
        raise HTTPException(status_code=400, detail="Asset symbol required")

    large_threshold = Decimal(settings.ADMIN_LARGE_CREDIT_THRESHOLD)
    is_large = amount >= large_threshold
    if is_large and admin.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail=f"Debits >= {large_threshold} require super_admin role",
        )

    key_input = f"admin_wallet_debit:{admin.id}:{uid}:{asset}:{body.amount}:{body.reason}"
    idempotency_key = f"awd:{hashlib.sha256(key_input.encode()).hexdigest()[:32]}"

    ledger = LedgerService(db)
    try:
        entry = await ledger.debit(
            user_id=uid,
            asset=asset,
            amount=amount,
            category="admin_debit",
            idempotency_key=idempotency_key,
            reference_type="admin_action",
            reference_id=admin.id,
            description=f"Admin wallet debit: {body.reason}",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    log = AuditLog(
        admin_id=admin.id,
        action="admin_wallet_debit",
        target_type="user",
        target_id=uid,
        details={
            "asset": asset,
            "amount": body.amount,
            "reason": body.reason,
            "large_operation": is_large,
            "idempotent_skip": entry is None,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {
        "ok": True,
        "amount": body.amount,
        "asset": asset,
        "large_operation": is_large,
        "idempotent_skip": entry is None,
    }
