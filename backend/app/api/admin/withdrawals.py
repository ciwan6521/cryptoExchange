"""
Admin withdrawal management routes.

Handles: listing pending withdrawals, approve/reject, settle, audit trail.
Enforces: admin self-protection, multi-admin approval, audit logging.
"""

import uuid
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.user import AdminUser
from app.models.wallet import Withdrawal, WithdrawalApproval
from app.models.cms import AuditLog
from app.api.deps import get_current_admin, require_admin_role
from app.services.withdrawal_service import WithdrawalService, WithdrawalError
from app.config import settings

router = APIRouter(prefix="/api/admin/withdrawals", tags=["admin-withdrawals"])


class ApproveRequest(BaseModel):
    comment: Optional[str] = Field(None, max_length=500)
    totp_code: Optional[str] = Field(None, max_length=6)


class RejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class SettleRequest(BaseModel):
    tx_hash: Optional[str] = Field(None, max_length=255)


def _serialize_withdrawal(w: Withdrawal) -> dict:
    return {
        "id": str(w.id),
        "user_id": str(w.user_id),
        "asset": w.asset,
        "network": w.network,
        "amount": str(w.amount),
        "fee": str(w.fee),
        "to_address": w.to_address,
        "status": w.status,
        "requires_multi_approval": w.requires_multi_approval,
        "approvals_required": w.approvals_required,
        "approvals_received": w.approvals_received,
        "reviewed_by": str(w.reviewed_by) if w.reviewed_by else None,
        "reviewed_at": w.reviewed_at.isoformat() if w.reviewed_at else None,
        "rejection_reason": w.rejection_reason,
        "tx_hash": w.tx_hash,
        "pay4pro_withdrawal_id": w.pay4pro_withdrawal_id,
        "request_ip": w.request_ip,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "completed_at": w.completed_at.isoformat() if w.completed_at else None,
    }


