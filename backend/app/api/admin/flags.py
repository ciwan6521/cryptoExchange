"""Admin system flags routes."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import AdminUser
from app.models.cms import SystemFlag, AuditLog
from app.api.deps import get_current_admin, require_admin_role

router = APIRouter(prefix="/api/admin/flags", tags=["admin-flags"])

DEFAULT_FLAGS = {
    "trading_enabled": True,
    "new_orders_enabled": True,
    "deposits_enabled": True,
    "withdrawals_enabled": True,
    "maintenance_mode": False,
    "registration_enabled": True,
}


class UpdateFlagRequest(BaseModel):
    value: bool


@router.get("")
async def get_flags(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemFlag))
    flags = {f.key: f.value for f in result.scalars().all()}
    # Merge with defaults
    merged = {**DEFAULT_FLAGS, **flags}
    return {"flags": merged}


@router.patch("/{key}")
async def update_flag(
    key: str,
    body: UpdateFlagRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    if key not in DEFAULT_FLAGS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown flag: {key}")

    result = await db.execute(select(SystemFlag).where(SystemFlag.key == key))
    flag = result.scalar_one_or_none()

    if flag:
        flag.value = body.value
        flag.updated_by = admin.id
    else:
        flag = SystemFlag(key=key, value=body.value, updated_by=admin.id)
        db.add(flag)

    log = AuditLog(
        admin_id=admin.id, action="update_system_flag",
        target_type="system_flag", target_id=None,
        details={"key": key, "value": body.value},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {"ok": True, "key": key, "value": body.value}
