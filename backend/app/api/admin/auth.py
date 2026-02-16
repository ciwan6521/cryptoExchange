"""Admin auth routes — separate auth flow from user auth."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.models.user import AdminUser
from app.models.cms import AuditLog
from app.schemas.auth import AdminLoginRequest, AdminLoginResponse, AdminUserResponse
from app.utils.security import verify_password, create_access_token
from app.api.deps import get_current_admin
from app.middleware.rate_limit import rate_limit_auth

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])

IS_PROD = settings.APP_ENV == "production"


def _set_admin_cookie(response: Response, token: str) -> None:
    """Set httpOnly cookie for admin JWT — never exposed to JavaScript."""
    response.set_cookie(
        key="admin_access_token",
        value=token,
        httponly=True,
        secure=IS_PROD,
        samesite="strict",
        max_age=settings.ADMIN_JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/api/admin",
    )


def _clear_admin_cookie(response: Response) -> None:
    response.delete_cookie(key="admin_access_token", path="/api/admin")


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Rate limit: per-IP on auth endpoints
    await rate_limit_auth(request)

    result = await db.execute(select(AdminUser).where(AdminUser.email == body.email))
    admin = result.scalar_one_or_none()

    # Account lockout check
    if admin and admin.locked_until and admin.locked_until > datetime.now(timezone.utc):
        remaining = int((admin.locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
        raise HTTPException(status_code=423, detail=f"Account locked. Try again in {remaining} minutes.")

    if not admin or not verify_password(body.password, admin.password_hash):
        # Increment failed attempts if admin exists
        if admin:
            admin.failed_login_attempts = (admin.failed_login_attempts or 0) + 1
            if admin.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
                admin.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
                log = AuditLog(
                    admin_id=admin.id, action="admin_account_locked",
                    target_type="admin_user", target_id=admin.id,
                    details={"reason": "max_login_attempts", "attempts": admin.failed_login_attempts},
                    ip_address=request.client.host if request.client else None,
                )
                db.add(log)
            await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Admin account disabled")

    # TOTP verification if enabled
    if admin.totp_enabled:
        if not body.totp_code:
            raise HTTPException(status_code=400, detail="TOTP code required")
        import pyotp
        totp = pyotp.TOTP(admin.totp_secret)
        if not totp.verify(body.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid TOTP code")

    # Success — reset lockout counters
    admin.failed_login_attempts = 0
    admin.locked_until = None
    admin.last_login_at = datetime.now(timezone.utc)
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

    # Set httpOnly cookie — token never in response body
    _set_admin_cookie(response, access_token)

    resp_data = AdminLoginResponse(
        admin=AdminUserResponse(
            id=admin.id, email=admin.email, username=admin.username,
            role=admin.role, is_active=admin.is_active, totp_enabled=admin.totp_enabled,
        ),
    )

    # If force_password_change is set, include a flag (no access until changed)
    if admin.force_password_change:
        return {"admin": resp_data.admin, "force_password_change": True}

    return resp_data


@router.post("/logout")
async def admin_logout(
    response: Response,
    admin: AdminUser = Depends(get_current_admin),
):
    _clear_admin_cookie(response)
    return {"ok": True}
