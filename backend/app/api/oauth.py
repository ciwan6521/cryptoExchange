"""Google OAuth login — token exchange, user find-or-create, session cookies."""

import logging
import secrets
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.config import settings
from app.database import get_db  # noqa: F401 — used by Depends
from app.models.user import User, UserSession
from app.models.ledger import Account
from app.utils.security import hash_password, create_access_token, create_refresh_token
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/oauth", tags=["oauth"])
logger = logging.getLogger("crypto4pro.oauth")

IS_PROD = settings.APP_ENV == "production"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
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
        path="/api/auth",
    )


async def _find_or_create_oauth_user(db: AsyncSession, email: str, name: str) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        return user

    base_username = email.split("@")[0].replace(".", "_")[:16]
    username = base_username
    for i in range(20):
        check = await db.execute(select(User).where(User.username == username))
        if not check.scalar_one_or_none():
            break
        username = f"{base_username}{i}"[:20]

    parts = name.split(" ", 1) if name else ["", ""]
    user = User(
        email=email,
        username=username,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        first_name=parts[0] or None,
        last_name=parts[1] if len(parts) > 1 else None,
        email_verified=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    for asset in ("USDT", "BTC", "ETH"):
        db.add(Account(user_id=user.id, asset=asset))

    return user


@router.get("/google")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": f"{settings.OAUTH_REDIRECT_BASE}/api/oauth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(
    response: Response,
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if error or not code:
        return RedirectResponse("/auth/login?error=oauth_cancelled")
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return RedirectResponse("/auth/login?error=oauth_not_configured")

    redirect_uri = f"{settings.OAUTH_REDIRECT_BASE}/api/oauth/google/callback"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            if token_res.status_code != 200:
                logger.error("Google token exchange failed: %s", token_res.text)
                return RedirectResponse("/auth/login?error=oauth_token_failed")

            tokens = token_res.json()
            access = tokens.get("access_token")
            if not access:
                return RedirectResponse("/auth/login?error=oauth_token_failed")

            userinfo_res = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access}"},
            )
            if userinfo_res.status_code != 200:
                return RedirectResponse("/auth/login?error=oauth_profile_failed")

            profile = userinfo_res.json()
            email = profile.get("email")
            if not email:
                return RedirectResponse("/auth/login?error=oauth_no_email")

            name = profile.get("name", "")
            user = await _find_or_create_oauth_user(db, email.lower(), name)

            if not user.is_active:
                return RedirectResponse("/auth/login?error=account_disabled")

            user.last_login_at = datetime.now(timezone.utc)
            access_token = create_access_token(str(user.id), token_type="user")
            refresh_token, refresh_expires = create_refresh_token(str(user.id))

            session = UserSession(
                user_id=user.id,
                refresh_token=refresh_token,
                expires_at=refresh_expires,
            )
            db.add(session)
            await db.commit()

            redirect = RedirectResponse("/dashboard")
            _set_auth_cookies(redirect, access_token, refresh_token)
            return redirect

    except Exception:
        logger.exception("Google OAuth callback error")
        return RedirectResponse("/auth/login?error=oauth_failed")
