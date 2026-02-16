"""
Ledger Service — THE core authority for all balance mutations.

Rules:
1. No service may modify accounts.available or accounts.locked directly.
2. ALL balance changes go through this service.
3. Every mutation is atomic (single DB transaction).
4. Every mutation is idempotent (idempotency_key prevents duplicates).
5. Every mutation is auditable (ledger_entries are immutable).
6. SELECT FOR UPDATE prevents race conditions on concurrent access.
"""

import uuid
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import Account, LedgerEntry


class InsufficientBalanceError(Exception):
    pass


class DuplicateTransactionError(Exception):
    pass


class LedgerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_account(self, user_id: uuid.UUID, asset: str) -> Account:
        """Get existing account or create a new one. Must be called within a transaction."""
        result = await self.db.execute(
            select(Account)
            .where(Account.user_id == user_id, Account.asset == asset)
            .with_for_update()
        )
        account = result.scalar_one_or_none()

        if account is None:
            account = Account(
                user_id=user_id,
                asset=asset,
                available=Decimal("0"),
                locked=Decimal("0"),
            )
            self.db.add(account)
            await self.db.flush()

        return account

    async def _check_idempotency(self, idempotency_key: str) -> Optional[LedgerEntry]:
        """Check if a transaction with this key already exists."""
        if not idempotency_key:
            return None
        result = await self.db.execute(
            select(LedgerEntry).where(LedgerEntry.idempotency_key == idempotency_key)
        )
        return result.scalar_one_or_none()

    async def credit(
        self,
        user_id: uuid.UUID,
        asset: str,
        amount: Decimal,
        category: str,
        idempotency_key: str,
        reference_type: Optional[str] = None,
        reference_id: Optional[uuid.UUID] = None,
        description: Optional[str] = None,
        tx_id: Optional[uuid.UUID] = None,
    ) -> Optional[LedgerEntry]:
        """
        Credit (add) funds to a user's available balance.
        Returns the ledger entry, or None if duplicate (idempotent).

        MUST be called within an active transaction (async with db.begin()).
        """
        # 1. Idempotency check
        existing = await self._check_idempotency(idempotency_key)
        if existing:
            return None  # Already processed — idempotent no-op

        # 2. Lock account row
        account = await self.get_or_create_account(user_id, asset)

        # 3. Calculate new balance
        if amount <= Decimal("0"):
            raise ValueError("Credit amount must be positive")

        new_balance = account.available + amount

        # 4. Create ledger entry
        entry_tx_id = tx_id or uuid.uuid4()
        entry = LedgerEntry(
            tx_id=entry_tx_id,
            idempotency_key=idempotency_key,
            account_id=account.id,
            user_id=user_id,
            asset=asset,
            entry_type="credit",
            amount=amount,
            balance_after=new_balance,
            category=category,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
        )
        self.db.add(entry)

        # 5. Update cached balance (atomic with entry)
        account.available = new_balance
        account.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        return entry

    async def debit(
        self,
        user_id: uuid.UUID,
        asset: str,
        amount: Decimal,
        category: str,
        idempotency_key: str,
        reference_type: Optional[str] = None,
        reference_id: Optional[uuid.UUID] = None,
        description: Optional[str] = None,
        tx_id: Optional[uuid.UUID] = None,
    ) -> Optional[LedgerEntry]:
        """
        Debit (subtract) funds from a user's available balance.
        Raises InsufficientBalanceError if balance is too low.
        Returns the ledger entry, or None if duplicate (idempotent).
        """
        # 1. Idempotency check
        existing = await self._check_idempotency(idempotency_key)
        if existing:
            return None

        # 2. Lock account row
        account = await self.get_or_create_account(user_id, asset)

        # 3. Check sufficient balance
        if amount <= Decimal("0"):
            raise ValueError("Debit amount must be positive")

        if account.available < amount:
            raise InsufficientBalanceError(
                f"Insufficient {asset} balance: available={account.available}, required={amount}"
            )

        new_balance = account.available - amount

        # 4. Create ledger entry
        entry_tx_id = tx_id or uuid.uuid4()
        entry = LedgerEntry(
            tx_id=entry_tx_id,
            idempotency_key=idempotency_key,
            account_id=account.id,
            user_id=user_id,
            asset=asset,
            entry_type="debit",
            amount=amount,
            balance_after=new_balance,
            category=category,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
        )
        self.db.add(entry)

        # 5. Update cached balance
        account.available = new_balance
        account.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        return entry

    async def lock_funds(
        self,
        user_id: uuid.UUID,
        asset: str,
        amount: Decimal,
        idempotency_key: str,
        reference_type: Optional[str] = None,
        reference_id: Optional[uuid.UUID] = None,
        description: Optional[str] = None,
    ) -> Optional[LedgerEntry]:
        """
        Move funds from available to locked (e.g., when placing an order).
        """
        existing = await self._check_idempotency(idempotency_key)
        if existing:
            return None

        account = await self.get_or_create_account(user_id, asset)

        if amount <= Decimal("0"):
            raise ValueError("Lock amount must be positive")

        if account.available < amount:
            raise InsufficientBalanceError(
                f"Insufficient {asset} available balance for lock: available={account.available}, required={amount}"
            )

        tx_id = uuid.uuid4()
        entry = LedgerEntry(
            tx_id=tx_id,
            idempotency_key=idempotency_key,
            account_id=account.id,
            user_id=user_id,
            asset=asset,
            entry_type="debit",
            amount=amount,
            balance_after=account.available - amount,
            category="order_lock",
            reference_type=reference_type,
            reference_id=reference_id,
            description=description or "Funds locked for order",
        )
        self.db.add(entry)

        account.available -= amount
        account.locked += amount
        account.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        return entry

    async def unlock_funds(
        self,
        user_id: uuid.UUID,
        asset: str,
        amount: Decimal,
        idempotency_key: str,
        reference_type: Optional[str] = None,
        reference_id: Optional[uuid.UUID] = None,
        description: Optional[str] = None,
    ) -> Optional[LedgerEntry]:
        """
        Move funds from locked back to available (e.g., order cancelled).
        """
        existing = await self._check_idempotency(idempotency_key)
        if existing:
            return None

        account = await self.get_or_create_account(user_id, asset)

        if amount <= Decimal("0"):
            raise ValueError("Unlock amount must be positive")

        if account.locked < amount:
            raise InsufficientBalanceError(
                f"Insufficient {asset} locked balance for unlock: locked={account.locked}, required={amount}"
            )

        tx_id = uuid.uuid4()
        entry = LedgerEntry(
            tx_id=tx_id,
            idempotency_key=idempotency_key,
            account_id=account.id,
            user_id=user_id,
            asset=asset,
            entry_type="credit",
            amount=amount,
            balance_after=account.available + amount,
            category="order_unlock",
            reference_type=reference_type,
            reference_id=reference_id,
            description=description or "Funds unlocked from cancelled order",
        )
        self.db.add(entry)

        account.available += amount
        account.locked -= amount
        account.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        return entry

    async def fill_from_locked(
        self,
        user_id: uuid.UUID,
        asset: str,
        amount: Decimal,
        idempotency_key: str,
        reference_type: Optional[str] = None,
        reference_id: Optional[uuid.UUID] = None,
        description: Optional[str] = None,
        tx_id: Optional[uuid.UUID] = None,
    ) -> Optional[LedgerEntry]:
        """
        Consume locked funds (e.g., order filled — locked funds are spent).
        """
        existing = await self._check_idempotency(idempotency_key)
        if existing:
            return None

        account = await self.get_or_create_account(user_id, asset)

        if amount <= Decimal("0"):
            raise ValueError("Fill amount must be positive")

        if account.locked < amount:
            raise InsufficientBalanceError(
                f"Insufficient {asset} locked balance for fill: locked={account.locked}, required={amount}"
            )

        entry_tx_id = tx_id or uuid.uuid4()
        entry = LedgerEntry(
            tx_id=entry_tx_id,
            idempotency_key=idempotency_key,
            account_id=account.id,
            user_id=user_id,
            asset=asset,
            entry_type="debit",
            amount=amount,
            balance_after=account.available,  # available unchanged, locked decreases
            category="order_fill",
            reference_type=reference_type,
            reference_id=reference_id,
            description=description or "Order filled",
        )
        self.db.add(entry)

        account.locked -= amount
        account.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        return entry

    async def get_balances(self, user_id: uuid.UUID) -> list[Account]:
        """Get all accounts for a user."""
        result = await self.db.execute(
            select(Account).where(Account.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_balance(self, user_id: uuid.UUID, asset: str) -> Optional[Account]:
        """Get a specific account for a user."""
        result = await self.db.execute(
            select(Account).where(Account.user_id == user_id, Account.asset == asset)
        )
        return result.scalar_one_or_none()

    async def get_history(
        self,
        user_id: uuid.UUID,
        asset: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[LedgerEntry]:
        """Get ledger history for a user with optional filters."""
        # Server-side cap — never return more than 200 rows regardless of input
        limit = min(limit, 200)
        query = (
            select(LedgerEntry)
            .where(LedgerEntry.user_id == user_id)
            .order_by(LedgerEntry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if asset:
            query = query.where(LedgerEntry.asset == asset)
        if category:
            query = query.where(LedgerEntry.category == category)

        result = await self.db.execute(query)
        return list(result.scalars().all())
