"""
Pay4Pro Webhook Handler — processes event notifications from Pay4Pro.

Security:
- X-Webhook-Secret header verification on every request
- Idempotency via Deposit.idempotency_key / transaction_id uniqueness
- All balance mutations go through LedgerService

Pay4Pro Events:
- deposit_confirmed  → user deposited, confirmed on blockchain
- deposit_rejected   → deposit rejected
- withdraw_approved  → withdrawal approved by Pay4Pro admin
- withdraw_completed → withdrawal sent on blockchain, TX confirmed
- withdraw_rejected  → withdrawal rejected

Flow (Deposit):
    User sends USDT to BSC address
    → Pay4Pro scans blockchain → 15 confirmations → writes ledger
    → Sends deposit_confirmed webhook here
    → We verify secret → find user by user_id → LedgerService.credit()

Flow (Withdrawal):
    Crypto4Pro sends POST /api/withdraw to Pay4Pro
    → Pay4Pro admin approves → master wallet sends TX
    → Sends withdraw_completed webhook here
    → We verify secret → find internal withdrawal → settle via LedgerService
"""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.wallet import Deposit, Withdrawal
from app.models.cms import AuditLog
from app.services.ledger_service import LedgerService
from app.services.pay4pro_client import get_pay4pro_client

logger = logging.getLogger("crypto4pro.webhook.pay4pro")

router = APIRouter(prefix="/api/webhooks/pay4pro", tags=["webhooks"])


async def _verify_secret(request: Request) -> bytes:
    """Verify X-Webhook-Secret header matches our configured secret."""
    webhook_secret = request.headers.get("X-Webhook-Secret", "")

    client = get_pay4pro_client()
    if not client.verify_webhook_secret(webhook_secret):
        logger.warning("Webhook secret verification failed from %s", request.client.host if request.client else "unknown")
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    return await request.body()


