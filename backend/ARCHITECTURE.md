# Nexus Exchange — Backend Architecture

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│  Dashboard · Trade · Wallet · Rewards · Admin Panel             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + WSS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY (FastAPI)                        │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Auth     │ │ Trading  │ │ Wallet   │ │ Admin            │   │
│  │ Service  │ │ Service  │ │ Service  │ │ Service          │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────────────┘   │
│       │            │            │             │                 │
│  ┌────┴────────────┴────────────┴─────────────┴──────────────┐  │
│  │              LEDGER SERVICE (Core)                         │  │
│  │  Double-entry · Atomic · Idempotent · Auditable           │  │
│  └────┬──────────────────────────────────────────────────────┘  │
│       │                                                         │
│  ┌────┴──────────────────────────────────────────────────────┐  │
│  │              EVENT BUS (Redis Pub/Sub)                     │  │
│  │  user_registered · deposit_completed · trade_executed      │  │
│  │  withdrawal_requested · campaign_evaluated                 │  │
│  └────┬──────────────────────────────────────────────────────┘  │
│       │                                                         │
│  ┌────┴──────────────────────────────────────────────────────┐  │
│  │              CAMPAIGN ENGINE (Celery Worker)               │  │
│  │  Rule evaluation · Reward distribution · Budget tracking   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │PostgreSQL│ │  Redis   │ │ Celery   │
        │  (Data)  │ │ (Cache/  │ │ (Workers)│
        │          │ │  Queue)  │ │          │
        └──────────┘ └──────────┘ └──────────┘
```

---

## 2. Project Structure

```
backend/
├── alembic/                    # Database migrations
│   ├── versions/
│   └── env.py
├── alembic.ini
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Settings (env-based)
│   ├── database.py             # SQLAlchemy engine + session
│   │
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── user.py             # User, UserSession
│   │   ├── ledger.py           # Account, LedgerEntry, BalanceSnapshot
│   │   ├── trading.py          # TradingPair, Order, Trade
│   │   ├── campaign.py         # Campaign, CampaignRule, CampaignClaim
│   │   ├── wallet.py           # Wallet, Deposit, Withdrawal
│   │   ├── cms.py              # CMSContent
│   │   ├── admin.py            # AdminUser, AuditLog
│   │   └── base.py             # Base model with id, timestamps
│   │
│   ├── schemas/                # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── ledger.py
│   │   ├── trading.py
│   │   ├── campaign.py
│   │   ├── wallet.py
│   │   ├── cms.py
│   │   └── admin.py
│   │
│   ├── api/                    # Route handlers
│   │   ├── __init__.py
│   │   ├── deps.py             # Dependency injection (get_db, get_current_user)
│   │   ├── auth.py             # POST /auth/register, /auth/login, /auth/logout, /auth/refresh
│   │   ├── users.py            # GET /users/me, PATCH /users/me
│   │   ├── ledger.py           # GET /balances, GET /ledger/history
│   │   ├── trading.py          # POST /orders, GET /orders, DELETE /orders/:id
│   │   ├── campaigns.py        # GET /campaigns/active, POST /campaigns/:id/claim
│   │   ├── wallet.py           # POST /wallet/deposit, POST /wallet/withdraw, GET /wallet/history
│   │   ├── market.py           # GET /market/tickers, GET /market/orderbook/:pair, WS /ws/market
│   │   └── admin/              # Admin-only routes
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       ├── users.py
│   │       ├── balances.py
│   │       ├── orders.py
│   │       ├── campaigns.py
│   │       ├── cms.py
│   │       ├── flags.py
│   │       ├── markets.py
│   │       ├── wallets.py
│   │       ├── analytics.py
│   │       └── logs.py
│   │
│   ├── services/               # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py     # Registration, login, JWT, 2FA
│   │   ├── ledger_service.py   # THE CORE — all balance mutations
│   │   ├── trading_service.py  # Order matching, execution
│   │   ├── campaign_service.py # Campaign CRUD, rule evaluation
│   │   ├── reward_engine.py    # Event-driven reward distribution
│   │   ├── wallet_service.py   # Deposit/withdrawal processing
│   │   ├── market_service.py   # Price feeds, orderbook aggregation
│   │   ├── cms_service.py      # CMS content management
│   │   └── admin_service.py    # Admin operations, audit logging
│   │
│   ├── events/                 # Event system
│   │   ├── __init__.py
│   │   ├── bus.py              # Redis pub/sub event bus
│   │   ├── types.py            # Event type definitions
│   │   └── handlers.py         # Event → campaign evaluation mapping
│   │
│   ├── tasks/                  # Celery background tasks
│   │   ├── __init__.py
│   │   ├── celery_app.py       # Celery configuration
│   │   ├── campaign_tasks.py   # Evaluate campaigns, distribute rewards
│   │   ├── wallet_tasks.py     # Process deposits/withdrawals
│   │   └── cleanup_tasks.py    # Expired sessions, ended campaigns
│   │
│   ├── middleware/              # FastAPI middleware
│   │   ├── __init__.py
│   │   ├── cors.py
│   │   ├── rate_limit.py
│   │   └── request_id.py
│   │
│   └── utils/                  # Shared utilities
│       ├── __init__.py
│       ├── security.py         # Password hashing, JWT encode/decode
│       ├── decimal_utils.py    # Decimal arithmetic (no floats for money)
│       └── idempotency.py      # Idempotency key management
│
├── tests/
│   ├── conftest.py
│   ├── test_ledger.py
│   ├── test_campaigns.py
│   ├── test_auth.py
│   └── test_trading.py
│
├── requirements.txt
├── docker-compose.yml          # PostgreSQL + Redis + Celery worker
├── Dockerfile
├── .env.example
└── README.md
```

---

## 3. Database Schema (ERD)

### 3.1 Users & Auth

```sql
-- Core user table
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    
    -- Status
    is_active       BOOLEAN DEFAULT TRUE,
    is_verified     BOOLEAN DEFAULT FALSE,
    email_verified  BOOLEAN DEFAULT FALSE,
    kyc_status      VARCHAR(20) DEFAULT 'none',  -- none, pending, approved, rejected
    member_tier     VARCHAR(20) DEFAULT 'standard', -- standard, vip1, vip2, vip3
    
    -- Admin-controlled flags
    trading_enabled     BOOLEAN DEFAULT TRUE,
    withdrawals_enabled BOOLEAN DEFAULT TRUE,
    
    -- 2FA
    totp_secret     VARCHAR(255),
    totp_enabled    BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Session tracking
CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    refresh_token   VARCHAR(512) UNIQUE NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Admin users (separate table, separate auth)
CREATE TABLE admin_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL, -- super_admin, operator, finance, readonly
    is_active       BOOLEAN DEFAULT TRUE,
    totp_secret     VARCHAR(255),
    totp_enabled    BOOLEAN DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Ledger System (Double-Entry)

```sql
-- Internal accounts (one per user per asset)
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(20) NOT NULL,   -- USDT, BTC, ETH, etc.
    
    -- Cached balance (derived from ledger_entries, updated atomically)
    available       DECIMAL(36,18) NOT NULL DEFAULT 0,
    locked          DECIMAL(36,18) NOT NULL DEFAULT 0,  -- in open orders
    
    -- Constraints
    UNIQUE(user_id, asset),
    CHECK(available >= 0),
    CHECK(locked >= 0),
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Every balance mutation is a ledger entry
-- Double-entry: every transaction has a debit AND credit entry
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    
    -- Transaction grouping
    tx_id           UUID NOT NULL,          -- Groups debit+credit pair
    idempotency_key VARCHAR(255) UNIQUE,    -- Prevents duplicate processing
    
    -- Account reference
    account_id      UUID NOT NULL REFERENCES accounts(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(20) NOT NULL,
    
    -- Entry type
    entry_type      VARCHAR(10) NOT NULL,   -- 'debit' or 'credit'
    amount          DECIMAL(36,18) NOT NULL,
    
    -- Balance after this entry (for audit trail)
    balance_after   DECIMAL(36,18) NOT NULL,
    
    -- Classification
    category        VARCHAR(30) NOT NULL,
    -- Categories: deposit, withdrawal, trade_buy, trade_sell, 
    --             fee, campaign_reward, admin_credit, admin_debit,
    --             order_lock, order_unlock, order_fill
    
    -- Reference to source
    reference_type  VARCHAR(30),            -- order, trade, deposit, withdrawal, campaign, admin_action
    reference_id    UUID,
    
    -- Metadata
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK(amount > 0)
);

-- Periodic balance snapshots for reconciliation
CREATE TABLE balance_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(20) NOT NULL,
    available       DECIMAL(36,18) NOT NULL,
    locked          DECIMAL(36,18) NOT NULL,
    snapshot_at     TIMESTAMPTZ DEFAULT NOW(),
    
    -- Sum of all ledger entries up to this point (for verification)
    ledger_sum      DECIMAL(36,18) NOT NULL
);

-- Indexes for ledger performance
CREATE INDEX idx_ledger_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_tx ON ledger_entries(tx_id);
CREATE INDEX idx_ledger_user_asset ON ledger_entries(user_id, asset);
CREATE INDEX idx_ledger_category ON ledger_entries(category);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_type, reference_id);
CREATE INDEX idx_ledger_created ON ledger_entries(created_at);
CREATE INDEX idx_idempotency ON ledger_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

### 3.3 Trading

```sql
-- Trading pair configuration (admin-managed)
CREATE TABLE trading_pairs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol          VARCHAR(20) UNIQUE NOT NULL,  -- 'BTC-USDT'
    base_asset      VARCHAR(10) NOT NULL,          -- 'BTC'
    quote_asset     VARCHAR(10) NOT NULL,          -- 'USDT'
    
    -- Precision
    price_precision     INT NOT NULL DEFAULT 2,
    quantity_precision  INT NOT NULL DEFAULT 6,
    tick_size       DECIMAL(36,18) NOT NULL,
    step_size       DECIMAL(36,18) NOT NULL,
    
    -- Limits
    min_order_size  DECIMAL(36,18) NOT NULL,
    max_order_size  DECIMAL(36,18) NOT NULL,
    min_notional    DECIMAL(36,18) NOT NULL DEFAULT 10,
    
    -- Fees
    maker_fee       DECIMAL(10,6) NOT NULL DEFAULT 0.001,  -- 0.1%
    taker_fee       DECIMAL(10,6) NOT NULL DEFAULT 0.001,
    
    -- Status
    is_enabled      BOOLEAN DEFAULT TRUE,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    pair_id         UUID NOT NULL REFERENCES trading_pairs(id),
    symbol          VARCHAR(20) NOT NULL,
    
    side            VARCHAR(4) NOT NULL,    -- 'buy' or 'sell'
    order_type      VARCHAR(15) NOT NULL,   -- 'limit', 'market', 'stop_limit'
    status          VARCHAR(15) NOT NULL DEFAULT 'open',
    -- Status: open, partially_filled, filled, cancelled, expired
    
    price           DECIMAL(36,18),         -- NULL for market orders
    stop_price      DECIMAL(36,18),         -- For stop-limit
    quantity        DECIMAL(36,18) NOT NULL,
    filled_quantity DECIMAL(36,18) NOT NULL DEFAULT 0,
    remaining       DECIMAL(36,18) NOT NULL,
    
    -- Fee tracking
    fee_asset       VARCHAR(10),
    fee_total       DECIMAL(36,18) NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    filled_at       TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ
);

