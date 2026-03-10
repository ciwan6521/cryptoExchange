"""
Ledger Reconciliation Task — daily balance verification.

Compares:
  SUM(ledger_entries per asset) vs SUM(accounts.available + accounts.locked per asset)

If they diverge, something has gone catastrophically wrong (manual DB edit,
bug in ledger service, or fraud). Raises a system alert flag and logs the discrepancy.

Risk prevented: Detects any silent corruption of user balances.
Without this, a bug could drain or inflate balances undetected for days.

Usage:
  - Run as Celery beat task (daily)
  - Or call directly: await run_reconciliation(async_session)
"""

import logging
from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import Account, LedgerEntry, BalanceSnapshot
from app.models.cms import SystemFlag, AuditLog

logger = logging.getLogger("crypto4pro.reconciliation")


async def run_reconciliation(db: AsyncSession) -> dict:
    """
    Core reconciliation logic.

    For each asset:
    1. Sum all account balances (available + locked)
    2. Sum all ledger credits - debits
    3. Compare — any difference is a critical alert

    Returns a report dict with per-asset results.
    """
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "ok",
        "assets": {},
        "mismatches": [],
    }

    # ── Step 1: Get total balances per asset from accounts table ──
    account_totals_q = (
        select(
            Account.asset,
            func.sum(Account.available + Account.locked).label("account_total"),
            func.count(Account.id).label("account_count"),
        )
        .group_by(Account.asset)
    )
    account_rows = (await db.execute(account_totals_q)).all()

    account_by_asset = {}
    for row in account_rows:
        account_by_asset[row.asset] = {
            "account_total": row.account_total or Decimal("0"),
            "account_count": row.account_count,
        }

    # ── Step 2: Get net ledger balance per asset ──
    # Net = SUM(credits) - SUM(debits)
    ledger_totals_q = (
        select(
            LedgerEntry.asset,
            func.sum(
                func.case(
                    (LedgerEntry.entry_type == "credit", LedgerEntry.amount),
                    else_=Decimal("0"),
                )
            ).label("total_credits"),
            func.sum(
                func.case(
                    (LedgerEntry.entry_type == "debit", LedgerEntry.amount),
                    else_=Decimal("0"),
                )
            ).label("total_debits"),
        )
        .group_by(LedgerEntry.asset)
    )
    ledger_rows = (await db.execute(ledger_totals_q)).all()

    ledger_by_asset = {}
    for row in ledger_rows:
        credits = row.total_credits or Decimal("0")
        debits = row.total_debits or Decimal("0")
        ledger_by_asset[row.asset] = {
            "total_credits": credits,
            "total_debits": debits,
            "net_balance": credits - debits,
        }

    # ── Step 3: Compare ──
    all_assets = set(account_by_asset.keys()) | set(ledger_by_asset.keys())

    for asset in sorted(all_assets):
        acct = account_by_asset.get(asset, {"account_total": Decimal("0"), "account_count": 0})
        ldgr = ledger_by_asset.get(asset, {"net_balance": Decimal("0"), "total_credits": Decimal("0"), "total_debits": Decimal("0")})

        account_total = acct["account_total"]
        ledger_net = ldgr["net_balance"]
        difference = account_total - ledger_net

        asset_report = {
            "account_total": str(account_total),
            "ledger_net": str(ledger_net),
            "difference": str(difference),
            "account_count": acct["account_count"],
            "match": difference == Decimal("0"),
        }
        report["assets"][asset] = asset_report

        if difference != Decimal("0"):
            report["status"] = "MISMATCH"
            report["mismatches"].append({
                "asset": asset,
                "difference": str(difference),
                "account_total": str(account_total),
                "ledger_net": str(ledger_net),
            })
            logger.critical(
                "LEDGER MISMATCH: %s — accounts=%s, ledger=%s, diff=%s",
                asset, account_total, ledger_net, difference,
            )

    # ── Step 4: Create balance snapshots for audit trail ──
    for asset in all_assets:
        acct_data = account_by_asset.get(asset, {"account_total": Decimal("0")})
        ldgr_data = ledger_by_asset.get(asset, {"net_balance": Decimal("0")})

        # We create a summary snapshot (account_id is NULL for system-level)
        # Use a sentinel for system-level snapshots
        # For now, skip per-account snapshots (too many rows) — just log the report

    # ── Step 5: If mismatch, set alert flag ──
    if report["mismatches"]:
        result = await db.execute(
            select(SystemFlag).where(SystemFlag.key == "ledger_mismatch_detected")
        )
        flag = result.scalar_one_or_none()
        if flag:
            flag.value = True
        else:
            flag = SystemFlag(key="ledger_mismatch_detected", value=True)
            db.add(flag)

        # Create audit log entry
        log = AuditLog(
            admin_id=None,
            action="ledger_mismatch_detected",
            target_type="system",
            target_id=None,
            details={"mismatches": report["mismatches"]},
            ip_address=None,
        )
        db.add(log)
        await db.commit()

        logger.critical("RECONCILIATION FAILED — mismatches detected: %s", report["mismatches"])
    else:
        # Clear mismatch flag if previously set
        result = await db.execute(
            select(SystemFlag).where(SystemFlag.key == "ledger_mismatch_detected")
        )
        flag = result.scalar_one_or_none()
        if flag and flag.value:
            flag.value = False
            await db.commit()

        logger.info("Reconciliation passed — all assets match")

    return report