@router.post("")
async def handle_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Single webhook endpoint for all Pay4Pro events.
    Routes to appropriate handler based on event type.
    """
    body = await _verify_secret(request)

    import json
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    logger.info("Pay4Pro webhook received: event=%s", event)

    if event == "deposit_confirmed":
        return await _handle_deposit_confirmed(payload, request, db)
    elif event == "deposit_rejected":
        return await _handle_deposit_rejected(payload, request, db)
    elif event == "withdraw_completed":
        return await _handle_withdraw_completed(payload, request, db)
    elif event == "withdraw_rejected":
        return await _handle_withdraw_rejected(payload, request, db)
    elif event == "withdraw_approved":
        return await _handle_withdraw_approved(payload, request, db)
    else:
        logger.warning("Unknown webhook event: %s", event)
        return {"ok": True, "message": f"Unknown event: {event}"}


async def _handle_deposit_confirmed(
    payload: dict,
    request: Request,
    db: AsyncSession,
) -> dict:
    """
    Handle deposit_confirmed event.

    Payload:
    {
        "event": "deposit_confirmed",
        "transaction_id": "TX982374ABC",
        "user_id": "12345",
        "amount": "500.00000000",
        "currency": "USDT",
        "tx_hash": "0xabc123...",
        "from_address": "0xsender...",
        "source": "blockchain"
    }
    """
    transaction_id = payload.get("transaction_id", "")
    user_id_str = payload.get("user_id", "")
    amount_str = payload.get("amount", "0")
    currency = payload.get("currency", "USDT")
    tx_hash = payload.get("tx_hash", "")
    from_address = payload.get("from_address", "")

    if not transaction_id or not user_id_str:
        raise HTTPException(status_code=400, detail="Missing transaction_id or user_id")

    try:
        amount = Decimal(amount_str)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Invalid amount")

    if amount <= Decimal("0"):
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Parse user_id — Pay4Pro stores it as string (our UUID)
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        logger.error("Invalid user_id in webhook: %s", user_id_str)
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    # Idempotency: check if deposit with this transaction_id already processed
    # First check pay4pro_deposit_id (set by claim endpoint)
    existing = None
    if transaction_id:
        result = await db.execute(
            select(Deposit).where(Deposit.pay4pro_deposit_id == transaction_id)
        )
        existing = result.scalar_one_or_none()

    # Fallback: check legacy idempotency key pattern
    idempotency_key = f"p4p_deposit:{transaction_id}"
    if not existing:
        result = await db.execute(
            select(Deposit).where(Deposit.idempotency_key == idempotency_key)
        )
        existing = result.scalar_one_or_none()

    if existing and existing.status == "completed":
        logger.info("Deposit %s already completed — idempotent skip", transaction_id)
        return {"ok": True, "message": "Already processed", "deposit_id": str(existing.id)}

    # Create or update deposit record
    source = payload.get("source", "")
    chain = payload.get("chain", "")
    network = chain or ("BSC" if source == "blockchain" else (payload.get("method", "") or "manual"))

    if existing:
        deposit = existing
        deposit.status = "completed"
        deposit.amount = amount
        deposit.tx_hash = tx_hash or deposit.tx_hash
        deposit.from_address = from_address or deposit.from_address
        deposit.pay4pro_deposit_id = deposit.pay4pro_deposit_id or transaction_id
        deposit.completed_at = datetime.now(timezone.utc)
    else:
        deposit = Deposit(
            user_id=user_id,
            asset=currency,
            network=network,
            amount=amount,
            tx_hash=tx_hash,
            from_address=from_address,
            confirmations=15 if source == "blockchain" else 0,
            required_confirmations=15 if source == "blockchain" else 0,
            status="completed",
            pay4pro_deposit_id=transaction_id,
            idempotency_key=idempotency_key,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(deposit)
        await db.flush()

    # Credit user balance via LedgerService
    ledger = LedgerService(db)
    ledger_key = f"p4p_deposit_credit:{transaction_id}"

    async with db.begin_nested():
        entry = await ledger.credit(
            user_id=user_id,
            asset=currency,
            amount=amount,
            category="deposit",
            idempotency_key=ledger_key,
            reference_type="deposit",
            reference_id=deposit.id,
            description=f"Deposit {amount} {currency} tx:{tx_hash[:16]}..." if tx_hash else f"Deposit {amount} {currency}",
        )

    if entry:
        deposit.ledger_tx_id = entry.tx_id
        logger.info(
            "Deposit credited: user=%s amount=%s %s tx=%s",
            user_id, amount, currency, tx_hash,
        )
    else:
        logger.info("Deposit ledger credit idempotent skip for %s", transaction_id)

    # Audit log
    audit = AuditLog(
        admin_id=None,
        action="webhook_deposit_confirmed",
        target_type="deposit",
        target_id=deposit.id,
        details={
            "transaction_id": transaction_id,
            "amount": str(amount),
            "currency": currency,
            "tx_hash": tx_hash,
            "from_address": from_address,
            "user_id": str(user_id),
        },
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return {
        "ok": True,
        "deposit_id": str(deposit.id),
        "status": "completed",
    }


async def _handle_deposit_rejected(
    payload: dict,
    request: Request,
    db: AsyncSession,
) -> dict:
    """Handle deposit_rejected — log it, mark deposit as failed if exists."""
    transaction_id = payload.get("transaction_id", "")
    user_id_str = payload.get("user_id", "")

    logger.warning("Deposit rejected: tx=%s user=%s", transaction_id, user_id_str)

    deposit = None
    if transaction_id:
        result = await db.execute(
            select(Deposit).where(Deposit.pay4pro_deposit_id == transaction_id)
        )
        deposit = result.scalar_one_or_none()

    if not deposit:
        idempotency_key = f"p4p_deposit:{transaction_id}"
        result = await db.execute(
            select(Deposit).where(Deposit.idempotency_key == idempotency_key)
        )
        deposit = result.scalar_one_or_none()
    if deposit and deposit.status != "completed":
        deposit.status = "failed"

    audit = AuditLog(
        admin_id=None,
        action="webhook_deposit_rejected",
        target_type="deposit",
        target_id=deposit.id if deposit else None,
        details={"transaction_id": transaction_id, "user_id": user_id_str},
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return {"ok": True, "message": "Deposit rejection recorded"}


async def _handle_withdraw_completed(
    payload: dict,
    request: Request,
    db: AsyncSession,
) -> dict:
    """
    Handle withdraw_completed — blockchain TX confirmed.

    Payload:
    {
        "event": "withdraw_completed",
        "transaction_id": "TX123456DEF",
        "withdraw_id": "uuid",
        "user_id": "12345",
        "amount": "200.00000000",
        "currency": "USDT",
        "status": "completed",
        "tx_hash": "0xdef456...",
        "destination": "0xhedef_adres",
        "chain": "bsc"
    }
    """
    transaction_id = payload.get("transaction_id", "")
    withdraw_id = payload.get("withdraw_id", "")
    user_id_str = payload.get("user_id", "")
    tx_hash = payload.get("tx_hash", "")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    # Find internal withdrawal by pay4pro_withdrawal_id or user match
    withdrawal = None

    if withdraw_id:
        result = await db.execute(
            select(Withdrawal).where(Withdrawal.pay4pro_withdrawal_id == withdraw_id)
        )
        withdrawal = result.scalar_one_or_none()

    if not withdrawal and transaction_id:
        result = await db.execute(
            select(Withdrawal).where(Withdrawal.pay4pro_withdrawal_id == transaction_id)
        )
        withdrawal = result.scalar_one_or_none()

    if not withdrawal:
        # Try finding by user_id + processing status (last resort)
        result = await db.execute(
            select(Withdrawal).where(
                Withdrawal.user_id == user_id,
                Withdrawal.status == "processing",
            ).order_by(Withdrawal.created_at.desc()).limit(1)
        )
        withdrawal = result.scalar_one_or_none()

    if not withdrawal:
        logger.error(
            "Withdraw completed webhook: no matching withdrawal. tx=%s withdraw=%s user=%s",
            transaction_id, withdraw_id, user_id_str,
        )
        audit = AuditLog(
            admin_id=None,
            action="webhook_withdraw_completed_orphan",
            target_type="withdrawal",
            target_id=None,
            details=payload,
            ip_address=request.client.host if request.client else None,
        )
        db.add(audit)
        await db.commit()
        return {"ok": True, "message": "No matching withdrawal found — logged for review"}

    if withdrawal.status == "completed":
        return {"ok": True, "message": "Already completed"}

    # Settle via WithdrawalService if in approved/processing state
    if withdrawal.can_transition_to("completed") or withdrawal.status in ("approved", "processing"):
        from app.services.withdrawal_service import WithdrawalService
        service = WithdrawalService(db)

        if withdrawal.status == "approved":
            withdrawal.status = "processing"
            await db.flush()

        async with db.begin_nested():
            await service.settle_withdrawal(
                withdrawal_id=withdrawal.id,
                tx_hash=tx_hash,
            )

        withdrawal.pay4pro_withdrawal_id = withdraw_id or transaction_id
        logger.info("Withdrawal settled via webhook: id=%s tx=%s", withdrawal.id, tx_hash)

    audit = AuditLog(
        admin_id=None,
        action="webhook_withdraw_completed",
        target_type="withdrawal",
        target_id=withdrawal.id,
        details={
            "transaction_id": transaction_id,
            "withdraw_id": withdraw_id,
            "tx_hash": tx_hash,
            "user_id": str(user_id),
        },
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return {"ok": True, "status": withdrawal.status}


async def _handle_withdraw_approved(
    payload: dict,
    request: Request,
    db: AsyncSession,
) -> dict:
    """Handle withdraw_approved — Pay4Pro admin approved, TX will be sent soon."""
    withdraw_id = payload.get("withdraw_id", "")
    transaction_id = payload.get("transaction_id", "")

    logger.info("Withdrawal approved on Pay4Pro: withdraw=%s tx=%s", withdraw_id, transaction_id)

    audit = AuditLog(
        admin_id=None,
        action="webhook_withdraw_approved",
        target_type="withdrawal",
        target_id=None,
        details=payload,
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return {"ok": True, "message": "Noted"}


async def _handle_withdraw_rejected(
    payload: dict,
    request: Request,
    db: AsyncSession,
) -> dict:
    """
    Handle withdraw_rejected — unlock user's funds.

    Payload:
    {
        "event": "withdraw_rejected",
        "transaction_id": "TX123456DEF",
        "withdraw_id": "uuid",
        "user_id": "12345",
        "amount": "200.00000000",
        "currency": "USDT",
        "status": "rejected",
        "destination": {"wallet_address": "0x..."}
    }
    """
    withdraw_id = payload.get("withdraw_id", "")
    transaction_id = payload.get("transaction_id", "")
    user_id_str = payload.get("user_id", "")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    withdrawal = None
    if withdraw_id:
        result = await db.execute(
            select(Withdrawal).where(Withdrawal.pay4pro_withdrawal_id == withdraw_id)
        )
        withdrawal = result.scalar_one_or_none()

    if not withdrawal:
        result = await db.execute(
            select(Withdrawal).where(
                Withdrawal.user_id == user_id,
                Withdrawal.status.in_(["processing", "approved"]),
            ).order_by(Withdrawal.created_at.desc()).limit(1)
        )
        withdrawal = result.scalar_one_or_none()

    if withdrawal and withdrawal.status not in ("completed", "failed", "rejected", "cancelled"):
        withdrawal.status = "failed"

        ledger = LedgerService(db)
        total = withdrawal.amount + withdrawal.fee
        async with db.begin_nested():
            await ledger.unlock_funds(
                user_id=withdrawal.user_id,
                asset=withdrawal.asset,
                amount=total,
                idempotency_key=f"p4p_withdraw_reject_unlock:{withdrawal.id}",
                reference_type="withdrawal",
                reference_id=withdrawal.id,
                description="Withdrawal rejected by Pay4Pro — funds returned",
            )

        logger.warning("Withdrawal rejected via webhook: id=%s", withdrawal.id)

    audit = AuditLog(
        admin_id=None,
        action="webhook_withdraw_rejected",
        target_type="withdrawal",
        target_id=withdrawal.id if withdrawal else None,
        details=payload,
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    await db.commit()

    return {"ok": True, "message": "Withdrawal rejection processed"}
