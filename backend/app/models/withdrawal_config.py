"""
Per-asset withdrawal fee and limits configuration.
Admin-managed via API. Stored in DB for runtime configurability.
"""

import uuid
from decimal import Decimal
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Numeric, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class WithdrawalFeeConfig(Base):
    """Per-asset withdrawal fee configuration."""
    __tablename__ = "withdrawal_fee_configs"
    __table_args__ = (
        UniqueConstraint("asset", "network", name="uq_withdrawal_fee_asset_network"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    network: Mapped[str] = mapped_column(String(20), nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    min_withdrawal: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("1"))
    max_withdrawal: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("100000"))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class HotWalletConfig(Base):
    """
    Hot/cold wallet configuration placeholders.
    Tracks system wallet addresses and balance thresholds.
    Actual blockchain integration deferred — this stores the rules.
    """
    __tablename__ = "hot_wallet_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    network: Mapped[str] = mapped_column(String(20), nullable=False)
    wallet_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'hot' or 'cold'
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    # Threshold: when hot wallet drops below this, alert to refill from cold
    min_balance_threshold: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("1000"))
    # Max balance: when hot wallet exceeds this, sweep to cold
    max_balance_threshold: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("50000"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
