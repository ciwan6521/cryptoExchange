# Step 1 — Backend Design Validation

## 1. Architecture Overview

### 1.1 Core Services & Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                       │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Auth        │  │ Market       │  │ CMS               │  │
│  │ Service     │  │ Service      │  │ Service            │  │
│  │             │  │              │  │                    │  │
│  │ • Register  │  │ • Pairs      │  │ • Active content   │  │
│  │ • Login     │  │ • Tickers    │  │ • CRUD (admin)     │  │
│  │ • JWT       │  │ • Orderbook  │  │                    │  │
│  │ • Sessions  │  │ • Flags      │  │                    │  │
│  └──────┬──────┘  └──────────────┘  └───────────────────┘  │
│         │                                                   │
│  ┌──────┴──────────────────────────────────────────────┐    │
│  │              LEDGER SERVICE (Central)                │    │
│  │                                                     │    │
│  │  • credit()        — add to available               │    │
│  │  • debit()         — subtract from available        │    │
│  │  • lock_funds()    — available → locked (orders)    │    │
│  │  • unlock_funds()  — locked → available (cancel)    │    │
│  │  • fill_from_locked() — consume locked (fill)       │    │
│  │  • get_balances()  — read accounts                  │    │
│  │  • get_history()   — read ledger entries            │    │
│  │                                                     │    │
│  │  ALL methods: atomic, idempotent, auditable         │    │
│  │  ALL methods: SELECT FOR UPDATE on account row      │    │
│  └──────┬──────────────────────────────────────────────┘    │
│         │                                                   │
│  ┌──────┴──────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Admin       │  │ Trading      │  │ Wallet             │  │
│  │ Service     │  │ Service      │  │ Service            │  │
│  │             │  │              │  │                    │  │
│  │ • Users     │  │ • Orders     │  │ • Deposits         │  │
│  │ • Credit    │  │ • Matching   │  │ • Withdrawals      │  │
│  │ • Debit     │  │ • Fills      │  │ • (Blockchain:     │  │
│  │ • Flags     │  │ • Fees       │  │    Phase 2)        │  │
│  │ • Audit     │  │              │  │                    │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              EVENT BUS (Redis)                        │   │
│  │  Publishes: user_registered, deposit_completed,       │   │
│  │             trade_executed                             │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              CELERY WORKER (Background)                      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              REWARD ENGINE                            │   │
│  │                                                      │   │
│  │  1. Drain event queue (every 5s via beat)            │   │
│  │  2. Find matching active campaigns                   │   │
│  │  3. Check eligibility (segment, one-time, budget)    │   │
│  │  4. Calculate reward                                 │   │
│  │  5. Distribute via LedgerService.credit()            │   │
│  │  6. Record CampaignClaim                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 How Services Interact

**Auth → Ledger:**
Registration creates a default USDT `Account` row. Auth publishes `user_registered` event.

**Auth → EventBus → Celery → RewardEngine → Ledger:**
After registration, event bus pushes to Redis queue. Celery worker drains queue, RewardEngine evaluates signup_bonus campaigns, calls `LedgerService.credit()` to add reward.

**Admin → Ledger:**
Admin credit/debit goes directly through `LedgerService.credit()` / `LedgerService.debit()` with audit log.

**Trading → Ledger:**
Order placement calls `lock_funds()`. Fill calls `fill_from_locked()` + `credit()`. Cancel calls `unlock_funds()`. Trade publishes `trade_executed` event for cashback campaigns.

**Wallet → Ledger → EventBus:**
Deposit completion calls `LedgerService.credit()` and publishes `deposit_completed` event.

**Key rule: No service writes to `accounts.available` or `accounts.locked` directly. ALL mutations go through LedgerService.**

---

## 2. Database Schema (ERD)

### 2.1 Table Overview

```
users ──────────────┬── user_sessions
  │                 │
  ├── accounts ─────┤── ledger_entries
  │                 │      │
  │                 │      └── balance_snapshots
  │                 │
  ├── orders ───────┤── trades
  │                 │
  ├── campaign_claims
  │       │
  │       └── campaigns ── admin_users
  │                            │
  ├── wallets                  ├── cms_content
  ├── deposits                 ├── system_flags
  └── withdrawals              └── audit_logs
```

### 2.2 Tables, Key Fields, Relations

