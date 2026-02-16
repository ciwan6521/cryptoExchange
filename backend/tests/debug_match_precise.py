"""Precise debug: call place_order via HTTP and capture exact traceback from backend."""
import sys, os, subprocess, httpx

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

# Start a fresh backend with stderr capture
def start_backend():
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--log-level", "warning"],
        cwd=os.path.join(os.path.dirname(__file__), ".."),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True
    )

clean()
print("[+] Cleaned")

import time
proc = start_backend()
time.sleep(5)
print("[+] Backend started on :8001")

BASE2 = "http://localhost:8001"
c1 = httpx.Client(base_url=BASE2, timeout=30)
c2 = httpx.Client(base_url=BASE2, timeout=30)

r1 = c1.post("/api/auth/login", json={"email": "e2e_user1@test.com", "password": "TestPass123!@"})
t1 = get_token(r1)
r2 = c2.post("/api/auth/login", json={"email": "e2e_user2@test.com", "password": "TestPass123!@"})
t2 = get_token(r2)

h1 = {"Authorization": f"Bearer {t1}"}
h2 = {"Authorization": f"Bearer {t2}"}

# Buy
r = c1.post("/api/orders/place", json={
    "symbol": "BTC-USDT", "side": "buy", "order_type": "limit",
    "quantity": "0.01", "price": "50000"
}, headers=h1)
print(f"BUY: {r.status_code}")

# Sell (should match)
r = c2.post("/api/orders/place", json={
    "symbol": "BTC-USDT", "side": "sell", "order_type": "limit",
    "quantity": "0.01", "price": "50000"
}, headers=h2)
print(f"SELL: {r.status_code}")
if r.status_code != 200:
    print(f"Error: {r.text[:500]}")

# Kill backend and get stderr
proc.terminate()
proc.wait(timeout=5)
stderr = proc.stderr.read()
if stderr:
    print("\n=== BACKEND STDERR ===")
    # Find the traceback
    lines = stderr.split("\n")
    tb_start = -1
    for i, line in enumerate(lines):
        if "Traceback" in line or "ERROR" in line or "MissingGreenlet" in line:
            tb_start = max(0, i - 2)
            break
    if tb_start >= 0:
        for line in lines[tb_start:]:
            print(line)
    else:
        # Print last 50 lines
        for line in lines[-50:]:
            print(line)