@router.get("")
async def list_withdrawals(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List withdrawals with optional status filter. Defaults to pending_approval."""
    conditions = []
    if status:
        conditions.append(Withdrawal.status == status)

    count_q = select(func.count(Withdrawal.id))
    if conditions:
        count_q = count_q.where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    q = select(Withdrawal).order_by(desc(Withdrawal.created_at)).limit(limit).offset(offset)
    if conditions:
        q = q.where(and_(*conditions))

    result = await db.execute(q)
    withdrawals = list(result.scalars().all())

    return {
        "withdrawals": [_serialize_withdrawal(w) for w in withdrawals],
        "total": total,
    }


@router.get("/pending")
async def list_pending_withdrawals(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Convenience: list only pending_approval withdrawals."""
    result = await db.execute(
        select(Withdrawal)
        .where(Withdrawal.status == "pending_approval")
        .order_by(Withdrawal.created_at.asc())  # FIFO
    )
    withdrawals = list(result.scalars().all())
    return {
        "withdrawals": [_serialize_withdrawal(w) for w in withdrawals],
        "total": len(withdrawals),
    }


@router.get("/{withdrawal_id}")
async def get_withdrawal_detail(
    withdrawal_id: uuid.UUID,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get withdrawal detail including approval trail."""
    result = await db.execute(
        select(Withdrawal).where(Withdrawal.id == withdrawal_id)
    )
    withdrawal = result.scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")

    # Get approval trail
    approvals_result = await db.execute(
        select(WithdrawalApproval)
        .where(WithdrawalApproval.withdrawal_id == withdrawal_id)
        .order_by(WithdrawalApproval.created_at.asc())
    )
    approvals = list(approvals_result.scalars().all())

    return {
        "withdrawal": _serialize_withdrawal(withdrawal),
        "approvals": [
            {
                "id": str(a.id),
                "admin_id": str(a.admin_id),
                "action": a.action,
                "comment": a.comment,
                "ip_address": a.ip_address,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in approvals
        ],
    }


@router.post("/{withdrawal_id}/approve")
async def approve_withdrawal(
    withdrawal_id: uuid.UUID,
    body: ApproveRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a withdrawal. For large withdrawals, multiple admins must approve.
    Same admin cannot approve twice. TOTP required if admin has it enabled.

    Risk prevented: Single compromised admin cannot authorize fund outflow.
    Stolen session cookie alone is insufficient — TOTP re-verification required.
    """
    # TOTP re-verification for withdrawal approval
    if admin.totp_enabled:
        if not body.totp_code:
            raise HTTPException(status_code=400, detail="TOTP code required for withdrawal approval")
        import pyotp
        totp = pyotp.TOTP(admin.totp_secret)
        if not totp.verify(body.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid TOTP code")

    service = WithdrawalService(db)
    try:
        async with db.begin_nested():
            withdrawal = await service.admin_approve(
                withdrawal_id=withdrawal_id,
                admin=admin,
                ip_address=request.client.host if request.client else None,
                comment=body.comment,
            )

        # Audit log
        log = AuditLog(
            admin_id=admin.id,
            action="withdrawal_approve",
            target_type="withdrawal",
            target_id=withdrawal_id,
            details={
                "amount": str(withdrawal.amount),
                "asset": withdrawal.asset,
                "to_address": withdrawal.to_address,
                "approvals": f"{withdrawal.approvals_received}/{withdrawal.approvals_required}",
                "final_approval": withdrawal.status == "approved",
            },
            ip_address=request.client.host if request.client else None,
        )
        db.add(log)
        await db.commit()

        # If fully approved, send to Pay4Pro for blockchain settlement
        p4p_sent = False
        if withdrawal.status == "approved":
            try:
                from app.services.pay4pro_client import get_pay4pro_client
                p4p = get_pay4pro_client()
                if p4p.base_url:
                    chain = (withdrawal.network or "bsc").lower()
                    p4p_result = await p4p.request_withdrawal(
                        user_id=str(withdrawal.user_id),
                        amount=withdrawal.amount,
                        wallet_address=withdrawal.to_address,
                        currency=withdrawal.asset,
                        chain=chain,
                        metadata={"crypto4pro_withdrawal_id": str(withdrawal.id)},
                    )
                    withdrawal.pay4pro_withdrawal_id = p4p_result.withdraw_id or p4p_result.transaction_id
                    withdrawal.status = "processing"
                    await db.commit()
                    p4p_sent = True
            except Exception as e:
                import logging
                logging.getLogger("crypto4pro.admin").error(
                    "Pay4Pro withdrawal send failed for %s: %s", withdrawal_id, e
                )

    except WithdrawalError as e:
        raise HTTPException(status_code=400, detail=e.message)

    msg = "Withdrawal approved and sent to Pay4Pro for settlement." if p4p_sent else (
        "Withdrawal approved and ready for settlement."
        if withdrawal.status == "approved"
        else f"Approval recorded ({withdrawal.approvals_received}/{withdrawal.approvals_required}). Awaiting more approvals."
    )

    return {
        "ok": True,
        "withdrawal": _serialize_withdrawal(withdrawal),
        "message": msg,
    }


@router.post("/{withdrawal_id}/reject")
async def reject_withdrawal(
    withdrawal_id: uuid.UUID,
    body: RejectRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a withdrawal. Locked funds are returned to user's available balance.

    Risk prevented: Users always get their locked funds back on rejection.
    """
    service = WithdrawalService(db)
    try:
        async with db.begin_nested():
            withdrawal = await service.admin_reject(
                withdrawal_id=withdrawal_id,
                admin=admin,
                reason=body.reason,
                ip_address=request.client.host if request.client else None,
            )

        log = AuditLog(
            admin_id=admin.id,
            action="withdrawal_reject",
            target_type="withdrawal",
            target_id=withdrawal_id,
            details={
                "amount": str(withdrawal.amount),
                "asset": withdrawal.asset,
                "reason": body.reason,
            },
            ip_address=request.client.host if request.client else None,
        )
        db.add(log)
        await db.commit()
    except WithdrawalError as e:
        raise HTTPException(status_code=400, detail=e.message)

    return {"ok": True, "withdrawal": _serialize_withdrawal(withdrawal)}


@router.post("/{withdrawal_id}/settle")
async def settle_withdrawal(
    withdrawal_id: uuid.UUID,
    body: SettleRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "finance")),
    db: AsyncSession = Depends(get_db),
):
    """
    Settle an approved withdrawal — deducts locked funds from ledger.
    Call this AFTER blockchain tx is confirmed (or for manual settlement).

    Risk prevented: Funds only leave the system after explicit settlement.
    Double-settlement prevented by idempotency key.
    """
    service = WithdrawalService(db)
    try:
        async with db.begin_nested():
            withdrawal = await service.settle_withdrawal(
                withdrawal_id=withdrawal_id,
                tx_hash=body.tx_hash,
            )

        log = AuditLog(
            admin_id=admin.id,
            action="withdrawal_settle",
            target_type="withdrawal",
            target_id=withdrawal_id,
            details={
                "amount": str(withdrawal.amount),
                "asset": withdrawal.asset,
                "tx_hash": body.tx_hash,
            },
            ip_address=request.client.host if request.client else None,
        )
        db.add(log)
        await db.commit()
    except WithdrawalError as e:
        raise HTTPException(status_code=400, detail=e.message)

    return {"ok": True, "withdrawal": _serialize_withdrawal(withdrawal)}


@router.get("/stats/summary")
async def withdrawal_stats(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard stats: pending count, today's total, etc."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Pending count
    pending_q = select(func.count(Withdrawal.id)).where(
        Withdrawal.status == "pending_approval"
    )
    pending_count = (await db.execute(pending_q)).scalar() or 0

    # Today's approved total
    today_approved_q = select(
        func.coalesce(func.sum(Withdrawal.amount), Decimal("0"))
    ).where(
        and_(
            Withdrawal.status.in_(["approved", "processing", "completed"]),
            Withdrawal.created_at >= day_start,
        )
    )
    today_total = (await db.execute(today_approved_q)).scalar() or Decimal("0")

    return {
        "pending_count": pending_count,
        "today_approved_total": str(today_total),
        "multi_approval_threshold": settings.WITHDRAWAL_MULTI_APPROVAL_THRESHOLD,
        "daily_limit_per_user": settings.WITHDRAWAL_DAILY_LIMIT_USDT,
    }
