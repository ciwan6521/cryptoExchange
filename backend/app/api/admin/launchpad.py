"""Admin launchpad sale management."""

import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.platform import LaunchpadSale, LaunchpadPurchase
from app.api.deps import get_current_admin, require_admin_role

router = APIRouter(prefix="/api/admin/launchpad", tags=["admin-launchpad"])
logger = logging.getLogger("crypto4pro.admin.launchpad")


class CreateSaleRequest(BaseModel):
    token_symbol: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    price_usdt: str
    total_allocation: str
    min_purchase_usdt: str = "10"
    max_purchase_usdt: str = "10000"
    is_active: bool = True
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class UpdateSaleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_usdt: Optional[str] = None
    total_allocation: Optional[str] = None
    min_purchase_usdt: Optional[str] = None
    max_purchase_usdt: Optional[str] = None
    is_active: Optional[bool] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format")


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
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


@router.get("/sales")
async def list_sales(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LaunchpadSale).order_by(desc(LaunchpadSale.created_at)))
    sales = list(result.scalars().all())
    return {"sales": [_serialize_sale(s) for s in sales]}


@router.post("/sales", dependencies=[Depends(require_admin_role("super_admin", "operator"))])
async def create_sale(
    body: CreateSaleRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        price = Decimal(body.price_usdt)
        allocation = Decimal(body.total_allocation)
        min_p = Decimal(body.min_purchase_usdt)
        max_p = Decimal(body.max_purchase_usdt)
        if price <= 0 or allocation <= 0 or min_p <= 0 or max_p < min_p:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid numeric values")

    sale = LaunchpadSale(
        token_symbol=body.token_symbol.upper(),
        name=body.name,
        description=body.description,
        price_usdt=price,
        total_allocation=allocation,
        min_purchase_usdt=min_p,
        max_purchase_usdt=max_p,
        is_active=body.is_active,
        starts_at=_parse_dt(body.starts_at),
        ends_at=_parse_dt(body.ends_at),
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale)
    logger.info("Admin %s created launchpad sale %s", admin.id, sale.id)
    return {"ok": True, "sale": _serialize_sale(sale)}


@router.patch("/sales/{sale_id}", dependencies=[Depends(require_admin_role("super_admin", "operator"))])
async def update_sale(
    sale_id: str,
    body: UpdateSaleRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LaunchpadSale).where(LaunchpadSale.id == uuid.UUID(sale_id)))
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    if body.name is not None:
        sale.name = body.name
    if body.description is not None:
        sale.description = body.description
    if body.is_active is not None:
        sale.is_active = body.is_active
    if body.starts_at is not None:
        sale.starts_at = _parse_dt(body.starts_at)
    if body.ends_at is not None:
        sale.ends_at = _parse_dt(body.ends_at)

    for field, attr in [
        (body.price_usdt, "price_usdt"),
        (body.total_allocation, "total_allocation"),
        (body.min_purchase_usdt, "min_purchase_usdt"),
        (body.max_purchase_usdt, "max_purchase_usdt"),
    ]:
        if field is not None:
            try:
                val = Decimal(field)
                if val <= 0:
                    raise ValueError
                setattr(sale, attr, val)
            except (InvalidOperation, ValueError):
                raise HTTPException(status_code=400, detail=f"Invalid {attr}")

    await db.commit()
    await db.refresh(sale)
    return {"ok": True, "sale": _serialize_sale(sale)}


@router.get("/purchases")
async def list_purchases(
    limit: int = 50,
    offset: int = 0,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LaunchpadPurchase, LaunchpadSale.token_symbol, LaunchpadSale.name)
        .join(LaunchpadSale, LaunchpadSale.id == LaunchpadPurchase.sale_id)
        .order_by(desc(LaunchpadPurchase.created_at))
        .limit(limit)
        .offset(offset)
    )
    rows = result.all()
    return {
        "purchases": [
            {
                "id": str(p.id),
                "user_id": str(p.user_id),
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
