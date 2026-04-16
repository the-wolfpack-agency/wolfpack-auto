# Client Context — Wolfpack Auto

Internal-only. Do not copy verbatim into client-facing artifacts.

## Product identity

- **Public name**: Wolfpack Auto (dealer DOS).
- **Repo**: `the-wolfpack-agency/wolfpack-auto`.
- **Positioning**: Modern dealer operating system — inventory, leads, F&I desking, service, accounting/GL, payroll, analytics. Targets parity with Tekion / CDK / Reynolds on the features that matter to independent and mid-market dealers.

## Audience

Dealership operators (GM, GSM, F&I manager, service advisor, BDC, accountant). Multi-tenant; every row keys on `dealer_id` and RLS policies enforce isolation (migration 055 made this the bar).

## Non-technical UI requirement

Brain / analytics surfaces MUST speak dealership language, not raw data or developer jargon. "30 leads are about to disappear" beats "session_count_delta crossed -0.4 std-dev." Copy for dealer users is plain English. Dev surfaces can be technical; user-visible dashboards can't.

## Mobile + desktop responsive

Every public page and every admin dashboard must render correctly on mobile + desktop. A broken widget = a failed feature.

## No client names in placeholders

No "Aidan", "CFTR", "Avis", or other client names in defaults, placeholder data, or perpetual UI examples. Generic examples only (e.g., "ACME Motors"). `src/lib/placeholder-data.ts` is the canonical source of generic placeholders.

## Required Vercel env vars (deployment blockers)

All must be set before test-client deployment — missing any = crash loop.

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (#1 blocker) |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` — session signing |
| `NEXTAUTH_URL` | Production URL (e.g. `https://auto.<domain>.com`) |
| `DEALER_ID` | Initial dealer tenant ID for test-client deploys |
| `REDIS_URL` | Rate limiter + cache + circuit breaker |
| `ELASTICSEARCH_URL` / `ELASTICSEARCH_API_KEY` | Vehicle search |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` | Media storage |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payments |
| `RESEND_API_KEY` | Email |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | SMS |
| `FAL_API_KEY` | Vehicle-background generation |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Error monitoring |
| `QDRANT_URL` / `QDRANT_API_KEY` | Triple-write vector store |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | Triple-write graph store |

`.env.example` is the source of truth for the full list — mirror it, don't reinvent it.

## Feature flags / posture in flight

- **Onboarding flow**: login → auto-redirect → 4-step wizard → dashboard. Setup completion tracked in `onboarding_complete` cookie + server-side events (migration 043 `onboarding_analytics.sql`).
- **Team invites**: stored in `invite_tokens` (migration 039), invite email dispatch is the current follow-up.
- **DMS provider selection in wizard**: stubbed UI; ingest path is live behind the scenes, wizard wiring is the follow-up.
- **Self-hack scanner**: 20 scanners, zero AI. Runs on `npm run agenticqa:scan`. Report latest in `demo/handoff-<date>.md`.

## Messaging guardrails

- Never reference competitors (Tekion, CDK, Reynolds, Dealertrack) by name in client materials.
- Public security posture: `docs/security-posture.md` + `/security-posture` page — use that wording verbatim externally.
- "Pass 2" admin-auth audit dated 2026-04-15 lives in `demo/admin-auth-pass-2-2026-04-15.md` — reference it, don't repeat conclusions.

## Session handoffs

Per-session context that isn't in git lives in `demo/handoff-<date>.md`. Always read the latest at session start and write one at session end.
