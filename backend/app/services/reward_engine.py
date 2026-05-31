"""
Reward Engine — Event-driven campaign evaluation and reward distribution.

Flow:
1. An event occurs (user_registered, deposit_completed, trade_executed)
2. Event is published to Redis pub/sub
3. Celery worker picks it up and calls evaluate()
4. Engine finds matching active campaigns
5. Checks eligibility per campaign
6. Calculates reward amount
7. Creates claim + distributes reward via ledger (atomic)

All reward distribution goes through LedgerService — no direct balance writes.
"""

import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func as sqlfunc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.campaign import Campaign, CampaignClaim
from app.services.ledger_service import LedgerService


# Event type → campaign type mapping
EVENT_TO_CAMPAIGN_TYPE = {
    "user_registered": ["signup_bonus"],
    "deposit_completed": ["deposit_bonus"],
    "trade_executed": ["trading_cashback", "fee_discount", "volume_reward"],
    "referral_completed": ["referral_bonus"],
}


class RewardEngine:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

    async def evaluate(self, event: dict) -> list[CampaignClaim]:
        """
        Main entry point. Evaluate an event against all active campaigns.
        Returns list of claims created (may be empty).

        event = {
            "type": "user_registered" | "deposit_completed" | "trade_executed",
            "user_id": UUID,
            "timestamp": datetime,
            "data": {
                # For deposit_completed:
                "deposit_id": UUID, "amount": Decimal, "asset": str
                # For trade_executed:
                "trade_id": UUID, "symbol": str, "side": str,
                "quantity": Decimal, "quote_quantity": Decimal,
                "fee": Decimal, "fee_asset": str
            }
        }
        """
        event_type = event["type"]
        user_id = uuid.UUID(str(event["user_id"]))
        campaign_types = EVENT_TO_CAMPAIGN_TYPE.get(event_type, [])

        if not campaign_types:
            return []

        # 1. Find matching active campaigns (with row lock to prevent budget race)
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(Campaign).where(
                Campaign.status == "active",
                Campaign.campaign_type.in_(campaign_types),
                Campaign.start_date <= now,
                Campaign.end_date > now,
            ).with_for_update()
        )
        campaigns = list(result.scalars().all())

        if not campaigns:
            return []

        # 2. Load user for eligibility checks
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user or not user.is_active:
            return []

        # 3. Evaluate each campaign
        claims = []
        for campaign in campaigns:
            claim = await self._evaluate_campaign(campaign, user, event)
            if claim:
                claims.append(claim)

        return claims

    async def _evaluate_campaign(
        self, campaign: Campaign, user: User, event: dict
    ) -> Optional[CampaignClaim]:
        """Evaluate a single campaign for a user/event. Returns claim if eligible."""
        user_id = user.id
        event_data = event.get("data", {})

        # Generate idempotency key
        trigger_ref_id = self._get_trigger_ref_id(event)
        idempotency_key = f"campaign:{campaign.id}:user:{user_id}:ref:{trigger_ref_id or 'none'}"

        # a) Check if already claimed (idempotency at application level)
        existing = await self.db.execute(
            select(CampaignClaim).where(
                CampaignClaim.idempotency_key == idempotency_key
            )
        )
        if existing.scalar_one_or_none():
            return None  # Already processed

        # b) One-time check
        if campaign.one_time_only:
            existing_claim = await self.db.execute(
                select(CampaignClaim).where(
                    CampaignClaim.campaign_id == campaign.id,
                    CampaignClaim.user_id == user_id,
                    CampaignClaim.status == "claimed",
                )
            )
            if existing_claim.scalar_one_or_none():
                return None  # Already claimed once

        # c) Target segment check
        if not self._check_segment(campaign.target_segment, user):
            return None

        # d) Pair restriction check
        if campaign.applicable_pairs:
            trade_symbol = event_data.get("symbol")
            if trade_symbol and trade_symbol not in campaign.applicable_pairs:
                return None

        # e) Min requirement check
        if campaign.min_requirement and campaign.min_requirement > Decimal("0"):
            event_amount = self._get_event_amount(event)
            if event_amount < campaign.min_requirement:
                return None

        # f) Budget check
        if campaign.total_budget > Decimal("0"):
            reward = self._calculate_reward(campaign, event)
            remaining_budget = campaign.total_budget - campaign.spent_budget
            if remaining_budget <= Decimal("0"):
                return None
            reward = min(reward, remaining_budget)
        else:
            reward = self._calculate_reward(campaign, event)

        if reward <= Decimal("0"):
            return None

        # g) Daily cap check
        if campaign.daily_cap and campaign.daily_cap > Decimal("0"):
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            daily_result = await self.db.execute(
                select(sqlfunc.coalesce(sqlfunc.sum(CampaignClaim.reward_amount), Decimal("0"))).where(
                    CampaignClaim.campaign_id == campaign.id,
                    CampaignClaim.status == "claimed",
                    CampaignClaim.claimed_at >= today_start,
                )
            )
            daily_spent = daily_result.scalar() or Decimal("0")
            if daily_spent >= campaign.daily_cap:
                return None
            reward = min(reward, campaign.daily_cap - daily_spent)

        # 6. Create claim + distribute reward (ATOMIC)
        return await self._distribute_reward(
            campaign=campaign,
            user_id=user_id,
            reward=reward,
            trigger_event=event["type"],
            trigger_ref_id=trigger_ref_id,
            idempotency_key=idempotency_key,
        )

    async def _distribute_reward(
        self,
        campaign: Campaign,
        user_id: uuid.UUID,
        reward: Decimal,
        trigger_event: str,
        trigger_ref_id: Optional[uuid.UUID],
        idempotency_key: str,
    ) -> Optional[CampaignClaim]:
        """Create claim record and credit user balance. Atomic."""
        tx_id = uuid.uuid4()

        # Credit user balance via ledger
        ledger_entry = await self.ledger.credit(
            user_id=user_id,
            asset=campaign.reward_asset,
            amount=reward,
            category="campaign_reward",
            idempotency_key=f"ledger:{idempotency_key}",
            reference_type="campaign",
            reference_id=campaign.id,
            description=f"Campaign reward: {campaign.name}",
            tx_id=tx_id,
        )

        if ledger_entry is None:
            return None  # Duplicate — ledger idempotency caught it

        # Create claim record
        claim = CampaignClaim(
            campaign_id=campaign.id,
            user_id=user_id,
            status="claimed",
            trigger_event=trigger_event,
            trigger_ref_id=trigger_ref_id,
            reward_amount=reward,
            reward_asset=campaign.reward_asset,
            ledger_tx_id=tx_id,
            idempotency_key=idempotency_key,
            claimed_at=datetime.now(timezone.utc),
        )
        self.db.add(claim)

        # Update campaign stats
        campaign.spent_budget += reward
        campaign.claimed_count += 1

        # Check if this is a new participant
        existing_participant = await self.db.execute(
            select(CampaignClaim).where(
                CampaignClaim.campaign_id == campaign.id,
                CampaignClaim.user_id == user_id,
                CampaignClaim.id != claim.id,
            )
        )
        if not existing_participant.scalar_one_or_none():
            campaign.participant_count += 1

        await self.db.flush()
        return claim

    def _calculate_reward(self, campaign: Campaign, event: dict) -> Decimal:
        """Calculate reward amount based on campaign config."""
        if campaign.percent_based:
            event_amount = self._get_event_amount(event)
            reward = event_amount * (campaign.reward_amount / Decimal("100"))
        else:
            reward = campaign.reward_amount

        # Clamp to max_per_user
        if campaign.max_per_user and campaign.max_per_user > Decimal("0"):
            reward = min(reward, campaign.max_per_user)

        return reward

    def _get_event_amount(self, event: dict) -> Decimal:
        """Extract the relevant amount from an event."""
        data = event.get("data", {})
        if event["type"] == "deposit_completed":
            return Decimal(str(data.get("amount", "0")))
        elif event["type"] == "trade_executed":
            return Decimal(str(data.get("quote_quantity", "0")))
        return Decimal("0")

    def _get_trigger_ref_id(self, event: dict) -> Optional[uuid.UUID]:
        """Extract the reference ID from an event."""
        data = event.get("data", {})
        ref_id = None
        if event["type"] == "user_registered":
            ref_id = event.get("user_id")
        elif event["type"] == "deposit_completed":
            ref_id = data.get("deposit_id")
        elif event["type"] == "trade_executed":
            ref_id = data.get("trade_id")

        if ref_id:
            return uuid.UUID(str(ref_id))
        return None

    def _check_segment(self, segment: str, user: User) -> bool:
        """Check if user matches the target segment."""
        if segment == "all":
            return True
        elif segment == "new_users":
            thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
            return user.created_at > thirty_days_ago
        elif segment == "verified":
            return user.kyc_status == "approved"
        elif segment == "vip":
            return user.member_tier in ("vip1", "vip2", "vip3")
        elif segment == "inactive":
            if user.last_login_at is None:
                return True
            thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
            return user.last_login_at < thirty_days_ago
        return False
