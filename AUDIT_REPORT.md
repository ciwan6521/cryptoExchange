# NEXUS EXCHANGE — FULL SYSTEM AUDIT REPORT

**Date:** 2026-02-15
**Auditor:** Cascade (AI Security & Architecture Audit)
**Scope:** Complete codebase — backend, frontend, infrastructure, compliance
**Posture:** Hostile attacker, malicious insider, race conditions, high load

---

## SECTION A — CRITICAL (Must fix before any real money)

### A1. Admin JWT Token Stored in localStorage (XSS = Full Admin Takeover)

- **File:** `src/stores/admin-store.ts:654` — `adminToken` is persisted via Zustand `persist` middleware to `localStorage`
- **Why dangerous:** Any XSS vulnerability (even from a CMS-injected banner or third-party script) can read `localStorage`, steal the admin JWT, and gain full super_admin access to the exchange
- **What could happen:** Attacker steals admin token → credits themselves unlimited funds → drains all user balances via admin debit → deletes audit logs
- **Minimal fix:** Move admin auth to httpOnly cookies (same as user auth already does). Remove `adminToken` from persisted state
- **Production fix:** httpOnly cookie + CSRF token + short-lived access token (15min) + refresh rotation + IP binding

### A2. No TOTP/2FA Enforcement (Marked as TODO)

- **Files:** `backend/app/api/auth.py:135` (`# TODO: TOTP verification`), `backend/app/api/admin/auth.py:29` (same)
- **Why dangerous:** 2FA fields exist in the model but are never verified. Any stolen password = full access
- **What could happen:** Credential stuffing attack succeeds → attacker has full user/admin access with no second factor
- **Minimal fix:** Implement TOTP verification in login flows when `totp_enabled=True`
- **Production fix:** Enforce 2FA for all admin accounts. Require 2FA for withdrawals. Support TOTP + WebAuthn

### A3. No Rate Limiting Implemented (Config Exists, Not Enforced)

- **File:** `backend/app/config.py:42` — `RATE_LIMIT_PER_MINUTE: int = 60` exists but is never used anywhere
- **Why dangerous:** No rate limiting on login, registration, password attempts, API calls
- **What could happen:** Brute force admin passwords (only 4 accounts with weak seed passwords). Credential stuffing. API abuse. DoS
- **Minimal fix:** Add `slowapi` or custom middleware using Redis to enforce per-IP and per-user rate limits on auth endpoints
- **Production fix:** Rate limiting at reverse proxy (nginx/Cloudflare) + application-level limits + account lockout after N failures

### A4. Hardcoded Seed Passwords in Source Code

- **Files:** `backend/app/seed.py:23-26` — `Admin123!`, `Operator123!`, `Finance123!`, `Viewer123!`
- **Also:** `src/stores/admin-store.ts:445-478` — same passwords in frontend source (shipped to browser)
- **Why dangerous:** Passwords are in the Git repo, in the Docker image, and in the browser bundle. Anyone with repo access or browser DevTools can see them
- **What could happen:** Attacker reads source → logs in as super_admin → full system compromise
- **Minimal fix:** Remove passwords from frontend code entirely. Force password change on first login. Use env vars for seed passwords
- **Production fix:** No seed passwords in code. Admin onboarding via secure invite flow. Passwords never in version control

### A5. `get_current_user` Accepts Refresh Tokens as Access Tokens

- **File:** `backend/app/api/deps.py:43` — `payload.get("type") not in ("user", "refresh")`
- **Why dangerous:** Refresh tokens (7-day lifetime) are accepted as access tokens for all API calls. This defeats the purpose of short-lived access tokens
- **What could happen:** A leaked refresh token (longer window) grants full API access instead of only being usable at the `/refresh` endpoint
- **Minimal fix:** Change to `payload.get("type") != "user"` — only accept access tokens
- **Production fix:** Strict token type validation. Refresh tokens should ONLY work at `/api/auth/refresh`

