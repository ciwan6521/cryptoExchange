"""
Matching Engine — atomic order matching with ledger settlement.

Flow:
1. Validate order against trading pair config
2. Lock funds in ledger (quote for buy, base for sell)
3. Insert order into DB
4. Match against resting orders (price-time priority)
5. For each fill: create Trade, update both orders, settle via ledger
6. All within a single DB transaction

Concurrency safety:
- SELECT FOR UPDATE on resting orders during matching
- SELECT FOR UPDATE on accounts via LedgerService
- Single DB transaction per order placement + matching cycle
- Idempotency keys on all ledger mutations

Risk prevented:
- Double-spending: funds locked before order enters book
- Negative balances: LedgerService enforces non-negative constraints
- Race conditions: row-level locks on orders and accounts
- Partial fills: atomic transaction — all fills commit or none do
"""

import uuid
import hashlib
import logging
from decimal import Decimal, ROUND_DOWN
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.trading import TradingPair, Order, Trade
from app.models.user import User
from app.services.ledger_service import LedgerService, InsufficientBalanceError

logger = logging.getLogger("nexus.matching")


class OrderError(Exception):
    def __init__(self, message: str, code: str = "order_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class MatchingEngine:
    """
    Synchronous-style matching engine operating within a single async DB session.
    All operations are atomic within the caller's transaction.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

    # ── Validation ────────────────────────────────────────────

    async def _get_pair(self, symbol: str) -> TradingPair:
        normalized = symbol.upper().replace("/", "-")
        result = await self.db.execute(
            select(TradingPair).where(TradingPair.symbol == normalized)
        )
        pair = result.scalar_one_or_none()
        if not pair:
            raise OrderError(f"Trading pair '{symbol}' not found", "pair_not_found")
        if not pair.is_enabled:
            raise OrderError(f"Trading pair '{symbol}' is currently disabled", "pair_disabled")
        return pair

    def _validate_order_params(
        self, pair: TradingPair, side: str, order_type: str,
        quantity: Decimal, price: Optional[Decimal],
    ) -> None:
        if side not in ("buy", "sell"):
            raise OrderError("Side must be 'buy' or 'sell'", "invalid_side")
        if order_type not in ("limit", "market"):
            raise OrderError("Order type must be 'limit' or 'market'", "invalid_type")
        if order_type == "limit" and price is None:
            raise OrderError("Limit orders require a price", "missing_price")
        if quantity <= Decimal("0"):
            raise OrderError("Quantity must be positive", "invalid_quantity")

        # Size limits
        if quantity < pair.min_order_size:
            raise OrderError(
                f"Minimum order size is {pair.min_order_size}", "below_min_size"
            )
        if quantity > pair.max_order_size:
            raise OrderError(
                f"Maximum order size is {pair.max_order_size}", "above_max_size"
            )

        # Step size (quantity precision)
        if pair.step_size > 0:
            remainder = quantity % pair.step_size
            if remainder != Decimal("0"):
                raise OrderError(
                    f"Quantity must be a multiple of {pair.step_size}", "invalid_step"
                )

        if price is not None:
            if price <= Decimal("0"):
                raise OrderError("Price must be positive", "invalid_price")
            # Tick size (price precision)
            if pair.tick_size > 0:
                remainder = price % pair.tick_size
                if remainder != Decimal("0"):
                    raise OrderError(
                        f"Price must be a multiple of {pair.tick_size}", "invalid_tick"
                    )
            # Min notional
            notional = price * quantity
            if notional < pair.min_notional:
                raise OrderError(
                    f"Order notional ({notional}) below minimum ({pair.min_notional})",
                    "below_min_notional",
                )

    # ── Fund locking ──────────────────────────────────────────

    async def _lock_order_funds(
        self, user_id: uuid.UUID, pair: TradingPair,
        side: str, order_type: str, quantity: Decimal,
        price: Optional[Decimal], order_id: uuid.UUID,
    ) -> None:
        """
        Lock the correct asset and amount for the order.
        - Buy limit: lock quote_asset = price * quantity
        - Sell limit: lock base_asset = quantity
        - Buy market: lock quote_asset = estimated max (use a buffer)
        - Sell market: lock base_asset = quantity
        """
        if side == "buy":
            asset = pair.quote_asset
            if order_type == "limit":
                amount = price * quantity
            else:
                # Market buy: we don't know the price yet.
                # Lock a large placeholder — excess unlocked after fills.
                # For safety, we require the user to specify a max quote amount
                # via the quantity field interpreted as quote amount for market buys.
                # ALTERNATIVE: reject market buys without price ceiling.
                raise OrderError(
                    "Market buy orders are not yet supported. Use limit orders.",
                    "market_buy_unsupported",
                )
        else:
            asset = pair.base_asset
            amount = quantity

        idem_key = f"order_lock:{order_id}"
        try:
            await self.ledger.lock_funds(
                user_id=user_id,
                asset=asset,
                amount=amount,
                idempotency_key=idem_key,
                reference_type="order",
                reference_id=order_id,
                description=f"Lock for {side} {quantity} {pair.symbol} @ {price or 'market'}",
            )
        except InsufficientBalanceError:
            raise OrderError(
                f"Insufficient {asset} balance", "insufficient_balance"
            )

    # ── Order matching ────────────────────────────────────────

    async def _get_matching_orders(
        self, pair: TradingPair, side: str, price: Optional[Decimal],
        order_type: str,
    ) -> list[Order]:
        """
        Get resting orders that can match against the incoming order.
        Price-time priority: best price first, then earliest time.

        Buy order matches against sell orders (asks) with price <= buy price.
        Sell order matches against buy orders (bids) with price >= sell price.
        """
        if side == "buy":
            # Match against sells at or below our price
            conditions = [
                Order.symbol == pair.symbol,
                Order.side == "sell",
                Order.status.in_(["open", "partially_filled"]),
                Order.order_type == "limit",  # Only match against limit orders
            ]
            if order_type == "limit" and price is not None:
                conditions.append(Order.price <= price)
            order_by = [asc(Order.price), asc(Order.created_at)]
        else:
            # Match against buys at or above our price
            conditions = [
                Order.symbol == pair.symbol,
                Order.side == "buy",
                Order.status.in_(["open", "partially_filled"]),
                Order.order_type == "limit",
            ]
            if order_type == "limit" and price is not None:
                conditions.append(Order.price >= price)
            order_by = [desc(Order.price), asc(Order.created_at)]

        result = await self.db.execute(
            select(Order)
            .where(and_(*conditions))
            .order_by(*order_by)
            .with_for_update()  # Lock matched orders to prevent concurrent fills
            .limit(100)  # Batch limit — process in chunks
        )
        return list(result.scalars().all())

    async def _execute_fill(
        self, taker: Order, maker: Order, pair: TradingPair,
        fill_qty: Decimal, fill_price: Decimal,
    ) -> Trade:
        """
        Execute a single fill between taker and maker orders.
        Creates Trade record and settles via ledger.

        For a BUY taker filling against a SELL maker:
        - Taker receives base_asset, pays quote_asset (from locked)
        - Maker receives quote_asset, pays base_asset (from locked)

        For a SELL taker filling against a BUY maker:
        - Taker receives quote_asset, pays base_asset (from locked)
        - Maker receives base_asset, pays quote_asset (from locked)
        """
        quote_qty = fill_price * fill_qty

        # Fees are always deducted from the RECEIVED asset
        if taker.side == "buy":
            # Taker receives base → fee in base; Maker receives quote → fee in quote
            taker_fee_amount = fill_qty * pair.taker_fee
            maker_fee_amount = quote_qty * pair.maker_fee
        else:
            # Taker receives quote → fee in quote; Maker receives base → fee in base
            taker_fee_amount = quote_qty * pair.taker_fee
            maker_fee_amount = fill_qty * pair.maker_fee

        trade_id = uuid.uuid4()
        trade = Trade(
            id=trade_id,
            pair_id=pair.id,
            symbol=pair.symbol,
            maker_order_id=maker.id,
            taker_order_id=taker.id,
            maker_user_id=maker.user_id,
            taker_user_id=taker.user_id,
            side=taker.side,
            price=fill_price,
            quantity=fill_qty,
            quote_quantity=quote_qty,
            maker_fee=maker_fee_amount,
            taker_fee=taker_fee_amount,
        )
        self.db.add(trade)

        # ── Ledger settlement ──
        # Consume locked funds from both sides, credit received assets
        tx_id = uuid.uuid4()

        if taker.side == "buy":
            # Taker BUY: consume locked quote from taker, credit base to taker
            # Maker SELL: consume locked base from maker, credit quote to maker
            taker_pay_asset = pair.quote_asset
            taker_pay_amount = quote_qty
            taker_receive_asset = pair.base_asset
            taker_receive_amount = fill_qty - taker_fee_amount

            maker_pay_asset = pair.base_asset
            maker_pay_amount = fill_qty
            maker_receive_asset = pair.quote_asset
            maker_receive_amount = quote_qty - maker_fee_amount
        else:
            # Taker SELL: consume locked base from taker, credit quote to taker
            # Maker BUY: consume locked quote from maker, credit base to maker
            taker_pay_asset = pair.base_asset
            taker_pay_amount = fill_qty
            taker_receive_asset = pair.quote_asset
            taker_receive_amount = quote_qty - taker_fee_amount

            maker_pay_asset = pair.quote_asset
            maker_pay_amount = quote_qty
            maker_receive_asset = pair.base_asset
            maker_receive_amount = fill_qty - maker_fee_amount

        # Taker: consume locked
        await self.ledger.fill_from_locked(
            user_id=taker.user_id,
            asset=taker_pay_asset,
            amount=taker_pay_amount,
            idempotency_key=f"trade_taker_pay:{trade_id}",
            reference_type="trade",
            reference_id=trade_id,
            description=f"Trade fill: pay {taker_pay_amount} {taker_pay_asset}",
            tx_id=tx_id,
        )

        # Taker: receive
        await self.ledger.credit(
            user_id=taker.user_id,
            asset=taker_receive_asset,
            amount=taker_receive_amount,
            category="trade_buy" if taker.side == "buy" else "trade_sell",
            idempotency_key=f"trade_taker_recv:{trade_id}",
            reference_type="trade",
            reference_id=trade_id,
            description=f"Trade fill: receive {taker_receive_amount} {taker_receive_asset}",
            tx_id=tx_id,
        )

        # Maker: consume locked
        await self.ledger.fill_from_locked(
            user_id=maker.user_id,
            asset=maker_pay_asset,
            amount=maker_pay_amount,
            idempotency_key=f"trade_maker_pay:{trade_id}",
            reference_type="trade",
            reference_id=trade_id,
            description=f"Trade fill: pay {maker_pay_amount} {maker_pay_asset}",
            tx_id=tx_id,
        )

        # Maker: receive
        await self.ledger.credit(
            user_id=maker.user_id,
            asset=maker_receive_asset,
            amount=maker_receive_amount,
            category="trade_sell" if taker.side == "buy" else "trade_buy",
            idempotency_key=f"trade_maker_recv:{trade_id}",
            reference_type="trade",
            reference_id=trade_id,
            description=f"Trade fill: receive {maker_receive_amount} {maker_receive_asset}",
            tx_id=tx_id,
        )

        # Update order fill tracking
        taker.filled_quantity += fill_qty
        taker.remaining -= fill_qty
        taker.fee_total += taker_fee_amount
        taker.fee_asset = taker_receive_asset

        maker.filled_quantity += fill_qty
        maker.remaining -= fill_qty
        maker.fee_total += maker_fee_amount
        maker.fee_asset = maker_receive_asset

        # Update order statuses
        now = datetime.now(timezone.utc)
        if maker.remaining <= Decimal("0"):
            maker.status = "filled"
            maker.filled_at = now
        else:
            maker.status = "partially_filled"

        if taker.remaining <= Decimal("0"):
            taker.status = "filled"
            taker.filled_at = now
        else:
            taker.status = "partially_filled"

        logger.info(
            "FILL: %s %s qty=%s @ %s | taker=%s maker=%s",
            taker.side, pair.symbol, fill_qty, fill_price,
            taker.id, maker.id,
        )

        return trade

    # ── Public API ────────────────────────────────────────────

    async def place_order(
        self,
        user: User,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Decimal,
        price: Optional[Decimal] = None,
    ) -> dict:
        """
        Place an order: validate → lock funds → insert → match → settle.
        Returns dict with order info and list of fills.

        MUST be called within db.begin_nested() or equivalent transaction.
        """
        pair = await self._get_pair(symbol)
        self._validate_order_params(pair, side, order_type, quantity, price)

        if not user.trading_enabled:
            raise OrderError("Trading is disabled for your account", "trading_disabled")

        # Disable autoflush during matching to prevent sync lazy-reload
        # of expired attributes (causes MissingGreenlet with async drivers).
        # All writes are flushed explicitly below.
        with self.db.no_autoflush:
            # Create order record
            order = Order(
                user_id=user.id,
                pair_id=pair.id,
                symbol=pair.symbol,
                side=side,
                order_type=order_type,
                status="open",
                price=price,
                quantity=quantity,
                filled_quantity=Decimal("0"),
                remaining=quantity,
            )
            self.db.add(order)
            await self.db.flush()  # Get order.id

            # Lock funds
            await self._lock_order_funds(
                user.id, pair, side, order_type, quantity, price, order.id
            )

            # Match against resting orders
            trades = []
            if order.remaining > Decimal("0"):
                matching_orders = await self._get_matching_orders(
                    pair, side, price, order_type
                )

                for maker in matching_orders:
                    if order.remaining <= Decimal("0"):
                        break
                    if maker.user_id == user.id:
                        continue  # Don't self-trade

                    fill_qty = min(order.remaining, maker.remaining)
                    fill_price = maker.price  # Maker's price (price-time priority)

                    trade = await self._execute_fill(order, maker, pair, fill_qty, fill_price)
                    trades.append(trade)

            # If limit order with unfilled remainder and it was a buy,
            # the excess locked quote needs to stay locked for the resting order.
            # No adjustment needed — exact amount was locked for limit orders.

            # If fully filled, order is already marked as "filled" by _execute_fill
            await self.db.flush()

        return {
            "order": order,
            "trades": trades,
            "fills_count": len(trades),
        }

    async def cancel_order(
        self, user: User, order_id: uuid.UUID,
    ) -> Order:
        """
        Cancel an open/partially_filled order. Unlocks remaining funds.
        """
        result = await self.db.execute(
            select(Order)
            .where(Order.id == order_id)
            .with_for_update()
        )
        order = result.scalar_one_or_none()
        if not order:
            raise OrderError("Order not found", "not_found")
        if order.user_id != user.id:
            raise OrderError("Not your order", "forbidden")
        if order.status not in ("open", "partially_filled"):
            raise OrderError(
                f"Cannot cancel order with status '{order.status}'",
                "invalid_status",
            )

        pair = await self._get_pair(order.symbol)

        # Calculate how much is still locked for this order
        if order.side == "buy":
            # Remaining locked = remaining * price (for limit buy)
            unlock_asset = pair.quote_asset
            unlock_amount = order.remaining * order.price
        else:
            unlock_asset = pair.base_asset
            unlock_amount = order.remaining

        # Unlock funds
        idem_key = f"order_cancel_unlock:{order.id}:{order.remaining}"
        await self.ledger.unlock_funds(
            user_id=user.id,
            asset=unlock_asset,
            amount=unlock_amount,
            idempotency_key=idem_key,
            reference_type="order_cancel",
            reference_id=order.id,
            description=f"Cancel order: unlock {unlock_amount} {unlock_asset}",
        )

        order.status = "cancelled"
        order.cancelled_at = datetime.now(timezone.utc)

        return order
