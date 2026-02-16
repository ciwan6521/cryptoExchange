# Production Hardening Report — Nexus Exchange

**Date:** 2026-02-15
**Scope:** Final infrastructure hardening before real-money operations
**Stack:** FastAPI + PostgreSQL + Redis + Celery (unchanged)

---

## PHASE 1 — WITHDRAWAL SAFETY LAYER

### 1. Withdrawal Queue System

**Risk prevented:** Without a queue, a withdrawal request could immediately deduct funds. If the blockchain tx fails, the user's balance is gone with no recovery path.

**Implementation:**
- **State machine** with explicit transitions: `pending_lock → pending_approval → approved → processing → completed`
- Terminal states: `rejected`, `cancelled`, `failed` — all return locked funds
- **Funds are LOCKED, not deducted** on request (`LedgerService.lock_funds()`)
- Settlement (`fill_from_locked()`) only occurs after admin approval
- Every state transition validated by `Withdrawal.can_transition_to()`
- `SELECT FOR UPDATE` on withdrawal row prevents concurrent approval race

**DB Schema Changes:**
```sql
-- Withdrawal table changes
ALTER TABLE withdrawals ALTER COLUMN status TYPE VARCHAR(20);
ALTER TABLE withdrawals ALTER COLUMN status SET DEFAULT 'pending_lock';
ALTER TABLE withdrawals ADD COLUMN requires_multi_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE withdrawals ADD COLUMN approvals_required INTEGER DEFAULT 1;
ALTER TABLE withdrawals ADD COLUMN approvals_received INTEGER DEFAULT 0;
ALTER TABLE withdrawals ADD COLUMN lock_ledger_tx_id UUID;
ALTER TABLE withdrawals ADD COLUMN settle_ledger_tx_id UUID;
ALTER TABLE withdrawals ADD COLUMN request_ip VARCHAR(45);
ALTER TABLE withdrawals ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;

-- New tables
CREATE TABLE withdrawal_approvals (
    id UUID PRIMARY KEY,
    withdrawal_id UUID REFERENCES withdrawals(id) NOT NULL,
    admin_id UUID REFERENCES admin_users(id) NOT NULL,
    action VARCHAR(10) NOT NULL,  -- 'approve' or 'reject'
    comment TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(withdrawal_id, admin_id)
);

CREATE TABLE withdrawal_addresses (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) NOT NULL,
    asset VARCHAR(10) NOT NULL,
    network VARCHAR(20) NOT NULL,
    address VARCHAR(255) NOT NULL,
    label VARCHAR(100),
    is_whitelisted BOOLEAN DEFAULT FALSE,
    first_added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cooldown_until TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(user_id, asset, network, address)
);
```

**How it prevents fund loss:**
```
USER REQUEST → lock_funds(available→locked) → pending_approval
                                                    ↓
                                           ADMIN APPROVES
                                                    ↓
                                         fill_from_locked(locked→gone)
                                                    ↓
                                              COMPLETED

At NO point are funds deducted from available without being locked first.
At NO point are locked funds consumed without admin approval.
```

**Files:** `backend/app/models/wallet.py`, `backend/app/services/withdrawal_service.py`, `backend/app/api/withdrawals.py`

---

### 2. Multi-Admin Approval

**Risk prevented:** A single compromised admin could approve fraudulent withdrawals. Requiring 2 distinct admins for large amounts makes collusion necessary.

**Implementation:**
- Configurable threshold: `WITHDRAWAL_MULTI_APPROVAL_THRESHOLD = 10000` (USDT)
- Withdrawals ≥ threshold get `requires_multi_approval=True, approvals_required=2`
- Each admin approval creates a `WithdrawalApproval` row
- DB `UNIQUE(withdrawal_id, admin_id)` prevents same admin approving twice
- Withdrawal only transitions to `approved` when `approvals_received >= approvals_required`
- Full approval trail stored for audit

**Files:** `backend/app/models/wallet.py` (WithdrawalApproval), `backend/app/services/withdrawal_service.py`, `backend/app/api/admin/withdrawals.py`

---

### 3. Withdrawal Limits

**Risk prevented:** Account takeover leading to rapid, total fund drainage.