### A6. No CSRF Protection on Cookie-Based Auth

- **Files:** `backend/app/api/auth.py:35` — `samesite="lax"`, no CSRF token
- **Why dangerous:** `SameSite=Lax` allows top-level GET navigations to send cookies. State-changing POST endpoints are partially protected but not fully. No explicit CSRF token exists
- **What could happen:** Attacker crafts a page that triggers state-changing requests using the victim's cookies
- **Minimal fix:** Add `SameSite=Strict` for auth cookies OR implement CSRF token (double-submit cookie pattern)
- **Production fix:** CSRF token in all state-changing requests + `SameSite=Strict` + `Origin` header validation

### A7. No Execution Engine — Order/Trade Tables Are Empty Shells

- **Files:** `backend/app/models/trading.py` — `Order` and `Trade` models exist but no API creates them
- **Why dangerous:** The system has balance locking primitives (`lock_funds`, `unlock_funds`, `fill_from_locked`) but no matching engine. If someone builds a quick order placement endpoint without proper atomicity, it will create double-spend conditions
- **What could happen:** Premature order placement without proper locking → double-spend, negative balances, inconsistent state
- **Minimal fix:** Keep order placement disabled (current state is correct). Document that execution engine requires threat modeling first
- **Production fix:** Full matching engine with: atomic lock-match-fill cycle, optimistic locking, order book state machine, trade settlement via ledger

### A8. `DEBUG=True` and SQL Echo in Production Config Defaults

- **Files:** `backend/app/config.py:10` — `DEBUG: bool = True`, `backend/app/database.py:8` — `echo=settings.DEBUG`
- **Why dangerous:** All SQL queries are logged to stdout including user data. Debug mode may expose stack traces with internal paths
- **What could happen:** SQL logs contain user IDs, emails, password hashes in error scenarios. Attackers can read container logs
- **Minimal fix:** Set `DEBUG=False` and `APP_ENV=production` in production `.env`
- **Production fix:** Structured logging with PII redaction. No SQL echo. Error responses never expose internals

---

## SECTION B — HIGH RISK (Strongly recommended before beta)

### B1. Admin Store Still Contains Full Mock Data (Shipped to Browser)

- **File:** `src/stores/admin-store.ts:338-431` — `SEED_USERS`, `SEED_ORDERS`, `SEED_TRADES`, `SEED_DEPOSITS`, `SEED_WITHDRAWALS` with fake user data, balances, and wallet addresses
- **Why dangerous:** This data is in the JavaScript bundle sent to every browser. It creates confusion between real and fake data. The mock store actions (`updateMockUser`, `updateMockOrder`, etc.) still exist and could be called
- **Minimal fix:** Remove all `SEED_*` arrays and mock action methods. Keep only auth state, permissions, and token
- **Production fix:** Admin store should only contain: auth state, token, permissions. All data comes from API

### B2. No Account Lockout After Failed Login Attempts

- **Files:** `backend/app/api/auth.py:129`, `backend/app/api/admin/auth.py:23`
- **Why dangerous:** Unlimited login attempts with no lockout, no delay, no CAPTCHA
- **What could happen:** Automated brute force against known admin emails (which are in the source code)
- **Minimal fix:** Track failed attempts in Redis. Lock account for 15min after 5 failures
- **Production fix:** Progressive delays + CAPTCHA after 3 failures + account lockout + alerting + IP blocklist

### B3. No Input Sanitization on Admin Search (SQL Injection via ilike)

- **File:** `backend/app/api/admin/users.py:46` — `User.email.ilike(f"%{search}%")`
- **Why dangerous:** While SQLAlchemy parameterizes queries, the `%` wildcards in the search pattern could allow ReDoS-style attacks with crafted input. More critically, there's no length limit or character validation on the search parameter
- **What could happen:** Extremely long search strings → DB performance degradation. Crafted patterns → slow queries
- **Minimal fix:** Limit search string length (max 100 chars). Strip special SQL pattern characters
- **Production fix:** Full input validation on all query parameters. Query timeouts. Read replicas for search

