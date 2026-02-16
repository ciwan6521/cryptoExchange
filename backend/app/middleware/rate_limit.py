"""
Redis-based rate limiting middleware.
Per-IP limits on auth endpoints. General limits on all API endpoints.
"""

import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import Request, HTTPException, status

from app.config import settings

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def check_rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int = 60,
) -> tuple[bool, int]:
    """
    Check if a rate limit key has exceeded max_requests in window_seconds.
    Returns (is_allowed, remaining_requests).
    """
    r = await get_redis()
    pipe = r.pipeline()
    now = time.time()
    window_start = now - window_seconds

    # Sorted set: score=timestamp, member=timestamp (unique enough)
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, window_seconds + 1)
    results = await pipe.execute()

    current_count = results[1]
    remaining = max(0, max_requests - current_count - 1)
    allowed = current_count < max_requests

    return allowed, remaining


async def rate_limit_auth(request: Request) -> None:
    """Rate limit for auth endpoints — stricter per-IP limit."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"nexus:ratelimit:auth:{client_ip}"

    allowed, remaining = await check_rate_limit(
        key,
        max_requests=settings.AUTH_RATE_LIMIT_PER_MINUTE,
        window_seconds=60,
    )

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
        )


async def rate_limit_orders(request: Request) -> None:
    """Rate limit for order placement — 30 per minute per user IP."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"nexus:ratelimit:orders:{client_ip}"

    allowed, remaining = await check_rate_limit(key, max_requests=30, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order requests. Please slow down.",
        )


async def rate_limit_withdrawals(request: Request) -> None:
    """Rate limit for withdrawal requests — 5 per minute per IP."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"nexus:ratelimit:withdrawals:{client_ip}"

    allowed, remaining = await check_rate_limit(key, max_requests=5, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many withdrawal requests. Please try again later.",
        )


async def rate_limit_financial(request: Request) -> None:
    """General rate limit for financial endpoints — 60 per minute per IP."""
    client_ip = request.client.host if request.client else "unknown"
    key = f"nexus:ratelimit:financial:{client_ip}"

    allowed, remaining = await check_rate_limit(
        key, max_requests=settings.RATE_LIMIT_PER_MINUTE, window_seconds=60
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