| Limit | Default | Configurable Via |
|---|---|---|
| Per-transaction max | 25,000 USDT | `WITHDRAWAL_PER_TX_MAX_USDT` |
| Daily per-user cap | 50,000 USDT | `WITHDRAWAL_DAILY_LIMIT_USDT` |
| Velocity limit | 3/hour | `WITHDRAWAL_VELOCITY_MAX_PER_HOUR` |
| Address cooldown | 24 hours | `WITHDRAWAL_ADDRESS_COOLDOWN_HOURS` |
| Withdrawal fee | 1 USDT | `WITHDRAWAL_FEE_USDT` |

- **Address cooldown**: New addresses must be pre-registered 24h before use. Prevents attacker from adding their address and immediately withdrawing.
- **Velocity limit**: Max 3 withdrawals per hour per user. Prevents rapid-fire draining.
- **Daily cap**: Accumulated withdrawals (all non-rejected) capped per UTC day.

**Files:** `backend/app/config.py`, `backend/app/services/withdrawal_service.py`, `backend/app/api/withdrawals.py`

---

### 4. Admin Self-Protection

**Risk prevented:** Rogue admin or compromised admin account creating/approving operations that drain the system.

| Protection | Implementation |
|---|---|
| Same admin can't approve twice | `UNIQUE(withdrawal_id, admin_id)` on withdrawal_approvals |
| Large credits/debits require super_admin | `ADMIN_LARGE_CREDIT_THRESHOLD = 10000` |
| Kill-switch toggles require super_admin | `CRITICAL_FLAGS` set in flags.py |
| All operations audit-logged | `AuditLog` with `large_operation` flag |

**Files:** `backend/app/api/admin/users.py`, `backend/app/api/admin/flags.py`

---

## PHASE 2 — RISK & EMERGENCY CONTROLS

### 5. Global Kill Switches

**Risk prevented:** In an active breach, you need to stop ALL financial operations instantly. Without kill switches, you'd need to shut down the entire server.

**Implementation:**
- `withdrawals_enabled` — blocks `POST /api/withdrawals/request` via `require_withdrawals_enabled` dependency
- `trading_enabled` — blocks order placement via `require_trading_enabled` dependency
- `deposits_enabled` — blocks deposit processing via `require_deposits_enabled` dependency
- `maintenance_mode` — general maintenance flag
- All enforced as FastAPI dependencies at API level (returns 503)
- Only `super_admin` can toggle critical flags (operator cannot)
- Every toggle creates a `kill_switch_toggled` critical event log

**Files:** `backend/app/api/deps_flags.py` (new), `backend/app/api/admin/flags.py`, `backend/app/services/critical_events.py`

---

### 6. Ledger Reconciliation Job

**Risk prevented:** Silent balance corruption. If a bug credits money without proper debit, or vice versa, the system silently becomes insolvent. Daily reconciliation catches this.

**Implementation:**
```
For each asset:
  account_total = SUM(accounts.available + accounts.locked) WHERE asset=X
  ledger_net    = SUM(credits) - SUM(debits) FROM ledger_entries WHERE asset=X

  IF account_total != ledger_net → CRITICAL ALERT
```

- Sets `ledger_mismatch_detected` system flag on mismatch
- Logs mismatch details to `audit_logs`
- Python CRITICAL log for external monitoring/SIEM
- Clears flag if reconciliation passes after previous failure
- Manual trigger: `POST /api/admin/reconciliation/run` (super_admin only)
- Designed for Celery beat scheduling (daily)

**Files:** `backend/app/tasks/reconciliation.py`, `backend/app/api/admin/reconciliation.py`

---

### 7. Suspicious Activity Guard

**Risk prevented:** Account takeover patterns that slip through individual limit checks.

| Check | Trigger | Action |
|---|---|---|
| Large withdrawal | amount ≥ multi-approval threshold | Audit log + `flagged=true` in response |
| IP mismatch | Withdrawal IP ≠ last login IP | Audit log warning |
| New account | Account < 24h old | Audit log warning |

- All alerts stored in `audit_logs` with `action=suspicious_withdrawal`
- Admin can filter audit logs by `suspicious_withdrawal` to review flagged requests
- Alerts don't block the withdrawal (limits do that) — they create visibility

**Files:** `backend/app/services/suspicious_activity.py`, `backend/app/api/withdrawals.py`

---

## PHASE 3 — MONITORING & BACKUP

### 8. Structured Critical Event Logging

