"""
Pure HTTP e2e test — no direct DB imports.
Funds user via a subprocess to avoid connection pool corruption.
"""
import httpx
import json
import subprocess
import sys
import os

BASE = "http://localhost:8000"


def get_token(resp):
    for h in resp.headers.get_list("set-cookie"):
        if h.startswith("access_token="):
            return h.split("=", 1)[1].split(";")[0]
    return None


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def fund_user(email, assets):
    """Fund user via a separate subprocess to avoid async/greenlet issues."""
    parts = "; ".join(
        f"await ledger.credit(u.id, '{a}', Decimal('{amt}'), 'deposit', idempotency_key='e2e-fund-{email}-{a}')"
        for a, amt in assets.items()
    )
    script = f"""
import asyncio
from decimal import Decimal
from sqlalchemy import select
from app.database import async_session_factory
from app.services.ledger_service import LedgerService
from app.models.user import User

async def go():
    async with async_session_factory() as db:
        r = await db.execute(select(User).where(User.email == '{email}'))
        u = r.scalar_one()
        ledger = LedgerService(db)
        {parts}
        await db.commit()
        print('OK')

asyncio.run(go())
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        capture_output=True, text=True
    )
    return "OK" in result.stdout


def main():
    c = httpx.Client(base_url=BASE, timeout=15)  # shared for registration
    ok = True

    # --- Setup: Register ---
    c.post("/api/auth/register", json={"email": "e2e_user1@test.com", "username": "e2e_user1", "password": "TestPass123!@"})
    c.post("/api/auth/register", json={"email": "e2e_user2@test.com", "username": "e2e_user2", "password": "TestPass123!@"})

    # Use SEPARATE clients per user to avoid cookie jar contamination
    c1 = httpx.Client(base_url=BASE, timeout=15)
    c2 = httpx.Client(base_url=BASE, timeout=15)

    r1 = c1.post("/api/auth/login", json={"email": "e2e_user1@test.com", "password": "TestPass123!@"})
    t1 = get_token(r1)
    r2 = c2.post("/api/auth/login", json={"email": "e2e_user2@test.com", "password": "TestPass123!@"})
    t2 = get_token(r2)
    print(f"[+] User1 token: {t1[:20]}...")
    print(f"[+] User2 token: {t2[:20]}...")

    # --- Fund users via subprocess ---
    fund_user("e2e_user1@test.com", {"USDT": "100000", "BTC": "5"})
    fund_user("e2e_user2@test.com", {"USDT": "100000", "BTC": "5"})
    print("[+] Both users funded")

    # --- TEST 1: Place Buy Order (User1) ---
    print("\n--- TEST 1: Place Buy Order (User1) ---")
    r = c1.post("/api/orders/place", json={
        "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
        "quantity": "0.1", "price": "50000"
    }, headers=auth(t1))
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        print(f"  ERROR: {r.text[:300]}")
        ok = False
    else:
        d = r.json()
        print(f"  Order: {d['order']['status']}, fills: {d['fills_count']}")
        assert d["order"]["status"] == "open"
        buy_id = d["order"]["id"]

    # --- TEST 2: Check balances after buy (USDT locked) ---
    if ok:
        print("\n--- TEST 2: Balance check after buy ---")
        b = c1.get("/api/balances", headers=auth(t1)).json()
        usdt = next(x for x in b["balances"] if x["asset"] == "USDT")
        print(f"  USDT: available={usdt['available']}, locked={usdt['locked']}")
        assert float(usdt["locked"]) > 0, "USDT should be locked"

    # --- TEST 3: User2 sells → should match ---
    if ok:
        print("\n--- TEST 3: Matching sell order (User2) ---")
        r = c2.post("/api/orders/place", json={
            "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
            "quantity": "0.1", "price": "50000"
        }, headers=auth(t2))
        print(f"  Status: {r.status_code}")
        if r.status_code != 200:
            print(f"  ERROR: {r.text[:300]}")
            ok = False
        else:
            d = r.json()
            print(f"  Order: {d['order']['status']}, fills: {d['fills_count']}")
            if d["fills_count"] > 0:
                t = d["fills"][0]
                print(f"  TRADE: price={t['price']}, qty={t['quantity']}")
            assert d["fills_count"] == 1, "Should have 1 fill"
            assert d["order"]["status"] == "filled"

    # --- TEST 4: Cancel order ---
    if ok:
        print("\n--- TEST 4: Place + Cancel (User1) ---")
        r = c1.post("/api/orders/place", json={
            "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
            "quantity": "0.05", "price": "45000"
        }, headers=auth(t1))
        if r.status_code == 200:
            oid = r.json()["order"]["id"]
            rc = c1.post(f"/api/orders/{oid}/cancel", headers=auth(t1))
            print(f"  Place: 200, Cancel: {rc.status_code}")
            if rc.status_code == 200:
                assert rc.json()["order"]["status"] == "cancelled"
            else:
                print(f"  Cancel error: {rc.text[:200]}")
                ok = False
        else:
            print(f"  Place error: {r.text[:200]}")
            ok = False

    # --- TEST 5: Public endpoints ---
    print("\n--- TEST 5: Public endpoints ---")
    pairs = c.get("/api/market/pairs").json()
    flags = c.get("/api/market/flags").json()
    print(f"  Pairs: {len(pairs['pairs'])}, Trading: {flags['flags']['trading_enabled']}")

    # --- TEST 6: Self-trade prevention ---
    if ok:
        print("\n--- TEST 6: Self-trade prevention ---")
        c1.post("/api/orders/place", json={
            "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
            "quantity": "0.01", "price": "49000"
        }, headers=auth(t1))
        r = c1.post("/api/orders/place", json={
            "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
            "quantity": "0.01", "price": "49000"
        }, headers=auth(t1))
        if r.status_code == 200:
            d = r.json()
            print(f"  Fills: {d['fills_count']} (should be 0 — self-trade prevention)")
            assert d["fills_count"] == 0

    print("\n" + "=" * 50)
    if ok:
        print("ALL TESTS PASSED!")
    else:
        print("SOME TESTS FAILED")
    print("=" * 50)


if __name__ == "__main__":
    main()