### B4. Campaign `spent_budget` Updated Without Row Lock

- **File:** `backend/app/services/reward_engine.py:230` — `campaign.spent_budget += reward`
- **Why dangerous:** The campaign row is not locked with `SELECT FOR UPDATE`. Two concurrent reward evaluations for the same campaign can both read the same `spent_budget`, both pass the budget check, and both increment — resulting in budget overrun
- **What could happen:** Campaign budget of $1000 could pay out $1500+ under concurrent load
- **Minimal fix:** Add `.with_for_update()` when selecting the campaign in `_evaluate_campaign`
- **Production fix:** Row-level lock on campaign + budget check + atomic increment in a single UPDATE statement

### B5. Idempotency Key Contains `uuid.uuid4()` (Defeats Idempotency)

- **File:** `backend/app/api/admin/users.py:136` — `idempotency_key = f"admin_credit:{admin.id}:{user_id}:{body.asset}:{uuid.uuid4()}"`
- **Why dangerous:** Every request generates a unique idempotency key. If the admin double-clicks or the request is retried, it creates duplicate credits
- **What could happen:** Network timeout → admin retries → user gets credited twice
- **Minimal fix:** Generate idempotency key from deterministic inputs (admin_id + user_id + asset + amount + timestamp_bucket) or require client-supplied idempotency key
- **Production fix:** Client-supplied idempotency key (required header). Server rejects requests without it

### B6. Refresh Token Not Validated Against Database

- **File:** `backend/app/api/auth.py:215` — refresh endpoint decodes JWT but never checks if the token exists in `user_sessions` table
- **Why dangerous:** A revoked/logged-out refresh token still works until it expires (7 days). Logout deletes sessions but the JWT is still valid
- **What could happen:** User logs out → attacker who captured the refresh token can still use it for 7 days
- **Minimal fix:** Check refresh token against `user_sessions` table during refresh
- **Production fix:** Token rotation on refresh (issue new refresh token, invalidate old). Maintain a revocation list in Redis

### B7. No Password Complexity Enforcement

- **File:** `backend/app/schemas/auth.py:11` — `password: str = Field(min_length=8, max_length=128)`
- **Why dangerous:** Only length is validated. No requirement for uppercase, lowercase, digits, or special characters
- **What could happen:** Users set `password` or `12345678` → trivially brute-forced
- **Minimal fix:** Add regex validation: at least 1 uppercase, 1 lowercase, 1 digit, 1 special char
- **Production fix:** Password strength meter + breach database check (HaveIBeenPwned API) + bcrypt cost factor ≥12

### B8. CMS Body Rendered Without Sanitization (Stored XSS)

- **File:** `src/components/layout/CMSRenderer.tsx` (renders CMS content), `backend/app/api/admin/cms.py:75` — `body=body.body` stored as-is
- **Why dangerous:** Admin-created CMS content body is stored raw and rendered on user-facing pages. A malicious or compromised admin can inject `<script>` tags
- **What could happen:** Stored XSS → steal user cookies → account takeover at scale
- **Minimal fix:** Sanitize HTML on output (DOMPurify on frontend) or strip all HTML on input
- **Production fix:** Allowlist-based HTML sanitizer on both input (backend) and output (frontend). CSP headers

### B9. No Database Transaction Wrapper on `get_db` Sessions

- **File:** `backend/app/database.py:25-31` — session is yielded without `begin()`, relies on implicit autocommit behavior
- **Why dangerous:** Some routes call `db.commit()` explicitly, others don't. Inconsistent transaction boundaries can lead to partial writes
- **What could happen:** A route that does multiple writes crashes midway → partial data committed
- **Minimal fix:** Wrap session in explicit transaction: `async with session.begin():`
- **Production fix:** Consistent transaction management pattern. All routes use explicit transactions. Savepoints for nested operations

