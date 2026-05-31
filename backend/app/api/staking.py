"""User-facing staking API — lock coins for configured periods and claim rewards."""

import uuid
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.staking import StakingProduct, StakingPeriod, StakingPosition
from app.api.deps import get_current_user
from app.schemas.staking import StakeRequest, StakingPositionResponse
from app.services.ledger_service import LedgerService, InsufficientBalanceError

router = APIRouter(prefix="/api/staking", tags=["staking"])
logger = logging.getLogger("crypto4pro.staking")


def _period_dict(p: StakingPeriod) -> dict:
    return {
        "id": str(p.id),
        "label": p.label,
        "duration_days": p.duration_days,
        "reward_percent": str(p.reward_percent),
        "is_active": p.is_active,
        "sort_order": p.sort_order,
    }


def _product_dict(p: StakingProduct) -> dict:
    periods = sorted(
        [pr for pr in p.periods if pr.is_active],
        key=lambda x: x.sort_order,
    )
    return {
        "id": str(p.id),
        "asset": p.asset,
        "name": p.name,
        "description": p.description,
        "min_stake": str(p.min_stake) if p.min_stake is not None else None,
        "periods": [_period_dict(pr) for pr in periods],
    }


def _position_dict(pos: StakingPosition, product_name: str) -> dict:
    now = datetime.now(timezone.utc)
    unlock = pos.unlock_at if pos.unlock_at.tzinfo else pos.unlock_at.replace(tzinfo=timezone.utc)
    can_claim = pos.status == "active" and now >= unlock
    return {
        "id": str(pos.id),
        "asset": pos.asset,
        "product_name": product_name,
        "amount": str(pos.amount),
        "reward_percent": str(pos.reward_percent),
        "expected_reward": str(pos.expected_reward),
        "period_label": pos.period_label,
        "duration_days": pos.duration_days,
        "started_at": pos.started_at.isoformat(),
        "unlock_at": pos.unlock_at.isoformat(),
        "claimed_at": pos.claimed_at.isoformat() if pos.claimed_at else None,
        "status": pos.status,
        "can_claim": can_claim,
    }


@router.get("/products")
async def list_staking_products(db: AsyncSession = Depends(get_db)):
    """Public list of active staking products with lock periods."""
    result = await db.execute(
        select(StakingProduct)
        .where(StakingProduct.is_active == True)
        .options(selectinload(StakingProduct.periods))
        .order_by(StakingProduct.sort_order, StakingProduct.asset)
    )
    products = list(result.scalars().unique().all())
    return {"products": [_product_dict(p) for p in products if any(pr.is_active for pr in p.periods)]}


@router.get("/positions")
async def list_my_positions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StakingPosition, StakingProduct.name)
        .join(StakingProduct, StakingProduct.id == StakingPosition.product_id)
        .where(StakingPosition.user_id == user.id)
        .order_by(desc(StakingPosition.created_at))
    )
    rows = result.all()
    return {
        "positions": [_position_dict(pos, name) for pos, name in rows],
    }


@router.post("/stake")
async def create_stake(
    body: StakeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC verification is required for staking.")

    if user.deposit_cooldown_until and user.deposit_cooldown_until > datetime.now(timezone.utc):
        remaining = int((user.deposit_cooldown_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(status_code=403, detail=f"Deposit is being processed. Please wait {remaining} seconds.")

    try:
        amount = Decimal(body.amount)
        if amount <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")

    result = await db.execute(
        select(StakingProduct)
        .where(StakingProduct.id == body.product_id, StakingProduct.is_active == True)
        .options(selectinload(StakingProduct.periods))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Staking product not found")

    period = next((p for p in product.periods if p.id == body.period_id and p.is_active), None)
    if not period:
        raise HTTPException(status_code=404, detail="Staking period not found")

    if product.min_stake and amount < product.min_stake:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum stake is {product.min_stake} {product.asset}",
        )

    reward = (amount * period.reward_percent / Decimal("100")).quantize(Decimal("0.00000001"))
    now = datetime.now(timezone.utc)
    unlock_at = now + timedelta(days=period.duration_days)
    position_id = uuid.uuid4()

    ledger = LedgerService(db)
    try:
        await ledger.lock_funds(
            user_id=user.id,
            asset=product.asset,
            amount=amount,
            idempotency_key=f"stake_lock:{position_id}",
            reference_type="stake",
            reference_id=position_id,
            description=f"Staked {amount} {product.asset} for {period.label}",
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=400, detail=f"Insufficient {product.asset} balance")

    position = StakingPosition(
        id=position_id,
        user_id=user.id,
        product_id=product.id,
        period_id=period.id,
        asset=product.asset,
        amount=amount,
        reward_percent=period.reward_percent,
        expected_reward=reward,
        period_label=period.label,
        duration_days=period.duration_days,
        started_at=now,
        unlock_at=unlock_at,
        status="active",
    )
    db.add(position)
    await db.commit()
    await db.refresh(position)

    logger.info("Stake created: user=%s asset=%s amount=%s period=%s", user.id, product.asset, amount, period.label)

    return {
        "ok": True,
        "position": _position_dict(position, product.name),
    }


@router.post("/positions/{position_id}/claim")
async def claim_stake(
    position_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StakingPosition, StakingProduct.name)
        .join(StakingProduct, StakingProduct.id == StakingPosition.product_id)
        .where(StakingPosition.id == position_id, StakingPosition.user_id == user.id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Stake not found")

    position, product_name = row
    if position.status != "active":
        raise HTTPException(status_code=400, detail="Stake already claimed")

    now = datetime.now(timezone.utc)
    unlock = position.unlock_at if position.unlock_at.tzinfo else position.unlock_at.replace(tzinfo=timezone.utc)
    if now < unlock:
        remaining = int((unlock - now).total_seconds())
        raise HTTPException(status_code=400, detail=f"Stake is still locked. {remaining} seconds remaining.")

    ledger = LedgerService(db)
    try:
        await ledger.unlock_funds(
            user_id=user.id,
            asset=position.asset,
            amount=position.amount,
            idempotency_key=f"stake_unlock:{position.id}",
            reference_type="stake",
            reference_id=position.id,
            description=f"Stake principal returned ({position.period_label})",
        )
        if position.expected_reward > 0:
            await ledger.credit(
                user_id=user.id,
                asset=position.asset,
                amount=position.expected_reward,
                category="campaign_reward",
                idempotency_key=f"stake_reward:{position.id}",
                reference_type="stake",
                reference_id=position.id,
                description=f"Staking reward ({position.reward_percent}% for {position.period_label})",
            )
    except InsufficientBalanceError:
        raise HTTPException(status_code=500, detail="Ledger error unlocking stake funds")

    position.status = "completed"
    position.claimed_at = now
    await db.commit()

    logger.info("Stake claimed: user=%s position=%s amount=%s reward=%s", user.id, position.id, position.amount, position.expected_reward)

    return {
        "ok": True,
        "position": _position_dict(position, product_name),
        "total_received": str(position.amount + position.expected_reward),
    }
