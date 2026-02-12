"""Admin auth routes — separate auth flow from user auth."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.cms import AuditLog
from app.schemas.auth import AdminLoginRequest, AdminAuthResponse, AdminUserResponse
from app.utils.security import verify_password, create_access_token

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


@router.post("/login", response_model=AdminAuthResponse)
async def admin_login(body: AdminLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AdminUser).where(AdminUser.email == body.email))
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Admin account disabled")

    # TODO: TOTP verification if admin.totp_enabled

    admin.last_login_at = datetime.utcnow()
    access_token = create_access_token(str(admin.id), token_type="admin")

    # Audit log
    log = AuditLog(
        admin_id=admin.id,
        action="admin_login",
        target_type="admin_user",
        target_id=admin.id,
        details={"ip": request.client.host if request.client else None},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return AdminAuthResponse(
        admin=AdminUserResponse(
            id=admin.id, email=admin.email, username=admin.username,
            role=admin.role, is_active=admin.is_active, totp_enabled=admin.totp_enabled,
        ),
        access_token=access_token,
    )
