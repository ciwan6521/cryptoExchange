"""Minimal HTTP matching test with detailed backend error capture."""
import sys, os, subprocess, httpx, json

BASE = "http://localhost:8000"

def get_token(resp):
    for h in resp.headers.get_list("set-cookie"):
        if h.startswith("access_token="):
            return h.split("=", 1)[1].split(";")[0]
    return None

def clean():
    script = (
        "import asyncio\n"
        "from sqlalchemy import text\n"
        "from app.database import async_session_factory\n"
        "async def go():\n"
        "    async with async_session_factory() as db:\n"
        "        await db.execute(text('DELETE FROM trades'))\n"
        "        await db.execute(text('DELETE FROM orders'))\n"
        "        await db.commit()\n"
        "        print('OK')\n"
        "asyncio.run(go())\n"
    )
    r = subprocess.run([sys.executable, "-c", script],
                       cwd=os.path.join(os.path.dirname(__file__), ".."),
                       capture_output=True, text=True)
    return "OK" in r.stdout

clean()
print("[+] Cleaned")

c1 = httpx.Client(base_url=BASE, timeout=30)
c2 = httpx.Client(base_url=BASE, timeout=30)

r1 = c1.post("/api/auth/login", json={"email": "e2e_user1@test.com", "password": "TestPass123!@"})
t1 = get_token(r1)
r2 = c2.post("/api/auth/login", json={"email": "e2e_user2@test.com", "password": "TestPass123!@"})
t2 = get_token(r2)

h1 = {"Authorization": f"Bearer {t1}"}
h2 = {"Authorization": f"Bearer {t2}"}

# Simple buy - no matching needed
print("\n--- BUY (no match) ---")
r = c1.post("/api/orders/place", json={
    "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
    "quantity": "0.01", "price": "50000"
}, headers=h1)
print(f"  Status: {r.status_code}")
if r.status_code != 200:
    print(f"  Error: {r.text[:500]}")
    sys.exit(1)
print(f"  Result: {r.json()['order']['status']}, fills={r.json()['fills_count']}")

# Simple sell - no matching needed (different price)
print("\n--- SELL at different price (no match) ---")
r = c2.post("/api/orders/place", json={
    "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
    "quantity": "0.01", "price": "55000"
}, headers=h2)
print(f"  Status: {r.status_code}")
if r.status_code != 200:
    print(f"  Error: {r.text[:500]}")
    sys.exit(1)
print(f"  Result: {r.json()['order']['status']}, fills={r.json()['fills_count']}")

# Now sell at matching price - THIS should trigger the match
print("\n--- SELL at matching price (should match) ---")
r = c2.post("/api/orders/place", json={
    "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
    "quantity": "0.01", "price": "50000"
}, headers=h2)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    d = r.json()
    print(f"  Result: {d['order']['status']}, fills={d['fills_count']}")
    if d['fills']:
        print(f"  Trade: price={d['fills'][0]['price']}, qty={d['fills'][0]['quantity']}")
else:
    print(f"  Error: {r.text[:500]}")
