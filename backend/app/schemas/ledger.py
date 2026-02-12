"""Pydantic schemas for ledger/balance endpoints."""

from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from decimal import Decimal


class BalanceResponse(BaseModel):
    asset: str
    available: str
    locked: str

    class Config:
        from_attributes = True


class BalancesResponse(BaseModel):
    balances: list[BalanceResponse]


class LedgerEntryResponse(BaseModel):
    id: int
    tx_id: UUID
    asset: str
    entry_type: str
    amount: str
    balance_after: str
    category: str
    reference_type: Optional[str] = None
    reference_id: Optional[UUID] = None
    description: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class LedgerHistoryResponse(BaseModel):
    entries: list[LedgerEntryResponse]
    total: int


class AdminCreditDebitRequest(BaseModel):
    asset: str
    amount: str
    reason: str
