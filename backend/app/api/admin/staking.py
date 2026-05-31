"""Admin staking product management."""

import uuid
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import AdminUser
from app.models.staking import StakingProduct, StakingPeriod
from app.models.cms import AuditLog
from app.api.deps import get_current_admin, require_admin_role
from app.schemas.staking import (
    CreateStakingProductRequest,
    UpdateStakingProductRequest,
    StakingProductResponse,
    StakingPeriodResponse,
)

router = APIRouter(prefix="/api/admin/staking", tags=["admin-staking"])


def _to_response(product: StakingProduct) -> StakingProductResponse:
    periods = sorted(product.periods, key=lambda p: p.sort_order)
    return StakingProductResponse(
        id=product.id,
        asset=product.asset,
        name=product.name,
        description=product.description,
        min_stake=str(product.min_stake) if product.min_stake is not None else None,
        is_active=product.is_active,
        sort_order=product.sort_order,
        periods=[
            StakingPeriodResponse(
                id=p.id,
                label=p.label,
                duration_days=p.duration_days,
                reward_percent=str(p.reward_percent),
                is_active=p.is_active,
                sort_order=p.sort_order,
            )
            for p in periods
        ],
        created_at=product.created_at.isoformat(),
    )


def _parse_decimal(value: str | None, field: str) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        d = Decimal(value)
        if d < 0:
            raise ValueError
        return d
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid {field}")


async def _replace_periods(db: AsyncSession, product: StakingProduct, periods_input):
    await db.execute(delete(StakingPeriod).where(StakingPeriod.product_id == product.id))
    await db.flush()

    for i, p in enumerate(periods_input):
        reward = _parse_decimal(p.reward_percent, "reward_percent")
        if reward is None:
            raise HTTPException(status_code=400, detail="reward_percent is required")
        period = StakingPeriod(
            product_id=product.id,
            label=p.label.strip(),
            duration_days=p.duration_days,
            reward_percent=reward,
            is_active=p.is_active,
            sort_order=p.sort_order if p.sort_order else i,
        )
        db.add(period)


@router.get("/products")
async def list_products(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StakingProduct)
        .options(selectinload(StakingProduct.periods))
        .order_by(StakingProduct.sort_order, StakingProduct.asset)
    )
    products = list(result.scalars().unique().all())
    return {"products": [_to_response(p) for p in products]}


@router.post("/products", response_model=StakingProductResponse)
async def create_product(
    body: CreateStakingProductRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator", "finance")),
    db: AsyncSession = Depends(get_db),
):
    min_stake = _parse_decimal(body.min_stake, "min_stake")

    product = StakingProduct(
        asset=body.asset.upper().strip(),
        name=body.name.strip(),
        description=body.description,
        min_stake=min_stake,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(product)
    await db.flush()

    await _replace_periods(db, product, body.periods)

    log = AuditLog(
        admin_id=admin.id,
        action="create_staking_product",
        target_type="staking_product",
        target_id=product.id,
        details={"asset": product.asset, "name": product.name},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    result = await db.execute(
        select(StakingProduct)
        .where(StakingProduct.id == product.id)
        .options(selectinload(StakingProduct.periods))
    )
    product = result.scalar_one()
    return _to_response(product)


@router.patch("/products/{product_id}", response_model=StakingProductResponse)
async def update_product(
    product_id: uuid.UUID,
    body: UpdateStakingProductRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator", "finance")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StakingProduct)
        .where(StakingProduct.id == product_id)
        .options(selectinload(StakingProduct.periods))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if body.asset is not None:
        product.asset = body.asset.upper().strip()
    if body.name is not None:
        product.name = body.name.strip()
    if body.description is not None:
        product.description = body.description
    if body.min_stake is not None:
        product.min_stake = _parse_decimal(body.min_stake, "min_stake")
    if body.is_active is not None:
        product.is_active = body.is_active
    if body.sort_order is not None:
        product.sort_order = body.sort_order

    if body.periods is not None:
        if len(body.periods) == 0:
            raise HTTPException(status_code=400, detail="At least one period is required")
        await _replace_periods(db, product, body.periods)

    log = AuditLog(
        admin_id=admin.id,
        action="update_staking_product",
        target_type="staking_product",
        target_id=product.id,
        details={"asset": product.asset},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    result = await db.execute(
        select(StakingProduct)
        .where(StakingProduct.id == product_id)
        .options(selectinload(StakingProduct.periods))
    )
    product = result.scalar_one()
    return _to_response(product)


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: uuid.UUID,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StakingProduct).where(StakingProduct.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.is_active = False
    log = AuditLog(
        admin_id=admin.id,
        action="deactivate_staking_product",
        target_type="staking_product",
        target_id=product.id,
        details={"asset": product.asset},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()
    return {"ok": True}
