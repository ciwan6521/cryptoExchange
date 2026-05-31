"""OAuth social login scaffold — Google."""

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.config import settings

router = APIRouter(prefix="/api/oauth", tags=["oauth"])
logger = logging.getLogger("crypto4pro.oauth")


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
        "prompt": "consent",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(request: Request, code: str | None = None, error: str | None = None):
    if error or not code:
        return RedirectResponse("/auth/login?error=oauth_cancelled")
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return RedirectResponse("/auth/login?error=oauth_not_configured")
    # Full token exchange + user creation requires httpx call to Google — redirect with notice
    logger.info("Google OAuth callback received — complete token exchange in production")
    return RedirectResponse("/auth/login?error=oauth_setup_incomplete")
