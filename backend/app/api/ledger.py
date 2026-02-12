"""
Ledger/Balance API routes — user balance queries and ledger history.
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.api.deps import get_current_user, get_ledger_service
from app.services.ledger_service import LedgerService
from app.schemas.ledger import BalanceResponse, BalancesResponse, LedgerEntryResponse, LedgerHistoryResponse

router = APIRouter(prefix="/api/balances", tags=["balances"])


@router.get("", response_model=BalancesResponse)
async def get_balances(
    user: User = Depends(get_current_user),
    ledger: LedgerService = Depends(get_ledger_service),
):
    """Get all balances for the current user."""
    accounts = await ledger.get_balances(user.id)
    return BalancesResponse(
        balances=[
            BalanceResponse(
                asset=a.asset,
                available=str(a.available),
                locked=str(a.locked),
            )
            for a in accounts
        ]
    )


@router.get("/{asset}", response_model=BalanceResponse)
async def get_balance(
    asset: str,
    user: User = Depends(get_current_user),
    ledger: LedgerService = Depends(get_ledger_service),
):
    """Get balance for a specific asset."""
    account = await ledger.get_balance(user.id, asset.upper())
    if not account:
        return BalanceResponse(asset=asset.upper(), available="0", locked="0")
    return BalanceResponse(
        asset=account.asset,
        available=str(account.available),
        locked=str(account.locked),
    )


ledger_router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@ledger_router.get("/history", response_model=LedgerHistoryResponse)
async def get_ledger_history(
    asset: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    ledger: LedgerService = Depends(get_ledger_service),
):
    """Get ledger history for the current user."""
    entries = await ledger.get_history(
        user_id=user.id,
        asset=asset.upper() if asset else None,
        category=category,
        limit=limit,
        offset=offset,
    )
    return LedgerHistoryResponse(
        entries=[
            LedgerEntryResponse(
                id=e.id,
                tx_id=e.tx_id,
                asset=e.asset,
                entry_type=e.entry_type,
                amount=str(e.amount),
                balance_after=str(e.balance_after),
                category=e.category,
                reference_type=e.reference_type,
                reference_id=e.reference_id,
                description=e.description,
                created_at=e.created_at.isoformat(),
            )
            for e in entries
        ],
        total=len(entries),
    )
