# Runbooks — Wolfpack Auto

Known failure modes + fixes. Add an entry every time a prod (or prod-like) issue is diagnosed.

## Canary workflow red — "DATABASE_URL not set"

The #1 historical cause of failing canary. The canary hits the deployed URL expecting a real Postgres connection. If the deployed env is missing `DATABASE_URL`, every read-backed route 500s and canary lights up.

Fix: set `DATABASE_URL` (Neon connection string) in Vercel for the target environment. Re-run the canary. If the canary issue was auto-filed, close it when green.

## `/admin` blanks out / redirect loop

Two causes:
1. **Onboarding cookie mismatch**. Middleware redirects `/admin` → `/admin/getting-started` when `onboarding_complete=false`. If `/admin/getting-started` itself is gated or errors, you get a loop. Check `src/middleware.ts` redirect conditions and the onboarding status route.
2. **NextAuth session cookie stale**. After a schema migration that touched `users`, existing sessions can mis-serialize. Fix: users log out/in once, or bump `NEXTAUTH_SECRET` rotation (all users re-auth).

## Playwright E2E failing locally but green in CI

Usually a `DATABASE_URL` that points at a schema one migration behind. Run `npm run db:migrate` and retry. Verify with `npm run verify:rls`.

## RLS verification failing

`npm run verify:rls` enumerates every table and checks for a matching policy. A new table without RLS triggers a fail.

Fix: add `ENABLE ROW LEVEL SECURITY` + a `USING (dealer_id = current_setting('app.dealer_id')::uuid)` policy to the migration that created the table. Re-run. Migration 055 `enforce_rls.sql` is the pattern — clone it.

## Rate-limit on public endpoint returning 500 instead of 429

Redis is down. `checkRateLimit()` should fail-open on Redis errors (let requests through) but never throw. If it's throwing, check `src/lib/redis.ts` — the `ioredis` `lazyConnect` + retry strategy should prevent this. A throwing rate limiter = a DoS on our own site.

## Stripe webhook signature verification failing

- Webhook secret rotated on Stripe side but not in Vercel env. Pull the new secret from Stripe dashboard into `STRIPE_WEBHOOK_SECRET`.
- Middleware touching the body before signature verification. The Stripe route MUST read the raw body. Check `src/app/api/webhooks/stripe/route.ts` — it should use `request.text()` and call `stripe.webhooks.constructEvent` with the exact raw string.

## DMS feed rejected with "Invalid VIN"

`src/lib/dms/vin-decoder.ts` validates VINs (17 chars, checksum). Some providers send pre-sale VINs or stock numbers in the VIN field. Fix at the normalizer: map those to a separate `stock_number` column, don't try to VIN-decode them.

## Elasticsearch search returns nothing / stale results

Index drift. `scripts/index-vehicles.ts` rebuilds the index. For incremental drift, an inventory mutation isn't firing the ES upsert hook. Grep for where `vehicles` rows are written; confirm `indexVehicle()` is called in the same transaction.

## Background generation stuck in "processing"

Migration 046 `vehicle_backgrounds.sql` has a status column. If a job hangs, check:
1. `fal.ai` billing blocker — budget exhausted → every job errors silently. Surface that in the UI.
2. S3 upload failing — IAM creds rotated in AWS but not in Vercel.
3. `background-removal.ts` worker path — verify the worker actually processes queued rows.

## MFA (TOTP) codes not accepted

Clock skew. `otpauth` allows a window; if the server clock drifts >30s from the user's, codes fail. Vercel regions should be NTP-synced, but verify. Also check `src/lib/__tests__/mfa.test.ts` hasn't been removed — that test covers drift.

## GL entries out of balance after a deal funds

Migration 048 `general_ledger.sql` requires every journal entry to sum to zero per entry. A recent desking change may have skipped a journal line. Query `general_ledger_entries` grouped by entry_id — any non-zero sum is a bug in the caller, not the GL. Fix at the caller and add an assertion.

## Triple-write silently dropping Qdrant writes

Historical Weaviate (predecessor) bug: version <1.27.0 silently discarded writes. Qdrant doesn't have this bug, but the pattern to remember is: `system.triple_write_degraded` events spike → check Qdrant health endpoint, check the `QDRANT_URL` env var actually points at a live instance (not a stopped Docker container).

## "Pre-existing test failure" in vehicle-delivery-tracker

`src/lib/__tests__/vehicle-delivery-tracker.test.ts` → `getVehiclePipeline › calculates average time to list` is a known timing-edge-case flake. Non-blocking. Fix it properly when you touch that module.
