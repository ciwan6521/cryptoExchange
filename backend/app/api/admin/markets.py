"""Admin trading pair / markets config routes."""

import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import AdminUser
from app.models.trading import TradingPair
from app.models.cms import AuditLog
from app.api.deps import get_current_admin, require_admin_role

router = APIRouter(prefix="/api/admin/markets", tags=["admin-markets"])


class UpdatePairRequest(BaseModel):
    is_enabled: Optional[bool] = None
    min_order_size: Optional[str] = None
    max_order_size: Optional[str] = None
    min_notional: Optional[str] = None
    maker_fee: Optional[str] = None
    taker_fee: Optional[str] = None
    tick_size: Optional[str] = None
    step_size: Optional[str] = None


@router.get("")
async def list_pairs(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TradingPair).order_by(TradingPair.symbol))
    pairs = list(result.scalars().all())
    return {
        "pairs": [
            {
                "id": str(p.id), "symbol": p.symbol,
                "base_asset": p.base_asset, "quote_asset": p.quote_asset,
                "price_precision": p.price_precision, "quantity_precision": p.quantity_precision,
                "tick_size": str(p.tick_size), "step_size": str(p.step_size),
                "min_order_size": str(p.min_order_size), "max_order_size": str(p.max_order_size),
                "min_notional": str(p.min_notional),
                "maker_fee": str(p.maker_fee), "taker_fee": str(p.taker_fee),
                "is_enabled": p.is_enabled,
            }
            for p in pairs
        ]
    }


@router.patch("/{pair_id}")
async def update_pair(
    pair_id: uuid.UUID,
    body: UpdatePairRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TradingPair).where(TradingPair.id == pair_id))
    pair = result.scalar_one_or_none()
    if not pair:
        raise HTTPException(status_code=404, detail="Trading pair not found")

    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            if field in ("min_order_size", "max_order_size", "min_notional", "maker_fee", "taker_fee", "tick_size", "step_size"):
                value = Decimal(value)
            setattr(pair, field, value)
            changes[field] = str(value)

    log = AuditLog(
        admin_id=admin.id, action="update_trading_pair",
        target_type="trading_pair", target_id=pair.id,
        details={"symbol": pair.symbol, **changes},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()

    return {"ok": True, "symbol": pair.symbol, "changes": changes}
