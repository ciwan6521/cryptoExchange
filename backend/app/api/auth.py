"""
Auth API routes — user registration, login, logout, token refresh.
Tokens are delivered via httpOnly cookies — never exposed to JavaScript.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.models.user import User, UserSession
from app.models.ledger import Account
from app.schemas.auth import (
    RegisterRequest, LoginRequest, UserResponse,
)
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.api.deps import get_current_user
from app.events.bus import EventBus

router = APIRouter(prefix="/api/auth", tags=["auth"])

IS_PROD = settings.APP_ENV == "production"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set httpOnly cookies for access and refresh tokens."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=IS_PROD,
        samesite="lax",
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=IS_PROD,
        samesite="lax",
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",  # Only sent to auth endpoints
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies on logout."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/api/auth")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Check existing email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check existing username
    existing_name = await db.execute(select(User).where(User.username == body.username))
    if existing_name.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Create user
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        last_login_at=datetime.utcnow(),
        last_login_ip=request.client.host if request.client else None,
    )
    db.add(user)
    await db.flush()

    # Create default USDT account
    usdt_account = Account(user_id=user.id, asset="USDT")
    db.add(usdt_account)

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
        pass  # Don't fail registration if event bus is down

    # Set httpOnly cookies
    _set_auth_cookies(response, access_token, refresh_token)

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
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


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # TODO: TOTP verification if user.totp_enabled

    # Update last login
    user.last_login_at = datetime.utcnow()
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

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
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


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
):
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
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


@router.post("/logout")
async def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Delete all sessions for this user
    from sqlalchemy import delete
    await db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    await db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh", response_model=UserResponse)
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh_token cookie."""
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

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="User not found or disabled")

    # Issue new access token, keep same refresh token
    new_access = create_access_token(str(user.id), token_type="user")
    response.set_cookie(
        key="access_token",
        value=new_access,
        httponly=True,
        secure=IS_PROD,
        samesite="lax",
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
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
