"""
Tests for the matching engine — order placement, matching, fills, cancellation.

Verifies:
- Fund locking on order placement
- Price-time priority matching
- Partial fills
- Full fills
- Order cancellation and fund unlock
- Self-trade prevention
- Insufficient balance rejection
- Invalid order parameter rejection
"""

import uuid
import pytest
import pytest_asyncio
from decimal import Decimal

from app.services.matching_engine import MatchingEngine, OrderError
from app.services.ledger_service import LedgerService


@pytest.mark.asyncio
async def test_place_limit_buy_locks_funds(db, funded_user, sample_pair):
    """Placing a buy order should lock quote asset (USDT)."""
    engine = MatchingEngine(db)
    ledger = LedgerService(db)

    # Check initial balance
    acct = await ledger.get_balance(funded_user.id, "USDT")
    initial_available = acct.available

    result = await engine.place_order(
        user=funded_user,
        symbol="BTC-USDT",
        side="buy",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    assert result["order"].status == "open"
    assert result["fills_count"] == 0

    # USDT should be locked: 1 * 50000 = 50000
    acct = await ledger.get_balance(funded_user.id, "USDT")
    assert acct.available == initial_available - Decimal("50000")
    assert acct.locked == Decimal("50000")


@pytest.mark.asyncio
async def test_place_limit_sell_locks_funds(db, funded_user, sample_pair):
    """Placing a sell order should lock base asset (BTC)."""
    engine = MatchingEngine(db)
    ledger = LedgerService(db)

    acct = await ledger.get_balance(funded_user.id, "BTC")
    initial_available = acct.available

    result = await engine.place_order(
        user=funded_user,
        symbol="BTC-USDT",
        side="sell",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    assert result["order"].status == "open"
    acct = await ledger.get_balance(funded_user.id, "BTC")
    assert acct.available == initial_available - Decimal("1")
    assert acct.locked == Decimal("1")


@pytest.mark.asyncio
async def test_matching_buy_against_sell(db, funded_user, funded_user2, sample_pair):
    """A buy order should match against a resting sell order at maker's price."""
    engine = MatchingEngine(db)

    # User2 places a sell at 50000
    await engine.place_order(
        user=funded_user2,
        symbol="BTC-USDT",
        side="sell",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    # User1 places a buy at 50000 — should match
    result = await engine.place_order(
        user=funded_user,
        symbol="BTC-USDT",
        side="buy",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    assert result["fills_count"] == 1
    assert result["order"].status == "filled"
    trade = result["trades"][0]
    assert trade.price == Decimal("50000")
    assert trade.quantity == Decimal("1")


@pytest.mark.asyncio
async def test_matching_sell_against_buy(db, funded_user, funded_user2, sample_pair):
    """A sell order should match against a resting buy order."""
    engine = MatchingEngine(db)

    # User1 places buy at 50000
    await engine.place_order(
        user=funded_user,
        symbol="BTC-USDT",
        side="buy",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    # User2 places sell at 50000 — should match
    result = await engine.place_order(
        user=funded_user2,
        symbol="BTC-USDT",
        side="sell",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    assert result["fills_count"] == 1
    assert result["order"].status == "filled"


@pytest.mark.asyncio
async def test_partial_fill(db, funded_user, funded_user2, sample_pair):
    """An order larger than available liquidity should be partially filled."""
    engine = MatchingEngine(db)

    # User2 sells 0.5 BTC
    await engine.place_order(
        user=funded_user2,
        symbol="BTC-USDT",
        side="sell",
        order_type="limit",
        quantity=Decimal("0.5"),
        price=Decimal("50000"),
    )

    # User1 buys 1 BTC — should fill 0.5, rest stays open
    result = await engine.place_order(
        user=funded_user,
        symbol="BTC-USDT",
        side="buy",
        order_type="limit",
        quantity=Decimal("1"),
        price=Decimal("50000"),
    )

    assert result["fills_count"] == 1
    assert result["order"].status == "partially_filled"
    assert result["order"].filled_quantity == Decimal("0.5")
    assert result["order"].remaining == Decimal("0.5")


@pytest.mark.asyncio
async def test_price_time_priority(db, funded_user, funded_user2, sample_pair):
    """Better-priced orders should be matched first (price priority)."""
    engine = MatchingEngine(db)
    ledger = LedgerService(db)

    # Fund user2 extra BTC
    await ledger.credit(
        user_id=funded_user2.id, asset="BTC", amount=Decimal("10"),
        category="test", idempotency_key=f"extra_btc:{uuid.uuid4()}",
    )

    # User2 places two sells at different prices
    await engine.place_order(
        user=funded_user2, symbol="BTC-USDT", side="sell",
        order_type="limit", quantity=Decimal("1"), price=Decimal("51000"),
    )
    await engine.place_order(
        user=funded_user2, symbol="BTC-USDT", side="sell",
        order_type="limit", quantity=Decimal("1"), price=Decimal("50000"),
    )

    # User1 buys 1 BTC at 51000 — should match the 50000 sell first
    result = await engine.place_order(
        user=funded_user, symbol="BTC-USDT", side="buy",
        order_type="limit", quantity=Decimal("1"), price=Decimal("51000"),
    )

    assert result["fills_count"] == 1
    assert result["trades"][0].price == Decimal("50000")  # Maker's price


@pytest.mark.asyncio
async def test_insufficient_balance_rejected(db, sample_user, sample_pair):
    """Order should be rejected if user has insufficient balance."""
    engine = MatchingEngine(db)

    with pytest.raises(OrderError, match="Insufficient"):
        await engine.place_order(
            user=sample_user,
            symbol="BTC-USDT",
            side="buy",
            order_type="limit",
            quantity=Decimal("1"),
            price=Decimal("50000"),
        )


@pytest.mark.asyncio
async def test_self_trade_prevention(db, funded_user, sample_pair):
    """User should not trade against their own resting orders."""
    engine = MatchingEngine(db)

    # Place a sell
    await engine.place_order(
        user=funded_user, symbol="BTC-USDT", side="sell",
        order_type="limit", quantity=Decimal("1"), price=Decimal("50000"),
    )

    # Place a buy at same price — should NOT match (self-trade)
    result = await engine.place_order(
        user=funded_user, symbol="BTC-USDT", side="buy",
        order_type="limit", quantity=Decimal("1"), price=Decimal("50000"),
    )

    assert result["fills_count"] == 0
    assert result["order"].status == "open"


@pytest.mark.asyncio
async def test_cancel_order_unlocks_funds(db, funded_user, sample_pair):
    """Cancelling an order should unlock the remaining funds."""
    engine = MatchingEngine(db)
    ledger = LedgerService(db)

    result = await engine.place_order(
        user=funded_user, symbol="BTC-USDT", side="buy",
        order_type="limit", quantity=Decimal("1"), price=Decimal("50000"),
    )
    order = result["order"]

    # Check locked
    acct = await ledger.get_balance(funded_user.id, "USDT")
    assert acct.locked == Decimal("50000")

    # Cancel
    cancelled = await engine.cancel_order(funded_user, order.id)
    assert cancelled.status == "cancelled"

    # Funds unlocked
    acct = await ledger.get_balance(funded_user.id, "USDT")
    assert acct.locked == Decimal("0")
    assert acct.available == Decimal("100000")


@pytest.mark.asyncio
async def test_invalid_order_params(db, funded_user, sample_pair):
    """Invalid order parameters should be rejected with clear errors."""
    engine = MatchingEngine(db)

    # Invalid side
    with pytest.raises(OrderError, match="Side must be"):
        await engine.place_order(
            user=funded_user, symbol="BTC-USDT", side="hold",
            order_type="limit", quantity=Decimal("1"), price=Decimal("50000"),
        )

    # Zero quantity
    with pytest.raises(OrderError, match="positive"):
        await engine.place_order(
            user=funded_user, symbol="BTC-USDT", side="buy",
            order_type="limit", quantity=Decimal("0"), price=Decimal("50000"),
        )

    # Limit without price
    with pytest.raises(OrderError, match="price"):
        await engine.place_order(
            user=funded_user, symbol="BTC-USDT", side="buy",
            order_type="limit", quantity=Decimal("1"),
        )

    # Disabled pair
    sample_pair.is_enabled = False
    await db.flush()
    with pytest.raises(OrderError, match="disabled"):
        await engine.place_order(
            user=funded_user, symbol="BTC-USDT", side="buy",
            order_type="limit", quantity=Decimal("1"), price=Decimal("50000"),
        )
