"""
Campaign API routes — public active campaigns + user claim history.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.campaign import Campaign, CampaignClaim
from app.api.deps import get_current_user
from app.schemas.campaign import CampaignResponse, CampaignListResponse, CampaignClaimResponse, MyClaimsResponse

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.get("/active", response_model=CampaignListResponse)
async def get_active_campaigns(db: AsyncSession = Depends(get_db)):
    """Get all currently active campaigns (public endpoint)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Campaign).where(
            Campaign.status == "active",
            Campaign.start_date <= now,
            Campaign.end_date > now,
        ).order_by(Campaign.created_at.desc())
    )
    campaigns = list(result.scalars().all())
    return CampaignListResponse(
        campaigns=[
            CampaignResponse(
                id=c.id,
                name=c.name,
                description=c.description,
                campaign_type=c.campaign_type,
                status=c.status,
                start_date=c.start_date.isoformat(),
                end_date=c.end_date.isoformat(),
                target_segment=c.target_segment,
                reward_amount=str(c.reward_amount),
                reward_asset=c.reward_asset,
                percent_based=c.percent_based,
                max_per_user=str(c.max_per_user),
                min_requirement=str(c.min_requirement),
                total_budget=str(c.total_budget),
                spent_budget=str(c.spent_budget),
                applicable_pairs=c.applicable_pairs,
                daily_cap=str(c.daily_cap),
                total_cap=str(c.total_cap),
                auto_apply=c.auto_apply,
                one_time_only=c.one_time_only,
                participant_count=c.participant_count,
                claimed_count=c.claimed_count,
            )
            for c in campaigns
        ]
    )


@router.get("/my-claims", response_model=MyClaimsResponse)
async def get_my_claims(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all campaign claims for the current user."""
    result = await db.execute(
        select(CampaignClaim)
        .where(CampaignClaim.user_id == user.id)
        .order_by(CampaignClaim.created_at.desc())
    )
    claims = list(result.scalars().all())
    return MyClaimsResponse(
        claims=[
            CampaignClaimResponse(
                id=cl.id,
                campaign_id=cl.campaign_id,
                status=cl.status,
                trigger_event=cl.trigger_event,
                reward_amount=str(cl.reward_amount),
                reward_asset=cl.reward_asset,
                claimed_at=cl.claimed_at.isoformat() if cl.claimed_at else None,
                created_at=cl.created_at.isoformat(),
            )
            for cl in claims
        ]
    )
