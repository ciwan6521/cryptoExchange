"""
Auth API routes — user registration, login, logout, token refresh,
password reset, email verification, profile management.
Tokens are delivered via httpOnly cookies — never exposed to JavaScript.
"""

import uuid
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.database import get_db
from app.config import settings
from app.models.user import User, UserSession
from app.models.ledger import Account
from app.schemas.auth import (
    RegisterRequest, LoginRequest, UserResponse,
    ForgotPasswordRequest, ResetPasswordRequest,
    ChangePasswordRequest, UpdateProfileRequest, SessionResponse,
    VerifyEmailCodeRequest, ResendVerificationCodeRequest,
)
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.api.deps import get_current_user
from app.events.bus import EventBus
from app.utils.password_policy import validate_password
from app.services.email_service import send_password_reset_email, send_email_verification, send_login_alert, send_verification_code
from app.middleware.rate_limit import rate_limit_auth

router = APIRouter(prefix="/api/auth", tags=["auth"])

IS_PROD = settings.APP_ENV == "production"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set httpOnly cookies for access and refresh tokens."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=IS_PROD,
        samesite="strict",
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=IS_PROD,
        samesite="strict",
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",  # Only sent to auth endpoints
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies on logout."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/api/auth")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_auth)])
async def register(body: RegisterRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Check existing email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check existing username
    existing_name = await db.execute(select(User).where(User.username == body.username))
    if existing_name.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Enforce password policy
    pw_errors = validate_password(body.password, is_admin=False)
    if pw_errors:
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    # Create user
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        phone=body.phone.strip(),
        last_login_at=datetime.now(timezone.utc),
        last_login_ip=request.client.host if request.client else None,
    )
    db.add(user)
    await db.flush()

    # Create default USDT account
    usdt_account = Account(user_id=user.id, asset="USDT")
    db.add(usdt_account)

    # Create Pay4Pro wallet (non-blocking — registration succeeds even if Pay4Pro is down)
    try:
        from app.services.pay4pro_client import get_pay4pro_client
        from app.models.wallet import Wallet
        p4p = get_pay4pro_client()
        if p4p.base_url:
            p4p_wallet = await p4p.get_or_create_wallet(user_id=str(user.id))
            wallet = Wallet(
                user_id=user.id,
                asset=settings.PAY4PRO_DEFAULT_ASSET,
                network=settings.PAY4PRO_DEFAULT_NETWORK,
                address=p4p_wallet.address,
                external_wallet_id=p4p_wallet.user_id,
            )
            db.add(wallet)
            await db.flush()
    except Exception as e:
        import logging
        logging.getLogger("crypto4pro.auth").warning("Pay4Pro wallet creation failed for user %s: %s", user.id, e)

    # Create session
    access_token = create_access_token(str(user.id), token_type="user")
    refresh_token, refresh_expires = create_refresh_token(str(user.id))

    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=refresh_expires,
    )
    db.add(session)
    await db.commit()

    # Publish event for campaign engine
    try:
        bus = await EventBus.get_instance()
        await bus.publish_user_registered(str(user.id), user.email)
    except Exception:
        pass

    # Send 6-digit verification code (non-blocking — don't fail registration)
    try:
        import random
        code = f"{random.randint(0, 999999):06d}"
        r = await _get_redis()
        await r.setex(f"{VERIFY_CODE_PREFIX}{user.id}", VERIFY_CODE_TTL, code)
        await r.aclose()
        send_verification_code(user.email, code)
    except Exception:
        pass

    # Set httpOnly cookies
    _set_auth_cookies(response, access_token, refresh_token)

    return _user_response(user)


@router.post("/login", response_model=UserResponse, dependencies=[Depends(rate_limit_auth)])
async def login(body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # TOTP verification
    if user.totp_enabled:
        if not body.totp_code:
            raise HTTPException(status_code=403, detail="2FA code required")
        import pyotp
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(body.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = request.client.host if request.client else None

    # Create tokens
    access_token = create_access_token(str(user.id), token_type="user")
    refresh_token, refresh_expires = create_refresh_token(str(user.id))

    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=refresh_expires,
    )
    db.add(session)
    await db.commit()

    # Set httpOnly cookies
    _set_auth_cookies(response, access_token, refresh_token)

    return _user_response(user)


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
):
    return _user_response(user
    )


