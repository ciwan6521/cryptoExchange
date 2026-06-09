"""
Seed script — creates initial data for the exchange:
- Admin accounts (super_admin, operator, finance, readonly)
- Trading pairs (BTC-USDT, ETH-USDT, SOL-USDT, XRP-USDT, DOGE-USDT, AVAX-USDT)
- System flags (all defaults)

Run: python -m app.seed
"""

import asyncio
import os
from decimal import Decimal

from sqlalchemy import select

from app.database import engine, Base, async_session_factory
from app.models.user import AdminUser, User
from app.models.ledger import Account
from app.models.trading import TradingPair
from app.models.cms import SystemFlag
from app.models.supported_asset import SupportedAsset
from app.models.staking import StakingProduct, StakingPeriod
from app.utils.security import hash_password

STAKING_PRODUCTS = [
    {
        "asset": "USDT",
        "name": "USDT Flexible Earn",
        "description": "Earn rewards on your USDT balance",
        "min_stake": "10",
        "periods": [
            {"label": "7 Days", "duration_days": 7, "reward_percent": "2.5"},
            {"label": "30 Days", "duration_days": 30, "reward_percent": "8.0"},
            {"label": "90 Days", "duration_days": 90, "reward_percent": "15.0"},
        ],
    },
    {
        "asset": "ETH",
        "name": "ETH Staking",
        "description": "Stake ETH and earn passive rewards",
        "min_stake": "0.01",
        "periods": [
            {"label": "14 Days", "duration_days": 14, "reward_percent": "3.0"},
            {"label": "60 Days", "duration_days": 60, "reward_percent": "10.0"},
        ],
    },
]


# Admin passwords MUST come from environment variables — never hardcoded.
ADMIN_ACCOUNTS = [
    {"email": "admin@crypto4.io", "username": "admin", "password": os.environ.get("SEED_ADMIN_PASSWORD", ""), "role": "super_admin"},
    {"email": "operator@crypto4.io", "username": "operator", "password": os.environ.get("SEED_OPERATOR_PASSWORD", ""), "role": "operator"},
    {"email": "finance@crypto4.io", "username": "finance", "password": os.environ.get("SEED_FINANCE_PASSWORD", ""), "role": "finance"},
    {"email": "viewer@crypto4.io", "username": "viewer", "password": os.environ.get("SEED_VIEWER_PASSWORD", ""), "role": "readonly"},
]

# Optional SUPER_ADMIN — only seeded when env vars are set
SUPER_ADMIN = {
    "email": os.environ.get("SEED_SUPER_ADMIN_EMAIL", ""),
    "username": os.environ.get("SEED_SUPER_ADMIN_USERNAME", "superadmin"),
    "password": os.environ.get("SEED_SUPER_ADMIN_PASSWORD", ""),
    "role": "super_admin",
}

