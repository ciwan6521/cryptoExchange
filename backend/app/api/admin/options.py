"""Admin options positions overview."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import AdminUser
from app.models.platform import OptionPosition
from app.api.deps import get_current_admin

router = APIRouter(prefix="/api/admin/options", tags=["admin-options"])


@router.get("/positions")
async def list_open_positions(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OptionPosition)
        .where(OptionPosition.status == "open")
        .order_by(desc(OptionPosition.opened_at))
        .limit(200)
    )
    positions = list(result.scalars().all())
    return {
        "positions": [
            {
                "id": str(p.id),
                "user_id": str(p.user_id),
                "asset": p.asset,
                "option_type": p.option_type,
                "strike_price": str(p.strike_price),
                "premium_usdt": str(p.premium_usdt),
                "quantity": str(p.quantity),
                "expiry_at": p.expiry_at.isoformat(),
                "status": p.status,
                "opened_at": p.opened_at.isoformat() if p.opened_at else None,
            }
            for p in positions
        ],
        "total": len(positions),
    }
