# Security Hardening Report — Nexus Exchange

**Date:** 2026-02-15
**Scope:** All 17 issues from audit report — 3 phases completed.
**Approach:** Minimal, surgical changes. No architecture changes. No new frameworks.

---

## Phase 1 — Critical Security Fixes (7/7 Complete)

### P1-1: Admin JWT moved from localStorage to httpOnly cookie
| | Before | After |
|---|---|---|
| **Storage** | `localStorage` via Zustand persist | httpOnly cookie (`admin_access_token`) |
| **JS access** | `useAdminStore.getState().adminToken` | Inaccessible to JavaScript |
| **Cookie flags** | N/A | `httpOnly=true, SameSite=Strict, Secure=<prod>, path=/api/admin` |

**Files changed:** `backend/app/api/admin/auth.py`, `backend/app/api/deps.py`, `src/stores/admin-store.ts`, `src/lib/admin-api.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `backend/app/schemas/auth.py`

**Impact:** XSS can no longer steal admin tokens. Token is never in response body or JS memory.

---

### P1-2: Refresh token type validation fixed
| | Before | After |
|---|---|---|
| **Validation** | `type in ("user", "refresh")` accepted both | `type == "user"` only for access token validation |
| **Refresh endpoint** | No DB validation | Validates against `user_sessions` table |

**Files changed:** `backend/app/api/deps.py`

**Impact:** Refresh tokens cannot be used as access tokens. Prevents privilege escalation.

---

### P1-3: All hardcoded passwords removed
| | Before | After |
|---|---|---|
| **Frontend** | `ADMIN_ACCOUNTS` array with plaintext passwords + test hint | Completely removed |
| **Backend seed** | `"Admin123!"` hardcoded | `os.environ.get("SEED_ADMIN_PASSWORD", "")` |
| **Enforcement** | None | Min 12 chars, `force_password_change=True` on seed |

**Files changed:** `backend/app/seed.py`, `src/stores/admin-store.ts`, `src/app/admin/login/page.tsx`, `.env.example`

**Impact:** No credentials in source code. Seed requires env vars. First login forces password change.

---

### P1-4: Redis-based rate limiting + account lockout
| | Before | After |
|---|---|---|
| **Rate limiting** | Config existed, not implemented | Redis sorted-set sliding window, 10 req/min on auth |
| **Account lockout** | None | 5 failed attempts → 15 min lock, audit logged |

**Files changed:** `backend/app/middleware/rate_limit.py` (new), `backend/app/api/admin/auth.py`, `backend/app/config.py`, `backend/app/models/user.py`

**Impact:** Brute force attacks throttled per-IP. Account locked after repeated failures.

---

### P1-5: 2FA (TOTP) enforced for admin login
| | Before | After |
|---|---|---|
| **TOTP check** | `# TODO: TOTP verification` | Full `pyotp.TOTP.verify()` with `valid_window=1` |
| **Bypass** | Field existed, never checked | Login rejected if `totp_enabled=True` without valid code |

**Files changed:** `backend/app/api/admin/auth.py`, `src/app/admin/login/page.tsx`

**Impact:** Admins with 2FA enabled cannot log in without valid TOTP code.

---

### P1-6: Production-safe defaults
| | Before | After |
|---|---|---|
| **DEBUG** | `True` | `False` |
| **SQL echo** | `echo=settings.DEBUG` (True) | `echo=settings.DEBUG` (False) |
| **Stack traces** | Returned to client | Global exception handler returns generic 500 |
| **Swagger docs** | Always visible | Hidden when `DEBUG=False` |

**Files changed:** `backend/app/config.py`, `backend/app/main.py`

**Impact:** No information leakage in production. No SQL logging. No interactive docs exposed.

---

### P1-7: CSRF protection (SameSite=Strict)
| | Before | After |
|---|---|---|
| **User cookies** | `SameSite=lax` | `SameSite=strict` |
| **Admin cookies** | N/A (was in localStorage) | `SameSite=strict, path=/api/admin` |

**Files changed:** `backend/app/api/auth.py`, `backend/app/api/admin/auth.py`

**Impact:** Cross-site request forgery blocked by browser SameSite policy.

---

## Phase 2 — Integrity Fixes (6/6 Complete)

### P2-8: Campaign spent_budget race condition fixed
| | Before | After |
|---|---|---|
| **Campaign load** | `select(Campaign).where(...)` | `select(Campaign).where(...).with_for_update()` |

**Files changed:** `backend/app/services/reward_engine.py`

**Impact:** Concurrent campaign evaluations cannot overspend budget.

---

### P2-9: Admin idempotency keys made deterministic
| | Before | After |
|---|---|---|
| **Key format** | `admin_credit:{admin_id}:{user_id}:{asset}:{uuid4()}` | `admin_credit:{sha256(admin+user+asset+amount+reason)[:32]}` |

**Files changed:** `backend/app/api/admin/users.py`

**Impact:** Retried admin credit/debit requests are idempotent (same input = same key = no duplicate).

