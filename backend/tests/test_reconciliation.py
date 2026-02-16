"""
Tests for the ledger reconciliation job.

Verifies:
- Clean reconciliation passes (accounts match ledger entries)
- Mismatch detection when accounts diverge from ledger
- System flag set on mismatch
- System flag cleared on subsequent clean run
"""

import uuid
import pytest
from decimal import Decimal

from app.services.ledger_service import LedgerService
from app.tasks.reconciliation import run_reconciliation
from app.models.cms import SystemFlag


@pytest.mark.asyncio
async def test_clean_reconciliation(db, funded_user):
    """When accounts match ledger entries, reconciliation should pass."""
    report = await run_reconciliation(db)

    assert report["status"] == "ok"
    assert len(report["mismatches"]) == 0
    assert "USDT" in report["assets"]
    assert report["assets"]["USDT"]["match"] is True


@pytest.mark.asyncio
async def test_reconciliation_detects_mismatch(db, funded_user):
    """If an account balance is manually altered, reconciliation should detect it."""
    ledger = LedgerService(db)

    # Get the account and manually corrupt it (simulate a bug)
    acct = await ledger.get_balance(funded_user.id, "USDT")
    acct.available += Decimal("9999")  # Corrupt: add balance without ledger entry
    await db.flush()

    report = await run_reconciliation(db)

    assert report["status"] == "MISMATCH"
    assert len(report["mismatches"]) > 0
    usdt_mismatch = next(m for m in report["mismatches"] if m["asset"] == "USDT")
    assert Decimal(usdt_mismatch["difference"]) == Decimal("9999")


@pytest.mark.asyncio
async def test_mismatch_flag_set_and_cleared(db, funded_user):
    """Mismatch flag should be set on failure and cleared on success."""
    from sqlalchemy import select

    ledger = LedgerService(db)

    # Corrupt balance
    acct = await ledger.get_balance(funded_user.id, "USDT")
    acct.available += Decimal("1000")
    await db.flush()

    # Run — should set flag
    await run_reconciliation(db)

    result = await db.execute(
        select(SystemFlag).where(SystemFlag.key == "ledger_mismatch_detected")
    )
    flag = result.scalar_one_or_none()
    assert flag is not None
    assert flag.value is True

    # Fix the corruption
    acct.available -= Decimal("1000")
    await db.flush()

    # Run again — should clear flag
    await run_reconciliation(db)

    await db.refresh(flag)
    assert flag.value is False