#### `users`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| email | VARCHAR(255) UNIQUE | Indexed |
| username | VARCHAR(50) UNIQUE | Indexed |
| password_hash | VARCHAR(255) | bcrypt |
| is_active | BOOLEAN | Admin can disable |
| trading_enabled | BOOLEAN | Per-user kill switch |
| withdrawals_enabled | BOOLEAN | Per-user kill switch |
| kyc_status | VARCHAR(20) | none/pending/approved/rejected |
| member_tier | VARCHAR(20) | standard/vip1/vip2/vip3 |
| totp_enabled | BOOLEAN | 2FA flag |

**Relations:** → accounts (1:N), → user_sessions (1:N), → orders (1:N)

#### `accounts`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| asset | VARCHAR(20) | e.g. "USDT", "BTC" |
| available | DECIMAL(36,18) | Cached sum, CHECK >= 0 |
| locked | DECIMAL(36,18) | In open orders, CHECK >= 0 |

**Constraints:** UNIQUE(user_id, asset), CHECK(available >= 0), CHECK(locked >= 0)
**Relations:** → ledger_entries (1:N)

#### `ledger_entries` ⭐ (Core — immutable)
| Field | Type | Notes |
|-------|------|-------|
| id | BIGSERIAL PK | Auto-increment for ordering |
| tx_id | UUID | Groups related entries |
| idempotency_key | VARCHAR(255) UNIQUE | **Prevents duplicate processing** |
| account_id | UUID FK → accounts | |
| user_id | UUID FK → users | Denormalized for query speed |
| asset | VARCHAR(20) | Denormalized |
| entry_type | VARCHAR(10) | "credit" or "debit" |
| amount | DECIMAL(36,18) | CHECK > 0 |
| balance_after | DECIMAL(36,18) | Snapshot for audit |
| category | VARCHAR(30) | deposit, withdrawal, trade_buy, trade_sell, fee, campaign_reward, admin_credit, admin_debit, order_lock, order_unlock, order_fill |
| reference_type | VARCHAR(30) | order, trade, deposit, withdrawal, campaign, admin_action |
| reference_id | UUID | FK to source entity |
| description | TEXT | Human-readable |
| created_at | TIMESTAMPTZ | Immutable |

#### `campaigns`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| campaign_type | VARCHAR(30) | signup_bonus, deposit_bonus, trading_cashback, referral_bonus, fee_discount, volume_reward |
| status | VARCHAR(15) | draft/active/paused/ended |
| reward_amount | DECIMAL(36,18) | Fixed amount or percentage |
| percent_based | BOOLEAN | If true, reward_amount is a % |
| max_per_user | DECIMAL(36,18) | Cap per user |
| min_requirement | DECIMAL(36,18) | Min deposit/trade to qualify |
| total_budget | DECIMAL(36,18) | Total budget pool |
| spent_budget | DECIMAL(36,18) | Running total spent |
| daily_cap | DECIMAL(36,18) | Max daily distribution |
| one_time_only | BOOLEAN | One claim per user |
| auto_apply | BOOLEAN | Auto-distribute vs manual claim |
| applicable_pairs | TEXT[] | NULL = all pairs |
| target_segment | VARCHAR(20) | all/new_users/verified/vip/inactive |

#### `campaign_claims`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| campaign_id | UUID FK → campaigns | |
| user_id | UUID FK → users | |
| status | VARCHAR(15) | pending/eligible/claimed/rejected/expired |
| trigger_event | VARCHAR(30) | user_registered/deposit_completed/trade_executed |
| trigger_ref_id | UUID | Points to deposit/trade/user that triggered it |
| reward_amount | DECIMAL(36,18) | Actual reward given |
| ledger_tx_id | UUID | Points to ledger_entries.tx_id |
| idempotency_key | VARCHAR(255) UNIQUE | **Prevents double claim** |

**Constraints:** UNIQUE(campaign_id, user_id, trigger_ref_id)

#### `trading_pairs`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| symbol | VARCHAR(20) UNIQUE | "BTC-USDT" |
| price_precision, quantity_precision | INT | Display decimals |
| tick_size, step_size | DECIMAL | Min increments |
| min_order_size, max_order_size | DECIMAL | Order limits |
| maker_fee, taker_fee | DECIMAL(10,6) | Fee rates |
| is_enabled | BOOLEAN | Admin kill switch |

#### `orders`, `trades`, `deposits`, `withdrawals`, `wallets`
Standard exchange tables. All balance-affecting operations go through LedgerService.