@router.post("/logout")
async def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Delete all sessions for this user (revokes all refresh tokens)
    await db.execute(sa_delete(UserSession).where(UserSession.user_id == user.id))
    await db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh", response_model=UserResponse)
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh_token cookie. Validates against DB and rotates token."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(token, token_type="user")
    if not payload or payload.get("type") != "refresh":
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # CRITICAL: Validate refresh token exists in DB (catches revoked tokens)
    session_result = await db.execute(
        select(UserSession).where(
            UserSession.refresh_token == token,
            UserSession.user_id == uuid.UUID(user_id),
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        # Token was revoked (e.g., by logout) — clear cookies and reject
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    # Check expiry
    if session.expires_at < datetime.now(timezone.utc):
        await db.delete(session)
        await db.commit()
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token expired")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="User not found or disabled")

    # Token rotation: delete old session, create new refresh token
    await db.delete(session)

    new_access = create_access_token(str(user.id), token_type="user")
    new_refresh, new_refresh_expires = create_refresh_token(str(user.id))

    new_session = UserSession(
        user_id=user.id,
        refresh_token=new_refresh,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=new_refresh_expires,
    )
    db.add(new_session)
    await db.commit()

    # Set rotated cookies
    _set_auth_cookies(response, new_access, new_refresh)

    return _user_response(user)


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        is_active=user.is_active,
        is_verified=user.is_verified,
        email_verified=user.email_verified,
        kyc_status=user.kyc_status,
        member_tier=user.member_tier,
        trading_enabled=user.trading_enabled,
        withdrawals_enabled=user.withdrawals_enabled,
        totp_enabled=user.totp_enabled,
        created_at=user.created_at.isoformat(),
    )


# ── Redis helper for tokens ──

async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL)


RESET_TOKEN_PREFIX = "pw_reset:"
VERIFY_TOKEN_PREFIX = "email_verify:"
VERIFY_CODE_PREFIX = "email_verify_code:"
RESET_TOKEN_TTL = 3600        # 1 hour
VERIFY_TOKEN_TTL = 86400      # 24 hours
VERIFY_CODE_TTL = 600          # 10 minutes


# ── Forgot Password ──

@router.post("/forgot-password", dependencies=[Depends(rate_limit_auth)])
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Send a password reset email. Always returns 200 to prevent email enumeration."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        token = secrets.token_urlsafe(48)
        r = await _get_redis()
        await r.setex(f"{RESET_TOKEN_PREFIX}{token}", RESET_TOKEN_TTL, str(user.id))
        await r.aclose()
        send_password_reset_email(user.email, token)

    return {"ok": True, "message": "If this email is registered, a reset link has been sent."}


# ── Reset Password ──

@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    r = await _get_redis()
    user_id_str = await r.get(f"{RESET_TOKEN_PREFIX}{body.token}")
    if not user_id_str:
        await r.aclose()
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user_id_str = user_id_str.decode() if isinstance(user_id_str, bytes) else user_id_str
    pw_errors = validate_password(body.password, is_admin=False)
    if pw_errors:
        await r.aclose()
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if not user:
        await r.aclose()
        raise HTTPException(status_code=400, detail="User not found")

    user.password_hash = hash_password(body.password)
    await db.execute(sa_delete(UserSession).where(UserSession.user_id == user.id))
    await db.commit()

    await r.delete(f"{RESET_TOKEN_PREFIX}{body.token}")
    await r.aclose()

    return {"ok": True, "message": "Password has been reset. Please log in."}


# ── Email Verification ──

