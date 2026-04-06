"""
Admin KYC management — list, review, approve/reject KYC submissions.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, AdminUser, KYCDocument
from app.models.cms import AuditLog
from app.api.deps import get_current_admin

logger = logging.getLogger("crypto4pro.admin.kyc")

router = APIRouter(prefix="/api/admin/kyc", tags=["admin-kyc"])


class KYCRejectRequest(BaseModel):
    reason: str


@router.get("/requests")
async def list_kyc_requests(
    status: Optional[str] = Query(None, description="Filter by status: pending, approved, rejected"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status:
        conditions.append(User.kyc_status == status)
    else:
        conditions.append(User.kyc_status.in_(["pending", "approved", "rejected"]))

    count_q = select(sa_func.count(User.id)).where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    query = (
        select(User)
        .where(*conditions)
        .order_by(
            case(
                (User.kyc_status == "pending", 0),
                (User.kyc_status == "rejected", 1),
                else_=2,
            ),
            User.created_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        doc_result = await db.execute(
            select(KYCDocument).where(KYCDocument.user_id == u.id)
        )
        docs = doc_result.scalars().all()

        items.append({
            "user_id": str(u.id),
            "email": u.email,
            "username": u.username,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
            "kyc_status": u.kyc_status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "documents": [
                {
                    "id": str(d.id),
                    "document_type": d.document_type,
                    "status": d.status,
                    "rejection_reason": d.rejection_reason,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in docs
            ],
        })

    return {"requests": items, "total": total}


@router.get("/requests/{user_id}")
async def get_kyc_detail(
    user_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    doc_result = await db.execute(
        select(KYCDocument).where(KYCDocument.user_id == uid)
    )
    docs = doc_result.scalars().all()

    return {
        "user_id": str(user.id),
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "kyc_status": user.kyc_status,
        "documents": [
            {
                "id": str(d.id),
                "document_type": d.document_type,
                "status": d.status,
                "rejection_reason": d.rejection_reason,
                "original_filename": d.original_filename,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
    }


@router.get("/document/{doc_id}/image")
async def get_document_image(
    doc_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    import os

    try:
        did = _uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    result = await db.execute(select(KYCDocument).where(KYCDocument.id == did))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type = "image/png" if doc.file_path.endswith(".png") else "image/jpeg"
    return FileResponse(doc.file_path, media_type=media_type)


@router.post("/{user_id}/approve")
async def approve_kyc(
    user_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.kyc_status == "approved":
        return {"ok": True, "message": "Already approved"}

    user.kyc_status = "approved"

    doc_result = await db.execute(
        select(KYCDocument).where(KYCDocument.user_id == uid)
    )
    for doc in doc_result.scalars().all():
        doc.status = "approved"
        doc.reviewed_by = admin.id
        doc.reviewed_at = datetime.now(timezone.utc)

    audit = AuditLog(
        admin_id=admin.id,
        action="kyc_approved",
        target_type="user",
        target_id=uid,
        details={"user_email": user.email},
    )
    db.add(audit)
    await db.commit()

    logger.info("KYC approved: user=%s by admin=%s", uid, admin.id)
    return {"ok": True, "message": "KYC approved", "kyc_status": "approved"}


@router.post("/{user_id}/reject")
async def reject_kyc(
    user_id: str,
    body: KYCRejectRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.kyc_status = "rejected"

    doc_result = await db.execute(
        select(KYCDocument).where(KYCDocument.user_id == uid)
    )
    for doc in doc_result.scalars().all():
        doc.status = "rejected"
        doc.rejection_reason = body.reason
        doc.reviewed_by = admin.id
        doc.reviewed_at = datetime.now(timezone.utc)

    audit = AuditLog(
        admin_id=admin.id,
        action="kyc_rejected",
        target_type="user",
        target_id=uid,
        details={"user_email": user.email, "reason": body.reason},
    )
    db.add(audit)
    await db.commit()

    logger.info("KYC rejected: user=%s by admin=%s reason=%s", uid, admin.id, body.reason)
    return {"ok": True, "message": "KYC rejected", "kyc_status": "rejected"}
