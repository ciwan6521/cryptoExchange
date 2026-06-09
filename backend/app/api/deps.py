"""
Dependency injection for FastAPI routes.
Provides: database sessions, current user, current admin, ledger service.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status, Request, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, AdminUser
from app.models.platform import UserApiKey
from app.utils.security import decode_token
from app.services.ledger_service import LedgerService

security = HTTPBearer(auto_error=False)


def _hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def _authenticate_api_key(raw_key: str, db: AsyncSession) -> User:
    """Validate X-API-Key header and return the owning user."""
    if not raw_key or not raw_key.startswith("c4p_"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key format")

    key_hash = _hash_api_key(raw_key)
    result = await db.execute(
        select(UserApiKey).where(UserApiKey.key_hash == key_hash, UserApiKey.is_active == True)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    user_result = await db.execute(select(User).where(User.id == api_key.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    api_key.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via JWT (cookie/Bearer) or X-API-Key header."""
    api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if api_key:
        return await _authenticate_api_key(api_key.strip(), db)

    token = None

    # 1. Try httpOnly cookie first
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        token = cookie_token

    # 2. Fallback to Bearer header (for curl/Swagger testing)
    if not token and credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(token, token_type="user")
    if not payload or payload.get("type") != "user":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    return user


def require_api_permission(permission: str):
    """Require API key to include a permission (JWT sessions bypass this check)."""
    async def checker(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
        if not api_key:
            return user

        key_hash = _hash_api_key(api_key.strip())
        result = await db.execute(
            select(UserApiKey).where(UserApiKey.key_hash == key_hash, UserApiKey.is_active == True)
        )
        key_row = result.scalar_one_or_none()
        if not key_row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

        perms = {p.strip() for p in key_row.permissions.split(",") if p.strip()}
        if permission not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key requires '{permission}' permission",
            )
        return user

    return checker


async def get_current_admin(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """Extract and validate admin from httpOnly cookie (primary) or Bearer header (fallback)."""
    token = None

    # 1. Try httpOnly cookie first
    cookie_token = request.cookies.get("admin_access_token")
    if cookie_token:
        token = cookie_token

    # 2. Fallback to Bearer header (for Swagger testing)
    if not token and credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(token, token_type="admin")
    if not payload or payload.get("type") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired admin token")

    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(AdminUser).where(AdminUser.id == uuid.UUID(admin_id)))
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
    if not admin.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin account disabled")

    return admin


def require_admin_role(*roles: str):
    """Dependency factory that checks admin role."""
    async def checker(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
        if admin.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(roles)}"
            )
        return admin
    return checker


def get_ledger_service(db: AsyncSession = Depends(get_db)) -> LedgerService:
    """Provide a LedgerService instance."""
    return LedgerService(db)
