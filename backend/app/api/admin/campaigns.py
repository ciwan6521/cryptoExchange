"""Admin campaign CRUD routes."""

import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.campaign import Campaign
from app.models.cms import AuditLog
from app.api.deps import get_current_admin, require_admin_role
from app.schemas.campaign import (
    CreateCampaignRequest, UpdateCampaignRequest,
    CampaignResponse, CampaignListResponse,
)

router = APIRouter(prefix="/api/admin/campaigns", tags=["admin-campaigns"])


@router.get("", response_model=CampaignListResponse)
async def list_campaigns(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Campaign).order_by(Campaign.created_at.desc()))
    campaigns = list(result.scalars().all())
    return CampaignListResponse(
        campaigns=[_to_response(c) for c in campaigns]
    )


@router.post("", response_model=CampaignResponse)
async def create_campaign(
    body: CreateCampaignRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    campaign = Campaign(
        name=body.name,
        description=body.description,
        campaign_type=body.campaign_type,
        status="draft",
        start_date=datetime.fromisoformat(body.start_date),
        end_date=datetime.fromisoformat(body.end_date),
        target_segment=body.target_segment,
        reward_amount=Decimal(body.reward_amount),
        reward_asset=body.reward_asset,
        percent_based=body.percent_based,
        max_per_user=Decimal(body.max_per_user),
        min_requirement=Decimal(body.min_requirement),
        total_budget=Decimal(body.total_budget),
        applicable_pairs=body.applicable_pairs,
        daily_cap=Decimal(body.daily_cap),
        total_cap=Decimal(body.total_cap),
        auto_apply=body.auto_apply,
        one_time_only=body.one_time_only,
        created_by=admin.id,
    )
    db.add(campaign)

    log = AuditLog(
        admin_id=admin.id, action="create_campaign",
        target_type="campaign", target_id=campaign.id,
        details={"name": body.name, "type": body.campaign_type},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()
    await db.refresh(campaign)

    return _to_response(campaign)


@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: uuid.UUID,
    body: UpdateCampaignRequest,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            if field in ("reward_amount", "max_per_user", "min_requirement", "total_budget", "daily_cap", "total_cap"):
                value = Decimal(value)
            elif field in ("start_date", "end_date"):
                value = datetime.fromisoformat(value)
            setattr(campaign, field, value)
            changes[field] = str(value)

    log = AuditLog(
        admin_id=admin.id, action="update_campaign",
        target_type="campaign", target_id=campaign.id,
        details=changes,
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()
    await db.refresh(campaign)

    return _to_response(campaign)


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: uuid.UUID,
    request: Request,
    admin: AdminUser = Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.status == "active":
        raise HTTPException(status_code=400, detail="Cannot delete an active campaign. End it first.")

    log = AuditLog(
        admin_id=admin.id, action="delete_campaign",
        target_type="campaign", target_id=campaign.id,
        details={"name": campaign.name},
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.delete(campaign)
    await db.commit()

    return {"ok": True}


def _to_response(c: Campaign) -> CampaignResponse:
    return CampaignResponse(
        id=c.id, name=c.name, description=c.description,
        campaign_type=c.campaign_type, status=c.status,
        start_date=c.start_date.isoformat(), end_date=c.end_date.isoformat(),
        target_segment=c.target_segment,
        reward_amount=str(c.reward_amount), reward_asset=c.reward_asset,
        percent_based=c.percent_based, max_per_user=str(c.max_per_user),
        min_requirement=str(c.min_requirement),
        total_budget=str(c.total_budget), spent_budget=str(c.spent_budget),
        applicable_pairs=c.applicable_pairs,
        daily_cap=str(c.daily_cap), total_cap=str(c.total_cap),
        auto_apply=c.auto_apply, one_time_only=c.one_time_only,
        participant_count=c.participant_count, claimed_count=c.claimed_count,
    )
