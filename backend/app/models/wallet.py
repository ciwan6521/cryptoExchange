import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Wallet(Base):
    """User wallet addresses (feature-flagged for future blockchain integration)."""
    __tablename__ = "wallets"
    __table_args__ = (
        UniqueConstraint("user_id", "asset", "network", name="uq_wallet_user_asset_network"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    network: Mapped[str] = mapped_column(String(20), nullable=False)  # TRC20, ERC20, etc.
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)  # NULL until generated
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Deposit(Base):
    """Deposit records."""
    __tablename__ = "deposits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    network: Mapped[str | None] = mapped_column(String(20), nullable=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    # Blockchain data (NULL for admin credits)
    tx_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confirmations: Mapped[int] = mapped_column(Integer, default=0)
    required_confirmations: Mapped[int] = mapped_column(Integer, default=1)

    status: Mapped[str] = mapped_column(String(15), nullable=False, default="pending", index=True)
    # Status: pending, confirming, completed, failed

    # Ledger reference
    ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Withdrawal(Base):
    """Withdrawal records."""
    __tablename__ = "withdrawals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    network: Mapped[str | None] = mapped_column(String(20), nullable=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))

    # Destination
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)

    # Blockchain data
    tx_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(15), nullable=False, default="pending", index=True)
    # Status: pending, approved, processing, completed, rejected, failed

    # Admin approval
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Ledger reference
    ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
