"""
User-facing deposit API routes.

- Get deposit address (from Pay4Pro — BSC wallet)
- List deposit history
- Create wallet on-demand if not exists
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.wallet import Wallet, Deposit
from app.api.deps import get_current_user

logger = logging.getLogger("crypto4pro.deposits")

router = APIRouter(prefix="/api/deposits", tags=["deposits"])


@router.get("/address")
async def get_deposit_address(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get or create a BSC deposit address for the user.
    Calls Pay4Pro GET /api/wallet/address?user_id=xxx which auto-creates.
    """
    # Look for existing wallet in our DB
    result = await db.execute(
        select(Wallet).where(
            Wallet.user_id == user.id,
            Wallet.is_active == True,
        )
    )
    wallet = result.scalar_one_or_none()

    if wallet and wallet.address:
        return {
            "address": wallet.address,
            "asset": wallet.asset,
            "network": wallet.network,
        }

    # No wallet or no address — fetch from Pay4Pro
    from app.services.pay4pro_client import get_pay4pro_client, Pay4ProError

    p4p = get_pay4pro_client()
    if not p4p.base_url:
        raise HTTPException(
            status_code=503,
            detail="Deposit service is not configured. Please try again later.",
        )

    try:
        p4p_wallet = await p4p.get_or_create_wallet(user_id=str(user.id))
    except Pay4ProError as e:
        logger.error("Pay4Pro wallet fetch failed for user %s: %s", user.id, e)
        raise HTTPException(status_code=503, detail="Deposit service temporarily unavailable")

    if wallet:
        wallet.address = p4p_wallet.address
        wallet.external_wallet_id = str(user.id)
    else:
        wallet = Wallet(
            user_id=user.id,
            asset=settings.PAY4PRO_DEFAULT_ASSET,
            network=settings.PAY4PRO_DEFAULT_NETWORK,
            address=p4p_wallet.address,
            external_wallet_id=str(user.id),
        )
        db.add(wallet)

    await db.commit()

    return {
        "address": p4p_wallet.address,
        "asset": settings.PAY4PRO_DEFAULT_ASSET,
        "network": settings.PAY4PRO_DEFAULT_NETWORK,
    }


@router.get("/my")
async def get_my_deposits(
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's deposit history."""
    conditions = [Deposit.user_id == user.id]
    if status:
        conditions.append(Deposit.status == status)

    count_q = select(func.count(Deposit.id)).where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(Deposit)
        .where(and_(*conditions))
        .order_by(desc(Deposit.created_at))
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    deposits = list(result.scalars().all())

    return {
        "deposits": [
            {
                "id": str(d.id),
                "asset": d.asset,
                "network": d.network,
                "amount": str(d.amount),
                "tx_hash": d.tx_hash,
                "from_address": d.from_address,
                "confirmations": d.confirmations,
                "required_confirmations": d.required_confirmations,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "completed_at": d.completed_at.isoformat() if d.completed_at else None,
            }
            for d in deposits
        ],
        "total": total,
    }


@router.get("/networks")
async def get_supported_networks():
    """Return supported deposit networks and assets."""
    return {
        "networks": [
            {
                "asset": "USDT",
                "network": "BSC",
                "name": "BNB Smart Chain (BEP-20)",
                "min_deposit": "10",
                "confirmations_required": 15,
                "estimated_time": "~1 minute",
            },
        ],
    }
