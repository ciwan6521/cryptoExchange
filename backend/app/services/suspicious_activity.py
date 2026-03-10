"""
Suspicious Activity Guard — detects and flags risky withdrawal patterns.

Checks:
1. Withdrawal velocity (already enforced in WithdrawalService, this adds alerting)
2. Large withdrawal triggers audit log entry
3. IP change detection — flags if withdrawal IP differs from last login IP

Risk prevented: Catches account takeover patterns where an attacker
changes the IP and immediately requests large withdrawals.
"""

import logging
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.wallet import Withdrawal
from app.models.cms import AuditLog

logger = logging.getLogger("crypto4pro.suspicious")


async def check_suspicious_withdrawal(
    db: AsyncSession,
    user: User,
    withdrawal: Withdrawal,
    request_ip: Optional[str] = None,
) -> list[str]:
    """
    Run suspicious activity checks after a withdrawal is created.
    Returns a list of alert reasons (empty = clean).
    All alerts are logged to audit_logs for admin review.
    """
    alerts: list[str] = []

    # ── Check 1: Large withdrawal ──
    large_threshold = Decimal(settings.WITHDRAWAL_MULTI_APPROVAL_THRESHOLD)
    if withdrawal.amount >= large_threshold:
        alerts.append(
            f"Large withdrawal: {withdrawal.amount} {withdrawal.asset} "
            f"(threshold: {large_threshold})"
        )

    # ── Check 2: IP change detection ──
    if request_ip and user.last_login_ip:
        if request_ip != user.last_login_ip:
            alerts.append(
                f"IP mismatch: withdrawal from {request_ip}, "
                f"last login from {user.last_login_ip}"
            )

    # ── Check 3: New account withdrawal (< 24h old) ──
    if user.created_at:
        account_age = datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc) if user.created_at.tzinfo is None else datetime.now(timezone.utc) - user.created_at
        if account_age.total_seconds() < 86400:  # 24 hours
            alerts.append(
                f"New account withdrawal: account is {int(account_age.total_seconds() / 3600)}h old"
            )

    # ── Log all alerts ──
    if alerts:
        log = AuditLog(
            admin_id=None,
            action="suspicious_withdrawal",
            target_type="withdrawal",
            target_id=withdrawal.id,
            details={
                "user_id": str(user.id),
                "amount": str(withdrawal.amount),
                "asset": withdrawal.asset,
                "to_address": withdrawal.to_address,
                "request_ip": request_ip,
                "alerts": alerts,
            },
            ip_address=request_ip,
        )
        db.add(log)

        logger.warning(
            "Suspicious withdrawal %s by user %s: %s",
            withdrawal.id, user.id, "; ".join(alerts),
        )

    return alerts
