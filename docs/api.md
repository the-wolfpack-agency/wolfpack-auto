# Wolfpack Auto — API Reference

> Auto-generated 2026-07-26 from `src/app/api/**/route.ts`.  
> Do not edit by hand — run `npm run openapi` to regenerate.

**Total routes:** 339

## Contents

- [ab](#ab)
- [address](#address)
- [admin](#admin)
- [agency](#agency)
- [analytics](#analytics)
- [audit-request](#audit-request)
- [auth](#auth)
- [chat](#chat)
- [contact](#contact)
- [cron](#cron)
- [csp-report](#csp-report)
- [demo](#demo)
- [dms](#dms)
- [errors](#errors)
- [health](#health)
- [images](#images)
- [inventory](#inventory)
- [leads](#leads)
- [literacy](#literacy)
- [openapi](#openapi)
- [operator](#operator)
- [prequal](#prequal)
- [privacy](#privacy)
- [security-posture](#security-posture)
- [service](#service)
- [status](#status)
- [surveys](#surveys)
- [touchpoints](#touchpoints)
- [trade-in](#trade-in)
- [vehicle-provenance](#vehicle-provenance)
- [vehicles](#vehicles)
- [walkaround](#walkaround)
- [webhooks](#webhooks)
- [website-audit-request](#website-audit-request)

## ab

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/ab/assign` | GET /api/ab/assign?test=hero-cta&visitor_id=optional-vid | — | Yes |
| `POST` | `/api/ab/convert` | POST /api/ab/convert | — | Yes |
| `GET` | `/api/ab/results` | GET /api/ab/results?test=hero-cta | — | — |

## address

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/address/validate` | Create validate | — | Yes |

## admin

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/admin/accept-invite` | POST /api/admin/accept-invite | — | — |
| `GET` | `/api/admin/accounting/chart` | List chart | Bearer | — |
| `POST` | `/api/admin/accounting/chart` | Create chart | Bearer | — |
| `GET` | `/api/admin/accounting/chart-of-accounts` | List chart-of-accounts | Bearer | — |
| `POST` | `/api/admin/accounting/chart-of-accounts` | Create chart-of-account | Bearer | — |
| `GET` | `/api/admin/accounting/commissions` | List commissions | Bearer | — |
| `POST` | `/api/admin/accounting/commissions` | Create commission | Bearer | — |
| `POST` | `/api/admin/accounting/export` | Create export | Bearer | — |
| `GET` | `/api/admin/accounting/journal` | List journal | Bearer | — |
| `POST` | `/api/admin/accounting/journal` | Create journal | Bearer | — |
| `GET` | `/api/admin/accounting/sales-log` | List sales-log | Bearer | — |
| `POST` | `/api/admin/accounting/sales-log` | Create sales-log | Bearer | — |
| `GET` | `/api/admin/accounting/statements` | List statements | Bearer | — |
| `GET` | `/api/admin/accounting/summary` | List summary | Bearer | — |
| `GET` | `/api/admin/alerts` | List alerts | Bearer | — |
| `PATCH` | `/api/admin/alerts` | Update alert | Bearer | — |
| `GET` | `/api/admin/analytics/ab-tests` | GET /api/admin/analytics/ab-tests | Bearer | — |
| `POST` | `/api/admin/analytics/ab-tests` | GET /api/admin/analytics/ab-tests | Bearer | — |
| `GET` | `/api/admin/analytics/calibration` | GET /api/admin/analytics/calibration | Bearer | — |
| `POST` | `/api/admin/analytics/calibration` | GET /api/admin/analytics/calibration | Bearer | — |
| `GET` | `/api/admin/analytics/cohorts` | List cohorts | Bearer | — |
| `GET` | `/api/admin/analytics/dashboard` | GET /api/admin/analytics/dashboard | Bearer | — |
| `GET` | `/api/admin/analytics/fi-penetration` | List fi-penetration | Bearer | — |
| `GET` | `/api/admin/analytics/health` | GET /api/admin/analytics/health | Bearer | — |
| `GET` | `/api/admin/analytics/intelligence` | GET /api/admin/analytics/intelligence | Bearer | — |
| `GET` | `/api/admin/analytics/lead-source-roi` | List lead-source-roi | Bearer | — |
| `GET` | `/api/admin/analytics/learning` | List learning | Bearer | — |
| `GET` | `/api/admin/analytics/micro-signals` | List micro-signals | Bearer | — |
| `GET` | `/api/admin/analytics/platform-health` | GET /api/admin/analytics/platform-health | Bearer | — |
| `POST` | `/api/admin/analytics/query` | POST /api/admin/analytics/query | Bearer | — |
| `GET` | `/api/admin/analytics/subdashboards` | Sub-Dashboard Aggregation API | Bearer | — |
| `GET` | `/api/admin/analytics/tech-utilization` | List tech-utilization | Bearer | — |
| `GET` | `/api/admin/analytics/trim-velocity` | List trim-velocity | Bearer | — |
| `GET` | `/api/admin/analytics/verification` | List verification | Bearer | — |
| `POST` | `/api/admin/analytics/verification` | Analytics Verification API | Bearer | — |
| `GET` | `/api/admin/annotations` | List annotations | Bearer | — |
| `POST` | `/api/admin/annotations` | Create annotation | Bearer | — |
| `DELETE` | `/api/admin/annotations` | Delete annotation | Bearer | — |
| `GET` | `/api/admin/assistant/actions` | List actions | Bearer | — |
| `POST` | `/api/admin/assistant/chat` | Create chat | Bearer | — |
| `GET` | `/api/admin/assistant/conversations` | List conversations | Bearer | — |
| `GET` | `/api/admin/auction/benchmarks` | List benchmarks | Bearer | — |
| `GET` | `/api/admin/auction/opportunities` | List opportunities | Bearer | — |
| `POST` | `/api/admin/auction/opportunities/{id}/{action}` | Create opportunity | Bearer | — |
| `GET` | `/api/admin/billing` | List billing | Bearer | — |
| `POST` | `/api/admin/bulk-provision` | Verify agency-level access: either an authenticated owner/admin user, | Bearer | — |
| `GET` | `/api/admin/call-intelligence` | List call-intelligence | Bearer | — |
| `POST` | `/api/admin/call-intelligence` | Create call-intelligence | Bearer | — |
| `GET` | `/api/admin/change-management` | List change-management | Bearer | — |
| `POST` | `/api/admin/change-management` | Create change-management | Bearer | — |
| `PATCH` | `/api/admin/change-management` | Update change-management | Bearer | — |
| `GET` | `/api/admin/comms` | List comms | Bearer | — |
| `POST` | `/api/admin/comms` | Create comm | Bearer | — |
| `GET` | `/api/admin/comms/log` | List log | Bearer | — |
| `POST` | `/api/admin/comms/send` | Create send | Bearer | Yes |
| `GET` | `/api/admin/comms/sequences` | List sequences | Bearer | — |
| `POST` | `/api/admin/comms/sequences` | Create sequence | Bearer | — |
| `GET` | `/api/admin/comms/templates` | List templates | Bearer | — |
| `POST` | `/api/admin/comms/templates` | Create template | Bearer | — |
| `GET` | `/api/admin/competitive` | List competitive | Bearer | — |
| `POST` | `/api/admin/competitive` | Create competitive | Bearer | — |
| `GET` | `/api/admin/compliance` | GET  /api/admin/compliance  — return the latest compliance score for the current dealer | Bearer | Yes |
| `POST` | `/api/admin/compliance` | GET  /api/admin/compliance  — return the latest compliance score for the current dealer | Bearer | Yes |
| `GET` | `/api/admin/compliance/checks` | List checks | Bearer | Yes |
| `POST` | `/api/admin/compliance/checks` | Create check | Bearer | Yes |
| `PATCH` | `/api/admin/compliance/checks/{id}` | Update check | Bearer | — |
| `GET` | `/api/admin/connected-vehicles` | List connected-vehicles | Bearer | — |
| `POST` | `/api/admin/connected-vehicles/connect` | Create connect | Bearer | — |
| `GET` | `/api/admin/credentials` | GET  /api/admin/credentials             — list dealer credentials | Bearer | — |
| `POST` | `/api/admin/credentials` | Create credential | Bearer | — |
| `PATCH` | `/api/admin/credentials/{id}` | Update credential | Bearer | — |
| `DELETE` | `/api/admin/credentials/{id}` | PATCH  /api/admin/credentials/[id]  — rotate the stored plaintext | Bearer | — |
| `GET` | `/api/admin/credit/history` | List history | Bearer | — |
| `POST` | `/api/admin/credit/pull` | Create pull | Bearer | Yes |
| `GET` | `/api/admin/customers` | List customers | Bearer | — |
| `GET` | `/api/admin/customers/{id}` | Get customer | Bearer | — |
| `GET` | `/api/admin/data-export` | Per-dealer in-memory export history. POST writes to it on every | Bearer | — |
| `POST` | `/api/admin/data-export` | Per-dealer in-memory export history. POST writes to it on every | Bearer | — |
| `POST` | `/api/admin/deal-copilot/sessions` | Create session | Bearer | — |
| `POST` | `/api/admin/deal-copilot/sessions/{id}/close` | Create close | Bearer | — |
| `POST` | `/api/admin/deal-copilot/sessions/{id}/suggest` | Create suggest | Bearer | — |
| `POST` | `/api/admin/deal-copilot/suggestions/{id}/accept` | Create accept | Bearer | — |
| `POST` | `/api/admin/deal-copilot/suggestions/{id}/reject` | Create reject | Bearer | — |
| `GET` | `/api/admin/dealer-users` | List dealer-users | Bearer | — |
| `POST` | `/api/admin/dealer-users` | Create dealer-user | Bearer | — |
| `PATCH` | `/api/admin/dealer-users/{id}` | PATCH  /api/admin/dealer-users/[id] — update user (name, role, active toggle) | Bearer | — |
| `DELETE` | `/api/admin/dealer-users/{id}` | Delete dealer-user | Bearer | — |
| `GET` | `/api/admin/dealer/lenders` | List lenders | Bearer | — |
| `POST` | `/api/admin/dealer/lenders` | Create lender | Bearer | — |
| `PATCH` | `/api/admin/dealer/lenders/{id}` | Update lender | Bearer | — |
| `DELETE` | `/api/admin/dealer/lenders/{id}` | Delete lender | Bearer | — |
| `GET` | `/api/admin/dealers` | List dealers | Bearer | — |
| `POST` | `/api/admin/dealers` | Create dealer | Bearer | — |
| `PATCH` | `/api/admin/dealers` | Update dealer | Bearer | — |
| `DELETE` | `/api/admin/dealers/{id}` | Delete dealer | Bearer | — |
| `GET` | `/api/admin/deals` | GET  /api/admin/deals — List deal worksheets (filterable) | Bearer | Yes |
| `POST` | `/api/admin/deals` | GET  /api/admin/deals — List deal worksheets (filterable) | Bearer | Yes |
| `GET` | `/api/admin/deals/{dealId}` | GET   /api/admin/deals/[dealId] — Single deal detail | Bearer | — |
| `PATCH` | `/api/admin/deals/{dealId}` | GET   /api/admin/deals/[dealId] — Single deal detail | Bearer | — |
| `POST` | `/api/admin/deals/{dealId}/calculate` | POST /api/admin/deals/[dealId]/calculate — Payment calculator | Bearer | — |
| `GET` | `/api/admin/deals/{dealId}/submissions` | List submissions | Bearer | — |
| `POST` | `/api/admin/deals/{dealId}/submit` | Create submit | Bearer | — |
| `POST` | `/api/admin/deals/sign` | POST /api/admin/deals/sign | Bearer | — |
| `GET` | `/api/admin/deliveries` | List deliveries | Bearer | — |
| `POST` | `/api/admin/deliveries` | Create delivery | Bearer | — |
| `GET` | `/api/admin/desking` | List desking | Bearer | — |
| `POST` | `/api/admin/desking` | Create desking | Bearer | — |
| `GET` | `/api/admin/desking/lenders` | List lenders | Bearer | — |
| `POST` | `/api/admin/desking/lenders` | Create lender | Bearer | — |
| `POST` | `/api/admin/desking/scenarios` | Create scenario | Bearer | — |
| `POST` | `/api/admin/digital-retail/calculator` | POST /api/admin/digital-retail/calculator | — | Yes |
| `GET` | `/api/admin/digital-retail/credit-app` | List credit-app | Bearer | — |
| `POST` | `/api/admin/digital-retail/credit-app` | Create credit-app | Bearer | — |
| `GET` | `/api/admin/dms-adapters` | List dms-adapters | Bearer | — |
| `POST` | `/api/admin/dms-adapters/{provider}` | Create dms-adapter | Bearer | — |
| `PATCH` | `/api/admin/dms-adapters/{provider}` | Update dms-adapter | Bearer | — |
| `DELETE` | `/api/admin/dms-adapters/{provider}` | Delete dms-adapter | Bearer | — |
| `GET` | `/api/admin/documents` | List documents | Bearer | Yes |
| `POST` | `/api/admin/documents` | Create document | Bearer | Yes |
| `GET` | `/api/admin/documents/{id}` | Get document | Bearer | — |
| `PATCH` | `/api/admin/documents/{id}` | Update document | Bearer | — |
| `DELETE` | `/api/admin/documents/{id}` | Delete document | Bearer | — |
| `GET` | `/api/admin/documents/analyze` | POST /api/admin/documents/analyze | Bearer | — |
| `POST` | `/api/admin/documents/analyze` | Create analyze | Bearer | — |
| `POST` | `/api/admin/documents/scan-all` | POST /api/admin/documents/scan-all | Bearer | — |
| `POST` | `/api/admin/documents/upload` | Create upload | Bearer | Yes |
| `GET` | `/api/admin/domains` | List domains | Bearer | — |
| `POST` | `/api/admin/domains` | Create domain | Bearer | — |
| `DELETE` | `/api/admin/domains` | Delete domain | Bearer | — |
| `GET` | `/api/admin/drip-campaigns` | List drip-campaigns | Bearer | — |
| `POST` | `/api/admin/drip-campaigns` | Create drip-campaign | Bearer | — |
| `GET` | `/api/admin/ecommerce-adapters` | List ecommerce-adapters | Bearer | — |
| `POST` | `/api/admin/ecommerce-adapters/{provider}` | Create ecommerce-adapter | Bearer | — |
| `PATCH` | `/api/admin/ecommerce-adapters/{provider}` | Update ecommerce-adapter | Bearer | — |
| `DELETE` | `/api/admin/ecommerce-adapters/{provider}` | Delete ecommerce-adapter | Bearer | — |
| `GET` | `/api/admin/econtracting` | GET  /api/admin/econtracting — List contract envelopes (filterable) | Bearer | Yes |
| `POST` | `/api/admin/econtracting` | GET  /api/admin/econtracting — List contract envelopes (filterable) | Bearer | Yes |
| `GET` | `/api/admin/econtracting/{contractId}` | GET   /api/admin/econtracting/[contractId] — Single contract detail | Bearer | — |
| `PATCH` | `/api/admin/econtracting/{contractId}` | GET   /api/admin/econtracting/[contractId] — Single contract detail | Bearer | — |
| `POST` | `/api/admin/econtracting/sign` | POST /api/admin/econtracting/sign — Simulate / initiate document signing | Bearer | Yes |
| `GET` | `/api/admin/engagement-reports` | List engagement-reports | Bearer | — |
| `POST` | `/api/admin/engagement-reports` | Create engagement-report | Bearer | — |
| `GET` | `/api/admin/equity-mining` | List equity-mining | Bearer | — |
| `POST` | `/api/admin/equity-mining` | Create equity-mining | Bearer | — |
| `GET` | `/api/admin/erating` | List erating | Bearer | — |
| `POST` | `/api/admin/erating` | Create erating | Bearer | — |
| `GET` | `/api/admin/error-monitor` | List error-monitor | Bearer | — |
| `POST` | `/api/admin/error-monitor` | Create error-monitor | Bearer | — |
| `GET` | `/api/admin/export/analytics` | GET /api/admin/export/analytics | Bearer | — |
| `GET` | `/api/admin/export/leads` | List leads | Bearer | — |
| `GET` | `/api/admin/fi-audit-runs` | List fi-audit-runs | — | — |
| `GET` | `/api/admin/fi-products` | GET  /api/admin/fi-products — List F&I product catalog | Bearer | — |
| `POST` | `/api/admin/fi-products` | GET  /api/admin/fi-products — List F&I product catalog | Bearer | — |
| `GET` | `/api/admin/floor-plan` | List floor-plan | Bearer | — |
| `POST` | `/api/admin/floor-plan` | Create floor-plan | Bearer | — |
| `PATCH` | `/api/admin/floor-plan/{id}` | Update floor-plan | Bearer | — |
| `GET` | `/api/admin/funnel-health` | GET /api/admin/funnel-health | Bearer | — |
| `GET` | `/api/admin/good-faith` | List good-faith | Bearer | — |
| `POST` | `/api/admin/good-faith` | Create good-faith | Bearer | — |
| `PATCH` | `/api/admin/good-faith` | Update good-faith | Bearer | — |
| `GET` | `/api/admin/heatmaps` | List heatmaps | Bearer | — |
| `GET` | `/api/admin/heatmaps/diagnostic` | List diagnostic | Bearer | — |
| `GET` | `/api/admin/households` | List households | Bearer | — |
| `POST` | `/api/admin/households` | Create household | Bearer | — |
| `POST` | `/api/admin/intake` | POST /api/admin/intake | Bearer | — |
| `GET` | `/api/admin/intake/recommendations` | GET /api/admin/intake/recommendations | Bearer | — |
| `POST` | `/api/admin/inventory` | Create inventory | Bearer | — |
| `POST` | `/api/admin/inventory-pool/join` | Create join | Bearer | — |
| `POST` | `/api/admin/inventory-pool/leave` | Create leave | Bearer | — |
| `POST` | `/api/admin/inventory-pool/reservations/{id}/{action}` | Create reservation | Bearer | — |
| `GET` | `/api/admin/inventory-pool/reserve` | List reserve | Bearer | — |
| `POST` | `/api/admin/inventory-pool/reserve` | Create reserve | Bearer | — |
| `GET` | `/api/admin/inventory-pool/swaps` | List swaps | Bearer | — |
| `POST` | `/api/admin/inventory-pool/swaps` | Create swap | Bearer | — |
| `POST` | `/api/admin/inventory-pool/swaps/{id}/{action}` | Create swap | Bearer | — |
| `GET` | `/api/admin/inventory-pool/visible` | List visible | Bearer | — |
| `PUT` | `/api/admin/inventory/{vin}` | PUT  /api/admin/inventory/[vin]  — update a vehicle | Bearer | — |
| `DELETE` | `/api/admin/inventory/{vin}` | PUT  /api/admin/inventory/[vin]  — update a vehicle | Bearer | — |
| `GET` | `/api/admin/inventory/export` | GET /api/admin/inventory/export — Export dealer inventory as CSV | Bearer | — |
| `POST` | `/api/admin/inventory/import` | POST /api/admin/inventory/import | Bearer | Yes |
| `GET` | `/api/admin/knowledge/ingest` | Knowledge Store Ingestion Endpoint | Bearer | — |
| `POST` | `/api/admin/knowledge/ingest` | Knowledge Store Ingestion Endpoint | Bearer | — |
| `POST` | `/api/admin/knowledge/query` | Knowledge Store Query Endpoint | Bearer | — |
| `GET` | `/api/admin/labor-insights` | List labor-insights | Bearer | — |
| `GET` | `/api/admin/lead-ingestion` | List lead-ingestion | Bearer | — |
| `POST` | `/api/admin/lead-ingestion` | Create lead-ingestion | Bearer | — |
| `GET` | `/api/admin/lead-sources` | List lead-sources | Bearer | — |
| `POST` | `/api/admin/lead-sources` | Create lead-source | Bearer | — |
| `GET` | `/api/admin/leads` | Fallback dealer UUID used when DEALER_ID env var is not set (demo mode). */ | Bearer | — |
| `GET` | `/api/admin/leads/{id}` | Fallback dealer UUID used when DEALER_ID env var is not set (demo mode). */ | Bearer | — |
| `PUT` | `/api/admin/leads/{id}` | Fallback dealer UUID used when DEALER_ID env var is not set (demo mode). */ | Bearer | — |
| `DELETE` | `/api/admin/leads/{id}` | Fallback dealer UUID used when DEALER_ID env var is not set (demo mode). */ | Bearer | — |
| `POST` | `/api/admin/leads/{id}/convert` | POST /api/admin/leads/[id]/convert — Convert a lead into a deal worksheet. | Bearer | Yes |
| `GET` | `/api/admin/leads/{id}/enrichment` | List enrichment | Bearer | — |
| `POST` | `/api/admin/leads/bulk` | Create bulk | Bearer | Yes |
| `GET` | `/api/admin/leads/predict` | GET /api/admin/leads/predict  — Predictive scores for all active leads | Bearer | — |
| `POST` | `/api/admin/leads/predict` | Create predict | Bearer | — |
| `POST` | `/api/admin/leads/score` | Create score | Bearer | — |
| `POST` | `/api/admin/leads/score-all` | Create score-all | Bearer | — |
| `GET` | `/api/admin/lender-routing` | GET  /api/admin/lender-routing — List credit app submissions (filterable) | Bearer | Yes |
| `POST` | `/api/admin/lender-routing` | GET  /api/admin/lender-routing — List credit app submissions (filterable) | Bearer | Yes |
| `GET` | `/api/admin/lender-routing/{submissionId}` | GET   /api/admin/lender-routing/[submissionId] — Single submission detail | Bearer | — |
| `PATCH` | `/api/admin/lender-routing/{submissionId}` | GET   /api/admin/lender-routing/[submissionId] — Single submission detail | Bearer | — |
| `GET` | `/api/admin/lender-routing/lenders` | GET /api/admin/lender-routing/lenders — Available lenders by platform | Bearer | — |
| `GET` | `/api/admin/lenders` | List lenders | Bearer | Yes |
| `POST` | `/api/admin/lenders` | Create lender | Bearer | Yes |
| `GET` | `/api/admin/lenders/{id}` | Get lender | Bearer | — |
| `PATCH` | `/api/admin/lenders/{id}` | Update lender | Bearer | — |
| `GET` | `/api/admin/literacy/actions` | List actions | — | — |
| `POST` | `/api/admin/literacy/actions` | Create action | — | — |
| `PATCH` | `/api/admin/literacy/actions/{id}` | Update action | — | — |
| `DELETE` | `/api/admin/literacy/actions/{id}` | Delete action | — | — |
| `GET` | `/api/admin/literacy/concepts` | List concepts | — | — |
| `POST` | `/api/admin/literacy/concepts` | Create concept | — | — |
| `GET` | `/api/admin/literacy/concepts/{id}` | Get concept | — | — |
| `PATCH` | `/api/admin/literacy/concepts/{id}` | Update concept | — | — |
| `DELETE` | `/api/admin/literacy/concepts/{id}` | Delete concept | — | — |
| `GET` | `/api/admin/literacy/mappings` | List mappings | — | — |
| `POST` | `/api/admin/literacy/mappings` | Create mapping | — | — |
| `DELETE` | `/api/admin/literacy/mappings/{id}` | Delete mapping | — | — |
| `GET` | `/api/admin/literacy/metrics` | List metrics | — | — |
| `POST` | `/api/admin/literacy/metrics` | Create metric | — | — |
| `GET` | `/api/admin/literacy/metrics/{id}` | Get metric | — | — |
| `PATCH` | `/api/admin/literacy/metrics/{id}` | Update metric | — | — |
| `DELETE` | `/api/admin/literacy/metrics/{id}` | Delete metric | — | — |
| `GET` | `/api/admin/literacy/tooltips` | List tooltips | — | — |
| `POST` | `/api/admin/literacy/tooltips` | Create tooltip | — | — |
| `PATCH` | `/api/admin/literacy/tooltips/{id}` | Update tooltip | — | — |
| `DELETE` | `/api/admin/literacy/tooltips/{id}` | Delete tooltip | — | — |
| `GET` | `/api/admin/literacy/translations` | List translations | — | — |
| `POST` | `/api/admin/literacy/translations` | Create translation | — | — |
| `PATCH` | `/api/admin/literacy/translations/{id}` | Update translation | — | — |
| `DELETE` | `/api/admin/literacy/translations/{id}` | Delete translation | — | — |
| `GET` | `/api/admin/literacy/walkthroughs` | List walkthroughs | — | — |
| `POST` | `/api/admin/literacy/walkthroughs` | Create walkthrough | — | — |
| `GET` | `/api/admin/literacy/walkthroughs/{id}` | Get walkthrough | — | — |
| `PATCH` | `/api/admin/literacy/walkthroughs/{id}` | Update walkthrough | — | — |
| `DELETE` | `/api/admin/literacy/walkthroughs/{id}` | Delete walkthrough | — | — |
| `GET` | `/api/admin/locations` | List locations | Bearer | — |
| `POST` | `/api/admin/locations` | Create location | Bearer | — |
| `GET` | `/api/admin/locations/{locationId}` | Get location | Bearer | — |
| `PUT` | `/api/admin/locations/{locationId}` | Update location | Bearer | — |
| `DELETE` | `/api/admin/locations/{locationId}` | Delete location | Bearer | — |
| `GET` | `/api/admin/maintenance-leads` | List maintenance-leads | Bearer | — |
| `POST` | `/api/admin/maintenance-leads/{id}/complete` | Create complete | Bearer | — |
| `POST` | `/api/admin/maintenance-leads/{id}/dismiss` | Create dismis | Bearer | — |
| `GET` | `/api/admin/marketing` | List marketing | Bearer | — |
| `POST` | `/api/admin/marketing` | Create marketing | Bearer | — |
| `GET` | `/api/admin/marketing/templates` | List templates | Bearer | — |
| `POST` | `/api/admin/marketing/templates` | Create template | Bearer | — |
| `GET` | `/api/admin/marketing/templates/{id}` | Get template | Bearer | — |
| `POST` | `/api/admin/marketing/templates/{id}` | Create template | Bearer | — |
| `GET` | `/api/admin/marketing/templates/{id}/canva` | List canva | Bearer | — |
| `GET` | `/api/admin/marketing/templates/performance` | List performance | Bearer | — |
| `DELETE` | `/api/admin/mfa/disable` | Delete disable | Bearer | — |
| `POST` | `/api/admin/mfa/enable` | Create enable | Bearer | — |
| `POST` | `/api/admin/mfa/setup` | Create setup | Bearer | — |
| `GET` | `/api/admin/mfa/status` | List status | Bearer | — |
| `POST` | `/api/admin/mfa/verify` | Create verify | — | — |
| `GET` | `/api/admin/modules` | GET /api/admin/modules — the current dealer's enabled-module allow-list + the | Bearer | — |
| `PUT` | `/api/admin/modules` | GET /api/admin/modules — the current dealer's enabled-module allow-list + the | Bearer | — |
| `GET` | `/api/admin/notifications/push` | GET /api/admin/notifications/push | Bearer | — |
| `POST` | `/api/admin/notifications/push` | GET /api/admin/notifications/push | Bearer | — |
| `GET` | `/api/admin/oem` | List oem | Bearer | — |
| `GET` | `/api/admin/oem/analytics` | List analytics | Bearer | — |
| `GET` | `/api/admin/oem/dealers` | List dealers | Bearer | — |
| `GET` | `/api/admin/oem/programs` | List programs | Bearer | — |
| `GET` | `/api/admin/ofac` | GET  /api/admin/ofac — List OFAC screening history (filterable) | Bearer | Yes |
| `POST` | `/api/admin/ofac` | GET  /api/admin/ofac — List OFAC screening history (filterable) | Bearer | Yes |
| `GET` | `/api/admin/ofac/{screeningId}` | GET   /api/admin/ofac/[screeningId] — Single screening detail | Bearer | — |
| `PATCH` | `/api/admin/ofac/{screeningId}` | GET   /api/admin/ofac/[screeningId] — Single screening detail | Bearer | — |
| `GET` | `/api/admin/omnichannel` | List omnichannel | Bearer | — |
| `POST` | `/api/admin/omnichannel` | Create omnichannel | Bearer | — |
| `POST` | `/api/admin/onboarding` | Parse a base64-encoded CSV string into vehicle rows. | Bearer | — |
| `PATCH` | `/api/admin/onboarding` | Update onboarding | Bearer | — |
| `GET` | `/api/admin/onboarding/status` | GET /api/admin/onboarding/status | Bearer | — |
| `GET` | `/api/admin/payments` | List payments | Bearer | — |
| `POST` | `/api/admin/payments` | Create payment | Bearer | — |
| `GET` | `/api/admin/payments/reconciliation` | List reconciliation | Bearer | — |
| `GET` | `/api/admin/payroll` | List payroll | Bearer | — |
| `POST` | `/api/admin/payroll` | Create payroll | Bearer | — |
| `GET` | `/api/admin/payroll/commissions` | List commissions | Bearer | — |
| `POST` | `/api/admin/payroll/commissions` | Create commission | Bearer | — |
| `POST` | `/api/admin/prequal/{id}/plaid-income` | Create plaid-income | Bearer | — |
| `POST` | `/api/admin/prequal/{id}/route-to-lender` | Create route-to-lender | Bearer | — |
| `GET` | `/api/admin/pricing` | GET  /api/admin/pricing  — return latest pricing report (cached < 24h) | Bearer | Yes |
| `POST` | `/api/admin/pricing` | GET  /api/admin/pricing  — return latest pricing report (cached < 24h) | Bearer | Yes |
| `PATCH` | `/api/admin/pricing/{vehicleId}` | Update pricing | Bearer | — |
| `GET` | `/api/admin/pricing/lot-report` | List lot-report | Bearer | — |
| `POST` | `/api/admin/pricing/optimize` | Create optimize | Bearer | — |
| `GET` | `/api/admin/pricing/recommendations` | List recommendations | Bearer | — |
| `GET` | `/api/admin/propensity` | List propensity | Bearer | — |
| `POST` | `/api/admin/propensity` | Create propensity | Bearer | — |
| `POST` | `/api/admin/quick-add` | POST /api/admin/quick-add | Bearer | — |
| `GET` | `/api/admin/reinsurance` | GET  /api/admin/reinsurance — Reinsurance programs, performance summary, and P&L | Bearer | — |
| `POST` | `/api/admin/reinsurance` | GET  /api/admin/reinsurance — Reinsurance programs, performance summary, and P&L | Bearer | — |
| `GET` | `/api/admin/reputation` | List reputation | Bearer | — |
| `POST` | `/api/admin/reset-password` | POST /api/admin/reset-password | — | — |
| `PUT` | `/api/admin/reset-password` | POST /api/admin/reset-password | — | — |
| `GET` | `/api/admin/resources` | List resources | Bearer | — |
| `POST` | `/api/admin/resources` | Create resource | Bearer | — |
| `POST` | `/api/admin/resources/analytics` | Create analytic | Bearer | — |
| `GET` | `/api/admin/reviews` | List reviews | Bearer | — |
| `POST` | `/api/admin/reviews` | Create review | Bearer | — |
| `POST` | `/api/admin/reviews/{id}/respond` | Create respond | Bearer | — |
| `GET` | `/api/admin/reviews/templates` | List templates | Bearer | — |
| `GET` | `/api/admin/rewards` | List rewards | Bearer | — |
| `POST` | `/api/admin/rewards` | Create reward | Bearer | — |
| `GET` | `/api/admin/security/scan` | GET  /api/admin/security/scan — Return last scan results (or mock results in shadow mode) | Bearer | — |
| `POST` | `/api/admin/security/scan` | GET  /api/admin/security/scan — Return last scan results (or mock results in shadow mode) | Bearer | — |
| `GET` | `/api/admin/service/appointments` | List appointments | Bearer | Yes |
| `POST` | `/api/admin/service/appointments` | Create appointment | Bearer | Yes |
| `PATCH` | `/api/admin/service/appointments/{id}` | Update appointment | Bearer | — |
| `GET` | `/api/admin/service/history/{vin}` | Get history | Bearer | — |
| `GET` | `/api/admin/service/parts` | List parts | Bearer | — |
| `POST` | `/api/admin/service/parts` | Create part | Bearer | — |
| `GET` | `/api/admin/service/repair-orders` | List repair-orders | Bearer | Yes |
| `POST` | `/api/admin/service/repair-orders` | Create repair-order | Bearer | Yes |
| `PATCH` | `/api/admin/service/repair-orders/{id}` | Update repair-order | Bearer | — |
| `GET` | `/api/admin/service/technicians` | List technicians | Bearer | — |
| `POST` | `/api/admin/service/technicians` | Create technician | Bearer | — |
| `PATCH` | `/api/admin/service/technicians` | Update technician | Bearer | — |
| `GET` | `/api/admin/session-replay` | List session-replay | Bearer | — |
| `POST` | `/api/admin/session-replay` | Create session-replay | Bearer | — |
| `GET` | `/api/admin/settings` | GET  /api/admin/settings — return current dealer configuration | Bearer | — |
| `PUT` | `/api/admin/settings` | GET  /api/admin/settings — return current dealer configuration | Bearer | — |
| `GET` | `/api/admin/settings/integrations` | List integrations | Bearer | — |
| `POST` | `/api/admin/settings/integrations` | Create integration | Bearer | — |
| `POST` | `/api/admin/settings/logo` | Create logo | Bearer | — |
| `DELETE` | `/api/admin/settings/logo` | Delete logo | Bearer | — |
| `GET` | `/api/admin/settings/notifications` | List notifications | Bearer | — |
| `PUT` | `/api/admin/settings/notifications` | Update notification | Bearer | — |
| `GET` | `/api/admin/sms` | List sms | Bearer | — |
| `POST` | `/api/admin/sms` | Create sm | Bearer | — |
| `GET` | `/api/admin/stats` | List stats | Bearer | — |
| `GET` | `/api/admin/surveys` | List surveys | Bearer | — |
| `POST` | `/api/admin/surveys` | Create survey | Bearer | — |
| `PATCH` | `/api/admin/surveys` | Update survey | Bearer | — |
| `DELETE` | `/api/admin/surveys` | Delete survey | Bearer | — |
| `GET` | `/api/admin/surveys/{surveyId}/responses` | List responses | Bearer | — |
| `POST` | `/api/admin/switch-dealer` | POST /api/admin/switch-dealer — switch session to a different dealer context | Bearer | — |
| `GET` | `/api/admin/syndication` | GET  /api/admin/syndication — List syndication feed configs | Bearer | Yes |
| `POST` | `/api/admin/syndication` | GET  /api/admin/syndication — List syndication feed configs | Bearer | Yes |
| `POST` | `/api/admin/syndication/export` | POST /api/admin/syndication/export — Trigger a manual feed export | Bearer | Yes |
| `GET` | `/api/admin/system/health` | GET /api/admin/system/health | Bearer | — |
| `GET` | `/api/admin/tasks` | List tasks | Bearer | — |
| `POST` | `/api/admin/tasks` | Create task | Bearer | — |
| `PATCH` | `/api/admin/tasks` | Update task | Bearer | — |
| `GET` | `/api/admin/touchpoints` | List touchpoints | Bearer | — |
| `GET` | `/api/admin/touchpoints/{id}` | Get touchpoint | Bearer | — |
| `GET` | `/api/admin/trade-in` | List trade-in | Bearer | — |
| `GET` | `/api/admin/training` | List training | Bearer | — |
| `POST` | `/api/admin/training` | Create training | Bearer | — |
| `GET` | `/api/admin/user-testing` | List user-testing | Bearer | — |
| `POST` | `/api/admin/user-testing` | Create user-testing | Bearer | — |
| `PATCH` | `/api/admin/user-testing` | Update user-testing | Bearer | — |
| `DELETE` | `/api/admin/user-testing` | Delete user-testing | Bearer | — |
| `GET` | `/api/admin/vehicle-history` | GET  /api/admin/vehicle-history — List vehicle history reports (filterable by vin, provider) | Bearer | Yes |
| `POST` | `/api/admin/vehicle-history` | GET  /api/admin/vehicle-history — List vehicle history reports (filterable by vin, provider) | Bearer | Yes |
| `GET` | `/api/admin/vehicle-history/{vin}` | GET /api/admin/vehicle-history/[vin] — Get the most recent report for a specific VIN | Bearer | — |
| `GET` | `/api/admin/vehicle-pipeline` | List vehicle-pipeline | Bearer | — |
| `POST` | `/api/admin/vehicle-pipeline` | Create vehicle-pipeline | Bearer | — |
| `GET` | `/api/admin/vehicle-provenance/{vin}` | Get vehicle-provenance | Bearer | — |
| `POST` | `/api/admin/vehicle-provenance/anchor` | Create anchor | Bearer | — |
| `POST` | `/api/admin/vehicle-provenance/record` | Create record | Bearer | — |
| `POST` | `/api/admin/vehicles` | Create vehicle | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}` | Get vehicle | Bearer | — |
| `PUT` | `/api/admin/vehicles/{vin}` | Update vehicle | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/autocheck` | List autocheck | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/buyers-guide` | List buyers-guide | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/carfax` | List carfax | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/edmunds-valuation` | List edmunds-valuation | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/market-intel` | GET  /api/admin/vehicles/[vin]/market-intel | Bearer | — |
| `POST` | `/api/admin/vehicles/{vin}/market-intel` | GET  /api/admin/vehicles/[vin]/market-intel | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/photos` | GET  /api/admin/vehicles/[vin]/photos — List photos for a vehicle | Bearer | Yes |
| `POST` | `/api/admin/vehicles/{vin}/photos` | GET  /api/admin/vehicles/[vin]/photos — List photos for a vehicle | Bearer | Yes |
| `GET` | `/api/admin/vehicles/{vin}/recalls` | List recalls | Bearer | — |
| `PATCH` | `/api/admin/vehicles/{vin}/recalls/{recallId}` | Update recall | Bearer | — |
| `GET` | `/api/admin/vehicles/{vin}/title-lien` | List title-lien | Bearer | — |
| `GET` | `/api/admin/vehicles/backgrounds` | GET  /api/admin/vehicles/backgrounds — List all backgrounds (presets + custom) | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds` | GET  /api/admin/vehicles/backgrounds — List all backgrounds (presets + custom) | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds/batch` | Create batch | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds/composite` | Create composite | Bearer | — |
| `GET` | `/api/admin/vehicles/backgrounds/custom/{id}` | GET    /api/admin/vehicles/backgrounds/custom/[id] — Get custom background details | Bearer | — |
| `PATCH` | `/api/admin/vehicles/backgrounds/custom/{id}` | GET    /api/admin/vehicles/backgrounds/custom/[id] — Get custom background details | Bearer | — |
| `DELETE` | `/api/admin/vehicles/backgrounds/custom/{id}` | GET    /api/admin/vehicles/backgrounds/custom/[id] — Get custom background details | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds/engagement` | Create engagement | Bearer | — |
| `GET` | `/api/admin/vehicles/backgrounds/insights` | List insights | Bearer | — |
| `GET` | `/api/admin/vehicles/backgrounds/recommend` | GET  /api/admin/vehicles/backgrounds/recommend?vin=xxx — Recommend background for one vehicle | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds/recommend` | GET  /api/admin/vehicles/backgrounds/recommend?vin=xxx — Recommend background for one vehicle | Bearer | — |
| `GET` | `/api/admin/vehicles/backgrounds/remove-bg` | POST /api/admin/vehicles/backgrounds/remove-bg — AI background removal | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds/remove-bg` | Create remove-bg | Bearer | — |
| `GET` | `/api/admin/vehicles/backgrounds/system/{id}` | Get system | Bearer | — |
| `POST` | `/api/admin/vehicles/backgrounds/upload` | Create upload | Bearer | — |
| `POST` | `/api/admin/vehicles/generate-listing` | Create generate-listing | Bearer | — |
| `POST` | `/api/admin/vehicles/index-all` | POST /api/admin/vehicles/index-all | Bearer | Yes |
| `GET` | `/api/admin/vin-decode` | GET /api/admin/vin-decode?vin=1HGCV1F34PA000001 | Bearer | — |
| `GET` | `/api/admin/walkarounds` | List walkarounds | Bearer | — |
| `POST` | `/api/admin/walkarounds` | Create walkaround | Bearer | — |
| `GET` | `/api/admin/webhooks` | Webhook config management — CRUD for outbound webhook subscriptions. | Bearer | — |
| `POST` | `/api/admin/webhooks` | Webhook config management — CRUD for outbound webhook subscriptions. | Bearer | — |
| `GET` | `/api/admin/webhooks/{id}` | Single webhook config — GET/PATCH/DELETE operations. | Bearer | — |
| `PATCH` | `/api/admin/webhooks/{id}` | Single webhook config — GET/PATCH/DELETE operations. | Bearer | — |
| `DELETE` | `/api/admin/webhooks/{id}` | Single webhook config — GET/PATCH/DELETE operations. | Bearer | — |
| `POST` | `/api/admin/webhooks/{id}/test` | Test webhook delivery — sends a sample payload to verify the URL. | Bearer | — |
| `GET` | `/api/admin/webhooks/deliveries` | Webhook delivery log — lists recent deliveries with optional status filter. | Bearer | — |
| `GET` | `/api/admin/website-audit-runs` | List website-audit-runs | — | — |

## agency

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/agency/api-keys` | List api-keys | Bearer | — |
| `POST` | `/api/agency/api-keys` | Create api-key | Bearer | — |
| `GET` | `/api/agency/dealers` | List dealers | Bearer | — |
| `GET` | `/api/agency/overview` | List overview | Bearer | — |

## analytics

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/analytics/events` | Log dataflow warnings once per process lifecycle. */ | — | Yes |
| `POST` | `/api/analytics/events` | Log dataflow warnings once per process lifecycle. */ | — | Yes |
| `GET` | `/api/analytics/insights` | List insights | — | — |

## audit-request

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/audit-request` | Create audit-request | — | Yes |
| `GET` | `/api/audit-request/{id}` | Get audit-request | — | — |

## auth

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/auth/{nextauth}` | Get auth | — | — |
| `POST` | `/api/auth/{nextauth}` | Create auth | — | — |

## chat

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/chat` | Cached dealer info populated on first request. */ | — | Yes |

## contact

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/contact` | Create contact | — | — |

## cron

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/cron/auction-sync` | List auction-sync | — | — |
| `GET` | `/api/cron/calibrate-predictions` | List calibrate-predictions | — | — |
| `GET` | `/api/cron/market-intel-refresh` | List market-intel-refresh | — | — |
| `GET` | `/api/cron/predict-leads` | GET /api/cron/predict-leads — Vercel cron job endpoint | — | — |
| `GET` | `/api/cron/process-sequences` | GET /api/cron/process-sequences — Vercel cron job endpoint | — | — |
| `GET` | `/api/cron/prune-analytics` | List prune-analytics | — | — |
| `GET` | `/api/cron/recall-refresh` | List recall-refresh | — | — |

## csp-report

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/csp-report` | Create csp-report | — | — |

## demo

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/demo` | List demo | — | Yes |
| `POST` | `/api/demo` | Create demo | — | Yes |
| `POST` | `/api/demo/convert` | Create convert | — | Yes |

## dms

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/dms/upload` | Create upload | Bearer | Yes |
| `POST` | `/api/dms/webhook` | Create webhook | — | Yes |

## errors

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/errors/report` | POST /api/errors/report — Public endpoint for client-side error reporting. | — | Yes |

## health

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/health` | List health | — | — |
| `GET` | `/api/health/deep` | GET /api/health/deep | — | — |

## images

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/images/{key}` | Get image | — | — |
| `POST` | `/api/images/upload` | Create upload | Bearer | — |

## inventory

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/inventory` | List inventory | — | — |
| `GET` | `/api/inventory/{vin}` | Get inventory | — | — |
| `GET` | `/api/inventory/feed` | POST /api/inventory/feed — DMS vehicle feed ingestion endpoint. | — | — |
| `POST` | `/api/inventory/feed` | Create feed | — | — |
| `POST` | `/api/inventory/nl-search` | Create nl-search | — | Yes |
| `GET` | `/api/inventory/recommendations` | GET /api/inventory/recommendations | — | — |
| `GET` | `/api/inventory/spotlight` | List spotlight | — | — |

## leads

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/leads` | Create lead | — | Yes |
| `POST` | `/api/leads/ingest` | POST /api/leads/ingest — Public webhook for third-party providers. | — | — |
| `POST` | `/api/leads/intake` | POST /api/leads/intake — modern lead intake endpoint. | — | Yes |

## literacy

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/literacy/walkthrough/{concept_slug}` | Get walkthrough | Bearer | — |

## openapi

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/openapi` | GET /api/openapi | — | — |

## operator

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/operator/audit` | List audit | — | — |
| `POST` | `/api/operator/auth/login` | Create login | — | — |
| `POST` | `/api/operator/auth/logout` | Create logout | — | — |
| `GET` | `/api/operator/dealers` | List dealers | — | — |
| `POST` | `/api/operator/dealers` | Create dealer | — | — |
| `GET` | `/api/operator/dealers/{id}` | Get dealer | — | — |
| `PATCH` | `/api/operator/dealers/{id}` | Update dealer | — | — |
| `DELETE` | `/api/operator/dealers/{id}` | Delete dealer | — | — |
| `GET` | `/api/operator/invites` | List invites | — | — |
| `POST` | `/api/operator/invites` | Create invite | — | — |
| `GET` | `/api/operator/invites/accept` | List accept | — | — |
| `POST` | `/api/operator/invites/accept` | Create accept | — | — |
| `GET` | `/api/operator/stats` | List stats | — | — |
| `GET` | `/api/operator/team` | List team | — | — |

## prequal

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/prequal/{id}/credit` | Create credit | — | Yes |
| `POST` | `/api/prequal/{id}/income` | Create income | — | Yes |
| `GET` | `/api/prequal/{id}/offers` | GET  /api/prequal/[id]/offers  (PUBLIC, rate-limited, session-id auth) | — | Yes |
| `POST` | `/api/prequal/start` | Create start | — | Yes |

## privacy

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/privacy/delete-data` | Create delete-data | Bearer | Yes |
| `POST` | `/api/privacy/export-data` | POST /api/privacy/export-data — CCPA data export (right to portability) | Bearer | — |

## security-posture

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/security-posture` | List security-posture | — | — |

## service

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/service/delivery` | List delivery | — | — |
| `GET` | `/api/service/schedule` | List schedule | — | — |
| `POST` | `/api/service/schedule` | Create schedule | — | — |
| `GET` | `/api/service/schedule/slots` | List slots | — | — |

## status

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/status` | List status | — | — |

## surveys

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/surveys/respond` | POST /api/surveys/respond — Public endpoint (no auth required). | — | Yes |

## touchpoints

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/touchpoints/scan` | Create scan | — | Yes |

## trade-in

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/trade-in/decode-vin` | POST /api/trade-in/decode-vin | — | Yes |
| `POST` | `/api/trade-in/estimate` | Create estimate | — | Yes |
| `POST` | `/api/trade-in/submit` | Create submit | — | Yes |

## vehicle-provenance

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/vehicle-provenance/{vin}/verify` | List verify | — | Yes |

## vehicles

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/vehicles/index` | POST /api/vehicles/index | Bearer | — |

## walkaround

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `GET` | `/api/walkaround` | List walkaround | — | — |
| `POST` | `/api/walkaround` | Create walkaround | — | — |

## webhooks

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/webhooks/resend` | Create resend | — | — |
| `POST` | `/api/webhooks/stripe` | Create stripe | — | — |
| `POST` | `/api/webhooks/telemetry/{provider}` | Create telemetry | — | — |
| `POST` | `/api/webhooks/twilio` | POST /api/webhooks/twilio — Public webhook for Twilio inbound SMS. | — | — |

## website-audit-request

| Method | Path | Summary | Auth | Rate-limited |
|--------|------|---------|------|-------------|
| `POST` | `/api/website-audit-request` | Create website-audit-request | — | Yes |
| `GET` | `/api/website-audit-request/{id}` | Get website-audit-request | — | — |
