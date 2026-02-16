"""
User-facing withdrawal API routes.

All withdrawals go through the queue:
  request → lock funds → pending_approval → admin approve → settle

No funds leave the system without admin approval.
"""

import uuid
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.wallet import Withdrawal, WithdrawalAddress
from app.api.deps import get_current_user
from app.api.deps_flags import require_withdrawals_enabled
from app.middleware.rate_limit import rate_limit_withdrawals
from app.services.withdrawal_service import WithdrawalService, WithdrawalError
from app.services.suspicious_activity import check_suspicious_withdrawal

router = APIRouter(prefix="/api/withdrawals", tags=["withdrawals"])


class WithdrawalRequest(BaseModel):
    asset: str = Field(min_length=1, max_length=10)
    network: str = Field(min_length=1, max_length=20)
    amount: str  # String to preserve Decimal precision
    to_address: str = Field(min_length=10, max_length=255)


class AddAddressRequest(BaseModel):
    asset: str = Field(min_length=1, max_length=10)
    network: str = Field(min_length=1, max_length=20)
    address: str = Field(min_length=10, max_length=255)
    label: Optional[str] = Field(None, max_length=100)


def _serialize_withdrawal(w: Withdrawal) -> dict:
    return {
        "id": str(w.id),
        "asset": w.asset,
        "network": w.network,
        "amount": str(w.amount),
        "fee": str(w.fee),
        "to_address": w.to_address,
        "status": w.status,
        "requires_multi_approval": w.requires_multi_approval,
        "approvals_required": w.approvals_required,
        "approvals_received": w.approvals_received,
        "tx_hash": w.tx_hash,
        "rejection_reason": w.rejection_reason,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "completed_at": w.completed_at.isoformat() if w.completed_at else None,
    }


@router.post("/request", dependencies=[Depends(require_withdrawals_enabled), Depends(rate_limit_withdrawals)])
async def request_withdrawal(
    body: WithdrawalRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a withdrawal request. Funds are LOCKED (not deducted) immediately.
    An admin must approve before settlement occurs.
    """
    try:
        amount = Decimal(body.amount)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount format")

    service = WithdrawalService(db)
    client_ip = request.client.host if request.client else None
    try:
        async with db.begin_nested():
            withdrawal = await service.request_withdrawal(
                user=user,
                asset=body.asset,
                network=body.network,
                amount=amount,
                to_address=body.to_address,
                request_ip=client_ip,
            )

        # Run suspicious activity checks (logs alerts to audit_logs)
        alerts = await check_suspicious_withdrawal(db, user, withdrawal, client_ip)
        await db.commit()
    except WithdrawalError as e:
        raise HTTPException(status_code=400, detail=e.message)

    return {
        "ok": True,
        "withdrawal": _serialize_withdrawal(withdrawal),
        "message": "Withdrawal request submitted. Funds locked pending admin approval.",
        "flagged": len(alerts) > 0,
    }


@router.post("/{withdrawal_id}/cancel")
async def cancel_withdrawal(
    withdrawal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending withdrawal and unlock funds."""
    service = WithdrawalService(db)
    try:
        async with db.begin_nested():
            withdrawal = await service.user_cancel(withdrawal_id, user)
        await db.commit()
    except WithdrawalError as e:
        raise HTTPException(status_code=400, detail=e.message)

    return {"ok": True, "withdrawal": _serialize_withdrawal(withdrawal)}


@router.get("/my")
async def get_my_withdrawals(
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's withdrawal history."""
    conditions = [Withdrawal.user_id == user.id]
    if status:
        conditions.append(Withdrawal.status == status)

    count_q = select(func.count(Withdrawal.id)).where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(Withdrawal)
        .where(and_(*conditions))
        .order_by(desc(Withdrawal.created_at))
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    withdrawals = list(result.scalars().all())

    return {
        "withdrawals": [_serialize_withdrawal(w) for w in withdrawals],
        "total": total,
    }


@router.get("/addresses")
async def get_my_addresses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's saved withdrawal addresses with cooldown status."""
    result = await db.execute(
        select(WithdrawalAddress)
        .where(WithdrawalAddress.user_id == user.id)
        .order_by(WithdrawalAddress.first_added_at.desc())
    )
    addresses = list(result.scalars().all())

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    return {
        "addresses": [
            {
                "id": str(a.id),
                "asset": a.asset,
                "network": a.network,
                "address": a.address,
                "label": a.label,
                "is_whitelisted": a.is_whitelisted,
                "is_available": now >= a.cooldown_until,
                "cooldown_until": a.cooldown_until.isoformat(),
                "first_added_at": a.first_added_at.isoformat(),
            }
            for a in addresses
        ]
    }


@router.post("/addresses")
async def add_withdrawal_address(
    body: AddAddressRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pre-register a withdrawal address to start the cooldown timer."""
    from datetime import datetime, timezone, timedelta

    asset = body.asset.upper()
    network = body.network.upper()

    # Check if already exists
    existing = await db.execute(
        select(WithdrawalAddress).where(
            and_(
                WithdrawalAddress.user_id == user.id,
                WithdrawalAddress.asset == asset,
                WithdrawalAddress.network == network,
                WithdrawalAddress.address == body.address,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Address already registered")

    cooldown_hours = settings.WITHDRAWAL_ADDRESS_COOLDOWN_HOURS
    now = datetime.now(timezone.utc)
    addr = WithdrawalAddress(
        user_id=user.id,
        asset=asset,
        network=network,
        address=body.address,
        label=body.label,
        cooldown_until=now + timedelta(hours=cooldown_hours),
    )
    db.add(addr)
    await db.commit()

    return {
        "ok": True,
        "message": f"Address registered. Available for withdrawals after {cooldown_hours}h cooldown.",
        "cooldown_until": addr.cooldown_until.isoformat(),
    }

