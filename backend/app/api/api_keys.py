"""User API key management."""

import secrets
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.platform import UserApiKey
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])
logger = logging.getLogger("crypto4pro.api_keys")


class CreateApiKeyRequest(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    permissions: str = Field(default="read,trade", max_length=100)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@router.get("")
async def list_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserApiKey)
        .where(UserApiKey.user_id == user.id)
        .order_by(desc(UserApiKey.created_at))
    )
    keys = list(result.scalars().all())
    return {
        "keys": [
            {
                "id": str(k.id),
                "label": k.label,
                "key_prefix": k.key_prefix,
                "permissions": k.permissions,
                "is_active": k.is_active,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "created_at": k.created_at.isoformat(),
            }
            for k in keys
        ],
    }


@router.post("")
async def create_key(
    body: CreateApiKeyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC required to create API keys.")

    count = await db.execute(
        select(UserApiKey).where(UserApiKey.user_id == user.id, UserApiKey.is_active == True)
    )
    if len(list(count.scalars().all())) >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 active API keys allowed.")

    raw_key = f"c4p_{secrets.token_urlsafe(32)}"
    prefix = raw_key[:12]
    key = UserApiKey(
        user_id=user.id,
        label=body.label,
        key_prefix=prefix,
        key_hash=_hash_key(raw_key),
        permissions=body.permissions,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)

    return {
        "ok": True,
        "key": {
            "id": str(key.id),
            "label": key.label,
            "api_key": raw_key,
            "key_prefix": prefix,
            "permissions": key.permissions,
        },
        "warning": "Save this key now — it will not be shown again.",
    }


@router.delete("/{key_id}")
async def revoke_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    result = await db.execute(
        select(UserApiKey).where(UserApiKey.id == uuid.UUID(key_id), UserApiKey.user_id == user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    key.is_active = False
    await db.commit()
    return {"ok": True}
