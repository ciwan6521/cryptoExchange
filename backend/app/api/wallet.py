"""
Wallet API — returns all supported assets with user balances and live prices.

- Shows ALL coins from market data (top 100 from Binance)
- User balance coins always shown first (sorted by value)
- Coins with 0 balance shown after, sorted alphabetically
- Prices come from MarketDataService (Binance + Redis cache)
- Balances come from existing Account model (ledger-backed)
"""

from decimal import Decimal, InvalidOperation
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

COIN_NAMES: dict[str, str] = {
    "BTC": "Bitcoin", "ETH": "Ethereum", "BNB": "BNB", "SOL": "Solana",
    "XRP": "XRP", "ADA": "Cardano", "DOGE": "Dogecoin", "DOT": "Polkadot",
    "AVAX": "Avalanche", "LINK": "Chainlink", "UNI": "Uniswap",
    "ATOM": "Cosmos", "LTC": "Litecoin", "NEAR": "NEAR Protocol",
    "APT": "Aptos", "SUI": "Sui", "ARB": "Arbitrum", "OP": "Optimism",
    "PEPE": "Pepe", "TRX": "TRON", "TON": "Toncoin", "FIL": "Filecoin",
    "HBAR": "Hedera", "MATIC": "Polygon", "POL": "Polygon",
    "IMX": "Immutable", "INJ": "Injective", "SEI": "Sei", "TIA": "Celestia",
    "ONDO": "Ondo", "RENDER": "Render", "FET": "Fetch.ai",
    "GRT": "The Graph", "AAVE": "Aave", "MKR": "Maker", "SNX": "Synthetix",
    "CRV": "Curve", "DYDX": "dYdX", "SAND": "The Sandbox", "MANA": "Decentraland",
    "AXS": "Axie Infinity", "GALA": "Gala", "ENS": "ENS", "LDO": "Lido",
    "RPL": "Rocket Pool", "SSV": "SSV Network", "EIGEN": "EigenLayer",
    "WIF": "dogwifhat", "BONK": "Bonk", "FLOKI": "Floki", "SHIB": "Shiba Inu",
    "XLM": "Stellar", "ALGO": "Algorand", "VET": "VeChain", "FTM": "Fantom",
    "THETA": "Theta", "EOS": "EOS", "IOTA": "IOTA", "XTZ": "Tezos",
    "USDT": "Tether", "USDC": "USD Coin", "TAO": "Bittensor",
    "WLD": "Worldcoin", "JUP": "Jupiter", "PYTH": "Pyth Network",
    "STX": "Stacks", "KAS": "Kaspa", "RUNE": "THORChain", "ORDI": "ORDI",
    "CAKE": "PancakeSwap", "PENDLE": "Pendle", "ENJ": "Enjin",
    "COMP": "Compound", "YFI": "yearn.finance", "BAL": "Balancer",
    "SUSHI": "SushiSwap", "1INCH": "1inch", "ZRX": "0x Protocol",
    "GMT": "STEPN", "APE": "ApeCoin", "ICP": "Internet Computer",
    "EGLD": "MultiversX", "QNT": "Quant", "FLOW": "Flow",
    "CHZ": "Chiliz", "MASK": "Mask Network", "CFX": "Conflux",
    "CELO": "Celo", "KAVA": "Kava", "ZIL": "Zilliqa",
    "ONE": "Harmony", "ROSE": "Oasis", "MINA": "Mina",
    "PAXG": "PAX Gold", "OM": "MANTRA",
}


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
    """Return all market coins with user balances and live USD prices."""

    market = get_market_data_service()

    # 1. Get live prices + tickers (defines which coins are active)
    prices = await market.fetch_prices()
    active_symbols = set(prices.keys())

    # 2. Get supported asset names from DB (for any that exist)
    result = await db.execute(
        select(SupportedAsset).where(SupportedAsset.is_active == True)
    )
    db_assets = {sa.symbol: sa for sa in result.scalars().all()}

    # 3. Get user's accounts (balances)
    acct_result = await db.execute(
        select(Account).where(Account.user_id == user.id)
    )
    accounts = {a.asset: a for a in acct_result.scalars().all()}

    # 4. Build response — combine DB assets + market symbols
    all_symbols = active_symbols | set(db_assets.keys()) | set(accounts.keys())

    with_balance: list[WalletAssetResponse] = []
    without_balance: list[WalletAssetResponse] = []
    total_portfolio = Decimal("0")

    for symbol in sorted(all_symbols):
        acct = accounts.get(symbol)
        available = acct.available if acct else Decimal("0")
        locked = acct.locked if acct else Decimal("0")
        total = available + locked

        price_str = prices.get(symbol)
        price_usd: Optional[Decimal] = None
        value_usd: Optional[Decimal] = None

        if price_str:
            try:
                price_usd = Decimal(price_str)
                value_usd = total * price_usd
            except (InvalidOperation, ValueError):
                pass

        if value_usd is not None:
            total_portfolio += value_usd

        # Resolve name: DB first, then static map, then symbol itself
        db_asset = db_assets.get(symbol)
        name = (db_asset.name if db_asset else None) or COIN_NAMES.get(symbol, symbol)

        entry = WalletAssetResponse(
            symbol=symbol,
            name=name,
            available=str(available),
            locked=str(locked),
            total=str(total),
            price_usd=str(price_usd) if price_usd is not None else None,
            value_usd=str(value_usd.quantize(Decimal("0.01"))) if value_usd is not None else None,
        )

        if total > 0:
            with_balance.append(entry)
        else:
            without_balance.append(entry)

    # Coins with balance first (sorted by USD value desc), then rest alphabetically
    with_balance.sort(
        key=lambda a: Decimal(a.value_usd) if a.value_usd else Decimal("0"),
        reverse=True,
    )

    return WalletResponse(
        assets=with_balance + without_balance,
        total_value_usd=str(total_portfolio.quantize(Decimal("0.01"))),
    )
