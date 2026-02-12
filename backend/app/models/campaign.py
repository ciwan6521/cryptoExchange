import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Campaign(Base):
    """Campaign definitions — admin-created promotions with real reward distribution."""
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    campaign_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    # Types: signup_bonus, deposit_bonus, trading_cashback,
    #        referral_bonus, fee_discount, volume_reward

    status: Mapped[str] = mapped_column(String(15), nullable=False, default="draft", index=True)
    # Status: draft, active, paused, ended

    # Schedule
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Targeting
    target_segment: Mapped[str] = mapped_column(String(20), nullable=False, default="all")

    # Reward config
    reward_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    reward_asset: Mapped[str] = mapped_column(String(10), nullable=False, default="USDT")
    percent_based: Mapped[bool] = mapped_column(Boolean, default=False)
    max_per_user: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))
    min_requirement: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))

    # Budget
    total_budget: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))
    spent_budget: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))

    # Rules
    applicable_pairs: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    daily_cap: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))
    total_cap: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))
    auto_apply: Mapped[bool] = mapped_column(Boolean, default=True)
    one_time_only: Mapped[bool] = mapped_column(Boolean, default=True)

    # Stats
    participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claimed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Admin
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CampaignClaim(Base):
    """Per-user campaign claim state. Tracks eligibility and reward distribution."""
    __tablename__ = "campaign_claims"
    __table_args__ = (
        UniqueConstraint("campaign_id", "user_id", "trigger_ref_id", name="uq_claim_campaign_user_ref"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(15), nullable=False, default="pending")
    # Status: pending, eligible, claimed, rejected, expired

    # What triggered eligibility
    trigger_event: Mapped[str] = mapped_column(String(30), nullable=False)
    trigger_ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Reward details
    reward_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    reward_asset: Mapped[str] = mapped_column(String(10), nullable=False)

    # Ledger reference (when claimed)
    ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Idempotency
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
