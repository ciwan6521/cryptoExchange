"""P2P marketplace MVP — ads and escrow orders."""

import uuid
import logging
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.platform import P2PAd, P2POrder
from app.api.deps import get_current_user
from app.services.ledger_service import LedgerService, InsufficientBalanceError

router = APIRouter(prefix="/api/p2p", tags=["p2p"])
logger = logging.getLogger("crypto4pro.p2p")


class CreateAdRequest(BaseModel):
    side: str = Field(pattern="^(buy|sell)$")
    asset: str = Field(min_length=2, max_length=20)
    fiat_currency: str = Field(default="TRY", max_length=10)
    price: str
    min_amount: str
    max_amount: str
    payment_method: str = Field(min_length=2, max_length=100)


class StartOrderRequest(BaseModel):
    amount: str


@router.get("/ads")
async def list_ads(
    side: str | None = None,
    asset: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    conditions = [P2PAd.status == "active"]
    if side:
        conditions.append(P2PAd.side == side)
    if asset:
        conditions.append(P2PAd.asset == asset.upper())

    result = await db.execute(
        select(P2PAd).where(and_(*conditions)).order_by(desc(P2PAd.created_at)).limit(100)
    )
    ads = list(result.scalars().all())
    return {
        "ads": [
            {
                "id": str(a.id),
                "user_id": str(a.user_id),
                "side": a.side,
                "asset": a.asset,
                "fiat_currency": a.fiat_currency,
                "price": str(a.price),
                "min_amount": str(a.min_amount),
                "max_amount": str(a.max_amount),
                "payment_method": a.payment_method,
                "created_at": a.created_at.isoformat(),
            }
            for a in ads
        ],
    }


@router.post("/ads")
async def create_ad(
    body: CreateAdRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC required for P2P ads.")
    try:
        price = Decimal(body.price)
        min_amt = Decimal(body.min_amount)
        max_amt = Decimal(body.max_amount)
        if min_amt <= 0 or max_amt < min_amt or price <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid ad parameters")

    ad = P2PAd(
        user_id=user.id,
        side=body.side,
        asset=body.asset.upper(),
        fiat_currency=body.fiat_currency.upper(),
        price=price,
        min_amount=min_amt,
        max_amount=max_amt,
        payment_method=body.payment_method,
    )
    db.add(ad)
    await db.commit()
    await db.refresh(ad)
    return {"ok": True, "ad_id": str(ad.id)}


@router.post("/ads/{ad_id}/order")
async def start_order(
    ad_id: uuid.UUID,
    body: StartOrderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="KYC required.")

    try:
        amount = Decimal(body.amount)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")

    result = await db.execute(select(P2PAd).where(P2PAd.id == ad_id, P2PAd.status == "active"))
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    if ad.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot trade on your own ad")
    if amount < ad.min_amount or amount > ad.max_amount:
        raise HTTPException(status_code=400, detail=f"Amount must be between {ad.min_amount} and {ad.max_amount}")

    total_fiat = amount * ad.price
    if ad.side == "sell":
        buyer_id = user.id
        seller_id = ad.user_id
    else:
        buyer_id = ad.user_id
        seller_id = user.id

    order_id = uuid.uuid4()
    ledger = LedgerService(db)
    try:
        await ledger.lock_funds(
            user_id=seller_id,
            asset=ad.asset,
            amount=amount,
            idempotency_key=f"p2p_escrow:{order_id}",
            reference_type="p2p",
            reference_id=order_id,
            description=f"P2P escrow {ad.asset}",
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=400, detail="Seller has insufficient balance for escrow")

    order = P2POrder(
        id=order_id,
        ad_id=ad.id,
        buyer_id=buyer_id,
        seller_id=seller_id,
        asset=ad.asset,
        amount=amount,
        price=ad.price,
        total_fiat=total_fiat,
        status="pending",
    )
    db.add(order)
    await db.commit()
    return {"ok": True, "order_id": str(order_id), "total_fiat": str(total_fiat)}


@router.get("/orders")
async def my_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(P2POrder)
        .where((P2POrder.buyer_id == user.id) | (P2POrder.seller_id == user.id))
        .order_by(desc(P2POrder.created_at))
    )
    orders = list(result.scalars().all())
    return {
        "orders": [
            {
                "id": str(o.id),
                "ad_id": str(o.ad_id),
                "asset": o.asset,
                "amount": str(o.amount),
                "price": str(o.price),
                "total_fiat": str(o.total_fiat),
                "status": o.status,
                "role": "buyer" if o.buyer_id == user.id else "seller",
                "created_at": o.created_at.isoformat(),
            }
            for o in orders
        ],
    }


@router.post("/orders/{order_id}/confirm")
async def confirm_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seller confirms fiat received — release escrow to buyer."""
    from datetime import datetime, timezone

    result = await db.execute(select(P2POrder).where(P2POrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.seller_id != user.id:
        raise HTTPException(status_code=403, detail="Only seller can confirm payment")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Order already processed")

    ledger = LedgerService(db)
    try:
        await ledger.fill_from_locked(
            user_id=order.seller_id,
            asset=order.asset,
            amount=order.amount,
            idempotency_key=f"p2p_fill:{order_id}",
            reference_type="p2p",
            reference_id=order_id,
            description="P2P escrow released from seller",
        )
        await ledger.credit(
            user_id=order.buyer_id,
            asset=order.asset,
            amount=order.amount,
            category="p2p",
            idempotency_key=f"p2p_buyer_credit:{order_id}",
            reference_type="p2p",
            reference_id=order_id,
            description="P2P purchase received",
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=500, detail="Escrow release failed")

    order.status = "completed"
    order.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(P2POrder).where(P2POrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user.id not in (order.buyer_id, order.seller_id):
        raise HTTPException(status_code=403, detail="Not your order")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Cannot cancel")

    ledger = LedgerService(db)
    try:
        await ledger.unlock_funds(
            user_id=order.seller_id,
            asset=order.asset,
            amount=order.amount,
            idempotency_key=f"p2p_unlock:{order_id}",
            reference_type="p2p",
            reference_id=order_id,
            description="P2P escrow cancelled",
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=500, detail="Unlock failed")

    order.status = "cancelled"
    await db.commit()
    return {"ok": True}
