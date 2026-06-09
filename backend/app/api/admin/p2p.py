"""Admin P2P moderation — list ads/orders, deactivate suspicious ads."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.platform import P2PAd, P2POrder
from app.api.deps import get_current_admin, require_admin_role

router = APIRouter(prefix="/api/admin/p2p", tags=["admin-p2p"])
logger = logging.getLogger("crypto4pro.admin.p2p")


@router.get("/ads")
async def list_ads(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(P2PAd).order_by(desc(P2PAd.created_at))
    if status:
        q = q.where(P2PAd.status == status)
    total = (await db.execute(select(func.count(P2PAd.id)).where(P2PAd.status == status) if status else select(func.count(P2PAd.id)))).scalar() or 0
    result = await db.execute(q.limit(limit).offset(offset))
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
                "status": a.status,
                "created_at": a.created_at.isoformat(),
            }
            for a in ads
        ],
        "total": total,
    }


@router.post("/ads/{ad_id}/deactivate", dependencies=[Depends(require_admin_role("super_admin", "operator"))])
async def deactivate_ad(
    ad_id: str,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(P2PAd).where(P2PAd.id == uuid.UUID(ad_id)))
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    ad.status = "inactive"
    await db.commit()
    logger.info("Admin %s deactivated P2P ad %s", admin.id, ad_id)
    return {"ok": True, "id": ad_id, "status": "inactive"}


@router.get("/orders")
async def list_orders(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(P2POrder).order_by(desc(P2POrder.created_at))
    if status:
        q = q.where(P2POrder.status == status)
    total = (await db.execute(select(func.count(P2POrder.id)).where(P2POrder.status == status) if status else select(func.count(P2POrder.id)))).scalar() or 0
    result = await db.execute(q.limit(limit).offset(offset))
    orders = list(result.scalars().all())
    return {
        "orders": [
            {
                "id": str(o.id),
                "ad_id": str(o.ad_id),
                "buyer_id": str(o.buyer_id),
                "seller_id": str(o.seller_id),
                "asset": o.asset,
                "amount": str(o.amount),
                "price": str(o.price),
                "total_fiat": str(o.total_fiat),
                "status": o.status,
                "created_at": o.created_at.isoformat(),
                "completed_at": o.completed_at.isoformat() if o.completed_at else None,
            }
            for o in orders
        ],
        "total": total,
    }