---

### P2-10: Refresh token validated against DB + rotation
| | Before | After |
|---|---|---|
| **DB check** | None — JWT signature only | Validated against `user_sessions.refresh_token` |
| **Rotation** | Same token reused | Old token deleted, new token issued on every refresh |
| **Revocation** | Logout deleted sessions but old tokens still valid | Token not in DB = rejected |

**Files changed:** `backend/app/api/auth.py`

**Impact:** Stolen refresh tokens can be revoked. Token rotation limits replay window.

---

### P2-11: CMS HTML output sanitized
| | Before | After |
|---|---|---|
| **Input** | Raw HTML stored as-is | `re.sub(r'<[^>]+>', '', text)` strips all tags |
| **Validation** | None | `content_type` and `priority` allowlisted |

**Files changed:** `backend/app/api/admin/cms.py`

**Impact:** Stored XSS via CMS content is prevented.

---

### P2-12: Max pagination limits on ledger endpoints
| | Before | After |
|---|---|---|
| **Route limit** | `le=200` (already present) | Same |
| **Service limit** | None | `limit = min(limit, 200)` defense-in-depth |

**Files changed:** `backend/app/services/ledger_service.py`

**Impact:** No endpoint can return unbounded result sets.

---

### P2-13: Account lockout mechanism
Implemented as part of P1-4. See above.

**New model fields:** `AdminUser.failed_login_attempts`, `AdminUser.locked_until`

---

## Phase 3 — Stability Hardening (4/4 Complete)

### P3-14: Request logging middleware
**New file:** `backend/app/middleware/request_logging.py`
Logs: `method`, `path`, `status_code`, `duration_ms`, `client_ip` for every request.

### P3-15: Health check verifies DB + Redis
**Before:** `{"status": "ok"}` (static)
**After:** Executes `SELECT 1` on DB and `PING` on Redis. Returns `503` if either fails.

### P3-16: CORS restricted
**Before:** `allow_methods=["*"], allow_headers=["*"]`
**After:** `allow_methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allow_headers=["Content-Type","Authorization","X-Requested-With"]`

### P3-17: datetime.utcnow() replaced globally
All 18 occurrences across 7 files replaced with `datetime.now(timezone.utc)`.

---

## Migration Notes

### Database Schema Changes
The `admin_users` table needs 3 new columns:
```sql
ALTER TABLE admin_users ADD COLUMN force_password_change BOOLEAN DEFAULT FALSE;
ALTER TABLE admin_users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;
```
Or simply re-run `create_all` in development (handled by seed script).

### New Dependencies
- `pyotp` — for TOTP verification (add to `requirements.txt`)
- `redis` — already in requirements (used for rate limiting)

### Environment Variables Required
```
SEED_ADMIN_PASSWORD=<strong-password-12-chars-min>
SEED_OPERATOR_PASSWORD=<strong-password-12-chars-min>
SEED_FINANCE_PASSWORD=<strong-password-12-chars-min>
SEED_VIEWER_PASSWORD=<strong-password-12-chars-min>
```

### Frontend localStorage Cleanup
Users with existing `nexus-admin` localStorage entry will have stale `adminToken` field. The new store's `partialize` no longer includes it, so it will be ignored and overwritten on next persist.

---

## Remaining Non-Critical Items
1. **Frontend proxy** — `next.config.js` still hardcodes `localhost:8000`. Should be env var for deployment.
2. **User TOTP** — User-side 2FA has `# TODO` but is lower priority than admin 2FA.
3. **Session expiry cleanup** — Expired `user_sessions` rows accumulate. Add a periodic cleanup task.
4. **CSP headers** — Consider adding Content-Security-Policy headers in `next.config.js`.
5. **Audit log pagination** — Admin audit log endpoint could benefit from max limit enforcement.

---

## Summary

| Category | Before | After |
|---|---|---|
| **Admin token storage** | localStorage (XSS-vulnerable) | httpOnly cookie |
| **Hardcoded passwords** | 4 accounts in source | Environment variables only |
| **2FA enforcement** | TODO comment | Real TOTP verification |
| **Rate limiting** | Config only | Redis sliding window |
| **Account lockout** | None | 5 attempts → 15 min lock |
| **Refresh token validation** | JWT-only | DB-validated + rotated |
| **CSRF protection** | SameSite=lax | SameSite=strict |
| **XSS prevention** | Raw HTML stored | HTML tags stripped |
| **Race conditions** | Unprotected campaign budget | SELECT FOR UPDATE |
| **Idempotency** | uuid4() defeats purpose | Deterministic SHA-256 |
| **Debug exposure** | DEBUG=True, SQL echo, stack traces | All off by default |
| **CORS** | Wildcard methods/headers | Explicit allowlist |
| **Health check** | Static response | Verifies DB + Redis |
| **Timezone safety** | datetime.utcnow() | datetime.now(timezone.utc) |
| **Request logging** | None | Structured access logs |
