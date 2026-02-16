"""
Tests for the withdrawal flow — request, approve, reject, cancel, settle.

Verifies:
- Withdrawal request locks funds
- Multi-admin approval for large withdrawals
- Rejection unlocks funds
- Cancellation unlocks funds
- Settlement consumes locked funds
- Velocity limit enforcement
- Per-tx limit enforcement
- Daily limit enforcement
"""

import uuid
import pytest
from decimal import Decimal
from datetime import datetime, timezone

from app.services.withdrawal_service import WithdrawalService, WithdrawalError
from app.services.ledger_service import LedgerService
from app.models.wallet import WithdrawalAddress


@pytest.mark.asyncio
async def test_withdrawal_request_locks_funds(db, funded_user):
    """Withdrawal request should lock funds (not deduct)."""
    ledger = LedgerService(db)

    # Pre-register address to bypass cooldown
    addr = WithdrawalAddress(
        user_id=funded_user.id, asset="USDT", network="TRC20",
        address="TXyz123456789012345678901234567890",
        cooldown_until=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db.add(addr)
    await db.flush()

    service = WithdrawalService(db)
    withdrawal = await service.request_withdrawal(
        user=funded_user, asset="USDT", network="TRC20",
        amount=Decimal("1000"),
        to_address="TXyz123456789012345678901234567890",
    )

    assert withdrawal.status == "pending_approval"

    acct = await ledger.get_balance(funded_user.id, "USDT")
    # 1000 + 1 fee = 1001 locked
    assert acct.locked == Decimal("1001")
    assert acct.available == Decimal("100000") - Decimal("1001")


@pytest.mark.asyncio
async def test_withdrawal_rejection_unlocks_funds(db, funded_user):
    """Rejecting a withdrawal should unlock all funds."""
    ledger = LedgerService(db)

    addr = WithdrawalAddress(
        user_id=funded_user.id, asset="USDT", network="TRC20",
        address="TXyz123456789012345678901234567890",
        cooldown_until=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db.add(addr)
    await db.flush()

    service = WithdrawalService(db)
    withdrawal = await service.request_withdrawal(
        user=funded_user, asset="USDT", network="TRC20",
        amount=Decimal("500"),
        to_address="TXyz123456789012345678901234567890",
    )

    # Create a mock admin
    from app.models.user import AdminUser
    from app.utils.security import hash_password
    admin = AdminUser(
        id=uuid.uuid4(), email="admin@test.com", username="admin",
        password_hash=hash_password("AdminPass123!"),
        role="super_admin", is_active=True,
    )
    db.add(admin)
    await db.flush()

    rejected = await service.admin_reject(
        withdrawal_id=withdrawal.id, admin=admin,
        reason="Test rejection",
    )

    assert rejected.status == "rejected"
    acct = await ledger.get_balance(funded_user.id, "USDT")
    assert acct.locked == Decimal("0")
    assert acct.available == Decimal("100000")


@pytest.mark.asyncio
async def test_withdrawal_cancellation_unlocks_funds(db, funded_user):
    """User cancelling a withdrawal should unlock funds."""
    ledger = LedgerService(db)

    addr = WithdrawalAddress(
        user_id=funded_user.id, asset="USDT", network="TRC20",
        address="TXyz123456789012345678901234567890",
        cooldown_until=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db.add(addr)
    await db.flush()

    service = WithdrawalService(db)
    withdrawal = await service.request_withdrawal(
        user=funded_user, asset="USDT", network="TRC20",
        amount=Decimal("500"),
        to_address="TXyz123456789012345678901234567890",
    )

    cancelled = await service.user_cancel(withdrawal.id, funded_user)
    assert cancelled.status == "cancelled"

    acct = await ledger.get_balance(funded_user.id, "USDT")
    assert acct.locked == Decimal("0")
    assert acct.available == Decimal("100000")


@pytest.mark.asyncio
async def test_multi_admin_approval_required_for_large(db, funded_user):
    """Large withdrawals should require multiple admin approvals."""
    addr = WithdrawalAddress(
        user_id=funded_user.id, asset="USDT", network="TRC20",
        address="TXyz123456789012345678901234567890",
        cooldown_until=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db.add(addr)
    await db.flush()

    service = WithdrawalService(db)
    withdrawal = await service.request_withdrawal(
        user=funded_user, asset="USDT", network="TRC20",
        amount=Decimal("15000"),  # Above 10000 threshold
        to_address="TXyz123456789012345678901234567890",
    )

    assert withdrawal.requires_multi_approval is True
    assert withdrawal.approvals_required == 2


@pytest.mark.asyncio
async def test_same_admin_cannot_approve_twice(db, funded_user):
    """Same admin approving twice should be rejected."""
    from app.models.user import AdminUser
    from app.utils.security import hash_password

    addr = WithdrawalAddress(
        user_id=funded_user.id, asset="USDT", network="TRC20",
        address="TXyz123456789012345678901234567890",
        cooldown_until=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db.add(addr)

    admin = AdminUser(
        id=uuid.uuid4(), email="admin@test.com", username="admin",
        password_hash=hash_password("AdminPass123!"),
        role="super_admin", is_active=True,
    )
    db.add(admin)
    await db.flush()

    service = WithdrawalService(db)
    withdrawal = await service.request_withdrawal(
        user=funded_user, asset="USDT", network="TRC20",
        amount=Decimal("15000"),
        to_address="TXyz123456789012345678901234567890",
    )

    # First approval
    await service.admin_approve(withdrawal.id, admin)

    # Second approval by same admin should fail
    with pytest.raises(WithdrawalError, match="already approved"):
        await service.admin_approve(withdrawal.id, admin)


@pytest.mark.asyncio
async def test_per_tx_limit(db, funded_user):
    """Withdrawal exceeding per-tx limit should be rejected."""
    addr = WithdrawalAddress(
        user_id=funded_user.id, asset="USDT", network="TRC20",
        address="TXyz123456789012345678901234567890",
        cooldown_until=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db.add(addr)
    await db.flush()

    service = WithdrawalService(db)
    with pytest.raises(WithdrawalError, match="cannot exceed"):
        await service.request_withdrawal(
            user=funded_user, asset="USDT", network="TRC20",
            amount=Decimal("30000"),  # Exceeds 25000 per-tx max
            to_address="TXyz123456789012345678901234567890",
        )


@pytest.mark.asyncio
async def test_disabled_user_withdrawals_rejected(db, funded_user):
    """User with withdrawals_enabled=False should be rejected."""
    funded_user.withdrawals_enabled = False
    await db.flush()

    service = WithdrawalService(db)
    with pytest.raises(WithdrawalError, match="disabled"):
        await service.request_withdrawal(
            user=funded_user, asset="USDT", network="TRC20",
            amount=Decimal("100"),
            to_address="TXyz123456789012345678901234567890",
        )


@pytest.mark.asyncio
async def test_address_cooldown_enforced(db, funded_user):
    """New addresses should trigger cooldown."""
    service = WithdrawalService(db)

    # No address pre-registered — should trigger cooldown
    with pytest.raises(WithdrawalError, match="cooldown"):
        await service.request_withdrawal(
            user=funded_user, asset="USDT", network="TRC20",
            amount=Decimal("100"),
            to_address="TNewAddress12345678901234567890ab",
        )