@router.post("/send-verification")
async def send_verification_email(
    user: User = Depends(get_current_user),
):
    if user.email_verified:
        return {"ok": True, "message": "Email already verified"}

    token = secrets.token_urlsafe(48)
    r = await _get_redis()
    await r.setex(f"{VERIFY_TOKEN_PREFIX}{token}", VERIFY_TOKEN_TTL, str(user.id))
    await r.aclose()
    send_email_verification(user.email, token)
    return {"ok": True, "message": "Verification email sent"}


@router.post("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    r = await _get_redis()
    user_id_str = await r.get(f"{VERIFY_TOKEN_PREFIX}{token}")
    if not user_id_str:
        await r.aclose()
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    user_id_str = user_id_str.decode() if isinstance(user_id_str, bytes) else user_id_str
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if not user:
        await r.aclose()
        raise HTTPException(status_code=400, detail="User not found")

    user.email_verified = True
    await db.commit()

    await r.delete(f"{VERIFY_TOKEN_PREFIX}{token}")
    await r.aclose()
    return {"ok": True, "message": "Email verified successfully"}


# ── Email Verification (6-digit code) ──

@router.post("/verify-email-code")
async def verify_email_code(
    body: VerifyEmailCodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.email_verified:
        return {"ok": True, "message": "Email already verified"}

    r = await _get_redis()
    stored_code = await r.get(f"{VERIFY_CODE_PREFIX}{user.id}")
    if not stored_code:
        await r.aclose()
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")

    stored_code = stored_code.decode() if isinstance(stored_code, bytes) else stored_code
    if stored_code != body.code:
        await r.aclose()
        raise HTTPException(status_code=400, detail="Invalid verification code")

    user.email_verified = True
    await db.commit()

    await r.delete(f"{VERIFY_CODE_PREFIX}{user.id}")
    await r.aclose()
    return {"ok": True, "message": "Email verified successfully"}


@router.post("/resend-verification-code")
async def resend_verification_code(
    user: User = Depends(get_current_user),
):
    if user.email_verified:
        return {"ok": True, "message": "Email already verified"}

    import random
    code = f"{random.randint(0, 999999):06d}"
    r = await _get_redis()
    await r.setex(f"{VERIFY_CODE_PREFIX}{user.id}", VERIFY_CODE_TTL, code)
    await r.aclose()
    send_verification_code(user.email, code)
    return {"ok": True, "message": "Verification code sent"}


# ── Change Password ──

@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    pw_errors = validate_password(body.new_password, is_admin=False)
    if pw_errors:
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True, "message": "Password changed successfully"}


# ── Update Profile ──

@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.username and body.username != user.username:
        existing = await db.execute(select(User).where(User.username == body.username))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = body.username

    await db.commit()
    return _user_response(user)


# ── Sessions Management ──

@router.get("/sessions")
async def get_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.desc())
    )
    sessions = result.scalars().all()

    current_token = request.cookies.get("refresh_token")
    return {
        "sessions": [
            SessionResponse(
                id=str(s.id),
                ip_address=s.ip_address,
                user_agent=s.user_agent,
                created_at=s.created_at.isoformat(),
                is_current=s.refresh_token == current_token,
            ).model_dump()
            for s in sessions
        ]
    }


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == uuid.UUID(session_id),
            UserSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()
    return {"ok": True}


# ── Two-Factor Authentication (TOTP) ──

@router.post("/2fa/setup")
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new TOTP secret and provisioning URI (QR code data)."""
    import pyotp
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")

    secret = pyotp.random_base32()
    user.totp_secret = secret
    await db.commit()

    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user.email, issuer_name="Crypto4Pro")

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
    }


@router.post("/2fa/enable")
async def enable_2fa(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify TOTP code and enable 2FA on the account."""
    import pyotp
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Run /2fa/setup first")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    user.totp_enabled = True
    await db.commit()
    return {"ok": True, "message": "2FA enabled successfully"}


@router.post("/2fa/disable")
async def disable_2fa(
    code: str,
    password: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable 2FA — requires current TOTP code and password for security."""
    import pyotp
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid password")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    user.totp_enabled = False
    user.totp_secret = None
    await db.commit()
    return {"ok": True, "message": "2FA disabled"}
