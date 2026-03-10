"""
Admin CRUD for deposit methods (crypto wallet addresses & bank accounts).
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.deposit_method import DepositMethod
from app.models.cms import AuditLog
from app.api.deps import get_current_admin
from app.models.user import AdminUser

router = APIRouter(prefix="/api/admin/deposit-methods", tags=["admin-deposit-methods"])


# ── Schemas ──

class DepositMethodCreate(BaseModel):
    method_type: str = Field(..., pattern="^(crypto_wallet|bank_transfer)$")
    label: str = Field(..., min_length=1, max_length=100)
    asset: Optional[str] = None
    network: Optional[str] = None
    address: Optional[str] = None
    memo_tag: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    iban: Optional[str] = None
    swift_code: Optional[str] = None
    currency: Optional[str] = None
    reference_note: Optional[str] = None
    notes: Optional[str] = None
    min_amount: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class DepositMethodUpdate(BaseModel):
    label: Optional[str] = None
    asset: Optional[str] = None
    network: Optional[str] = None
    address: Optional[str] = None
    memo_tag: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    iban: Optional[str] = None
    swift_code: Optional[str] = None
    currency: Optional[str] = None
    reference_note: Optional[str] = None
    notes: Optional[str] = None
    min_amount: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


def _serialize(m: DepositMethod) -> dict:
    return {
        "id": str(m.id),
        "method_type": m.method_type,
        "label": m.label,
        "asset": m.asset,
        "network": m.network,
        "address": m.address,
        "memo_tag": m.memo_tag,
        "bank_name": m.bank_name,
        "account_holder": m.account_holder,
        "iban": m.iban,
        "swift_code": m.swift_code,
        "currency": m.currency,
        "reference_note": m.reference_note,
        "notes": m.notes,
        "min_amount": m.min_amount,
        "is_active": m.is_active,
        "sort_order": m.sort_order,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ── Endpoints ──

@router.get("")
async def list_deposit_methods(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    result = await db.execute(
        select(DepositMethod).order_by(DepositMethod.sort_order, DepositMethod.created_at)
    )
    methods = result.scalars().all()
    return {"methods": [_serialize(m) for m in methods]}


@router.post("")
async def create_deposit_method(
    body: DepositMethodCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    method = DepositMethod(**body.model_dump())
    db.add(method)
    db.add(AuditLog(
        admin_id=admin.id,
        action="deposit_method_created",
        target_type="deposit_method",
        details={"label": body.label, "method_type": body.method_type},
    ))
    await db.commit()
    await db.refresh(method)
    return _serialize(method)


@router.patch("/{method_id}")
async def update_deposit_method(
    method_id: uuid.UUID,
    body: DepositMethodUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    result = await db.execute(select(DepositMethod).where(DepositMethod.id == method_id))
    method = result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Deposit method not found")

    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        old = getattr(method, field)
        if old != value:
            setattr(method, field, value)
            changes[field] = {"old": str(old), "new": str(value)}

    if changes:
        db.add(AuditLog(
            admin_id=admin.id,
            action="deposit_method_updated",
            target_type="deposit_method",
            target_id=method.id,
            details=changes,
        ))
        await db.commit()
        await db.refresh(method)

    return {"ok": True, "method": _serialize(method)}


@router.delete("/{method_id}")
async def delete_deposit_method(
    method_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    result = await db.execute(select(DepositMethod).where(DepositMethod.id == method_id))
    method = result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Deposit method not found")

    db.add(AuditLog(
        admin_id=admin.id,
        action="deposit_method_deleted",
        target_type="deposit_method",
        target_id=method.id,
        details={"label": method.label},
    ))
    await db.delete(method)
    await db.commit()
    return {"ok": True}