**Events logged:**
- `withdrawal_requested` — via suspicious activity guard
- `withdrawal_approved` / `withdrawal_rejected` — via admin withdrawal API
- `withdrawal_settled` — via admin settlement API
- `kill_switch_toggled` — via admin flags API
- `ledger_mismatch_detected` — via reconciliation task
- `suspicious_withdrawal` — via suspicious activity guard
- `large_admin_operation` — via admin credit/debit

All events go to both:
1. **`audit_logs` table** — queryable by admin panel
2. **Python structured logger** — for external SIEM/alerting integration

**Files:** `backend/app/services/critical_events.py`

---

### 9. Health Endpoint Upgrade

`GET /api/health` now verifies:
- **Database:** `SELECT 1` via async connection
- **Redis:** `PING` via async client
- **Celery:** Checks for `_kombu.binding.*` keys in broker Redis

Returns `503` with `status: "degraded"` if any component fails.

**Files:** `backend/app/main.py`

---

### 10. Backup Strategy Scaffold

**Script:** `backend/scripts/backup.sh`
- Timestamped, gzipped `pg_dump`
- Size verification (catches silent failures)
- 30-day retention with auto-cleanup
- Documented restore instructions including ledger integrity verification
- Ready for cron scheduling

---

## DATA INTEGRITY RULES — VERIFICATION

| Rule | Status |
|---|---|
| All financial mutations through LedgerService | ✅ Enforced |
| SELECT FOR UPDATE where race possible | ✅ Withdrawal + campaign |
| Explicit transactions | ✅ `db.begin_nested()` |
| No silent failures | ✅ WithdrawalError with codes |
| No floating point (Decimal only) | ✅ All amounts are `Numeric(36,18)` |
| Explicit enum state transitions | ✅ `Withdrawal.TRANSITIONS` dict |

---

## NEW API ENDPOINTS

### User Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/withdrawals/request` | User | Submit withdrawal (locks funds) |
| POST | `/api/withdrawals/{id}/cancel` | User | Cancel pending withdrawal |
| GET | `/api/withdrawals/my` | User | List own withdrawals |
| GET | `/api/withdrawals/addresses` | User | List saved addresses |
| POST | `/api/withdrawals/addresses` | User | Pre-register address (starts cooldown) |

### Admin Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/withdrawals` | Admin | List all withdrawals |
| GET | `/api/admin/withdrawals/pending` | Admin | List pending approvals |
| GET | `/api/admin/withdrawals/{id}` | Admin | Detail + approval trail |
| POST | `/api/admin/withdrawals/{id}/approve` | Finance/Super | Approve withdrawal |
| POST | `/api/admin/withdrawals/{id}/reject` | Finance/Super | Reject + unlock funds |
| POST | `/api/admin/withdrawals/{id}/settle` | Finance/Super | Settle (deduct locked) |
| GET | `/api/admin/withdrawals/stats/summary` | Admin | Dashboard stats |
| POST | `/api/admin/reconciliation/run` | Super | Manual reconciliation |

---

## UPDATED SYSTEM RISK PROFILE

| Risk | Before | After |
|---|---|---|
| Instant withdrawal without approval | Possible | Impossible — queue + lock |
| Single admin drains funds | Possible | Blocked — multi-approval for large |
| Rapid account drainage | No limits | 3/hr, 25K/tx, 50K/day |
| Attacker adds address + withdraws | Instant | 24h cooldown |
| Admin self-enrichment | No controls | Large ops require super_admin |
| System-wide breach | No kill switch | Instant withdrawal/trading/deposit disable |
| Silent balance corruption | Undetected | Daily reconciliation + alert flag |
| Account takeover pattern | Unmonitored | IP change + velocity + age alerts |
| Data loss | No backups | pg_dump script with restore docs |
| Component failure | Basic health | DB + Redis + Celery verification |
| Forensic investigation | Limited logs | Structured critical event logging |

---

## REMAINING GAPS BEFORE REAL-MONEY READINESS

### Must-Have (before launch)
1. **Blockchain integration** — TRC20 address generation + deposit confirmation (QuickNode — deferred per user instruction)
2. **KYC enforcement** — Withdrawal should require `kyc_status == "approved"` (legal/compliance — deferred per user instruction)
3. **Email notifications** — User must be notified on: withdrawal request, approval, rejection, settlement
4. **Withdrawal address whitelisting** — Admin ability to whitelist/blacklist addresses
5. **Hot/cold wallet management** — System wallet separation for operational vs reserve funds