---

## SECTION C — MEDIUM RISK

### C1. CORS Allows Credentials with Wildcard Methods/Headers

- **File:** `backend/app/main.py:64-70` — `allow_methods=["*"]`, `allow_headers=["*"]`, `allow_credentials=True`
- **Risk:** Overly permissive. Should restrict to actual methods (GET, POST, PATCH, DELETE) and specific headers
- **Fix:** Explicit method and header allowlists

### C2. No Email Verification Flow

- **File:** `backend/app/models/user.py:20` — `email_verified` field exists but is never set to `True`
- **Risk:** Fake email registrations. No way to verify account ownership. No password reset flow
- **Fix:** Email verification on registration. Password reset via email link

### C3. No Pagination Limit Enforcement on Ledger History

- **File:** `backend/app/services/ledger_service.py:356` — `limit: int = 50` but no max cap
- **Risk:** Client can request `limit=999999` and dump entire ledger
- **Fix:** Cap at 200. Add server-side max enforcement

### C4. Audit Logs Can Be Read by Any Admin (No Log Integrity)

- **File:** `backend/app/api/admin/logs.py:23` — any authenticated admin can read all logs
- **Risk:** A malicious admin can see what other admins are doing. Logs are in a mutable database table (could be deleted by someone with DB access)
- **Fix:** Append-only log table with no DELETE permission. Ship logs to external immutable store

### C5. No Withdrawal Limits or Cooling Period

- **File:** `backend/app/models/wallet.py:54-85` — Withdrawal model exists but no limit enforcement
- **Risk:** When withdrawals are implemented, no daily/per-tx limits exist
- **Fix:** Configurable daily withdrawal limits per user tier. Cooling period for new addresses. Large withdrawal requires admin approval

### C6. `datetime.utcnow()` Used Instead of Timezone-Aware Datetimes

- **Files:** Throughout — `security.py:38`, `reward_engine.py:69`, `ledger_service.py:118`, etc.
- **Risk:** `datetime.utcnow()` returns naive datetimes. Database columns are timezone-aware. Comparison bugs possible
- **Fix:** Use `datetime.now(timezone.utc)` everywhere. `utcnow()` is deprecated in Python 3.12+

### C7. No Request Logging / Access Logging Middleware

- **File:** `backend/app/main.py` — no request logging middleware
- **Risk:** No visibility into who is calling what. Cannot detect attack patterns
- **Fix:** Add structured request logging middleware (method, path, status, duration, IP, user_id)

### C8. Campaign Engine Has No Self-Referral Protection

- **File:** `backend/app/services/reward_engine.py` — no referral tracking or self-referral detection
- **Risk:** When referral campaigns are added, users can create multiple accounts to refer themselves
- **Fix:** IP/device fingerprint tracking. Referral chain validation. Minimum activity threshold before referral reward

### C9. No Health Check for Database/Redis Connectivity

- **File:** `backend/app/main.py:91-97` — health check returns static `{"status": "ok"}` without checking DB or Redis
- **Risk:** Load balancer thinks service is healthy when DB is down
- **Fix:** Health check should verify DB connection (`SELECT 1`) and Redis ping

### C10. Frontend Proxy Rewrites to Hardcoded `localhost:8000`

- **File:** `next.config.js:26` — `destination: 'http://localhost:8000/api/:path*'`
- **Risk:** Won't work in production. Must be configurable
- **Fix:** Use environment variable: `process.env.BACKEND_URL || 'http://localhost:8000'`

---

## SECTION D — MISSING BUT OPTIONAL (For production readiness)

### D1. No Email Service Integration
No transactional email for: verification, password reset, login alerts, withdrawal confirmations

### D2. No WebSocket Authentication
WebSocket connections for market data have no auth. Fine for public data, but user-specific streams need auth

### D3. No API Versioning
All routes are `/api/...` with no version prefix. Breaking changes will affect all clients

