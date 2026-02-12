import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TradingPair(Base):
    """Trading pair configuration (admin-managed)."""
    __tablename__ = "trading_pairs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)  # 'BTC-USDT'
    base_asset: Mapped[str] = mapped_column(String(10), nullable=False)
    quote_asset: Mapped[str] = mapped_column(String(10), nullable=False)

    # Precision
    price_precision: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    quantity_precision: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    tick_size: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    step_size: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    # Limits
    min_order_size: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    max_order_size: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    min_notional: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("10"))

    # Fees
    maker_fee: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("0.001"))
    taker_fee: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False, default=Decimal("0.001"))

    # Status
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Order(Base):
    """User orders."""
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    pair_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trading_pairs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    side: Mapped[str] = mapped_column(String(4), nullable=False)  # 'buy' or 'sell'
    order_type: Mapped[str] = mapped_column(String(15), nullable=False)  # 'limit', 'market', 'stop_limit'
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="open", index=True)
    # Status: open, partially_filled, filled, cancelled, expired

    price: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)  # NULL for market
    stop_price: Mapped[Decimal | None] = mapped_column(Numeric(36, 18), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    filled_quantity: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))
    remaining: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)

    # Fee tracking
    fee_asset: Mapped[str | None] = mapped_column(String(10), nullable=True)
    fee_total: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Trade(Base):
    """Executed trades (matched orders)."""
    __tablename__ = "trades"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pair_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trading_pairs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    maker_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    taker_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False)
    maker_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    taker_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    side: Mapped[str] = mapped_column(String(4), nullable=False)  # Taker's side
    price: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)
    quote_quantity: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False)  # price * quantity

    maker_fee: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))
    taker_fee: Mapped[Decimal] = mapped_column(Numeric(36, 18), nullable=False, default=Decimal("0"))

    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