#### `admin_users`, `audit_logs`, `cms_content`, `system_flags`
Admin infrastructure. Separate auth. Every admin action creates an audit_log entry.

### 2.3 Indexing Strategy

**ledger_entries (highest volume table):**
```
idx_ledger_account    — (account_id)           — balance queries
idx_ledger_tx         — (tx_id)                — transaction grouping
idx_ledger_user_asset — (user_id, asset)       — user history
idx_ledger_category   — (category)             — type filtering
idx_ledger_reference  — (reference_type, reference_id) — trace source
idx_ledger_created    — (created_at)           — time-range queries
UNIQUE                — (idempotency_key)      — duplicate prevention
```

**trades:**
```
idx on symbol          — pair filtering
idx on maker_user_id   — user trade history
idx on taker_user_id   — user trade history
```

**orders:**
```
idx on user_id         — user's orders
idx on symbol          — pair filtering
idx on status          — open order queries
```

**campaign_claims:**
```
idx on campaign_id     — campaign stats
idx on user_id         — user's claims
UNIQUE on idempotency_key — duplicate prevention
UNIQUE on (campaign_id, user_id, trigger_ref_id) — composite uniqueness
```

---

## 3. Critical Flows — Step by Step

### 3.1 User Signup → Signup Bonus

```
TRIGGER: User calls POST /api/auth/register

STEP 1 — API Handler (app/api/auth.py:register)
  Tables touched: users (INSERT), accounts (INSERT), user_sessions (INSERT)
  • Validate email/username uniqueness
  • Create User row
  • Create Account row (user_id, asset="USDT", available=0, locked=0)
  • Create UserSession with refresh token
  • COMMIT

STEP 2 — Event Publication (app/api/auth.py:68-71)
  • EventBus.publish_user_registered(user_id, email)
  • Redis: LPUSH "crypto4pro:event_queue" {type: "user_registered", user_id, data: {email}}
  • Non-blocking: if Redis is down, registration still succeeds

STEP 3 — Celery Worker (app/tasks/campaign_tasks.py:62-86)
  • process_event_queue() runs every 5 seconds (Celery beat)
  • RPOP from "crypto4pro:event_queue"
  • Calls RewardEngine.evaluate(event)

STEP 4 — Campaign Matching (app/services/reward_engine.py:68-78)
  Tables touched: campaigns (SELECT)
  • Query: WHERE status='active' AND campaign_type IN ('signup_bonus')
    AND start_date <= NOW() AND end_date > NOW()

STEP 5 — Eligibility Check (app/services/reward_engine.py:100-174)
  Tables touched: campaign_claims (SELECT), campaign_claims (SELECT for one-time)
  • a) Idempotency: SELECT WHERE idempotency_key = "campaign:{id}:user:{id}:ref:{user_id}"
  • b) One-time: SELECT WHERE campaign_id AND user_id AND status='claimed'
  • c) Segment: check user.created_at for new_users, etc.
  • d) Budget: check spent_budget < total_budget
  • e) Daily cap: SUM(reward_amount) WHERE claimed_at >= today

STEP 6 — Reward Distribution (app/services/reward_engine.py:186-245)
  ALL IN ONE DB TRANSACTION (async with db.begin()):
  Tables touched:
    • ledger_entries (INSERT) — category='campaign_reward'
    • accounts (UPDATE) — available += reward_amount
    • campaign_claims (INSERT) — status='claimed', ledger_tx_id set
    • campaigns (UPDATE) — spent_budget += reward, claimed_count += 1

  Idempotency enforced by:
    • campaign_claims.idempotency_key UNIQUE constraint
    • ledger_entries.idempotency_key UNIQUE constraint (prefixed "ledger:")
    • If either INSERT conflicts → entire operation is a no-op

RESULT: User's USDT account.available increases by reward_amount.
        Verifiable via GET /api/balances and GET /api/ledger/history.
```

### 3.2 Deposit Completed → Deposit Bonus

