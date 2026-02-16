"""
Tests for ledger integrity — credit, debit, lock, unlock, fill, idempotency.

Verifies:
- Credits increase available balance
- Debits decrease available balance
- Insufficient balance rejected
- Lock moves available → locked
- Unlock moves locked → available
- Fill consumes locked
- Idempotency prevents double-processing
- Balance never goes negative
"""

import uuid
import pytest
from decimal import Decimal

from app.services.ledger_service import LedgerService, InsufficientBalanceError


@pytest.mark.asyncio
async def test_credit_increases_balance(db, sample_user):
    ledger = LedgerService(db)

    entry = await ledger.credit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("1000"),
        category="deposit", idempotency_key="test_credit_1",
    )

    assert entry is not None
    acct = await ledger.get_balance(sample_user.id, "USDT")
    assert acct.available == Decimal("1000")
    assert acct.locked == Decimal("0")


@pytest.mark.asyncio
async def test_debit_decreases_balance(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("1000"),
        category="deposit", idempotency_key="test_credit_2",
    )

    entry = await ledger.debit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("300"),
        category="withdrawal", idempotency_key="test_debit_1",
    )

    assert entry is not None
    acct = await ledger.get_balance(sample_user.id, "USDT")
    assert acct.available == Decimal("700")


@pytest.mark.asyncio
async def test_insufficient_balance_rejected(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("100"),
        category="deposit", idempotency_key="test_credit_3",
    )

    with pytest.raises(InsufficientBalanceError):
        await ledger.debit(
            user_id=sample_user.id, asset="USDT", amount=Decimal("200"),
            category="withdrawal", idempotency_key="test_debit_2",
        )


@pytest.mark.asyncio
async def test_lock_moves_available_to_locked(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="BTC", amount=Decimal("5"),
        category="deposit", idempotency_key="test_credit_btc_1",
    )

    await ledger.lock_funds(
        user_id=sample_user.id, asset="BTC", amount=Decimal("2"),
        idempotency_key="test_lock_1",
    )

    acct = await ledger.get_balance(sample_user.id, "BTC")
    assert acct.available == Decimal("3")
    assert acct.locked == Decimal("2")


@pytest.mark.asyncio
async def test_unlock_moves_locked_to_available(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="BTC", amount=Decimal("5"),
        category="deposit", idempotency_key="test_credit_btc_2",
    )
    await ledger.lock_funds(
        user_id=sample_user.id, asset="BTC", amount=Decimal("2"),
        idempotency_key="test_lock_2",
    )
    await ledger.unlock_funds(
        user_id=sample_user.id, asset="BTC", amount=Decimal("2"),
        idempotency_key="test_unlock_1",
    )

    acct = await ledger.get_balance(sample_user.id, "BTC")
    assert acct.available == Decimal("5")
    assert acct.locked == Decimal("0")


@pytest.mark.asyncio
async def test_fill_from_locked_consumes_locked(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="BTC", amount=Decimal("5"),
        category="deposit", idempotency_key="test_credit_btc_3",
    )
    await ledger.lock_funds(
        user_id=sample_user.id, asset="BTC", amount=Decimal("3"),
        idempotency_key="test_lock_3",
    )
    await ledger.fill_from_locked(
        user_id=sample_user.id, asset="BTC", amount=Decimal("1"),
        idempotency_key="test_fill_1",
    )

    acct = await ledger.get_balance(sample_user.id, "BTC")
    assert acct.available == Decimal("2")
    assert acct.locked == Decimal("2")


@pytest.mark.asyncio
async def test_idempotency_prevents_double_credit(db, sample_user):
    ledger = LedgerService(db)

    key = "test_idempotent_credit"
    entry1 = await ledger.credit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("1000"),
        category="deposit", idempotency_key=key,
    )
    entry2 = await ledger.credit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("1000"),
        category="deposit", idempotency_key=key,
    )

    assert entry1 is not None
    assert entry2 is None  # Idempotent no-op

    acct = await ledger.get_balance(sample_user.id, "USDT")
    assert acct.available == Decimal("1000")  # Only credited once


@pytest.mark.asyncio
async def test_negative_amounts_rejected(db, sample_user):
    ledger = LedgerService(db)

    with pytest.raises(ValueError, match="positive"):
        await ledger.credit(
            user_id=sample_user.id, asset="USDT", amount=Decimal("-100"),
            category="deposit", idempotency_key="neg_credit",
        )

    with pytest.raises(ValueError, match="positive"):
        await ledger.lock_funds(
            user_id=sample_user.id, asset="USDT", amount=Decimal("0"),
            idempotency_key="zero_lock",
        )


@pytest.mark.asyncio
async def test_lock_insufficient_available(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="USDT", amount=Decimal("100"),
        category="deposit", idempotency_key="test_credit_insuf",
    )

    with pytest.raises(InsufficientBalanceError):
        await ledger.lock_funds(
            user_id=sample_user.id, asset="USDT", amount=Decimal("200"),
            idempotency_key="test_lock_insuf",
        )


@pytest.mark.asyncio
async def test_fill_insufficient_locked(db, sample_user):
    ledger = LedgerService(db)

    await ledger.credit(
        user_id=sample_user.id, asset="BTC", amount=Decimal("1"),
        category="deposit", idempotency_key="test_credit_fill_insuf",
    )
    await ledger.lock_funds(
        user_id=sample_user.id, asset="BTC", amount=Decimal("1"),
        idempotency_key="test_lock_fill_insuf",
    )

    with pytest.raises(InsufficientBalanceError):
        await ledger.fill_from_locked(
            user_id=sample_user.id, asset="BTC", amount=Decimal("2"),
            idempotency_key="test_fill_insuf",
        )
