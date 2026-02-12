"""Admin audit log routes."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.cms import AuditLog
from app.api.deps import get_current_admin

router = APIRouter(prefix="/api/admin/logs", tags=["admin-logs"])


@router.get("")
async def get_audit_logs(
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    if action:
        query = query.where(AuditLog.action == action)
    if target_type:
        query = query.where(AuditLog.target_type == target_type)

    result = await db.execute(query)
    logs = list(result.scalars().all())

    count_q = select(func.count(AuditLog.id))
    if action:
        count_q = count_q.where(AuditLog.action == action)
    if target_type:
        count_q = count_q.where(AuditLog.target_type == target_type)
    total = (await db.execute(count_q)).scalar() or 0

    return {
        "logs": [
            {
                "id": l.id,
                "admin_id": str(l.admin_id) if l.admin_id else None,
                "action": l.action,
                "target_type": l.target_type,
                "target_id": str(l.target_id) if l.target_id else None,
                "details": l.details,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
        "total": total,
    }
