"""
User-facing deposit API routes.

- Get supported chains and tokens (from Pay4Pro)
- Get deposit address per chain
- Claim deposit (notify Pay4Pro after bank/papara transfer)
- List deposit history
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta
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
from app.api.deps_flags import require_deposits_enabled

logger = logging.getLogger("crypto4pro.deposits")

router = APIRouter(prefix="/api/deposits", tags=["deposits"])


class DepositClaimRequest(BaseModel):
    amount: str = Field(..., min_length=1)
    currency: str = Field(default="USDT", max_length=10)
    method: str = Field(..., min_length=1, max_length=30)
    payment_method_id: Optional[str] = None


@router.get("/chains")
async def get_supported_chains():
    """Get active chains and their supported tokens from Pay4Pro."""
    from app.services.pay4pro_client import get_pay4pro_client, Pay4ProError

    p4p = get_pay4pro_client()
    if not p4p.base_url:
        return {"chains": []}

    try:
        chains = await p4p.get_chains()
        return {
            "chains": [
                {
                    "name": c.name,
                    "displayName": c.display_name,
                    "gasToken": c.gas_token,
                    "tokens": c.tokens,
                }
                for c in chains
            ]
        }
    except Pay4ProError as exc:
        logger.warning("Failed to fetch chains from Pay4Pro: %s", exc)
        return {"chains": []}


@router.get("/address")
async def get_deposit_address(
    chain: str = Query("bsc", max_length=20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get or create a deposit address for the user on specified chain.
    EVM chains (bsc, ethereum) share the same address; TRON has a separate one.
    """
    is_tron = chain.lower() == "tron"
    network_key = "tron" if is_tron else "evm"

    result = await db.execute(
        select(Wallet).where(
            Wallet.user_id == user.id,
            Wallet.network == network_key,
            Wallet.is_active == True,
        )
    )
    wallet = result.scalar_one_or_none()

    if wallet and wallet.address:
        return {
            "address": wallet.address,
            "chain": chain,
        }

    from app.services.pay4pro_client import get_pay4pro_client, Pay4ProError

    p4p = get_pay4pro_client()
    if not p4p.base_url:
        raise HTTPException(
            status_code=503,
            detail="Deposit service is not configured.",
        )

    try:
        p4p_wallet = await p4p.get_or_create_wallet(user_id=str(user.id), chain=chain)
    except Pay4ProError as e:
        logger.error("Pay4Pro wallet fetch failed for user %s chain=%s: %s", user.id, chain, e)
        raise HTTPException(status_code=503, detail="Deposit service temporarily unavailable")

    if wallet:
        wallet.address = p4p_wallet.address
        wallet.external_wallet_id = str(user.id)
    else:
        wallet = Wallet(
            user_id=user.id,
            asset=settings.PAY4PRO_DEFAULT_ASSET,
            network=network_key,
            address=p4p_wallet.address,
            external_wallet_id=str(user.id),
        )
        db.add(wallet)

    await db.commit()

    return {
        "address": p4p_wallet.address,
        "chain": chain,
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


@router.post("/claim", dependencies=[Depends(require_deposits_enabled)])
async def claim_deposit(
    body: DepositClaimRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    User claims they have sent a deposit via bank transfer / papara / etc.
    Creates a deposit request on Pay4Pro and a local pending record.
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
            payment_method_id=body.payment_method_id,
            metadata={
                "source": "crypto4pro_user_claim",
            },
        )
    except Pay4ProError as e:
        logger.error("Pay4Pro deposit claim failed for user %s: %s", user.id, e)
        raise HTTPException(status_code=503, detail="Failed to submit deposit claim")

    tx_id = p4p_result.get("transaction_id", "")
    idempotency_key = f"deposit-claim-{tx_id or uuid.uuid4()}"

    fee_kwargs: dict = {}
    if body.payment_method_id:
        try:
            rate_info = await p4p.get_payment_method_rate(
                body.payment_method_id, amount=float(amount),
            )
            base_rate = Decimal(str(rate_info.get("base_rate", 0)))
            markup_pct = Decimal(str(rate_info.get("financier_commission_percent", 0) or rate_info.get("markup_percent", 0)))
            if base_rate > 0:
                admin_fee = Decimal("1")
                display_rate = base_rate * (1 + admin_fee / 100)
                gross = amount / display_rate
                fee_amt = gross * markup_pct / 100
                net = gross - fee_amt
                fee_kwargs = {
                    "base_rate_at_claim": base_rate,
                    "deposit_fee_percent": markup_pct,
                    "gross_amount": gross,
                    "deposit_fee": fee_amt,
                    "expected_net_amount": net,
                    "fiat_payment_method_id": body.payment_method_id,
                }
        except Exception as exc:
            logger.warning("Failed to fetch rate for fee calc: %s", exc)

    deposit = Deposit(
        user_id=user.id,
        asset=body.currency,
        network=body.method,
        amount=amount,
        status="pending",
        pay4pro_deposit_id=tx_id,
        idempotency_key=idempotency_key,
        **fee_kwargs,
    )
    db.add(deposit)

    cooldown_until = datetime.now(timezone.utc) + timedelta(minutes=15)
    user.deposit_cooldown_until = cooldown_until

    await db.commit()
    await db.refresh(deposit)

    logger.info(
        "Deposit claim created: user=%s amount=%s %s method=%s p4p_tx=%s cooldown_until=%s",
        user.id, amount, body.currency, body.method, tx_id, cooldown_until.isoformat(),
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
        "cooldown_until": cooldown_until.isoformat(),
        "message": "Deposit claim submitted. It will be credited after admin verification.",
    }


class CardDepositRequest(BaseModel):
    amount: str = Field(..., min_length=1)
    currency: str = Field(default="USD", max_length=10)
    card_last4: str = Field(..., min_length=4, max_length=4)
    card_brand: str = Field(default="visa", max_length=20)


@router.post("/card", dependencies=[Depends(require_deposits_enabled)])
async def request_card_deposit(
    body: CardDepositRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a credit/debit card deposit request for manual or PSP processing."""
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC required for card deposits")

    try:
        amount = Decimal(body.amount)
        if amount <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")

    deposit_id = uuid.uuid4()
    deposit = Deposit(
        id=deposit_id,
        user_id=user.id,
        asset=body.currency.upper(),
        network="card",
        amount=amount,
        status="pending",
        idempotency_key=f"card_deposit:{user.id}:{deposit_id}",
    )
    db.add(deposit)
    await db.commit()
    await db.refresh(deposit)

    logger.info(
        "Card deposit request: user=%s amount=%s %s brand=%s last4=%s",
        user.id, amount, body.currency, body.card_brand, body.card_last4,
    )

    return {
        "ok": True,
        "deposit": {
            "id": str(deposit.id),
            "amount": str(deposit.amount),
            "currency": body.currency.upper(),
            "status": deposit.status,
        },
        "message": "Card deposit submitted. Funds will be credited after payment verification (typically 5–30 minutes).",
    }