-- Trades (matched orders)
CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pair_id         UUID NOT NULL REFERENCES trading_pairs(id),
    symbol          VARCHAR(20) NOT NULL,
    
    -- Maker/Taker
    maker_order_id  UUID NOT NULL REFERENCES orders(id),
    taker_order_id  UUID NOT NULL REFERENCES orders(id),
    maker_user_id   UUID NOT NULL REFERENCES users(id),
    taker_user_id   UUID NOT NULL REFERENCES users(id),
    
    side            VARCHAR(4) NOT NULL,    -- Taker's side
    price           DECIMAL(36,18) NOT NULL,
    quantity        DECIMAL(36,18) NOT NULL,
    quote_quantity  DECIMAL(36,18) NOT NULL, -- price * quantity
    
    -- Fees
    maker_fee       DECIMAL(36,18) NOT NULL DEFAULT 0,
    taker_fee       DECIMAL(36,18) NOT NULL DEFAULT 0,
    
    executed_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 Campaign & Rewards

```sql
-- Campaign definitions
CREATE TABLE campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    campaign_type   VARCHAR(30) NOT NULL,
    -- Types: signup_bonus, deposit_bonus, trading_cashback, 
    --        referral_bonus, fee_discount, volume_reward
    
    status          VARCHAR(15) NOT NULL DEFAULT 'draft',
    -- Status: draft, active, paused, ended
    
    -- Schedule
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ NOT NULL,
    
    -- Targeting
    target_segment  VARCHAR(20) NOT NULL DEFAULT 'all',
    
    -- Reward config
    reward_amount   DECIMAL(36,18) NOT NULL,
    reward_asset    VARCHAR(10) NOT NULL DEFAULT 'USDT',
    percent_based   BOOLEAN DEFAULT FALSE,
    max_per_user    DECIMAL(36,18) DEFAULT 0,
    min_requirement DECIMAL(36,18) DEFAULT 0,
    
    -- Budget
    total_budget    DECIMAL(36,18) NOT NULL DEFAULT 0,
    spent_budget    DECIMAL(36,18) NOT NULL DEFAULT 0,
    
    -- Rules
    applicable_pairs TEXT[],                -- NULL = all pairs
    daily_cap       DECIMAL(36,18) DEFAULT 0,
    total_cap       DECIMAL(36,18) DEFAULT 0,
    auto_apply      BOOLEAN DEFAULT TRUE,
    one_time_only   BOOLEAN DEFAULT TRUE,
    
    -- Stats
    participant_count INT NOT NULL DEFAULT 0,
    claimed_count     INT NOT NULL DEFAULT 0,
    
    -- Admin
    created_by      UUID REFERENCES admin_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user campaign state
CREATE TABLE campaign_claims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    
    status          VARCHAR(15) NOT NULL DEFAULT 'pending',
    -- Status: pending, eligible, claimed, rejected, expired
    
    -- What triggered eligibility
    trigger_event   VARCHAR(30) NOT NULL,
    trigger_ref_id  UUID,                   -- Reference to deposit/trade/etc.
    
    -- Reward details
    reward_amount   DECIMAL(36,18) NOT NULL,
    reward_asset    VARCHAR(10) NOT NULL,
    
    -- Ledger reference (when claimed)
    ledger_tx_id    UUID,                   -- Points to ledger_entries.tx_id
    
    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    
    claimed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(campaign_id, user_id, trigger_ref_id)
);
```