### Should-Have (within first month)
6. **Celery beat scheduling** — Wire reconciliation task into Celery beat for daily auto-run
7. **WAL archiving** — PostgreSQL point-in-time recovery (not just daily dumps)
8. **Rate limiting on withdrawal endpoints** — Currently only on auth endpoints
9. **Withdrawal fee per-asset config** — Currently flat USDT fee
10. **Admin 2FA enforcement on approval** — Re-verify TOTP before approving large withdrawals

### Nice-to-Have
11. **Real-time WebSocket alerts** — Push suspicious activity to admin dashboard
12. **Geographic IP analysis** — Flag withdrawals from unusual countries
13. **Automated withdrawal processing** — For small, whitelisted-address withdrawals

---

## DEPLOYMENT CHECKLIST

```
PRE-DEPLOYMENT
[ ] Run database migration (create_all or Alembic)
[ ] Verify new tables created: withdrawal_approvals, withdrawal_addresses
[ ] Verify withdrawal table has new columns
[ ] Set environment variables:
    WITHDRAWAL_DAILY_LIMIT_USDT=50000
    WITHDRAWAL_PER_TX_MAX_USDT=25000
    WITHDRAWAL_MULTI_APPROVAL_THRESHOLD=10000
    WITHDRAWAL_ADDRESS_COOLDOWN_HOURS=24
    ADMIN_LARGE_CREDIT_THRESHOLD=10000
[ ] Verify Redis is running (for rate limiting + kill switches)
[ ] Verify Celery worker is running (for event processing)

POST-DEPLOYMENT
[ ] Test withdrawal request flow end-to-end:
    1. User registers address → verify cooldown
    2. Wait for cooldown (or set to 0 for testing)
    3. User requests withdrawal → verify funds locked
    4. Admin approves → verify status change
    5. Admin settles → verify funds deducted from locked
[ ] Test multi-approval flow:
    1. Request withdrawal > 10,000 USDT
    2. First admin approves → verify still pending
    3. Second admin approves → verify status = approved
    4. Same admin tries again → verify rejected
[ ] Test kill switches:
    1. Set withdrawals_enabled = false
    2. Attempt withdrawal → verify 503
    3. Re-enable → verify withdrawal works
[ ] Test reconciliation:
    1. POST /api/admin/reconciliation/run
    2. Verify report shows all assets matching
[ ] Test backup:
    1. Run backup.sh
    2. Verify .sql.gz file created
    3. Test restore to separate database
    4. Verify ledger integrity in restored DB
[ ] Verify health endpoint:
    GET /api/health → db: ok, redis: ok, celery: ok

MONITORING
[ ] Set up log shipping for nexus.critical logger
[ ] Set up alert on ledger_mismatch_detected flag
[ ] Set up alert on health endpoint returning 503
[ ] Schedule daily reconciliation (cron or Celery beat)
[ ] Schedule daily backup (cron)
```

---

## FILES CREATED/MODIFIED

### New Files
| File | Purpose |
|---|---|
| `backend/app/services/withdrawal_service.py` | Withdrawal queue + limits + locking |
| `backend/app/services/suspicious_activity.py` | Fraud pattern detection |
| `backend/app/services/critical_events.py` | Structured event logging |
| `backend/app/api/withdrawals.py` | User withdrawal API |
| `backend/app/api/admin/withdrawals.py` | Admin withdrawal management |
| `backend/app/api/admin/reconciliation.py` | Admin reconciliation trigger |
| `backend/app/api/deps_flags.py` | Kill switch enforcement dependencies |
| `backend/app/tasks/reconciliation.py` | Ledger reconciliation logic |
| `backend/scripts/backup.sh` | PostgreSQL backup script |

### Modified Files
| File | Changes |
|---|---|
| `backend/app/models/wallet.py` | Withdrawal state machine, WithdrawalApproval, WithdrawalAddress models |
| `backend/app/config.py` | Withdrawal limits + admin threshold settings |
| `backend/app/api/admin/users.py` | Large credit/debit requires super_admin |
| `backend/app/api/admin/flags.py` | Critical flags restricted to super_admin, kill-switch event logging |
| `backend/app/main.py` | New routers registered, health check upgraded |
