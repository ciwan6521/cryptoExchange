"""Launchpad token sale API."""

import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.platform import LaunchpadSale, LaunchpadPurchase
from app.api.deps import get_current_user
from app.services.ledger_service import LedgerService, InsufficientBalanceError

router = APIRouter(prefix="/api/launchpad", tags=["launchpad"])
logger = logging.getLogger("crypto4pro.launchpad")


class PurchaseRequest(BaseModel):
    sale_id: str
    amount_usdt: str


def _serialize_sale(s: LaunchpadSale) -> dict:
    remaining = s.total_allocation - s.sold_amount
    return {
        "id": str(s.id),
        "token_symbol": s.token_symbol,
        "name": s.name,
        "description": s.description,
        "price_usdt": str(s.price_usdt),
        "total_allocation": str(s.total_allocation),
        "sold_amount": str(s.sold_amount),
        "remaining": str(remaining),
        "min_purchase_usdt": str(s.min_purchase_usdt),
        "max_purchase_usdt": str(s.max_purchase_usdt),
        "is_active": s.is_active,
        "starts_at": s.starts_at.isoformat() if s.starts_at else None,
        "ends_at": s.ends_at.isoformat() if s.ends_at else None,
    }


@router.get("/sales")
async def list_sales(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LaunchpadSale)
        .where(LaunchpadSale.is_active == True)
        .order_by(desc(LaunchpadSale.created_at))
    )
    sales = list(result.scalars().all())
    return {"sales": [_serialize_sale(s) for s in sales]}


@router.get("/purchases")
async def my_purchases(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LaunchpadPurchase, LaunchpadSale.token_symbol, LaunchpadSale.name)
        .join(LaunchpadSale, LaunchpadSale.id == LaunchpadPurchase.sale_id)
        .where(LaunchpadPurchase.user_id == user.id)
        .order_by(desc(LaunchpadPurchase.created_at))
    )
    rows = result.all()
    return {
        "purchases": [
            {
                "id": str(p.id),
                "token_symbol": symbol,
                "name": name,
                "amount_usdt": str(p.amount_usdt),
                "tokens": str(p.tokens),
                "status": p.status,
                "created_at": p.created_at.isoformat(),
            }
            for p, symbol, name in rows
        ],
    }


@router.post("/purchase")
async def purchase(
    body: PurchaseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC required for launchpad purchase.")

    try:
        amount = Decimal(body.amount_usdt)
        if amount <= 0:
            raise ValueError
        sale_uuid = uuid.UUID(body.sale_id)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid request")

    result = await db.execute(
        select(LaunchpadSale).where(LaunchpadSale.id == sale_uuid).with_for_update()
    )
    sale = result.scalar_one_or_none()
    if not sale or not sale.is_active:
        raise HTTPException(status_code=404, detail="Sale not found or inactive")

    now = datetime.now(timezone.utc)
    if sale.starts_at and now < sale.starts_at:
        raise HTTPException(status_code=400, detail="Sale has not started yet")
    if sale.ends_at and now > sale.ends_at:
        raise HTTPException(status_code=400, detail="Sale has ended")

    if amount < sale.min_purchase_usdt:
        raise HTTPException(status_code=400, detail=f"Minimum purchase is {sale.min_purchase_usdt} USDT")
    if amount > sale.max_purchase_usdt:
        raise HTTPException(status_code=400, detail=f"Maximum purchase is {sale.max_purchase_usdt} USDT")

    tokens = amount / sale.price_usdt
    if sale.sold_amount + tokens > sale.total_allocation:
        raise HTTPException(status_code=400, detail="Insufficient allocation remaining")

    purchase_id = uuid.uuid4()
    ledger = LedgerService(db)
    try:
        await ledger.debit(
            user_id=user.id,
            asset="USDT",
            amount=amount,
            category="launchpad",
            idempotency_key=f"launchpad_debit:{purchase_id}",
            reference_type="launchpad",
            reference_id=purchase_id,
            description=f"Launchpad purchase {sale.token_symbol}",
        )
        await ledger.credit(
            user_id=user.id,
            asset=sale.token_symbol,
            amount=tokens,
            category="launchpad",
            idempotency_key=f"launchpad_credit:{purchase_id}",
            reference_type="launchpad",
            reference_id=purchase_id,
            description=f"Launchpad tokens {sale.token_symbol}",
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=400, detail="Insufficient USDT balance")

    sale.sold_amount += tokens
    purchase = LaunchpadPurchase(
        id=purchase_id,
        user_id=user.id,
        sale_id=sale.id,
        amount_usdt=amount,
        tokens=tokens,
    )
    db.add(purchase)
    await db.commit()

    logger.info("Launchpad purchase: user=%s sale=%s amount=%s tokens=%s", user.id, sale.id, amount, tokens)
    return {
        "ok": True,
        "purchase": {
            "id": str(purchase_id),
            "tokens": str(tokens),
            "amount_usdt": str(amount),
            "token_symbol": sale.token_symbol,
        },
    }
