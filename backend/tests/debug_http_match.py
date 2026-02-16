"""Debug: test matching via HTTP with separate clients, capturing exact error."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import subprocess

BASE = "http://localhost:8000"


def get_token(resp):
    for h in resp.headers.get_list("set-cookie"):
        if h.startswith("access_token="):
            return h.split("=", 1)[1].split(";")[0]
    return None


def clean_via_subprocess():
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


def main():
    if clean_via_subprocess():
        print("[+] Cleaned orders+trades")
    else:
        print("[!] Cleanup failed")

    c1 = httpx.Client(base_url=BASE, timeout=15)
    c2 = httpx.Client(base_url=BASE, timeout=15)

    # Login
    r1 = c1.post("/api/auth/login", json={"email": "e2e_user1@test.com", "password": "TestPass123!@"})
    t1 = get_token(r1)
    r2 = c2.post("/api/auth/login", json={"email": "e2e_user2@test.com", "password": "TestPass123!@"})
    t2 = get_token(r2)

    # Decode tokens to verify different users
    import base64, json
    payload1 = json.loads(base64.b64decode(t1.split(".")[1] + "=="))
    payload2 = json.loads(base64.b64decode(t2.split(".")[1] + "=="))
    print(f"[+] User1 sub: {payload1.get('sub', 'N/A')}")
    print(f"[+] User2 sub: {payload2.get('sub', 'N/A')}")

    # User1 buy
    h1 = {"Authorization": f"Bearer {t1}"}
    h2 = {"Authorization": f"Bearer {t2}"}

    print("\n--- User1 BUY ---")
    r = c1.post("/api/orders/place", json={
        "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
        "quantity": "0.1", "price": "50000"
    }, headers=h1)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        print(f"  Order: {r.json()['order']['status']}")
    else:
        print(f"  Error: {r.text[:500]}")
        return

    # User2 sell
    print("\n--- User2 SELL ---")
    r = c2.post("/api/orders/place", json={
        "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
        "quantity": "0.1", "price": "50000"
    }, headers=h2)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        print(f"  Order: {d['order']['status']}, fills: {d['fills_count']}")
        if d["fills"]:
            print(f"  Trade: price={d['fills'][0]['price']}, qty={d['fills'][0]['quantity']}")
    else:
        print(f"  Error: {r.text[:500]}")


if __name__ == "__main__":
    main()
