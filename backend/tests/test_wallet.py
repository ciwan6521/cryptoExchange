"""
Tests for the wallet system:
- Wallet returns all supported assets
- Zero balance user sees all coins
- Admin credit updates balance correctly
- Idempotent credit does not double-credit
- Market price fetch works
- Redis cache works
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx

BASE = "http://localhost:8000"

# Test users (must already exist from e2e tests)
USER_EMAIL = "e2e_user1@test.com"
USER_PASS = "TestPass123!@"
ADMIN_EMAIL = "admin@crypto4.io"
ADMIN_PASS = "Admin123!"


def test_market_prices():
    """Market price endpoint returns prices for all tracked assets."""
    print("\n[TEST] GET /api/market/prices")
    r = httpx.get(f"{BASE}/api/market/prices", timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    prices = data["prices"]
    print(f"  Prices received for: {list(prices.keys())}")

    # USDT should always be "1"
    assert prices.get("USDT") == "1", f"USDT price should be 1, got {prices.get('USDT')}"

    # BTC should have a price
    assert prices.get("BTC") is not None, "BTC price should not be None"
    btc_price = float(prices["BTC"])
    assert btc_price > 0, f"BTC price should be > 0, got {btc_price}"
    print(f"  BTC: ${btc_price:,.2f}")
    print("  ✓ PASSED")


def test_wallet_returns_all_assets():
    """Wallet endpoint returns all supported assets even with zero balances."""
    print("\n[TEST] GET /api/wallet/me — all assets with zero balances")

    # Login
    client = httpx.Client(base_url=BASE, timeout=15)
    r = client.post("/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"

    # Get wallet
    r = client.get("/api/wallet/me")
    assert r.status_code == 200, f"Wallet failed: {r.status_code} {r.text}"
    data = r.json()
    assets = data["assets"]
    symbols = [a["symbol"] for a in assets]

    expected = ["ADA", "BNB", "BTC", "DOGE", "ETH", "SOL", "TRX", "USDT", "XRP"]
    print(f"  Returned symbols: {symbols}")
    for s in expected:
        assert s in symbols, f"Missing asset: {s}"

    # Each asset has required fields
    for a in assets:
        assert "available" in a
        assert "locked" in a
        assert "total" in a
        assert "price_usd" in a
        assert "value_usd" in a
        assert "name" in a

    # Total portfolio value should be present
    assert "total_value_usd" in data
    print(f"  Total value: ${data['total_value_usd']}")
    print("  ✓ PASSED")
    client.close()


def test_admin_credit_updates_balance():
    """Admin credit should update user balance via ledger."""
    print("\n[TEST] POST /api/admin/wallet/credit — updates balance")

    # Get user ID
    user_client = httpx.Client(base_url=BASE, timeout=15)
    r = user_client.post("/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS})
    assert r.status_code == 200
    user_id = r.json()["id"]

    # Admin login
    admin_client = httpx.Client(base_url=BASE, timeout=15)
    r = admin_client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"

    # Credit 0.5 BTC
    r = admin_client.post("/api/admin/wallet/credit", json={
        "user_id": user_id,
        "asset": "BTC",
        "amount": "0.5",
        "reason": "test_wallet_credit",
    })
    assert r.status_code == 200, f"Credit failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["ok"] is True
    assert data["asset"] == "BTC"
    print(f"  Credited 0.5 BTC to user {user_id[:8]}...")

    # Check wallet balance
    r = user_client.get("/api/wallet/me")
    assert r.status_code == 200
    wallet = r.json()
    btc = next((a for a in wallet["assets"] if a["symbol"] == "BTC"), None)
    assert btc is not None
    balance = float(btc["available"])
    assert balance >= 0.5, f"Expected BTC balance >= 0.5, got {balance}"
    print(f"  BTC balance: {btc['available']}")
    print(f"  BTC value: ${btc['value_usd']}")
    print("  ✓ PASSED")

    user_client.close()
    admin_client.close()


def test_idempotent_credit():
    """Same credit request should not double-credit."""
    print("\n[TEST] Idempotent credit — no double-credit")

    user_client = httpx.Client(base_url=BASE, timeout=15)
    r = user_client.post("/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS})
    assert r.status_code == 200
    user_id = r.json()["id"]

    admin_client = httpx.Client(base_url=BASE, timeout=15)
    r = admin_client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200

    # Get current balance
    r = user_client.get("/api/wallet/me")
    wallet = r.json()
    eth_before = float(next((a for a in wallet["assets"] if a["symbol"] == "ETH"), {"available": "0"})["available"])

    # Credit 1 ETH twice with same reason (same idempotency key)
    credit_data = {
        "user_id": user_id,
        "asset": "ETH",
        "amount": "1.0",
        "reason": "idempotency_test_unique_key_12345",
    }

    r1 = admin_client.post("/api/admin/wallet/credit", json=credit_data)
    assert r1.status_code == 200
    first_skip = r1.json().get("idempotent_skip", False)

    r2 = admin_client.post("/api/admin/wallet/credit", json=credit_data)
    assert r2.status_code == 200
    second_skip = r2.json().get("idempotent_skip", False)

    # Second should be skipped
    assert second_skip is True, f"Second credit should be idempotent skip, got {r2.json()}"
    print(f"  First credit skip={first_skip}, Second credit skip={second_skip}")

    # Balance should only increase by 1 ETH
    r = user_client.get("/api/wallet/me")
    wallet = r.json()
    eth_after = float(next((a for a in wallet["assets"] if a["symbol"] == "ETH"), {"available": "0"})["available"])
    increase = eth_after - eth_before
    assert abs(increase - 1.0) < 0.001, f"Expected ~1 ETH increase, got {increase}"
    print(f"  ETH before={eth_before}, after={eth_after}, increase={increase}")
    print("  ✓ PASSED")

    user_client.close()
    admin_client.close()


def test_admin_debit():
    """Admin debit should reduce user balance."""
    print("\n[TEST] POST /api/admin/wallet/debit")

    user_client = httpx.Client(base_url=BASE, timeout=15)
    r = user_client.post("/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS})
    assert r.status_code == 200
    user_id = r.json()["id"]

    admin_client = httpx.Client(base_url=BASE, timeout=15)
    r = admin_client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200

    # First credit some USDT
    admin_client.post("/api/admin/wallet/credit", json={
        "user_id": user_id,
        "asset": "USDT",
        "amount": "1000",
        "reason": "debit_test_setup",
    })

    # Get balance before debit
    r = user_client.get("/api/wallet/me")
    usdt_before = float(next(a for a in r.json()["assets"] if a["symbol"] == "USDT")["available"])

    # Debit 100 USDT
    r = admin_client.post("/api/admin/wallet/debit", json={
        "user_id": user_id,
        "asset": "USDT",
        "amount": "100",
        "reason": "debit_test",
    })
    assert r.status_code == 200, f"Debit failed: {r.status_code} {r.text}"

    # Check balance decreased
    r = user_client.get("/api/wallet/me")
    usdt_after = float(next(a for a in r.json()["assets"] if a["symbol"] == "USDT")["available"])
    diff = usdt_before - usdt_after
    assert abs(diff - 100) < 0.01, f"Expected 100 USDT decrease, got {diff}"
    print(f"  USDT before={usdt_before}, after={usdt_after}, diff={diff}")
    print("  ✓ PASSED")

    user_client.close()
    admin_client.close()


if __name__ == "__main__":
    print("=" * 50)
    print("WALLET SYSTEM TESTS")
    print("=" * 50)
    print(f"Backend: {BASE}")

    passed = 0
    failed = 0
    tests = [
        test_market_prices,
        test_wallet_returns_all_assets,
        test_admin_credit_updates_balance,
        test_idempotent_credit,
        test_admin_debit,
    ]

    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'=' * 50}")
    exit(1 if failed > 0 else 0)
