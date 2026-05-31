import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, DateTime, Numeric, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LeveragePosition(Base):
    """Perpetual-style leveraged position — margin locked in USDT."""
    __tablename__ = "leverage_positions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    base_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    quote_asset: Mapped[str] = mapped_column(String(20), nullable=False, default="USDT")
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # long | short
    leverage: Mapped[int] = mapped_column(Integer, nullable=False)

    margin_usdt: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    notional_usdt: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    entry_price: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    liquidation_price: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    close_price: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)
    realized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="open")  # open | closed | liquidated
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
