"""
Seed script — creates initial data for the exchange:
- Admin accounts (super_admin, operator, finance, readonly)
- Trading pairs (BTC-USDT, ETH-USDT, SOL-USDT, XRP-USDT, DOGE-USDT, AVAX-USDT)
- System flags (all defaults)

Run: python -m app.seed
"""

import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.database import engine, Base, async_session_factory
from app.models.user import AdminUser
from app.models.trading import TradingPair
from app.models.cms import SystemFlag
from app.utils.security import hash_password


ADMIN_ACCOUNTS = [
    {"email": "admin@nexus.com", "username": "admin", "password": "Admin123!", "role": "super_admin"},
    {"email": "operator@nexus.com", "username": "operator", "password": "Operator123!", "role": "operator"},
    {"email": "finance@nexus.com", "username": "finance", "password": "Finance123!", "role": "finance"},
    {"email": "viewer@nexus.com", "username": "viewer", "password": "Viewer123!", "role": "readonly"},
]

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
]

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
        # --- Admin Accounts ---
        for acct in ADMIN_ACCOUNTS:
            existing = await db.execute(
                select(AdminUser).where(AdminUser.email == acct["email"])
            )
            if not existing.scalar_one_or_none():
                admin = AdminUser(
                    email=acct["email"],
                    username=acct["username"],
                    password_hash=hash_password(acct["password"]),
                    role=acct["role"],
                )
                db.add(admin)
                print(f"  [+] Admin: {acct['email']} ({acct['role']})")
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
    print("Seeding Nexus Exchange database...\n")
    asyncio.run(seed())
