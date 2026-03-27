"""
Pay4Pro background tasks — balance reconciliation and withdrawal status polling.

- Periodic balance reconciliation: compare internal ledger totals with Pay4Pro user wallets
- Withdrawal status polling: check pending withdrawals via transaction lookup
"""

import logging
import asyncio
from decimal import Decimal

from app.celery_app import celery

logger = logging.getLogger("crypto4pro.tasks.pay4pro")


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(name="app.tasks.pay4pro_tasks.reconcile_pay4pro_balances", bind=True, max_retries=2)
def reconcile_pay4pro_balances(self):
    """
    Compare Crypto4Pro internal ledger totals with Pay4Pro on-chain balances.

    For each user with a wallet, fetches on-chain balance from Pay4Pro
    and compares with our internal Account balance.
    Logs discrepancies but does NOT auto-correct.
    """
    logger.info("Starting Pay4Pro balance reconciliation...")

    async def _run():
        from app.services.pay4pro_client import get_pay4pro_client, Pay4ProError
        from app.database import async_session_factory
        from app.models.wallet import Wallet
        from app.models.ledger import Account
        from app.models.cms import AuditLog
        from sqlalchemy import select, func

        p4p = get_pay4pro_client()
        if not p4p.base_url:
            logger.info("Pay4Pro not configured — skipping reconciliation")
            return {"status": "skipped", "reason": "pay4pro_not_configured"}

        report = {"status": "ok", "checked": 0, "mismatches": [], "errors": []}

        async with async_session_factory() as db:
            # Get all wallets with external IDs
            result = await db.execute(
                select(Wallet).where(
                    Wallet.is_active == True,
                    Wallet.address.isnot(None),
                )
            )
            wallets = list(result.scalars().all())

            # Get aggregate internal balance per asset
            internal_q = select(
                Account.asset,
                func.sum(Account.available + Account.locked).label("total"),
            ).group_by(Account.asset)
            internal_rows = (await db.execute(internal_q)).all()
            internal_totals = {r.asset: r.total or Decimal("0") for r in internal_rows}

            # Sample check: fetch a few user balances from Pay4Pro
            checked = 0
            for wallet in wallets[:50]:
                try:
                    p4p_balance = await p4p.get_wallet_balance(str(wallet.user_id))
                    on_chain_usdt = p4p_balance.balances.get("USDT", Decimal("0"))

                    # Get internal balance for this user
                    acct_result = await db.execute(
                        select(Account).where(
                            Account.user_id == wallet.user_id,
                            Account.asset == "USDT",
                        )
                    )
                    acct = acct_result.scalar_one_or_none()
                    internal = (acct.available + acct.locked) if acct else Decimal("0")

                    checked += 1

                    # On-chain should be >= internal (user may have deposited but not yet credited)
                    # Only flag if internal > on-chain (would mean we credited more than exists)
                    if internal > on_chain_usdt and (internal - on_chain_usdt) > Decimal("0.01"):
                        report["mismatches"].append({
                            "user_id": str(wallet.user_id),
                            "address": wallet.address,
                            "internal": str(internal),
                            "on_chain": str(on_chain_usdt),
                            "difference": str(internal - on_chain_usdt),
                        })
                        logger.warning(
                            "PAY4PRO MISMATCH: user=%s internal=%s on_chain=%s",
                            wallet.user_id, internal, on_chain_usdt,
                        )

                except Pay4ProError as e:
                    report["errors"].append({"user_id": str(wallet.user_id), "error": str(e)})
                except Exception as e:
                    report["errors"].append({"user_id": str(wallet.user_id), "error": str(e)})

            report["checked"] = checked

            if report["mismatches"]:
                report["status"] = "MISMATCH"
                audit = AuditLog(
                    admin_id=None,
                    action="pay4pro_reconciliation_mismatch",
                    target_type="system",
                    target_id=None,
                    details={"mismatches": report["mismatches"], "checked": checked},
                    ip_address=None,
                )
                db.add(audit)
                await db.commit()
                logger.critical("Pay4Pro reconciliation FAILED: %d mismatches", len(report["mismatches"]))
            else:
                logger.info("Pay4Pro reconciliation passed: %d users verified", checked)

        return report

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.exception("Pay4Pro reconciliation failed")
        raise self.retry(exc=exc, countdown=600)


@celery.task(name="app.tasks.pay4pro_tasks.poll_pending_withdrawals")
def poll_pending_withdrawals():
    """
    Safety net: check Pay4Pro for status of withdrawals stuck in 'processing'.
    Uses GET /api/transaction/:txRef to check status.
    Catches cases where webhook delivery failed.
    """
    logger.info("Polling Pay4Pro for pending withdrawal statuses...")

    async def _run():
        from app.services.pay4pro_client import get_pay4pro_client, Pay4ProError
        from app.database import async_session_factory
        from app.models.wallet import Withdrawal
        from app.services.withdrawal_service import WithdrawalService
        from sqlalchemy import select

        p4p = get_pay4pro_client()
        if not p4p.base_url:
            return {"status": "skipped"}

        async with async_session_factory() as db:
            result = await db.execute(
                select(Withdrawal).where(
                    Withdrawal.status == "processing",
                    Withdrawal.pay4pro_withdrawal_id.isnot(None),
                )
            )
            pending = list(result.scalars().all())

            updated = 0
            for w in pending:
                try:
                    tx_data = await p4p.get_transaction(w.pay4pro_withdrawal_id)
                    p4p_status = tx_data.get("status", "")

                    if p4p_status in ("completed", "confirmed"):
                        service = WithdrawalService(db)
                        tx_hash = tx_data.get("tx_hash", "")

                        if w.status == "processing":
                            async with db.begin_nested():
                                await service.settle_withdrawal(w.id, tx_hash=tx_hash)
                            await db.commit()
                            updated += 1
                            logger.info("Polled withdrawal %s → completed (tx=%s)", w.id, tx_hash)

                    elif p4p_status == "rejected":
                        from app.services.ledger_service import LedgerService
                        w.status = "failed"
                        ledger = LedgerService(db)
                        total = w.amount + w.fee
                        async with db.begin_nested():
                            await ledger.unlock_funds(
                                user_id=w.user_id,
                                asset=w.asset,
                                amount=total,
                                idempotency_key=f"p4p_poll_fail_unlock:{w.id}",
                                reference_type="withdrawal",
                                reference_id=w.id,
                                description="Withdrawal failed (detected by polling)",
                            )
                        await db.commit()
                        updated += 1
                        logger.warning("Polled withdrawal %s → failed/rejected", w.id)

                except Pay4ProError as e:
                    logger.warning("Failed to poll withdrawal %s: %s", w.id, e)

            return {"checked": len(pending), "updated": updated}

    return _run_async(_run())


# Beat schedule is registered in app/celery_app.py (single source of truth)
