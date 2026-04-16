# Integrations — Wolfpack Auto

Every external system is wrapped. Call sites never import SDKs directly.

## DMS providers (CDK, Reynolds, Dealertrack, others)

Goal: normalize heterogeneous dealer-management-system feeds into a single canonical shape so downstream code (inventory, desking, service) is DMS-agnostic.

Layout: `src/lib/dms/`
- `types.ts` — canonical `DMSVehicle`, `DMSDeal`, `DMSServiceOrder` shapes + enums.
- `normalizer.ts` — converts provider-specific payloads to canonical shapes.
- `feed-processor.ts` — scheduled ingest entrypoint; idempotent on `(dms_provider, external_id)`.
- `vin-decoder.ts` — VIN validation + decoding (year / make / model / trim).

Adding a new DMS provider:
1. Add the provider enum to `src/lib/dms/types.ts`.
2. Implement a provider-specific normalizer branch in `normalizer.ts`.
3. Feed endpoint under `src/app/api/dms/<provider>/feed/route.ts`; verify provider signature via `lib/webhook-verify.ts`.
4. Migration 003 `dms_feeds.sql` defines the `dms_feeds` table — reuse it; don't invent a parallel schema.
5. Integration test fixture under `tests/api/dms/<provider>.spec.ts`.
6. Canary check in `tests/canary/` asserts the ingest path returns a valid payload.

## QuickBooks + General Ledger

Accounting moved in-house. Migration 048 `general_ledger.sql` + migration 051 `multi_company_gl.sql` define the GL; QuickBooks is optional outbound sync.

- `src/lib/payroll-integration.ts` — payroll journal entries (migration 050).
- `src/lib/webhook-outbound.ts` + migration 034 `webhook_outbound.sql` — deliver GL events to QuickBooks / client systems with signed payloads.
- Signatures rotate; rotation is handled by `lib/crypto/sign.ts`.

Adding a new outbound webhook subscriber:
1. Insert a row in `webhook_outbound_subscriptions` (dealer-scoped).
2. Event fan-out happens in `lib/webhook-outbound.ts`; typed event union there — add your event.
3. Deliveries are recorded in `webhook_outbound_deliveries`; retries honor exponential backoff from the circuit-breaker.

## Stripe payments

- `src/lib/stripe-payments.ts` — create/capture/refund wrappers; migration 049 `stripe_payments.sql`.
- Webhooks: `src/app/api/webhooks/stripe/route.ts`, Stripe signature verified via `lib/webhook-verify.ts`.
- Never accept `amount` from client input — always compute server-side off the deal.

## Resend (email)

- `src/lib/email.ts` + `src/lib/email-templates.ts`.
- Used by: drip-campaigns, lead nurturing, dealer onboarding invites (see wizard Step 4), service-appointment reminders.
- Configure `RESEND_API_KEY` + sender domain (DKIM verified) in Vercel.

## Twilio SMS

- `src/lib/sms.ts`. Drip-campaign + appointment reminders. Respects opt-out flags on `leads.sms_opt_out`.

## Elasticsearch (inventory search)

- `src/lib/elasticsearch.ts` — typed client wrapper.
- `src/lib/vehicle-search.ts` — query builder + result normalization.
- Indexing driven by `scripts/index-vehicles.ts`; incremental updates piped through the normalizer → ES on DMS ingest.

## S3 (media)

- `@aws-sdk/client-s3` wrapped in `src/lib/storage.ts`.
- Vehicle backgrounds (migration 046) + AI removal pipeline (`background-generator.ts`, `background-removal.ts`).
- Signed URLs via `@aws-sdk/s3-request-presigner`.

## Redis

- `src/lib/redis.ts` — ioredis client.
- `src/lib/rate-limit.ts` — token-bucket rate limiting for public endpoints.
- `src/lib/circuit-breaker.ts` — short-circuits flaky downstream calls.
- `src/lib/cache.ts` — memoized reads for hot paths.

## OFAC screening

- `src/lib/ofac-screening.ts`, migration 044. Hit on lead creation for credit-bearing flows (financing, F&I).

## Credit bureau

- Migration 027 `credit_bureau.sql`. Wrapper lives in `src/lib/credit-*` (check before using). Soft-pull vs. hard-pull flags are first-class.

## Qdrant / Neo4j

Accessed via `src/lib/qdrant-client.ts` and `src/lib/neo4j-client.ts`. Never called directly from routes — go through `src/lib/triple-write.ts`. See `.ai/data-stores.md`.

## Sentry

Wired in `src/instrumentation.ts` + `instrumentation-client.ts`. Every unhandled error + server-side console.error surfaces. Don't silently catch errors without rethrowing through Sentry.
