# Admin Auth Hardening — Pass 2 (2026-04-15)

## Scope

Systematic zero-token audit of all admin API routes using the AgenticQA `AuthBypassScanner`.
192 route files across 82 sub-routes under `src/app/api/admin/`.

---

## Scanner Results

- **Total findings (all routes):** 41
- **Admin-scoped findings:** 8
- **Bugs fixed:** 2
- **Intentional-public (allowlisted):** 5
- **False positives:** 1 (`bulk-provision` — has its own `requireAgencyAuth`, scanner missed non-standard helper)

---

## Bugs Fixed

| Route | Before | After |
|-------|--------|-------|
| `src/app/api/admin/vehicles/backgrounds/system/[id]/route.ts` | No auth — GET served system background images to anyone | Added `requireAuth()` at top of GET handler |
| `src/app/api/admin/system/health/route.ts` | No auth — exposed DB circuit breaker state, git commit hash, analytics event counts | Added `requireAuth()` at top of GET handler |

The second bug was found by the coverage test (not the scanner — scanner missed it because `trackSystem` calls use dynamic import, not a direct pattern match). This demonstrates why the coverage test is the real guardrail.

---

## Intentional-Public Routes Allowlisted

Documented in `src/app/api/admin/PUBLIC_ROUTES.ts`.

| Route | Reason |
|-------|--------|
| `accept-invite/route.ts` | New users clicking email invite link — no session exists yet |
| `reset-password/route.ts` | Unauthenticated users requesting/completing a forgotten password reset |
| `mfa/verify/route.ts` | Called during login flow, before a session is established |
| `digital-retail/calculator/route.ts` | Customer-facing payment calculator — no login required (explicitly documented in source) |
| `digital-retail/credit-app/route.ts` | Customer-facing credit application submission (POST only; GET is auth-guarded) |

---

## Analytics Hookup

Added `security.unauthorized_access_attempt` to `SecurityEvent` type in `src/lib/analytics-hooks.ts`.

Extended `requireAuth()` in `src/lib/auth-guard.ts` to:
- Accept an optional `NextRequest` parameter (fully backward-compatible — all existing callers with no args continue to work)
- Emit `security.unauthorized_access_attempt` on every 401 with `{ route, ip, timestamp }`
- IP extracted from `x-forwarded-for` or `x-real-ip` headers; falls back to `"unknown"`

The event emission is in the helper, not in individual routes (DRY).

---

## Coverage Test

**File:** `src/__tests__/admin-auth-coverage.test.ts`

**Test results:** 5/5 pass

Tests:
1. Sanity check: at least 80 admin route files found (192 found)
2. Every admin route is either auth-guarded or in `PUBLIC_ADMIN_ROUTES` — **PASS**
3. `PUBLIC_ADMIN_ROUTES` entries all correspond to real files — **PASS**
4. `requireAuth` emits exactly one `security.unauthorized_access_attempt` event with `route + ip + timestamp` on 401 — **PASS**
5. `requireAuth` does not emit event when session is valid — **PASS**

---

## TypeScript

`npx tsc --noEmit` — zero new type errors introduced. Two pre-existing errors in `scripts/ingest-market-data.ts` and `src/__tests__/openapi-valid.test.ts` were present before this pass.

---

## Routes Needing Human Judgment

None. All 8 scanner findings were unambiguous:
- 5 are structurally required to be public (pre-auth flows)
- 1 is a false positive (non-standard but valid auth helper)
- 2 are real bugs, now fixed
