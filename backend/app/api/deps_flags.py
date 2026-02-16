"""
System flag enforcement dependencies.

These are injected into API routes that must respect global kill switches.
Prevents financial operations when system is in emergency/maintenance mode.

Risk prevented: Even if an admin account is compromised, the kill switch
stops ALL withdrawals/trading system-wide until a super_admin re-enables.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cms import SystemFlag


async def _get_flag_value(db: AsyncSession, key: str, default: bool = True) -> bool:
    """Read a system flag from DB, falling back to default if not set."""
    result = await db.execute(select(SystemFlag).where(SystemFlag.key == key))
    flag = result.scalar_one_or_none()
    if flag is None:
        return default
    return flag.value


async def require_withdrawals_enabled(db: AsyncSession = Depends(get_db)) -> None:
    """Dependency: blocks request if global withdrawals are disabled."""
    enabled = await _get_flag_value(db, "withdrawals_enabled", default=True)
    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Withdrawals are temporarily disabled by system administrator",
        )


async def require_trading_enabled(db: AsyncSession = Depends(get_db)) -> None:
    """Dependency: blocks request if global trading is disabled."""
    enabled = await _get_flag_value(db, "trading_enabled", default=True)
    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trading is temporarily disabled by system administrator",
        )


async def require_deposits_enabled(db: AsyncSession = Depends(get_db)) -> None:
    """Dependency: blocks request if global deposits are disabled."""
    enabled = await _get_flag_value(db, "deposits_enabled", default=True)
    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Deposits are temporarily disabled by system administrator",
        )
