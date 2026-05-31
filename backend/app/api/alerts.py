"""Price alerts API."""

import uuid
import logging
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.platform import PriceAlert
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])
logger = logging.getLogger("crypto4pro.alerts")


class CreateAlertRequest(BaseModel):
    asset: str = Field(min_length=2, max_length=20)
    condition: str = Field(pattern="^(above|below)$")
    target_price: str


@router.get("")
async def list_alerts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PriceAlert)
        .where(PriceAlert.user_id == user.id)
        .order_by(desc(PriceAlert.created_at))
    )
    alerts = list(result.scalars().all())
    return {
        "alerts": [
            {
                "id": str(a.id),
                "asset": a.asset,
                "condition": a.condition,
                "target_price": str(a.target_price),
                "is_active": a.is_active,
                "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
                "created_at": a.created_at.isoformat(),
            }
            for a in alerts
        ],
    }


@router.post("")
async def create_alert(
    body: CreateAlertRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        price = Decimal(body.target_price)
        if price <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid target price")

    active_count = await db.execute(
        select(PriceAlert).where(PriceAlert.user_id == user.id, PriceAlert.is_active == True)
    )
    if len(list(active_count.scalars().all())) >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 active alerts")

    alert = PriceAlert(
        user_id=user.id,
        asset=body.asset.upper(),
        condition=body.condition,
        target_price=price,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return {
        "ok": True,
        "alert": {
            "id": str(alert.id),
            "asset": alert.asset,
            "condition": alert.condition,
            "target_price": str(alert.target_price),
            "is_active": alert.is_active,
        },
    }


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PriceAlert).where(PriceAlert.id == alert_id, PriceAlert.user_id == user.id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    await db.commit()
    return {"ok": True}
