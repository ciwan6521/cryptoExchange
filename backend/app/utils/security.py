"""
Security utilities — password hashing, JWT encode/decode.
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str,
    token_type: str = "user",
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT access token."""
    if token_type == "admin":
        secret = settings.ADMIN_JWT_SECRET_KEY
        default_expire = timedelta(minutes=settings.ADMIN_JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    else:
        secret = settings.JWT_SECRET_KEY
        default_expire = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.utcnow() + (expires_delta or default_expire)
    payload = {
        "sub": subject,
        "type": token_type,
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, secret, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> tuple[str, datetime]:
    """Create a refresh token. Returns (token, expires_at)."""
    expires_at = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "type": "refresh",
        "exp": expires_at,
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def decode_token(token: str, token_type: str = "user") -> Optional[dict]:
    """Decode and validate a JWT token. Returns payload or None."""
    secret = settings.ADMIN_JWT_SECRET_KEY if token_type == "admin" else settings.JWT_SECRET_KEY
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
