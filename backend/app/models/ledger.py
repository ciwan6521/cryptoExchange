import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric, BigInteger, Text, ForeignKey, CheckConstraint, UniqueConstraint, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Account(Base):
    """Internal account — one per user per asset. Cached balance derived from ledger."""
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "asset", name="uq_account_user_asset"),
        CheckConstraint("available >= 0", name="ck_account_available_non_negative"),
        CheckConstraint("locked >= 0", name="ck_account_locked_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)

    # Cached balance (always updated atomically with ledger entries)
    available: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))
    locked: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="accounts")
    entries = relationship("LedgerEntry", back_populates="account")


class LedgerEntry(Base):
    """
    Immutable ledger entry. Every balance mutation creates one.
    Double-entry: every transaction (tx_id) has a debit AND credit entry.
    """
    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_ledger_amount_positive"),
        Index("idx_ledger_account", "account_id"),
        Index("idx_ledger_tx", "tx_id"),
        Index("idx_ledger_user_asset", "user_id", "asset"),
        Index("idx_ledger_category", "category"),
        Index("idx_ledger_reference", "reference_type", "reference_id"),
        Index("idx_ledger_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Transaction grouping
    tx_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)

    # Account reference
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)

    # Entry type
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'debit' or 'credit'
    amount: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    # Balance after this entry (audit trail)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    # Classification
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    # Categories: deposit, withdrawal, trade_buy, trade_sell, fee,
    #             campaign_reward, admin_credit, admin_debit,
    #             order_lock, order_unlock, order_fill

    # Reference to source
    reference_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Metadata
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    account = relationship("Account", back_populates="entries")


class BalanceSnapshot(Base):
    """Periodic balance snapshots for reconciliation."""
    __tablename__ = "balance_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    available: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    locked: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ledger_sum: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