```
TRIGGER: Deposit confirmed (admin credit or blockchain confirmation)

STEP 1 — Deposit Credit
  • LedgerService.credit(user_id, asset, amount, category="deposit",
      idempotency_key="deposit:{deposit_id}")
  Tables: ledger_entries (INSERT), accounts (UPDATE)

STEP 2 — Event Publication
  • EventBus.publish_deposit_completed(user_id, deposit_id, amount, asset)
  • Redis queue push

STEP 3 — Celery Worker picks up event

STEP 4 — Campaign Matching
  • Query campaigns WHERE campaign_type IN ('deposit_bonus')

STEP 5 — Eligibility Check
  • Same checks as signup, PLUS:
  • Min requirement: event.data.amount >= campaign.min_requirement
    (e.g., "deposit at least $100 to get bonus")
  • Idempotency key: "campaign:{id}:user:{id}:ref:{deposit_id}"
    → Same deposit can never trigger same campaign twice

STEP 6 — Reward Calculation
  • If percent_based: reward = deposit_amount * (reward_amount / 100)
  • Clamped to max_per_user
  • Clamped to remaining budget

STEP 7 — Distribution (atomic, same as 3.1 Step 6)
  • LedgerService.credit(category="campaign_reward")
  • CampaignClaim INSERT
  • Campaign stats UPDATE

RESULT: User gets deposit amount + bonus in their account.
```

### 3.3 Trade Executed → Cashback

```
TRIGGER: Order matched and trade recorded

STEP 1 — Trade Execution (future trading service)
  • Lock funds consumed: LedgerService.fill_from_locked()
  • Counter-party credited: LedgerService.credit()
  • Fee deducted: LedgerService.debit(category="fee")
  Tables: ledger_entries (multiple INSERTs), accounts (multiple UPDATEs), trades (INSERT)

STEP 2 — Event Publication
  • EventBus.publish_trade_executed(user_id, trade_id, symbol, side,
      quantity, quote_quantity, fee, fee_asset)

STEP 3 — Celery Worker picks up event

STEP 4 — Campaign Matching
  • Query campaigns WHERE campaign_type IN ('trading_cashback', 'fee_discount', 'volume_reward')

STEP 5 — Eligibility Check
  • Pair restriction: if campaign.applicable_pairs is set, trade.symbol must be in list
  • Min requirement: quote_quantity >= min_requirement
  • Idempotency key: "campaign:{id}:user:{id}:ref:{trade_id}"
    → Same trade can never trigger same campaign twice

STEP 6 — Reward Calculation
  • trading_cashback (percent_based=true): reward = quote_quantity * (reward_amount / 100)
  • fee_discount: reward = fee * (reward_amount / 100)
  • volume_reward: reward = fixed reward_amount
  • All clamped to max_per_user and remaining budget

STEP 7 — Distribution (atomic)

RESULT: User gets cashback credited to their account after each qualifying trade.
```

### 3.4 Manual Admin Balance Credit

```
TRIGGER: Admin calls POST /api/admin/users/{user_id}/credit
  Body: { asset: "USDT", amount: "100.00", reason: "Customer support compensation" }

STEP 1 — Auth & Permission Check (app/api/deps.py)
  • JWT decoded with ADMIN_JWT_SECRET_KEY
  • Role check: require_admin_role("super_admin", "finance")
  • If role doesn't match → 403 Forbidden

STEP 2 — Validation (app/api/admin/users.py:115-133)
  Tables: users (SELECT)
  • Verify user exists
  • Verify amount > 0

STEP 3 — Ledger Credit (app/api/admin/users.py:135-148)
  Tables: ledger_entries (INSERT), accounts (UPDATE)
  • idempotency_key = "admin_credit:{admin_id}:{user_id}:{asset}:{uuid4()}"
    (UUID4 suffix because admin credits are intentionally non-idempotent —
     each click is a new credit. The key still prevents accidental double-submit
     of the exact same request.)
  • LedgerService.credit(category="admin_credit", reference_type="admin_action")
  • Runs inside db.begin_nested() savepoint

STEP 4 — Audit Log (app/api/admin/users.py:150-158)
  Tables: audit_logs (INSERT)
  • Records: admin_id, action="admin_credit", target user, amount, asset, reason, IP
  • COMMIT

RESULT: User balance increased. Fully traceable via:
  • GET /api/ledger/history?category=admin_credit (user sees it)
  • GET /api/admin/logs?action=admin_credit (admin audit trail)
```

---

## 4. Safety Mechanisms

### 4.1 Double Reward Prevention (3 layers)

**Layer 1 — Application-level idempotency check (RewardEngine):**
```python
# reward_engine.py:111-118
existing = await self.db.execute(
    select(CampaignClaim).where(
        CampaignClaim.idempotency_key == idempotency_key
    )
)
if existing.scalar_one_or_none():
    return None  # Already processed
```
Before any reward logic runs, check if this exact (campaign, user, trigger) combination was already processed.

