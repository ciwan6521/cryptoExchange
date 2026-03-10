"""
Wallet API — returns all supported assets with user balances and live prices.

- All supported assets are returned even if user has 0 balance
- Prices come from MarketDataService (Binance + Redis cache)
- Balances come from existing Account model (ledger-backed)
"""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.ledger import Account
from app.models.supported_asset import SupportedAsset
from app.api.deps import get_current_user
from app.services.market_data import get_market_data_service

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


class WalletAssetResponse(BaseModel):
    symbol: str
    name: str
    available: str
    locked: str
    total: str
    price_usd: Optional[str] = None
    value_usd: Optional[str] = None


class WalletResponse(BaseModel):
    assets: list[WalletAssetResponse]
    total_value_usd: Optional[str] = None


@router.get("/me", response_model=WalletResponse)
async def get_wallet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all supported assets with user balances and live USD prices."""

    # 1. Get all active supported assets
    result = await db.execute(
        select(SupportedAsset)
        .where(SupportedAsset.is_active == True)
        .order_by(SupportedAsset.symbol)
    )
    supported = list(result.scalars().all())

    # 2. Get user's accounts (balances)
    acct_result = await db.execute(
        select(Account).where(Account.user_id == user.id)
    )
    accounts = {a.asset: a for a in acct_result.scalars().all()}

    # 3. Fetch live prices
    market = get_market_data_service()
    prices = await market.fetch_prices()

    # 4. Build response
    assets = []
    total_portfolio = Decimal("0")

    for sa in supported:
        acct = accounts.get(sa.symbol)
        available = acct.available if acct else Decimal("0")
        locked = acct.locked if acct else Decimal("0")
        total = available + locked

        price_str = prices.get(sa.symbol)
        price_usd = Decimal(price_str) if price_str else None
        value_usd = (total * price_usd) if price_usd is not None else None

        if value_usd is not None:
            total_portfolio += value_usd

        assets.append(WalletAssetResponse(
            symbol=sa.symbol,
            name=sa.name,
            available=str(available),
            locked=str(locked),
            total=str(total),
            price_usd=str(price_usd) if price_usd is not None else None,
            value_usd=str(value_usd.quantize(Decimal("0.01"))) if value_usd is not None else None,
        ))

    return WalletResponse(
        assets=assets,
        total_value_usd=str(total_portfolio.quantize(Decimal("0.01"))),
    )