TRADING_PAIRS = [
    {
        "symbol": "BTC-USDT", "base_asset": "BTC", "quote_asset": "USDT",
        "price_precision": 2, "quantity_precision": 6,
        "tick_size": "0.01", "step_size": "0.000001",
        "min_order_size": "0.000001", "max_order_size": "9999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "ETH-USDT", "base_asset": "ETH", "quote_asset": "USDT",
        "price_precision": 2, "quantity_precision": 5,
        "tick_size": "0.01", "step_size": "0.00001",
        "min_order_size": "0.00001", "max_order_size": "99999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "SOL-USDT", "base_asset": "SOL", "quote_asset": "USDT",
        "price_precision": 2, "quantity_precision": 3,
        "tick_size": "0.01", "step_size": "0.001",
        "min_order_size": "0.001", "max_order_size": "999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "XRP-USDT", "base_asset": "XRP", "quote_asset": "USDT",
        "price_precision": 4, "quantity_precision": 1,
        "tick_size": "0.0001", "step_size": "0.1",
        "min_order_size": "1", "max_order_size": "9999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "DOGE-USDT", "base_asset": "DOGE", "quote_asset": "USDT",
        "price_precision": 6, "quantity_precision": 0,
        "tick_size": "0.000001", "step_size": "1",
        "min_order_size": "1", "max_order_size": "99999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "AVAX-USDT", "base_asset": "AVAX", "quote_asset": "USDT",
        "price_precision": 2, "quantity_precision": 2,
        "tick_size": "0.01", "step_size": "0.01",
        "min_order_size": "0.01", "max_order_size": "999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "BNB-USDT", "base_asset": "BNB", "quote_asset": "USDT",
        "price_precision": 2, "quantity_precision": 4,
        "tick_size": "0.01", "step_size": "0.0001",
        "min_order_size": "0.0001", "max_order_size": "999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "ADA-USDT", "base_asset": "ADA", "quote_asset": "USDT",
        "price_precision": 4, "quantity_precision": 1,
        "tick_size": "0.0001", "step_size": "0.1",
        "min_order_size": "1", "max_order_size": "9999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
    {
        "symbol": "TRX-USDT", "base_asset": "TRX", "quote_asset": "USDT",
        "price_precision": 5, "quantity_precision": 1,
        "tick_size": "0.00001", "step_size": "0.1",
        "min_order_size": "1", "max_order_size": "9999999",
        "min_notional": "10", "maker_fee": "0.001", "taker_fee": "0.001",
    },
]

SUPPORTED_ASSETS = [
    {"symbol": "BTC", "name": "Bitcoin", "decimals": 8},
    {"symbol": "ETH", "name": "Ethereum", "decimals": 18},
    {"symbol": "BNB", "name": "BNB", "decimals": 8},
    {"symbol": "SOL", "name": "Solana", "decimals": 9},
    {"symbol": "XRP", "name": "XRP", "decimals": 6},
    {"symbol": "ADA", "name": "Cardano", "decimals": 6},
    {"symbol": "DOGE", "name": "Dogecoin", "decimals": 8},
    {"symbol": "TRX", "name": "TRON", "decimals": 6},
    {"symbol": "USDT", "name": "Tether", "decimals": 6},
]

MM_EMAIL = os.environ.get("MARKET_MAKER_EMAIL", "mm@crypto4pro.io")
MM_PASSWORD = os.environ.get("SEED_MM_PASSWORD", "")

SYSTEM_FLAGS = {
    "trading_enabled": True,
    "new_orders_enabled": True,
    "deposits_enabled": True,
    "withdrawals_enabled": True,
    "maintenance_mode": False,
    "registration_enabled": True,
}


async def seed():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        # --- SUPER_ADMIN (optional — requires env vars) ---
        if not SUPER_ADMIN["email"] or not SUPER_ADMIN["password"]:
            print("  [!] SKIPPED: SUPER_ADMIN — set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD")
        elif len(SUPER_ADMIN["password"]) < 12:
            print("  [!] SKIPPED: SUPER_ADMIN — password must be >= 12 chars")
        else:
            existing = await db.execute(
                select(AdminUser).where(AdminUser.email == SUPER_ADMIN["email"])
            )
            sa = existing.scalar_one_or_none()
            if sa:
                sa.password_hash = hash_password(SUPER_ADMIN["password"])
                sa.role = SUPER_ADMIN["role"]
                print(f"  [~] SUPER_ADMIN updated: {SUPER_ADMIN['email']}")
            else:
                sa = AdminUser(
                    email=SUPER_ADMIN["email"],
                    username=SUPER_ADMIN["username"],
                    password_hash=hash_password(SUPER_ADMIN["password"]),
                    role=SUPER_ADMIN["role"],
                    force_password_change=False,
                )
                db.add(sa)
                print(f"  [+] SUPER_ADMIN created: {SUPER_ADMIN['email']}")

        # --- Admin Accounts ---
        for acct in ADMIN_ACCOUNTS:
            if not acct["password"]:
                print(f"  [!] SKIPPED: {acct['email']} — set SEED_{acct['role'].upper()}_PASSWORD env var")
                continue
            if len(acct["password"]) < 12:
                print(f"  [!] SKIPPED: {acct['email']} — password must be >= 12 chars")
                continue
            existing = await db.execute(
                select(AdminUser).where(AdminUser.email == acct["email"])
            )
            if not existing.scalar_one_or_none():
                admin = AdminUser(
                    email=acct["email"],
                    username=acct["username"],
                    password_hash=hash_password(acct["password"]),
                    role=acct["role"],
                    force_password_change=True,
                )
                db.add(admin)
                print(f"  [+] Admin: {acct['email']} ({acct['role']}) — must change password on first login")
            else:
                print(f"  [=] Admin already exists: {acct['email']}")

        # --- Trading Pairs ---
        for pair_data in TRADING_PAIRS:
            existing = await db.execute(
                select(TradingPair).where(TradingPair.symbol == pair_data["symbol"])
            )
            if not existing.scalar_one_or_none():
                pair = TradingPair(
                    symbol=pair_data["symbol"],
                    base_asset=pair_data["base_asset"],
                    quote_asset=pair_data["quote_asset"],
                    price_precision=pair_data["price_precision"],
                    quantity_precision=pair_data["quantity_precision"],
                    tick_size=Decimal(pair_data["tick_size"]),
                    step_size=Decimal(pair_data["step_size"]),
                    min_order_size=Decimal(pair_data["min_order_size"]),
                    max_order_size=Decimal(pair_data["max_order_size"]),
                    min_notional=Decimal(pair_data["min_notional"]),
                    maker_fee=Decimal(pair_data["maker_fee"]),
                    taker_fee=Decimal(pair_data["taker_fee"]),
                )
                db.add(pair)
                print(f"  [+] Pair: {pair_data['symbol']}")
            else:
                print(f"  [=] Pair already exists: {pair_data['symbol']}")

        # --- Supported Assets ---
        for asset_data in SUPPORTED_ASSETS:
            existing = await db.execute(
                select(SupportedAsset).where(SupportedAsset.symbol == asset_data["symbol"])
            )
            if not existing.scalar_one_or_none():
                asset = SupportedAsset(
                    symbol=asset_data["symbol"],
                    name=asset_data["name"],
                    decimals=asset_data["decimals"],
                    is_active=True,
                )
                db.add(asset)
                print(f"  [+] Asset: {asset_data['symbol']} ({asset_data['name']})")
            else:
                print(f"  [=] Asset already exists: {asset_data['symbol']}")

        # --- Market Maker bot user (optional) ---
        if MM_PASSWORD and len(MM_PASSWORD) >= 12:
            mm_result = await db.execute(select(User).where(User.email == MM_EMAIL))
            mm_user = mm_result.scalar_one_or_none()
            if not mm_user:
                mm_user = User(
                    email=MM_EMAIL,
                    username="marketmaker",
                    password_hash=hash_password(MM_PASSWORD),
                    email_verified=True,
                    is_verified=True,
                    kyc_status="approved",
                    trading_enabled=True,
                )
                db.add(mm_user)
                await db.flush()
                for asset in ("USDT", "BTC", "ETH", "SOL", "XRP", "DOGE"):
                    db.add(Account(user_id=mm_user.id, asset=asset))
                print(f"  [+] Market maker user: {MM_EMAIL}")
            else:
                print(f"  [=] Market maker exists: {MM_EMAIL}")
        else:
            print("  [!] SKIPPED: market maker — set SEED_MM_PASSWORD (>=12 chars)")

        # --- Staking Products ---
        for prod_data in STAKING_PRODUCTS:
            existing = await db.execute(
                select(StakingProduct).where(
                    StakingProduct.asset == prod_data["asset"],
                    StakingProduct.name == prod_data["name"],
                )
            )
            if existing.scalar_one_or_none():
                print(f"  [=] Staking product already exists: {prod_data['name']}")
                continue
            product = StakingProduct(
                asset=prod_data["asset"],
                name=prod_data["name"],
                description=prod_data.get("description"),
                min_stake=Decimal(prod_data["min_stake"]) if prod_data.get("min_stake") else None,
                is_active=True,
            )
            db.add(product)
            await db.flush()
            for i, period in enumerate(prod_data["periods"]):
                db.add(StakingPeriod(
                    product_id=product.id,
                    label=period["label"],
                    duration_days=period["duration_days"],
                    reward_percent=Decimal(period["reward_percent"]),
                    is_active=True,
                    sort_order=i,
                ))
            print(f"  [+] Staking product: {prod_data['name']}")

        # --- System Flags ---
        for key, value in SYSTEM_FLAGS.items():
            existing = await db.execute(
                select(SystemFlag).where(SystemFlag.key == key)
            )
            if not existing.scalar_one_or_none():
                flag = SystemFlag(key=key, value=value)
                db.add(flag)
                print(f"  [+] Flag: {key} = {value}")
            else:
                print(f"  [=] Flag already exists: {key}")

        await db.commit()
        print("\n✓ Seed complete!")


if __name__ == "__main__":
    print("Seeding Crypto4Pro database...\n")
    asyncio.run(seed())