### D4. No OpenAPI Schema Validation Tests
No automated tests verify that API responses match declared schemas

### D5. No Database Migration Strategy
Using `create_all` on startup instead of Alembic migrations. Schema changes will fail on existing data

### D6. No Graceful Shutdown Handling
Celery workers and API server have no graceful shutdown for in-flight requests

### D7. No Admin Activity Notifications
No alerts when: admin logs in from new IP, large balance adjustment made, system flag changed

### D8. No User Session Management UI
Users cannot see active sessions or revoke them

### D9. No API Key System for Programmatic Access
No way for users to create API keys for trading bots

### D10. No Content Security Policy (CSP) Header
`next.config.js` has `X-Frame-Options` and `X-Content-Type-Options` but no CSP header

---

## SECTION E — SCALABILITY LIMITATIONS

### E1. Single PostgreSQL Instance
No replication, no read replicas, no connection pooling (beyond SQLAlchemy pool). Single point of failure

### E2. Single Redis Instance
No Redis Sentinel or Cluster. Redis failure = event bus down + Celery down + rate limiting down (when implemented)

### E3. No Caching Layer
Every API call hits the database. No Redis caching for: trading pairs, system flags, user balances

### E4. Celery Event Queue is Unbounded
`nexus:event_queue` Redis list has no max length. Under high load, memory exhaustion possible

### E5. No Database Connection Pooling (PgBouncer)
Direct connections from app to PostgreSQL. Under high concurrency, connection exhaustion

### E6. No CDN for Static Assets
Next.js serves all static assets. No CDN = high latency for global users

### E7. Ledger Table Will Grow Unbounded
No archival strategy for old ledger entries. Table will become slow over time

### E8. No Horizontal Scaling Strategy
Single API instance. No documentation for multi-instance deployment. No shared session store

---

## SUMMARY SCORECARD

| Category | Score | Notes |
|----------|-------|-------|
| **Authentication** | 4/10 | Good cookie-based flow, but 2FA missing, refresh token validation broken, admin token in localStorage |
| **Authorization** | 7/10 | RBAC model is sound, 3-layer enforcement, but frontend permissions are client-side only |
| **Ledger Integrity** | 7/10 | Strong design with FOR UPDATE locks, idempotency, CHECK constraints. But admin idempotency is broken |
| **Campaign Engine** | 6/10 | Good design, but race condition on budget, no self-referral protection |
| **Trading System** | 2/10 | Models exist, no execution engine. Correct decision to keep disabled |
| **Admin Panel** | 6/10 | Full CRUD + audit logging, but token storage is critical vulnerability |
| **Infrastructure** | 3/10 | Docker Compose only. No monitoring, no backups, no HA, no CI/CD |
| **Compliance** | 1/10 | No KYC, no AML, no withdrawal limits, no suspicious activity monitoring |
| **DevOps** | 2/10 | No tests, no CI/CD, no migration strategy, secrets in code |
| **Overall** | **4/10** | Solid architecture and design patterns, but critical security gaps prevent any real-money use |

---

## RECOMMENDED FIX ORDER

1. **A1** — Move admin token to httpOnly cookie (blocks XSS takeover)
2. **A5** — Fix refresh token type validation (blocks token confusion)
3. **A3** — Implement rate limiting on auth endpoints (blocks brute force)
4. **A4** — Remove hardcoded passwords from source (blocks trivial compromise)
5. **A2** — Implement 2FA verification (blocks credential theft)
6. **A6** — Add CSRF protection (blocks cross-site attacks)
7. **B4** — Lock campaign row during reward distribution (blocks budget overrun)
8. **B5** — Fix admin idempotency keys (blocks double-credit)
9. **B6** — Validate refresh tokens against DB (blocks post-logout access)
10. **A8** — Disable debug mode defaults (blocks information leakage)

---

*This audit was performed by reading every source file in the repository. No assumptions were made about correctness. All findings are based on actual code analysis.*
