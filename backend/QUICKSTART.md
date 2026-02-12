# Step 2 — Local Run & Happy Path Verification

## Prerequisites

- **Docker Desktop** (for PostgreSQL + Redis)
- **Python 3.11+**

## Setup (one-time)

```bash
cd backend

# 1. Start PostgreSQL + Redis
docker-compose up -d postgres redis

# 2. Create Python virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env from template
copy .env.example .env         # Windows
# cp .env.example .env         # Linux/Mac

# 5. Seed database (creates tables + admin accounts + trading pairs + flags)
python -m app.seed

# 6. Start API server
uvicorn app.main:app --reload --port 8000

# 7. (Separate terminal) Start Celery worker for campaign rewards
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo

# 8. (Separate terminal) Start Celery beat for periodic tasks
celery -A app.tasks.celery_app beat --loglevel=info
```

API docs available at: **http://localhost:8000/docs**

---

## Happy Path Test Sequence

### Test 1: Health Check

```bash
curl http://localhost:8000/api/health
```

Expected:
```json
{"status": "ok", "service": "nexus-exchange", "env": "development"}
```

---

### Test 2: Admin Login

```bash
curl -X POST http://localhost:8000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@nexus.com", "password": "Admin123!"}'
```

Expected: Returns `admin` object + `access_token`. Save the token:
```bash
set ADMIN_TOKEN=<paste_access_token_here>
```

---

### Test 3: Create a Signup Bonus Campaign (Admin)

```bash
curl -X POST http://localhost:8000/api/admin/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer %ADMIN_TOKEN%" \
  -d '{
    "name": "Welcome Bonus $5",
    "description": "Get $5 USDT when you register",
    "campaign_type": "signup_bonus",
    "start_date": "2026-01-01T00:00:00",
    "end_date": "2026-12-31T23:59:59",
    "target_segment": "all",
    "reward_amount": "5.00",
    "reward_asset": "USDT",
    "percent_based": false,
    "max_per_user": "5.00",
    "total_budget": "10000",
    "auto_apply": true,
    "one_time_only": true
  }'
```

Expected: Returns campaign with `status: "draft"`. Save the `id`.

---

### Test 4: Activate the Campaign (Admin)

```bash
curl -X PATCH http://localhost:8000/api/admin/campaigns/<campaign_id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer %ADMIN_TOKEN%" \
  -d '{"status": "active"}'
```

Expected: Returns campaign with `status: "active"`.

---

### Test 5: Verify Campaign is Visible (Public)

```bash
curl http://localhost:8000/api/campaigns/active
```

Expected: Returns the active campaign in the list.

---

### Test 6: Register a New User

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "username": "testuser",
    "password": "TestPass123!"
  }'
```

Expected: Returns `user` object + `access_token`. Save the token:
```bash
set USER_TOKEN=<paste_access_token_here>
```

At this point, the `user_registered` event has been pushed to Redis.

---

### Test 7: Wait for Celery to Process (5 seconds)

The Celery beat task `process_event_queue` runs every 5 seconds.
Wait ~5-10 seconds, then check the Celery worker terminal for:

```
[REWARD] Campaign=<uuid> User=<uuid> Amount=5.00 USDT Event=user_registered
```

---

### Test 8: Check User Balance (THE KEY TEST)

```bash
curl http://localhost:8000/api/balances \
  -H "Authorization: Bearer %USER_TOKEN%"
```

Expected:
```json
{
  "balances": [
    {
      "asset": "USDT",
      "available": "5.000000000000000000",
      "locked": "0"
    }
  ]
}
```

**The user now has a REAL $5 USDT balance from the signup bonus campaign.**

---

### Test 9: Verify via Ledger History

```bash
curl "http://localhost:8000/api/ledger/history" \
  -H "Authorization: Bearer %USER_TOKEN%"
```

Expected:
```json
{
  "entries": [
    {
      "id": 1,
      "tx_id": "<uuid>",
      "asset": "USDT",
      "entry_type": "credit",
      "amount": "5.000000000000000000",
      "balance_after": "5.000000000000000000",
      "category": "campaign_reward",
      "reference_type": "campaign",
      "reference_id": "<campaign_uuid>",
      "description": "Campaign reward: Welcome Bonus $5",
      "created_at": "2026-02-10T..."
    }
  ],
  "total": 1
}
```

---

### Test 10: Check Campaign Stats (Admin)

```bash
curl http://localhost:8000/api/admin/campaigns \
  -H "Authorization: Bearer %ADMIN_TOKEN%"
```

Expected: The campaign now shows:
- `participant_count: 1`
- `claimed_count: 1`
- `spent_budget: "5.000000000000000000"`

---

### Test 11: Admin Manual Credit

```bash
curl -X POST http://localhost:8000/api/admin/users/<user_id>/credit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer %ADMIN_TOKEN%" \
  -d '{
    "asset": "USDT",
    "amount": "100.00",
    "reason": "Test credit for verification"
  }'
```

Expected: `{"ok": true, "amount": "100.00", "asset": "USDT"}`

---

### Test 12: Verify Updated Balance

```bash
curl http://localhost:8000/api/balances \
  -H "Authorization: Bearer %USER_TOKEN%"
```

Expected:
```json
{
  "balances": [
    {
      "asset": "USDT",
      "available": "105.000000000000000000",
      "locked": "0"
    }
  ]
}
```

$5 (signup bonus) + $100 (admin credit) = $105 total.

---

### Test 13: Verify Audit Trail (Admin)

```bash
curl "http://localhost:8000/api/admin/logs?action=admin_credit" \
  -H "Authorization: Bearer %ADMIN_TOKEN%"
```

Expected: Shows the admin credit action with admin_id, user_id, amount, reason, IP.

---

### Test 14: Idempotency Verification

Register the same email again:
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "username": "testuser2",
    "password": "TestPass123!"
  }'
```

Expected: `400 — "Email already registered"` (no duplicate user, no duplicate reward).

---

## What This Proves

| # | Claim | Verified By |
|---|-------|-------------|
| 1 | Tables are created correctly | Seed script succeeds |
| 2 | Admin auth works (separate JWT) | Test 2 |
| 3 | Campaign CRUD works | Tests 3-4 |
| 4 | Public campaign visibility | Test 5 |
| 5 | User registration creates account | Test 6 |
| 6 | Events flow through Redis → Celery | Test 7 |
| 7 | **Campaign rewards credit real balances** | **Test 8** |
| 8 | Ledger entries are immutable and traceable | Test 9 |
| 9 | Campaign stats update correctly | Test 10 |
| 10 | Admin credit creates ledger entry | Tests 11-12 |
| 11 | Audit trail captures admin actions | Test 13 |
| 12 | Duplicate prevention works | Test 14 |
