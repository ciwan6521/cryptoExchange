"""
User-facing deposit API routes.

- Get deposit address (from Pay4Pro — BSC wallet)
- Claim deposit (notify Pay4Pro after bank/papara transfer)
- List deposit history
- Create wallet on-demand if not exists
"""

import uuid
import logging
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.wallet import Wallet, Deposit
from app.api.deps import get_current_user

logger = logging.getLogger("crypto4pro.deposits")

router = APIRouter(prefix="/api/deposits", tags=["deposits"])


class DepositClaimRequest(BaseModel):
    amount: str = Field(..., min_length=1)
    currency: str = Field(default="USDT", max_length=10)
    method: str = Field(..., min_length=1, max_length=30)
    payment_method_id: Optional[str] = None


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


@router.post("/claim")
async def claim_deposit(
    body: DepositClaimRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    User claims they have sent a deposit via bank transfer / papara / etc.
    Creates a deposit request on Pay4Pro and a local pending record.
    Pay4Pro admin will verify and confirm → webhook credits the balance.
    """
    try:
        amount = Decimal(body.amount)
        if amount <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")

    from app.services.pay4pro_client import get_pay4pro_client, Pay4ProError

    p4p = get_pay4pro_client()
    if not p4p.base_url:
        raise HTTPException(status_code=503, detail="Deposit service not configured")

    try:
        p4p_result = await p4p.create_deposit(
            user_id=str(user.id),
            amount=amount,
            currency=body.currency,
            method=body.method,
            metadata={
                "payment_method_id": body.payment_method_id,
                "source": "crypto4pro_user_claim",
            },
        )
    except Pay4ProError as e:
        logger.error("Pay4Pro deposit claim failed for user %s: %s", user.id, e)
        raise HTTPException(status_code=503, detail="Failed to submit deposit claim")

    tx_id = p4p_result.get("transaction_id", "")
    idempotency_key = f"deposit-claim-{tx_id or uuid.uuid4()}"

    deposit = Deposit(
        user_id=user.id,
        asset=body.currency,
        network=body.method,
        amount=amount,
        status="pending",
        pay4pro_deposit_id=tx_id,
        idempotency_key=idempotency_key,
    )
    db.add(deposit)
    await db.commit()
    await db.refresh(deposit)

    logger.info(
        "Deposit claim created: user=%s amount=%s %s method=%s p4p_tx=%s",
        user.id, amount, body.currency, body.method, tx_id,
    )

    return {
        "ok": True,
        "deposit": {
            "id": str(deposit.id),
            "amount": str(deposit.amount),
            "currency": body.currency,
            "method": body.method,
            "status": deposit.status,
            "transaction_id": tx_id,
        },
        "message": "Deposit claim submitted. It will be credited after admin verification.",
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
