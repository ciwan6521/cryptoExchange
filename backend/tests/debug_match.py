"""Debug: test matching between two different users directly."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import asyncio
import traceback
import logging
from decimal import Decimal
from sqlalchemy import select, text
from app.database import async_session_factory
from app.services.matching_engine import MatchingEngine
from app.models.user import User

logging.basicConfig(level=logging.WARNING)  # suppress SQL noise


async def test():
    # Clean first
    async with async_session_factory() as db:
        await db.execute(text("DELETE FROM trades"))
        await db.execute(text("DELETE FROM orders"))
        await db.commit()
        print("[+] Cleaned orders+trades")

    async with async_session_factory() as db:
        r1 = await db.execute(select(User).where(User.email == "e2e_user1@test.com"))
        u1 = r1.scalar_one()
        r2 = await db.execute(select(User).where(User.email == "e2e_user2@test.com"))
        u2 = r2.scalar_one()
        print(f"[+] User1: {u1.id} ({u1.email})")
        print(f"[+] User2: {u2.id} ({u2.email})")
        assert u1.id != u2.id, "Users must be different!"

        engine = MatchingEngine(db)

        # User1 places buy
        print("\n--- User1 BUY 0.1 BTC @ 50000 ---")
        try:
            res1 = await engine.place_order(u1, "BTC-USDT", "buy", "limit", Decimal("0.1"), Decimal("50000"))
            print(f"  Status: {res1['order'].status}, fills: {res1['fills_count']}")
        except Exception:
            traceback.print_exc()
            return

        # User2 places sell -> should match
        print("\n--- User2 SELL 0.1 BTC @ 50000 ---")
        try:
            res2 = await engine.place_order(u2, "BTC-USDT", "sell", "limit", Decimal("0.1"), Decimal("50000"))
            print(f"  Status: {res2['order'].status}, fills: {res2['fills_count']}")
            if res2["trades"]:
                t = res2["trades"][0]
                print(f"  TRADE: price={t.price}, qty={t.quantity}")
        except Exception:
            traceback.print_exc()
            return

        await db.commit()
        print("\n[+] ALL OK - committed successfully")


asyncio.run(test())
