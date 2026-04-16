# Data Stores — Wolfpack Auto

Primary: Postgres (Neon). Supporting: Redis (hot cache + rate limit), Elasticsearch (vehicle search), S3 (media), Qdrant (semantic), Neo4j (relationship graph).

## Postgres

Schema evolves via numbered migrations in `src/db/migrations/`. Current range: 001 → 055. `src/db/schema.sql` holds a snapshot for quick inspection; authoritative source is the migration chain.

### Migration map (grouped by theme)

| Theme | Migrations |
|---|---|
| Foundation, dealers, inventory, leads | 001 initial schema; 002 dealer_domains; 003 dms_feeds; 009 ev_fields |
| OEM, billing, compliance, scoring, pricing | 004 oem_program_management; 005 billing; 006 compliance; 007 lead_scoring; 008 pricing_recommendations |
| Trade-in + MFA | 010 trade_in; 020 mfa |
| F&I + service + comms + accounting | 021 fi_deals; 022 service_parts; 023 comms_automation; 024 deal_accounting; 025 reviews |
| Lender / credit / documents / compliance | 026 lender_portal; 027 credit_bureau; 028 document_vault; 029 compliance_checks |
| Floor plan / schema hygiene | 030 floor_plan; 031 schema_fixes; 032 soft_delete; 033 missing_indexes |
| Outbound webhooks + dealer users | 034 webhook_outbound; 035 dealer_users |
| Canary + branding + settings | 036 canary_fixes; 037 add_logo_url; 038 dealer_settings_columns |
| Auth tokens + agency keys | 039 invite_tokens; 040 reset_tokens; 041 agency_api_keys |
| Multi-location + onboarding analytics | 042 multi_location; 043 onboarding_analytics |
| OFAC + high-priority | 044 ofac_screening; 045 high_priority_features |
| Backgrounds + F&I deep + GL + payments + payroll + multi-company | 046 vehicle_backgrounds; 047 fi_desking_deep; 048 general_ledger; 049 stripe_payments; 050 payroll_integration; 051 multi_company_gl |
| Late-stage additions | 052 new_feature_tables; 053 schema_alignment; 054 micro_behavioral_views |
| RLS hardening | 055 enforce_rls |

### Key tables by domain

- **Dealers + tenancy**: `dealers`, `dealer_domains`, `dealer_users`, `dealer_settings`, `dealer_branding`, `multi_location` (042).
- **Inventory + vehicles**: `vehicles`, `dms_feeds`, `vehicle_backgrounds` (046), `ev_fields` (009).
- **Leads + scoring**: `leads`, `lead_scores` (007).
- **F&I + desking**: `fi_deals` (021), `fi_desking_deep` (047), `lender_portal` (026), `credit_bureau` (027).
- **Service + parts**: migration 022.
- **Accounting / GL / payments / payroll**: `general_ledger_*` (048, 051), `stripe_payments_*` (049), `payroll_*` (050), `deal_accounting` (024).
- **Compliance**: migrations 006, 029, `ofac_screening` (044), `document_vault` (028).
- **Comms**: `comms_automation` (023), drip campaigns, email + SMS outbound.
- **Reviews**: migration 025.
- **Auth**: `users`, `sessions`, `mfa_*` (020), `invite_tokens` (039), `reset_tokens` (040), `agency_api_keys` (041).
- **Analytics / learning**: `analytics_events`, `micro_behavioral_*` views (054), `onboarding_analytics_*` (043).
- **Audit**: `audit_log` (hash-chained; verify via `npm run verify:audit` if present, otherwise `audit-log-immutable` tests).
- **Outbound webhooks**: `webhook_outbound_subscriptions`, `webhook_outbound_deliveries` (034).

### RLS

Migration 055 `enforce_rls.sql` raised the bar. Every table must have `ROW LEVEL SECURITY` enabled and a policy keyed on `dealer_id` (or `tenant_id` for legacy tables). `npm run verify:rls` scans the schema and fails CI if a table is unprotected.

### Views for learning

- `micro_behavioral_*` views (migration 054) aggregate `analytics_events` into per-lead / per-dealer signal rows.
- `onboarding_analytics_funnel` (migration 043) powers the onboarding funnel surface.

## Redis

- Cache layer: hot reads (inventory summaries, dealer config).
- Rate limiter: token-bucket keyed on `(ip, route)`, `(dealer_id, route)`, or `(session_id, route)`.
- Circuit breaker: flip-on failure counters with TTL-based half-open.

## Elasticsearch

- Index per dealer (or a shared index keyed on `dealer_id` — verify in `src/lib/elasticsearch.ts`).
- Populated by `scripts/index-vehicles.ts` (bulk) + inline `indexVehicle()` on DMS ingest.
- Query path: `src/lib/vehicle-search.ts` → `lib/elasticsearch.ts`.

## S3

- Bucket holds vehicle media: raw photos, AI-generated backgrounds, walkaround videos.
- Signed URLs issued via `@aws-sdk/s3-request-presigner`. Never expose raw bucket URLs.
- Background-generation worker writes to `s3://.../backgrounds/<vehicle_id>/<timestamp>.jpg`.

## Qdrant

- Semantic index for triple-write entities: leads, conversations, trade-in evaluations, walkaround sessions.
- Writes go through `src/lib/triple-write.ts` only. Never direct.

## Neo4j

- Relationship graph: dealer → lead → vehicle → deal → service.
- Drives cross-entity reasoning in the analytics brain.
- Populated by triple-write; read by analytics-engine signal generators.