### 3.5 Wallet (Blockchain-Ready)

```sql
-- User wallet addresses (feature-flagged, for future blockchain integration)
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(10) NOT NULL,
    network         VARCHAR(20) NOT NULL,   -- 'TRC20', 'ERC20', etc.
    address         VARCHAR(255),           -- Blockchain address (NULL until generated)
    
    is_active       BOOLEAN DEFAULT TRUE,
    
    UNIQUE(user_id, asset, network),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Deposit records
CREATE TABLE deposits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(10) NOT NULL,
    network         VARCHAR(20),
    
    amount          DECIMAL(36,18) NOT NULL,
    
    -- Blockchain data (NULL for admin credits)
    tx_hash         VARCHAR(255),
    from_address    VARCHAR(255),
    confirmations   INT DEFAULT 0,
    required_confirmations INT DEFAULT 1,
    
    status          VARCHAR(15) NOT NULL DEFAULT 'pending',
    -- Status: pending, confirming, completed, failed
    
    -- Ledger reference
    ledger_tx_id    UUID,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Withdrawal records
CREATE TABLE withdrawals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(10) NOT NULL,
    network         VARCHAR(20),
    
    amount          DECIMAL(36,18) NOT NULL,
    fee             DECIMAL(36,18) NOT NULL DEFAULT 0,
    
    -- Destination
    to_address      VARCHAR(255) NOT NULL,
    
    -- Blockchain data
    tx_hash         VARCHAR(255),
    
    status          VARCHAR(15) NOT NULL DEFAULT 'pending',
    -- Status: pending, approved, processing, completed, rejected, failed
    
    -- Admin approval
    reviewed_by     UUID REFERENCES admin_users(id),
    reviewed_at     TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Ledger reference
    ledger_tx_id    UUID,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.6 CMS & System

```sql
-- CMS content
CREATE TABLE cms_content (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type    VARCHAR(20) NOT NULL,   -- announcement, banner, popup, maintenance
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    priority        VARCHAR(10) NOT NULL DEFAULT 'medium',
    is_active       BOOLEAN DEFAULT TRUE,
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ,
    created_by      UUID REFERENCES admin_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- System flags (singleton-ish, one row per flag)
CREATE TABLE system_flags (
    key             VARCHAR(50) PRIMARY KEY,
    value           BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by      UUID REFERENCES admin_users(id),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Keys: trading_enabled, new_orders_enabled, deposits_enabled, 
--        withdrawals_enabled, maintenance_mode, registration_enabled

-- Audit log
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        UUID REFERENCES admin_users(id),
    action          VARCHAR(50) NOT NULL,
    target_type     VARCHAR(30),
    target_id       UUID,
    details         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_admin ON audit_logs(admin_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

---

## 4. API Contracts

### 4.1 Auth

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| POST | `/api/auth/register` | `{email, username, password}` | `{user, access_token}` | No |
| POST | `/api/auth/login` | `{email, password, totp_code?}` | `{user, access_token}` | No |
| POST | `/api/auth/logout` | — | `{ok}` | Yes |
| POST | `/api/auth/refresh` | — (httpOnly cookie) | `{access_token}` | Cookie |
| GET | `/api/auth/me` | — | `{user}` | Yes |

### 4.2 Balances & Ledger

| Method | Endpoint | Response | Auth |
|--------|----------|----------|------|
| GET | `/api/balances` | `{balances: [{asset, available, locked}]}` | Yes |
| GET | `/api/balances/:asset` | `{asset, available, locked}` | Yes |
| GET | `/api/ledger/history` | `{entries: [{id, tx_id, asset, entry_type, amount, category, ...}]}` | Yes |
| GET | `/api/ledger/history?asset=USDT&category=campaign_reward` | Filtered | Yes |

### 4.3 Trading

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| POST | `/api/orders` | `{symbol, side, type, price?, quantity, stop_price?}` | `{order}` | Yes |
| GET | `/api/orders` | — | `{orders: [...]}` | Yes |
| GET | `/api/orders/:id` | — | `{order}` | Yes |
| DELETE | `/api/orders/:id` | — | `{ok}` | Yes |
| GET | `/api/trades` | — | `{trades: [...]}` | Yes |

### 4.4 Market Data

| Method | Endpoint | Response | Auth |
|--------|----------|----------|------|
| GET | `/api/market/pairs` | `{pairs: [{symbol, base, quote, ...config}]}` | No |
| GET | `/api/market/tickers` | `{tickers: [{symbol, price, change24h, volume24h}]}` | No |
| GET | `/api/market/orderbook/:symbol` | `{bids: [...], asks: [...]}` | No |
| GET | `/api/market/trades/:symbol` | `{trades: [...]}` | No |
| WS | `/ws/market` | Real-time tickers, orderbook, trades | No |

### 4.5 Campaigns & Rewards

| Method | Endpoint | Response | Auth |
|--------|----------|----------|------|
| GET | `/api/campaigns/active` | `{campaigns: [...]}` | No |
| GET | `/api/campaigns/my-claims` | `{claims: [{campaign_id, status, reward_amount, ...}]}` | Yes |
| POST | `/api/campaigns/:id/claim` | `{claim}` | Yes |

### 4.6 Wallet

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| GET | `/api/wallet/addresses` | — | `{addresses: [{asset, network, address}]}` | Yes |
| POST | `/api/wallet/deposit` | `{asset, network, amount}` | `{deposit}` | Yes |
| POST | `/api/wallet/withdraw` | `{asset, network, amount, address}` | `{withdrawal}` | Yes |
| GET | `/api/wallet/deposits` | — | `{deposits: [...]}` | Yes |
| GET | `/api/wallet/withdrawals` | — | `{withdrawals: [...]}` | Yes |

### 4.7 CMS

| Method | Endpoint | Response | Auth |
|--------|----------|----------|------|
| GET | `/api/cms/active` | `{content: [{type, title, body, priority}]}` | No |

### 4.8 Admin (all require admin JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/auth/login` | Admin login |
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/:id` | Update user flags |
| POST | `/api/admin/users/:id/credit` | Manual balance credit |
| POST | `/api/admin/users/:id/debit` | Manual balance debit |
| GET/POST/PATCH/DELETE | `/api/admin/campaigns/*` | Campaign CRUD |
| GET/POST/PATCH/DELETE | `/api/admin/cms/*` | CMS CRUD |
| GET/PATCH | `/api/admin/flags` | System flags |
| GET/PATCH | `/api/admin/markets/*` | Trading pair config |
| GET | `/api/admin/orders` | All orders |
| DELETE | `/api/admin/orders/:id` | Force cancel |
| GET/PATCH | `/api/admin/withdrawals` | Approve/reject |
| GET | `/api/admin/audit-logs` | Audit trail |
| GET | `/api/admin/analytics/*` | Reports |

---

## 5. Campaign Evaluation Flow

```
Step-by-step flow for automatic campaign reward distribution:

1. EVENT OCCURS
   ┌─────────────────────────────────────────────┐
   │ User registers / deposits / trades           │
   │ The API endpoint (e.g. POST /auth/register)  │
   │ publishes an event to Redis:                 │
   │                                              │
   │   event = {                                  │
   │     type: "user_registered",                 │
   │     user_id: "uuid",                         │
   │     timestamp: "2026-02-10T...",             │
   │     data: { email, ... }                     │
   │   }                                          │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
2. EVENT BUS DISPATCHES
   ┌─────────────────────────────────────────────┐
   │ Redis pub/sub receives the event.            │
   │ Celery worker picks it up.                   │
   │                                              │
   │ The worker calls:                            │
   │   reward_engine.evaluate(event)              │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
3. FIND MATCHING CAMPAIGNS
   ┌─────────────────────────────────────────────┐
   │ Query: SELECT * FROM campaigns               │
   │   WHERE status = 'active'                    │
   │   AND campaign_type matches event type       │
   │   AND start_date <= NOW()                    │
   │   AND end_date > NOW()                       │
   │   AND spent_budget < total_budget            │
   │                                              │
   │ Event type mapping:                          │
   │   user_registered  → signup_bonus            │
   │   deposit_completed → deposit_bonus          │
   │   trade_executed   → trading_cashback,       │
   │                      fee_discount,           │
   │                      volume_reward           │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
4. CHECK ELIGIBILITY (per campaign)
   ┌─────────────────────────────────────────────┐
   │ For each matching campaign:                  │
   │                                              │
   │ a) Target segment check                      │
   │    - all → pass                              │
   │    - new_users → user.created_at > 30d ago   │
   │    - verified → user.kyc_status = approved   │
   │    - vip → user.member_tier in [vip1..3]     │
   │                                              │
   │ b) One-time check                            │
   │    - If one_time_only: check campaign_claims │
   │      for existing claim by this user         │
   │                                              │
   │ c) Min requirement check                     │
   │    - deposit_bonus: deposit.amount >= min     │
   │    - volume_reward: user 24h volume >= min    │
   │                                              │
   │ d) Pair restriction check                    │
   │    - If applicable_pairs set, verify trade   │
   │      pair is in the list                     │
   │                                              │
   │ e) Daily cap check                           │
   │    - Sum today's claims for this campaign    │
   │    - If >= daily_cap, skip                   │
   │                                              │
   │ f) Budget check                              │
   │    - If spent_budget + reward > total_budget │
   │      skip (insufficient budget)              │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
5. CALCULATE REWARD
   ┌─────────────────────────────────────────────┐
   │ If percent_based:                            │
   │   reward = event.amount * (reward_amount/100)│
   │   reward = min(reward, max_per_user)         │
   │ Else:                                        │
   │   reward = reward_amount                     │
   │                                              │
   │ Clamp to remaining budget:                   │
   │   reward = min(reward, budget - spent)       │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
6. CREATE CLAIM + DISTRIBUTE (ATOMIC)
   ┌─────────────────────────────────────────────┐
   │ Inside a single DB transaction:              │
   │                                              │
   │ a) Generate idempotency_key:                 │
   │    f"campaign:{campaign_id}:user:{user_id}   │
   │     :ref:{trigger_ref_id}"                   │
   │                                              │
   │ b) INSERT campaign_claims (                  │
   │      status='claimed',                       │
   │      idempotency_key=...,                    │
   │      reward_amount=...,                      │
   │    )                                         │
   │    ON CONFLICT (idempotency_key) DO NOTHING  │
   │    → If conflict, this is a duplicate. STOP. │
   │                                              │
   │ c) Call ledger_service.credit(               │
   │      user_id, asset, amount,                 │
   │      category='campaign_reward',             │
   │      reference_type='campaign',              │
   │      reference_id=campaign_id,               │
   │      idempotency_key=...                     │
   │    )                                         │
   │                                              │
   │ d) UPDATE campaigns SET                      │
   │      spent_budget = spent_budget + reward,   │
   │      claimed_count = claimed_count + 1       │
   │                                              │
   │ e) COMMIT                                    │
   │                                              │
   │ If any step fails → ROLLBACK entire tx       │
   └─────────────────────────────────────────────┘
```

---

## 6. Ledger Safety Guarantees

### 6.1 No Direct Balance Overwrites
```
WRONG:  UPDATE accounts SET available = 100 WHERE ...
RIGHT:  INSERT INTO ledger_entries (...) + UPDATE accounts SET available = available + amount
```
The `accounts.available` field is a **cached sum** — it's always updated atomically alongside the ledger entry in the same transaction.

### 6.2 Idempotency
Every ledger operation requires an `idempotency_key`:
```python
# Example: campaign reward
key = f"campaign_reward:{campaign_id}:{user_id}:{trigger_ref_id}"

# Example: deposit credit
key = f"deposit:{deposit_id}"

# Example: trade fill
key = f"trade:{trade_id}:maker" or f"trade:{trade_id}:taker"
```
The `UNIQUE` constraint on `ledger_entries.idempotency_key` prevents any duplicate processing at the database level.

### 6.3 Atomicity (PostgreSQL Transaction)
```python
async def credit(self, user_id, asset, amount, category, idempotency_key, ...):
    async with self.db.begin():  # Single transaction
        # 1. Check idempotency
        existing = await self.db.execute(
            select(LedgerEntry).where(LedgerEntry.idempotency_key == idempotency_key)
        )
        if existing.scalar():
            return None  # Already processed
        
        # 2. Lock account row (SELECT FOR UPDATE — prevents race conditions)
        account = await self.db.execute(
            select(Account)
            .where(Account.user_id == user_id, Account.asset == asset)
            .with_for_update()
        )
        
        # 3. Create ledger entry
        new_balance = account.available + amount
        entry = LedgerEntry(
            tx_id=uuid4(),
            account_id=account.id,
            entry_type='credit',
            amount=amount,
            balance_after=new_balance,
            category=category,
            idempotency_key=idempotency_key,
        )
        
        # 4. Update cached balance
        account.available = new_balance
        
        # 5. Both committed atomically or both rolled back
```

### 6.4 Double-Entry Enforcement
For transfers (e.g., trade execution):
```
Trade: User A buys 1 BTC from User B at $50,000

Ledger entries (all in one tx_id):
  1. DEBIT   User A  USDT  50,000  (available -= 50000)
  2. CREDIT  User A  BTC   1       (available += 1)
  3. DEBIT   User B  BTC   1       (available -= 1)
  4. CREDIT  User B  USDT  50,000  (available += 50000)
  5. DEBIT   User A  USDT  50      (fee)
  6. CREDIT  SYSTEM  USDT  50      (platform fee revenue)
```

### 6.5 Race Condition Prevention
- `SELECT ... FOR UPDATE` locks the account row during a transaction
- No two concurrent transactions can modify the same account simultaneously
- PostgreSQL serializable isolation for critical paths

### 6.6 Reconciliation
Periodic background task verifies:
```sql
-- For every account, the cached balance must equal the sum of ledger entries
SELECT a.id, a.available,
       COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE -le.amount END), 0) as ledger_sum
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
GROUP BY a.id
HAVING a.available != ledger_sum;
-- This query MUST return 0 rows. Any mismatch = critical alert.
```

---

## 7. Service Dependencies

```
auth_service        → database, security utils, event bus
ledger_service      → database (THE authority for all balance changes)
trading_service     → ledger_service, market_service, event bus
campaign_service    → database, ledger_service
reward_engine       → campaign_service, ledger_service (Celery worker)
wallet_service      → ledger_service, event bus, [future: blockchain provider]
market_service      → database, Redis cache, [future: external price feeds]
admin_service       → all services, audit logging
```

**Critical rule:** No service may modify `accounts.available` or `accounts.locked` directly. ALL mutations go through `ledger_service`.
