"""
Withdrawal Service — enforces ALL withdrawal safety rules.

Rules enforced:
1. Global kill switch (withdrawals_enabled system flag)
2. Per-user withdrawal flag
3. Per-transaction max limit
4. Daily per-user withdrawal cap
5. Address cooldown (24h for new addresses)
6. Velocity limit (max N per hour)
7. Funds LOCK (not deduct) on request
8. Multi-admin approval for large withdrawals
9. Admin cannot approve own withdrawal
10. Ledger settlement only after approval
"""

import uuid
import hashlib
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User, AdminUser
from app.models.wallet import Withdrawal, WithdrawalApproval, WithdrawalAddress
from app.models.cms import SystemFlag, AuditLog
from app.services.ledger_service import LedgerService, InsufficientBalanceError


class WithdrawalError(Exception):
    """Base withdrawal error with user-safe message."""
    def __init__(self, message: str, code: str = "withdrawal_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class WithdrawalService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ledger = LedgerService(db)

    # ── Guard checks ─────────────────────────────────────────

    async def _check_global_withdrawals_enabled(self) -> None:
        """Check system flag — prevents ALL withdrawals when disabled."""
        result = await self.db.execute(
            select(SystemFlag).where(SystemFlag.key == "withdrawals_enabled")
        )
        flag = result.scalar_one_or_none()
        if flag and not flag.value:
            raise WithdrawalError("Withdrawals are temporarily disabled", "withdrawals_disabled")

    async def _check_user_allowed(self, user: User) -> None:
        """Check per-user withdrawal permission."""
        if not user.is_active:
            raise WithdrawalError("Account is disabled", "account_disabled")
        if not user.withdrawals_enabled:
            raise WithdrawalError("Withdrawals are disabled for your account", "user_withdrawals_disabled")

    def _check_per_tx_limit(self, amount: Decimal) -> None:
        """Prevent single withdrawal exceeding per-tx max."""
        max_per_tx = Decimal(settings.WITHDRAWAL_PER_TX_MAX_USDT)
        if amount > max_per_tx:
            raise WithdrawalError(
                f"Single withdrawal cannot exceed {max_per_tx} USDT",
                "per_tx_limit_exceeded",
            )

    async def _check_daily_limit(self, user_id: uuid.UUID, amount: Decimal) -> None:
        """Prevent user from exceeding daily withdrawal cap."""
        daily_limit = Decimal(settings.WITHDRAWAL_DAILY_LIMIT_USDT)
        now = datetime.now(timezone.utc)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Sum all non-rejected/cancelled withdrawals today
        result = await self.db.execute(
            select(func.coalesce(func.sum(Withdrawal.amount), Decimal("0"))).where(
                and_(
                    Withdrawal.user_id == user_id,
                    Withdrawal.created_at >= day_start,
                    Withdrawal.status.notin_(["rejected", "cancelled", "failed"]),
                )
            )
        )
        today_total = result.scalar() or Decimal("0")

        if today_total + amount > daily_limit:
            remaining = max(daily_limit - today_total, Decimal("0"))
            raise WithdrawalError(
                f"Daily withdrawal limit is {daily_limit} USDT. "
                f"Already used: {today_total}. Remaining: {remaining}.",
                "daily_limit_exceeded",
            )

    async def _check_velocity(self, user_id: uuid.UUID) -> None:
        """Prevent rapid-fire withdrawals (fraud indicator)."""
        max_per_hour = settings.WITHDRAWAL_VELOCITY_MAX_PER_HOUR
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)

        result = await self.db.execute(
            select(func.count(Withdrawal.id)).where(
                and_(
                    Withdrawal.user_id == user_id,
                    Withdrawal.created_at >= one_hour_ago,
                    Withdrawal.status.notin_(["rejected", "cancelled", "failed"]),
                )
            )
        )
        count = result.scalar() or 0

        if count >= max_per_hour:
            raise WithdrawalError(
                f"Maximum {max_per_hour} withdrawals per hour. Please wait.",
                "velocity_limit_exceeded",
            )

    async def _check_address_cooldown(
        self, user_id: uuid.UUID, asset: str, network: str, address: str
    ) -> None:
        """Enforce 24h cooldown on newly added withdrawal addresses."""
        result = await self.db.execute(
            select(WithdrawalAddress).where(
                and_(
                    WithdrawalAddress.user_id == user_id,
                    WithdrawalAddress.asset == asset,
                    WithdrawalAddress.network == network,
                    WithdrawalAddress.address == address,
                )
            )
        )
        addr_record = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if addr_record is None:
            # First time using this address — register it with cooldown
            cooldown_hours = settings.WITHDRAWAL_ADDRESS_COOLDOWN_HOURS
            cooldown_until = now + timedelta(hours=cooldown_hours)
            new_addr = WithdrawalAddress(
                user_id=user_id,
                asset=asset,
                network=network,
                address=address,
                cooldown_until=cooldown_until,
            )
            self.db.add(new_addr)
            await self.db.flush()
            raise WithdrawalError(
                f"New withdrawal address registered. "
                f"For security, it will be available after {cooldown_hours}h cooldown.",
                "address_cooldown",
            )

        if now < addr_record.cooldown_until:
            remaining = addr_record.cooldown_until - now
            hours_left = int(remaining.total_seconds() / 3600) + 1
            raise WithdrawalError(
                f"Address is in cooldown. Available in ~{hours_left}h.",
                "address_cooldown",
            )

    # ── Main operations ──────────────────────────────────────

    async def request_withdrawal(
        self,
        user: User,
        asset: str,
        network: str,
        amount: Decimal,
        to_address: str,
        request_ip: Optional[str] = None,
    ) -> Withdrawal:
        """
        User requests a withdrawal.

        Flow:
        1. Run ALL guard checks
        2. Lock funds in ledger (available → locked)
        3. Create Withdrawal record with status=pending_approval
        4. If amount > threshold → mark requires_multi_approval

        Risk prevented: Funds never leave the system without admin approval.
        Funds are LOCKED, not deducted — they're still in the system.
        """
        asset = asset.upper()
        network = network.upper()

        # ── Run all guard checks ──
        await self._check_global_withdrawals_enabled()
        await self._check_user_allowed(user)

        if amount <= Decimal("0"):
            raise WithdrawalError("Amount must be positive", "invalid_amount")

        fee = Decimal(settings.WITHDRAWAL_FEE_USDT)
        total_deduction = amount + fee

        self._check_per_tx_limit(amount)
        await self._check_daily_limit(user.id, amount)
        await self._check_velocity(user.id)
        await self._check_address_cooldown(user.id, asset, network, to_address)

        # ── Determine if multi-approval required ──
        threshold = Decimal(settings.WITHDRAWAL_MULTI_APPROVAL_THRESHOLD)
        requires_multi = amount >= threshold
        approvals_needed = settings.WITHDRAWAL_MULTI_APPROVAL_COUNT if requires_multi else 1

        # ── Create withdrawal record ──
        key_input = f"withdraw:{user.id}:{asset}:{amount}:{to_address}:{datetime.now(timezone.utc).isoformat()}"
        idempotency_key = f"withdraw:{hashlib.sha256(key_input.encode()).hexdigest()[:32]}"

        withdrawal = Withdrawal(
            user_id=user.id,
            asset=asset,
            network=network,
            amount=amount,
            fee=fee,
            to_address=to_address,
            status="pending_lock",
            requires_multi_approval=requires_multi,
            approvals_required=approvals_needed,
            approvals_received=0,
            idempotency_key=idempotency_key,
            request_ip=request_ip,
        )
        self.db.add(withdrawal)
        await self.db.flush()  # Get withdrawal.id

        # ── Lock funds in ledger ──
        lock_idem_key = f"withdraw_lock:{withdrawal.id}"
        try:
            entry = await self.ledger.lock_funds(
                user_id=user.id,
                asset=asset,
                amount=total_deduction,
                idempotency_key=lock_idem_key,
                reference_type="withdrawal",
                reference_id=withdrawal.id,
                description=f"Withdrawal lock: {amount} {asset} + {fee} fee to {to_address}",
            )
        except InsufficientBalanceError:
            raise WithdrawalError(
                f"Insufficient {asset} balance for withdrawal of {amount} + {fee} fee",
                "insufficient_balance",
            )

        # ── Update withdrawal status ──
        withdrawal.lock_ledger_tx_id = entry.tx_id if entry else None
        withdrawal.status = "pending_approval"

        return withdrawal

    async def admin_approve(
        self,
        withdrawal_id: uuid.UUID,
        admin: AdminUser,
        ip_address: Optional[str] = None,
        comment: Optional[str] = None,
    ) -> Withdrawal:
        """
        Admin approves a withdrawal.

        Rules enforced:
        - Admin cannot approve withdrawal belonging to their own user account
          (not applicable here since admins and users are separate tables,
           but we check admin_id != previously approved admin for multi-sig)
        - Same admin cannot approve twice (DB unique constraint)
        - Large withdrawals require N distinct admin approvals

        Risk prevented: Single compromised admin cannot drain funds.
        """
        # Lock the withdrawal row to prevent concurrent approvals
        result = await self.db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id)
            .with_for_update()
        )
        withdrawal = result.scalar_one_or_none()
        if not withdrawal:
            raise WithdrawalError("Withdrawal not found", "not_found")

        if withdrawal.status != "pending_approval":
            raise WithdrawalError(
                f"Withdrawal is not pending approval (status: {withdrawal.status})",
                "invalid_status",
            )

        # Check if this admin already approved
        existing_approval = await self.db.execute(
            select(WithdrawalApproval).where(
                and_(
                    WithdrawalApproval.withdrawal_id == withdrawal_id,
                    WithdrawalApproval.admin_id == admin.id,
                )
            )
        )
        if existing_approval.scalar_one_or_none():
            raise WithdrawalError(
                "You have already approved this withdrawal",
                "duplicate_approval",
            )

        # Record approval
        approval = WithdrawalApproval(
            withdrawal_id=withdrawal_id,
            admin_id=admin.id,
            action="approve",
            comment=comment,
            ip_address=ip_address,
        )
        self.db.add(approval)
        withdrawal.approvals_received += 1

        # Check if enough approvals collected
        if withdrawal.approvals_received >= withdrawal.approvals_required:
            withdrawal.status = "approved"
            withdrawal.reviewed_by = admin.id
            withdrawal.reviewed_at = datetime.now(timezone.utc)
        # else: still pending_approval, waiting for more admins

        return withdrawal

    async def admin_reject(
        self,
        withdrawal_id: uuid.UUID,
        admin: AdminUser,
        reason: str,
        ip_address: Optional[str] = None,
    ) -> Withdrawal:
        """
        Admin rejects a withdrawal — unlocks funds back to available.

        Risk prevented: Locked funds are returned, user sees them immediately.
        """
        result = await self.db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id)
            .with_for_update()
        )
        withdrawal = result.scalar_one_or_none()
        if not withdrawal:
            raise WithdrawalError("Withdrawal not found", "not_found")

        if withdrawal.status != "pending_approval":
            raise WithdrawalError(
                f"Withdrawal is not pending approval (status: {withdrawal.status})",
                "invalid_status",
            )

        # Record rejection
        approval = WithdrawalApproval(
            withdrawal_id=withdrawal_id,
            admin_id=admin.id,
            action="reject",
            comment=reason,
            ip_address=ip_address,
        )
        self.db.add(approval)

        # Unlock funds
        total_locked = withdrawal.amount + withdrawal.fee
        unlock_idem_key = f"withdraw_unlock:{withdrawal.id}"
        await self.ledger.unlock_funds(
            user_id=withdrawal.user_id,
            asset=withdrawal.asset,
            amount=total_locked,
            idempotency_key=unlock_idem_key,
            reference_type="withdrawal_rejection",
            reference_id=withdrawal.id,
            description=f"Withdrawal rejected: {reason}",
        )

        withdrawal.status = "rejected"
        withdrawal.reviewed_by = admin.id
        withdrawal.reviewed_at = datetime.now(timezone.utc)
        withdrawal.rejection_reason = reason

        return withdrawal

    async def settle_withdrawal(
        self,
        withdrawal_id: uuid.UUID,
        tx_hash: Optional[str] = None,
    ) -> Withdrawal:
        """
        Settle an approved withdrawal — deduct from locked balance.
        Called after blockchain tx is confirmed (or manually by admin).

        Risk prevented: Funds only leave the system AFTER admin approval
        AND confirmation. Double-deduction prevented by idempotency key.
        """
        result = await self.db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id)
            .with_for_update()
        )
        withdrawal = result.scalar_one_or_none()
        if not withdrawal:
            raise WithdrawalError("Withdrawal not found", "not_found")

        if withdrawal.status != "approved":
            raise WithdrawalError(
                f"Withdrawal must be approved before settlement (status: {withdrawal.status})",
                "invalid_status",
            )

        withdrawal.status = "processing"
        await self.db.flush()

        # Consume locked funds via ledger
        total = withdrawal.amount + withdrawal.fee
        settle_idem_key = f"withdraw_settle:{withdrawal.id}"
        entry = await self.ledger.fill_from_locked(
            user_id=withdrawal.user_id,
            asset=withdrawal.asset,
            amount=total,
            idempotency_key=settle_idem_key,
            reference_type="withdrawal_settlement",
            reference_id=withdrawal.id,
            description=f"Withdrawal settled: {withdrawal.amount} {withdrawal.asset} to {withdrawal.to_address}",
        )

        withdrawal.settle_ledger_tx_id = entry.tx_id if entry else None
        withdrawal.ledger_tx_id = entry.tx_id if entry else None
        withdrawal.tx_hash = tx_hash
        withdrawal.status = "completed"
        withdrawal.completed_at = datetime.now(timezone.utc)

        return withdrawal

    async def user_cancel(
        self,
        withdrawal_id: uuid.UUID,
        user: User,
    ) -> Withdrawal:
        """User cancels their own pending withdrawal — unlocks funds."""
        result = await self.db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id)
            .with_for_update()
        )
        withdrawal = result.scalar_one_or_none()
        if not withdrawal:
            raise WithdrawalError("Withdrawal not found", "not_found")

        if withdrawal.user_id != user.id:
            raise WithdrawalError("Not your withdrawal", "forbidden")

        if withdrawal.status != "pending_approval":
            raise WithdrawalError(
                "Only pending withdrawals can be cancelled",
                "invalid_status",
            )

        # Unlock funds
        total_locked = withdrawal.amount + withdrawal.fee
        unlock_idem_key = f"withdraw_cancel:{withdrawal.id}"
        await self.ledger.unlock_funds(
            user_id=user.id,
            asset=withdrawal.asset,
            amount=total_locked,
            idempotency_key=unlock_idem_key,
            reference_type="withdrawal_cancellation",
            reference_id=withdrawal.id,
            description=f"Withdrawal cancelled by user",
        )

        withdrawal.status = "cancelled"

        return withdrawal
