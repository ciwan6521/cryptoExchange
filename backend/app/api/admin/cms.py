"""Admin CMS content CRUD routes."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import AdminUser
from app.models.cms import CMSContent, AuditLog
from app.api.deps import get_current_admin, require_admin_role

router = APIRouter(prefix="/api/admin/cms", tags=["admin-cms"])


class CreateCMSRequest(BaseModel):
    content_type: str  # announcement, banner, popup, maintenance
    title: str
    body: Optional[str] = None
    priority: str = "medium"
    is_active: bool = True
    start_date: str
    end_date: Optional[str] = None


class UpdateCMSRequest(BaseModel):
    content_type: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    priority: Optional[str] = None
    is_active: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CMSResponse(BaseModel):
    id: uuid.UUID
    content_type: str
    title: str
    body: Optional[str]
    priority: str
    is_active: bool
    start_date: str
    end_date: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


@router.get("")
async def list_cms(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CMSContent).order_by(CMSContent.created_at.desc()))
    items = list(result.scalars().all())
    return {"content": [_to_response(c) for c in items]}


@router.post("", response_model=CMSResponse)
async def create_cms(
    body: CreateCMSRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    content = CMSContent(
        content_type=body.content_type,
        title=body.title,
        body=body.body,
        priority=body.priority,
        is_active=body.is_active,
        start_date=datetime.fromisoformat(body.start_date),
        end_date=datetime.fromisoformat(body.end_date) if body.end_date else None,
        created_by=admin.id,
    )
    db.add(content)

    log = AuditLog(
        admin_id=admin.id, action="create_cms",
        target_type="cms_content", target_id=content.id,
        details={"title": body.title, "type": body.content_type},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()
    await db.refresh(content)

    return _to_response(content)


@router.patch("/{content_id}", response_model=CMSResponse)
async def update_cms(
    content_id: uuid.UUID,
    body: UpdateCMSRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CMSContent).where(CMSContent.id == content_id))
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="CMS content not found")

    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            if field in ("start_date", "end_date"):
                value = datetime.fromisoformat(value)
            setattr(content, field, value)
            changes[field] = str(value)

    log = AuditLog(
        admin_id=admin.id, action="update_cms",
        target_type="cms_content", target_id=content.id,
        details=changes,
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()
    await db.refresh(content)

    return _to_response(content)


@router.delete("/{content_id}")
async def delete_cms(
    content_id: uuid.UUID,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CMSContent).where(CMSContent.id == content_id))
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="CMS content not found")

    log = AuditLog(
        admin_id=admin.id, action="delete_cms",
        target_type="cms_content", target_id=content.id,
        details={"title": content.title},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.delete(content)
    await db.commit()

    return {"ok": True}


def _to_response(c: CMSContent) -> dict:
    return {
        "id": str(c.id),
        "content_type": c.content_type,
        "title": c.title,
        "body": c.body,
        "priority": c.priority,
        "is_active": c.is_active,
        "start_date": c.start_date.isoformat(),
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "created_at": c.created_at.isoformat(),
    }
