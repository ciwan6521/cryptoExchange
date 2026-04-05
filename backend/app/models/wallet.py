import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, ForeignKey, UniqueConstraint, Index, func
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
    external_wallet_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
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

    # Fee data (stored at claim time for fiat deposits)
    deposit_fee_percent: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)
    deposit_fee: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))
    gross_amount: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)
    expected_net_amount: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)
    base_rate_at_claim: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)
    fiat_payment_method_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Pay4Pro reference
    pay4pro_deposit_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    # Ledger reference
    ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Withdrawal(Base):
    """
    Withdrawal records.

    State machine:
      pending_lock → pending_approval → approved → processing → completed
                   → rejected
                   → cancelled

    - pending_lock:     User submitted, funds being locked in ledger
    - pending_approval: Funds locked, awaiting admin approval
    - approved:         Admin approved, ready for blockchain settlement
    - processing:       Settlement in progress (blockchain tx sent)
    - completed:        Funds deducted from locked, tx confirmed
    - rejected:         Admin rejected, locked funds returned to available
    - cancelled:        User cancelled before approval, funds unlocked
    - failed:           Settlement failed after approval, funds unlocked
    """
    __tablename__ = "withdrawals"
    __table_args__ = (
        Index("idx_withdrawal_user_status", "user_id", "status"),
        Index("idx_withdrawal_created", "created_at"),
    )

    VALID_STATUSES = {
        "pending_lock", "pending_approval", "approved", "processing",
        "completed", "rejected", "cancelled", "failed",
    }
    # Transitions: {from_status: [allowed_to_statuses]}
    TRANSITIONS = {
        "pending_lock":     ["pending_approval", "failed"],
        "pending_approval": ["approved", "rejected", "cancelled"],
        "approved":         ["processing", "failed"],
        "processing":       ["completed", "failed"],
    }

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

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending_lock", index=True)

    # Whether this withdrawal requires multi-admin approval (large amount)
    requires_multi_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    approvals_required: Mapped[int] = mapped_column(Integer, default=1)
    approvals_received: Mapped[int] = mapped_column(Integer, default=0)

    # Legacy single-admin reviewed_by kept for quick lookup
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Ledger references — lock_tx when funds locked, settle_tx when settled
    lock_ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    settle_ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Keep legacy column name for backwards compat
    ledger_tx_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # Pay4Pro reference
    pay4pro_withdrawal_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    # IP for fraud detection
    request_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def can_transition_to(self, new_status: str) -> bool:
        allowed = self.TRANSITIONS.get(self.status, [])
        return new_status in allowed


class WithdrawalApproval(Base):
    """
    Immutable approval trail for withdrawals.
    Each admin approval is a separate row — prevents same-admin double-approve.
    """
    __tablename__ = "withdrawal_approvals"
    __table_args__ = (
        UniqueConstraint("withdrawal_id", "admin_id", name="uq_withdrawal_approval_admin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    withdrawal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("withdrawals.id"), nullable=False, index=True)
    admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # 'approve' or 'reject'
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WithdrawalAddress(Base):
    """
    Tracks user withdrawal addresses for cooldown enforcement.
    New addresses must wait 24h before first withdrawal.
    """
    __tablename__ = "withdrawal_addresses"
    __table_args__ = (
        UniqueConstraint("user_id", "asset", "network", "address", name="uq_withdrawal_address"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    network: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_whitelisted: Mapped[bool] = mapped_column(Boolean, default=False)
    first_added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cooldown_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