**Layer 2 — Database UNIQUE constraint (campaign_claims):**
```sql
idempotency_key VARCHAR(255) UNIQUE NOT NULL
-- Also: UNIQUE(campaign_id, user_id, trigger_ref_id)
```
Even if two Celery workers process the same event concurrently, the DB constraint prevents duplicate INSERT. One succeeds, the other gets a constraint violation and the transaction rolls back.

**Layer 3 — Ledger idempotency (ledger_entries):**
```python
# reward_engine.py:204
idempotency_key=f"ledger:{idempotency_key}"
```
The ledger credit itself has its own UNIQUE idempotency_key. Even if the claim record somehow got created without the ledger entry, retrying would not create a duplicate credit.

**Key format guarantees uniqueness:**
```
campaign:{campaign_uuid}:user:{user_uuid}:ref:{trigger_ref_uuid}
```
- Signup: ref = user_id (one signup per user)
- Deposit: ref = deposit_id (one bonus per deposit)
- Trade: ref = trade_id (one cashback per trade)

### 4.2 Race Condition Prevention

**SELECT FOR UPDATE on account rows:**
```python
# ledger_service.py:38-42
result = await self.db.execute(
    select(Account)
    .where(Account.user_id == user_id, Account.asset == asset)
    .with_for_update()  # ← Row-level lock
)
```
When two concurrent requests try to modify the same account:
1. First request acquires the row lock
2. Second request BLOCKS until first commits/rollbacks
3. Second request then sees the updated balance
4. No lost updates, no phantom reads

**Celery worker transaction isolation:**
```python
# campaign_tasks.py:39-40
async with async_session_factory() as db:
    async with db.begin():  # ← Full transaction
        engine = RewardEngine(db)
        await engine.evaluate(event)
```
The entire evaluation + distribution runs in a single DB transaction. If any step fails, everything rolls back.

**CHECK constraints as last resort:**
```sql
CHECK(available >= 0)
CHECK(locked >= 0)
```
Even if application logic has a bug, PostgreSQL will reject any transaction that would make a balance negative.

### 4.3 Admin Mistake Mitigation

**Role-based access control:**
```python
# Only super_admin and finance can credit/debit
admin: AdminUser = Depends(require_admin_role("super_admin", "finance"))
```

**Mandatory reason field:**
```python
class AdminCreditDebitRequest(BaseModel):
    asset: str
    amount: str
    reason: str  # ← Required, cannot be empty
```

**Full audit trail:**
Every admin action creates an `audit_logs` entry with:
- `admin_id` — who did it
- `action` — what they did
- `target_type` + `target_id` — what was affected
- `details` — JSON with all parameters (amount, asset, reason)
- `ip_address` — from where
- `created_at` — when

**Ledger entries are immutable:**
There is no UPDATE or DELETE on `ledger_entries`. To reverse an admin credit, you must create a new admin_debit entry. The original credit remains in the audit trail forever.

**Balance verification (reconciliation):**
```sql
-- This query MUST return 0 rows in a healthy system
SELECT a.id, a.available,
  COALESCE(SUM(
    CASE WHEN le.entry_type = 'credit' THEN le.amount
         ELSE -le.amount END
  ), 0) as ledger_sum
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
GROUP BY a.id, a.available
HAVING a.available != COALESCE(SUM(
    CASE WHEN le.entry_type = 'credit' THEN le.amount
         ELSE -le.amount END
  ), 0);
```
Can be run as a periodic health check. Any mismatch between cached balance and ledger sum = critical alert.

---

## Summary

| Concern | Mechanism | Location |
|---------|-----------|----------|
| No direct balance writes | All through LedgerService | ledger_service.py |
| Duplicate rewards | 3-layer idempotency (app + claim UNIQUE + ledger UNIQUE) | reward_engine.py, campaign_claims, ledger_entries |
| Race conditions | SELECT FOR UPDATE row locks | ledger_service.py:41 |
| Negative balances | CHECK constraints on accounts | ledger.py model |
| Admin abuse | RBAC + mandatory reason + audit log | deps.py, admin/users.py |
| Data integrity | Immutable ledger entries, reconciliation query | ledger_entries table |
| Event loss | Redis list (LPUSH/RPOP) + Celery retry (max 3) | bus.py, campaign_tasks.py |
| Transaction atomicity | Single DB transaction per operation | db.begin() wrapping |
