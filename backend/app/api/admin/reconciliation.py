"""
Admin reconciliation endpoint — trigger and view ledger reconciliation.

Risk prevented: Provides visibility into ledger integrity.
If accounts and ledger entries diverge, funds are either missing or fabricated.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.api.deps import require_admin_role
from app.tasks.reconciliation import run_reconciliation

router = APIRouter(prefix="/api/admin/reconciliation", tags=["admin-reconciliation"])


@router.post("/run")
async def trigger_reconciliation(
    admin: AdminUser = Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger ledger reconciliation.
    Compares account balances vs ledger entry sums per asset.
    Sets ledger_mismatch_detected flag if any discrepancy found.
    """
    report = await run_reconciliation(db)
    return report
