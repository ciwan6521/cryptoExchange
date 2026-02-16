"""Debug: check open orders and user IDs to diagnose matching failure."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncio
from sqlalchemy import text
from app.database import async_session_factory


async def check():
    async with async_session_factory() as db:
        # Check open orders
        r = await db.execute(text(
            "SELECT CAST(user_id AS TEXT), side, status, price, remaining "
            "FROM orders WHERE status = 'open' ORDER BY created_at DESC LIMIT 10"
        ))
        rows = r.fetchall()
        print("=== Open Orders ===")
        for row in rows:
            print(f"  user={row[0][:8]}... side={row[1]} status={row[2]} price={row[3]} rem={row[4]}")
        if not rows:
            print("  (none)")

        # Check users
        r2 = await db.execute(text(
            "SELECT CAST(id AS TEXT), email, trading_enabled FROM users "
            "WHERE email LIKE '%e2e%' OR email LIKE '%test@%' OR email LIKE '%trader%'"
        ))
        rows2 = r2.fetchall()
        print("\n=== Test Users ===")
        for row in rows2:
            print(f"  id={row[0][:8]}... email={row[1]} trading={row[2]}")

        # Check all orders (last 10)
        r3 = await db.execute(text(
            "SELECT CAST(user_id AS TEXT), side, status, price, remaining "
            "FROM orders ORDER BY created_at DESC LIMIT 10"
        ))
        rows3 = r3.fetchall()
        print("\n=== All Orders (last 10) ===")
        for row in rows3:
            print(f"  user={row[0][:8]}... side={row[1]} status={row[2]} price={row[3]} rem={row[4]}")


asyncio.run(check())
