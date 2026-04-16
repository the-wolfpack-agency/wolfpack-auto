# Conventions — Wolfpack Auto

Reference for adding code that fits the existing DOS. Match the closest existing pattern exactly.

## File layout

- Route handlers: `src/app/api/<resource>/route.ts`. Admin-only routes go under `src/app/api/admin/<resource>/`.
- Tenant-console pages: `src/app/admin/<resource>/page.tsx` (e.g. `admin/deals`, `admin/inventory`).
- Public pages: `src/app/<page>/page.tsx` (e.g. `inventory`, `trade-in`, `walkaround`).
- Shared domain logic: `src/lib/<domain>.ts`. One file per noun (`leads.ts`, `drip-campaigns.ts`, `trade-in-valuator.ts`).
- DMS sub-system: `src/lib/dms/` (feed-processor, normalizer, vin-decoder, types).
- Tests: co-located under `src/**/__tests__/<name>.test.ts` for unit; Playwright under `tests/`.

## Naming

- Roles: `admin`, `manager`, `agent`, `viewer`. Scoped by `dealer_id`.
- Analytics events: `<module>.<noun>_<verb_past>`, e.g. `deal.created`, `lead.status_changed`, `service.appointment_booked`. Every event is declared as a string-literal union in `src/lib/analytics-hooks.ts` (`DealEvent`, `ServiceEvent`, `LeadEvent`, …) — typos fail at compile time.
- Tenant scoping: every table column is `dealer_id` (legacy `tenant_id` also appears — match what the table already uses). Never derive from the request body; always pull from `tenant-context.ts`.
- Migrations: three-digit prefix, snake_case. The repo's migration counter is past 055; pick the next number.

## Migrations

- Location: `src/db/migrations/NNN_<name>.sql`. Companion rollbacks in `src/db/migrations/rollback/`.
- Always additive in production. Run locally: `npm run db:migrate`. Reset + seed: `npm run db:reset` (destroys data — local only).
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, guard indexes.
- New tables MUST include `dealer_id` (or `tenant_id` matching sibling tables) and an RLS policy keyed on it. Migration 055 raised the bar — every table should `ENABLE ROW LEVEL SECURITY` plus a policy.
- After adding a migration: `npm run test:migrations` (`scripts/test-migrations.sh`) and `npm run verify:rls` to confirm policies are present.

## Adding a new admin route

1. Create `src/app/api/admin/<resource>/route.ts`.
2. First line: `const session = await requireAuth(request);` from `src/lib/auth-guard.ts`.
3. Resolve tenant: `const { dealerId } = getTenantContext(session);`.
4. If the action is user-triggered (not a cron), emit a typed analytics event via the right `trackXxx` helper in `analytics-hooks.ts`.
5. If the action is a mutation, write an `audit_log` row via `lib/audit-log.ts`.
6. Push business logic to `src/lib/<domain>.ts`; route handler stays thin.
7. Add a contract test under `src/**/__tests__/` asserting 200, 401, 403, 400. See `admin-api-contracts.test.ts` for the pattern.
8. If the route backs a UI surface, add an E2E spec under `tests/e2e/<flow>.spec.ts`.

## Adding a public (customer-facing) route

1. Create `src/app/api/<resource>/route.ts`.
2. First call: `await checkRateLimit(request, { key: '<resource>', limit: N, windowSec: M })` from `src/lib/rate-limit.ts`.
3. Input validation via `zod` — no raw `req.json()` consumption.
4. If the action writes, use `lib/triple-write.ts` or `lib/db.ts` + tenant-scoped query.
5. Contract test must prove rate-limit trips on N+1 calls (`security-hardening.spec.ts` + per-route tests).

## External integrations

All external SDKs are wrapped. Call sites never import SDKs directly.

- **Stripe**: `src/lib/stripe-payments.ts`. Webhooks via `app/api/webhooks/stripe/route.ts`, signature verified with `lib/webhook-verify.ts`.
- **Resend email**: `src/lib/email.ts` + `email-templates.ts`.
- **Twilio SMS**: `src/lib/sms.ts`.
- **Elasticsearch**: `src/lib/elasticsearch.ts` + `lib/vehicle-search.ts`.
- **DMS providers** (CDK, Reynolds, Dealertrack): `src/lib/dms/` — one normalizer per provider, common `types.ts` shape.
- **QuickBooks / General Ledger**: `src/lib/payroll-integration.ts`, migration 048 `general_ledger.sql`, migration 051 `multi_company_gl.sql`.
- **OFAC**: `src/lib/ofac-screening.ts`, migration 044.

Never call `fetch()` to an external service directly from a route handler. Use or create a wrapper that returns `Result<T, IntegrationError>`.

## Test patterns

- **Unit / Jest**: `npm run test:unit` — `src/**/__tests__/**/*.test.ts` (see `jest.config.ts`).
- **E2E / Playwright**: `npm run test:e2e` — `tests/e2e/*.spec.ts` against the dev server.
- **Smoke**: `npm run test:smoke` — `tests/smoke.spec.ts`.
- **Canary (post-deploy)**: `npm run test:canary` → `playwright.canary.config.ts` (hits the deployed URL).
- **Predeploy gate**: `npm run test:predeploy` → `playwright.predeploy.config.ts`.
- **Full combined**: `npm run test:all` (jest + playwright chromium).
- **RLS verification**: `npm run verify:rls`.
- **Migrations**: `npm run test:migrations`.

Assert HTTP 200, not just "no 500". A 401 renders a blank page — that's a production bug class we already lived.

## Verification

Canonical pre-push command: `scripts/verify.sh` (lint + type-check + jest + smoke). Use it; don't compose commands by hand.

Predeploy: `npm run predeploy` (`scripts/predeploy-gate.sh`). Post-deploy canary: `npm run canary`.

## Handoff

`demo/handoff-<date>.md` at session end. Flag any missing Vercel env var (`DATABASE_URL`, `NEXTAUTH_SECRET`, `DEALER_ID`, etc.) at the top of the handoff, not buried.
