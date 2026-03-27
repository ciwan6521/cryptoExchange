"""
Admin wallet management — user wallets, deposit history, hot wallet balances.
Now integrated with Pay4Pro for real on-chain balance queries.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.wallet import Wallet, Deposit
from app.models.withdrawal_config import HotWalletConfig
from app.api.deps import get_current_admin

router = APIRouter(prefix="/api/admin/wallets", tags=["admin-wallets"])


@router.get("/hot-balances")
async def list_hot_wallet_balances(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns configured hot wallets with live balances from Pay4Pro when available.
    """
    result = await db.execute(
        select(HotWalletConfig)
        .where(HotWalletConfig.wallet_type == "hot")
        .order_by(HotWalletConfig.asset, HotWalletConfig.network)
    )
    rows = list(result.scalars().all())

    p4p_balances = {}
    try:
        from app.services.pay4pro_client import get_pay4pro_client
        p4p = get_pay4pro_client()
        if p4p.base_url:
            balances = await p4p.get_hot_wallet_balance()
            for b in balances:
                p4p_balances[f"{b.asset}:{b.network}"] = str(b.balance)
    except Exception:
        pass

    return {
        "balances": [
            {
                "id": str(r.id),
                "asset": r.asset,
                "network": r.network,
                "address": r.address,
                "min_balance_threshold": str(r.min_balance_threshold),
                "max_balance_threshold": str(r.max_balance_threshold),
                "is_active": r.is_active,
                "on_chain_balance": p4p_balances.get(f"{r.asset}:{r.network}"),
            }
            for r in rows
        ]
    }


@router.get("/user-wallets")
async def list_user_wallets(
    user_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List user wallets with deposit addresses."""
    conditions = []
    if user_id:
        conditions.append(Wallet.user_id == uuid.UUID(user_id))

    count_q = select(func.count(Wallet.id))
    if conditions:
        count_q = count_q.where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    q = select(Wallet).order_by(desc(Wallet.created_at)).limit(limit).offset(offset)
    if conditions:
        q = q.where(and_(*conditions))

    result = await db.execute(q)
    wallets = list(result.scalars().all())

    return {
        "wallets": [
            {
                "id": str(w.id),
                "user_id": str(w.user_id),
                "asset": w.asset,
                "network": w.network,
                "address": w.address,
                "external_wallet_id": w.external_wallet_id,
                "is_active": w.is_active,
                "created_at": w.created_at.isoformat() if w.created_at else None,
            }
            for w in wallets
        ],
        "total": total,
    }


@router.get("/deposits")
async def list_all_deposits(
    user_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all deposits with optional user/status filter."""
    conditions = []
    if user_id:
        conditions.append(Deposit.user_id == uuid.UUID(user_id))
    if status:
        conditions.append(Deposit.status == status)

    count_q = select(func.count(Deposit.id))
    if conditions:
        count_q = count_q.where(and_(*conditions))
    total = (await db.execute(count_q)).scalar() or 0

    q = select(Deposit).order_by(desc(Deposit.created_at)).limit(limit).offset(offset)
    if conditions:
        q = q.where(and_(*conditions))

    result = await db.execute(q)
    deposits = list(result.scalars().all())

    return {
        "deposits": [
            {
                "id": str(d.id),
                "user_id": str(d.user_id),
                "asset": d.asset,
                "network": d.network,
                "amount": str(d.amount),
                "tx_hash": d.tx_hash,
                "from_address": d.from_address,
                "confirmations": d.confirmations,
                "required_confirmations": d.required_confirmations,
                "status": d.status,
                "pay4pro_deposit_id": d.pay4pro_deposit_id,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "completed_at": d.completed_at.isoformat() if d.completed_at else None,
            }
            for d in deposits
        ],
        "total": total,
    }


@router.get("/deposits/stats")
async def deposit_stats(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Deposit stats for admin dashboard."""
    from datetime import datetime, timezone
    from decimal import Decimal

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    pending_q = select(func.count(Deposit.id)).where(
        Deposit.status.in_(["pending", "confirming"])
    )
    pending_count = (await db.execute(pending_q)).scalar() or 0

    today_completed_q = select(
        func.coalesce(func.sum(Deposit.amount), Decimal("0"))
    ).where(
        and_(
            Deposit.status == "completed",
            Deposit.completed_at >= day_start,
        )
    )
    today_total = (await db.execute(today_completed_q)).scalar() or Decimal("0")

    total_deposits_q = select(func.count(Deposit.id)).where(
        Deposit.status == "completed"
    )
    total_count = (await db.execute(total_deposits_q)).scalar() or 0

    return {
        "pending_count": pending_count,
        "today_completed_total": str(today_total),
        "total_completed_count": total_count,
    }
