"""
DepositMethod — Admin-managed deposit instructions shown to users.

Two types:
- crypto_wallet: blockchain address + network for crypto deposits
- bank_transfer: bank name, IBAN, account holder, SWIFT for fiat deposits
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DepositMethod(Base):
    __tablename__ = "deposit_methods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # "crypto_wallet" or "bank_transfer"
    method_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Display label, e.g. "BTC - Bitcoin Network", "Ziraat Bankası TRY"
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    # --- Crypto fields ---
    asset: Mapped[str | None] = mapped_column(String(10), nullable=True)       # BTC, ETH, USDT ...
    network: Mapped[str | None] = mapped_column(String(30), nullable=True)     # ERC20, TRC20, BEP20 ...
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)    # wallet address
    memo_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)   # memo/tag for XRP, etc.

    # --- Bank fields ---
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_holder: Mapped[str | None] = mapped_column(String(200), nullable=True)
    iban: Mapped[str | None] = mapped_column(String(50), nullable=True)
    swift_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)    # USD, EUR, TRY ...
    reference_note: Mapped[str | None] = mapped_column(String(200), nullable=True)  # "Include your user ID"

    # --- Common ---
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # Admin notes or instructions
    min_amount: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())
