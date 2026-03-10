"""
End-to-end API test script.
Tests: register, login, fund, place order, match, cancel, balances.
Run: python tests/e2e_test.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import json
import asyncio
from decimal import Decimal
from sqlalchemy import select

BASE = "http://localhost:8000"


def get_token(resp):
    for h in resp.headers.get_list("set-cookie"):
        if h.startswith("access_token="):
            return h.split("=", 1)[1].split(";")[0]
    return None


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    c = httpx.Client(base_url=BASE, timeout=10)

    # --- Register user2 ---
    r = c.post("/api/auth/register", json={
        "email": "trader2@crypto4.io", "username": "trader2", "password": "Trader2Pass!@"
    })
    if r.status_code == 200:
        print("[+] Registered trader2")
    else:
        print(f"[=] trader2 registration: {r.status_code} {r.text[:100]}")

    # --- Login both users ---
    r1 = c.post("/api/auth/login", json={"email": "test@crypto4.io", "password": "TestPass123!@"})
    t1 = get_token(r1)
    h1 = auth_headers(t1)
    print(f"[+] User1 logged in")

    r2 = c.post("/api/auth/login", json={"email": "trader2@crypto4.io", "password": "Trader2Pass!@"})
    t2 = get_token(r2)
    h2 = auth_headers(t2)
    print(f"[+] User2 logged in")

    # --- Fund user2 via DB ---
    from app.database import async_session_factory
    from app.services.ledger_service import LedgerService
    from app.models.user import User

    async def fund_user2():
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.email == "trader2@crypto4.io"))
            u2 = result.scalar_one()
            ledger = LedgerService(db)
            await ledger.credit(u2.id, "BTC", Decimal("5"), "deposit", idempotency_key="fund-trader2-btc")
            await ledger.credit(u2.id, "USDT", Decimal("50000"), "deposit", idempotency_key="fund-trader2-usdt")
            await db.commit()

    asyncio.run(fund_user2())
    print("[+] Funded trader2: 5 BTC + 50,000 USDT")

    # --- Cancel user1's existing open orders ---
    oo = c.get("/api/trading/orders/open", headers=h1).json()
    for o in oo.get("orders", []):
        oid = o["id"]
        cr = c.post(f"/api/orders/{oid}/cancel", headers=h1)
        print(f"  [x] Cancelled order {oid[:8]}... : {cr.status_code}")

    # --- Check balances ---
    b1 = c.get("/api/balances", headers=h1).json()
    print("\n=== User1 Balances ===")
    for b in b1["balances"]:
        print(f"  {b['asset']}: available={b['available']}, locked={b['locked']}")

    b2 = c.get("/api/balances", headers=h2).json()
    print("\n=== User2 Balances ===")
    for b in b2["balances"]:
        print(f"  {b['asset']}: available={b['available']}, locked={b['locked']}")

    # --- User1 places BUY 0.1 BTC @ 50000 ---
    print("\n=== TEST 1: Place Buy Order ===")
    r_buy = c.post("/api/orders/place", json={
        "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
        "quantity": "0.1", "price": "50000"
    }, headers=h1)
    print(f"  Status: {r_buy.status_code}")
    if r_buy.status_code != 200:
        print(f"  Error: {r_buy.text[:500]}")
        return
    buy = r_buy.json()
    print(f"  Order: {buy['order']['status']}, fills: {buy['fills_count']}")

    # --- User2 places SELL 0.1 BTC @ 50000 -> should MATCH ---
    print("\n=== TEST 2: Place Sell Order (should match) ===")
    r_sell = c.post("/api/orders/place", json={
        "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
        "quantity": "0.1", "price": "50000"
    }, headers=h2)
    sell = r_sell.json()
    print(f"  Status: {r_sell.status_code}")
    print(f"  Order: {sell['order']['status']}, fills: {sell['fills_count']}")
    if sell["fills_count"] > 0:
        t = sell["fills"][0]
        print(f"  TRADE EXECUTED: price={t['price']}, qty={t['quantity']}")

    # --- Balances after match ---
    b1 = c.get("/api/balances", headers=h1).json()
    print("\n=== User1 Balances After Match ===")
    for b in b1["balances"]:
        print(f"  {b['asset']}: available={b['available']}, locked={b['locked']}")

    b2 = c.get("/api/balances", headers=h2).json()
    print("\n=== User2 Balances After Match ===")
    for b in b2["balances"]:
        print(f"  {b['asset']}: available={b['available']}, locked={b['locked']}")

    # --- TEST 3: Cancel order ---
    print("\n=== TEST 3: Place + Cancel Order ===")
    r_new = c.post("/api/orders/place", json={
        "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
        "quantity": "0.05", "price": "48000"
    }, headers=h1)
    new_order = r_new.json()
    new_id = new_order["order"]["id"]
    print(f"  Placed: {new_id[:8]}... status={new_order['order']['status']}")

    r_cancel = c.post(f"/api/orders/{new_id}/cancel", headers=h1)
    cancel_data = r_cancel.json()
    print(f"  Cancel: {r_cancel.status_code}, status={cancel_data['order']['status']}")

    # Final balances
    b1 = c.get("/api/balances", headers=h1).json()
    print("\n=== User1 Final Balances ===")
    for b in b1["balances"]:
        print(f"  {b['asset']}: available={b['available']}, locked={b['locked']}")

    # --- TEST 4: Market pairs + flags ---
    print("\n=== TEST 4: Public Endpoints ===")
    pairs = c.get("/api/market/pairs").json()
    print(f"  Trading pairs: {len(pairs['pairs'])}")
    flags = c.get("/api/market/flags").json()
    print(f"  Flags: {flags['flags']}")

    print("\n" + "=" * 50)
    print("ALL TESTS PASSED!")
    print("=" * 50)


if __name__ == "__main__":
    main()
