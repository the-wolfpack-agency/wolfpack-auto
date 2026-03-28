# Wolfpack Auto — Session Handoff
**Date:** March 28, 2026 (evening session)
**HEAD commit:** `15a7058` — feat: configure Sentry + Resend, migrate to Next.js instrumentation pattern
**Deployed:** https://wolfpack-auto.vercel.app

---

## What Was Done This Session

### Production Infrastructure Configured
| Service | Status | Details |
|---------|--------|---------|
| **Sentry** | Verified | DSN set, source maps uploading, CSP configured, test error received (WOLFPACK-AUTO-1) |
| **Resend** | Configured | API key set, from email set to `onboarding@resend.dev` (free tier, no custom domain yet) |
| **PII Encryption** | Active | AES-256-GCM key generated and set on Vercel |
| **Lead Submission** | Verified | End-to-end test: form -> DB -> queued for processing |
| **Inventory API** | Verified | Returns full vehicle data |

### Code Changes
1. **Sentry migration** -- moved from deprecated `sentry.{client,server,edge}.config.ts` to Next.js instrumentation pattern (`src/instrumentation.ts` + `src/instrumentation-client.ts`)
2. **CSP fix** -- added Sentry ingest domains to `connect-src` in `src/lib/security-headers.ts` (the actual enforced CSP, not just `next.config.mjs`)
3. **Health dashboard fix** -- `SENTRY_DSN` -> `NEXT_PUBLIC_SENTRY_DSN` (was checking wrong env var)
4. **Replaced Plausible card** -- health dashboard now shows "Analytics (Postgres)" instead of unconfigured Plausible
5. **All docs updated** -- README, whitepaper, architecture, getting-started, release report, handoff

### Vercel Environment Variables (Production)
| Variable | Set |
|----------|-----|
| `DATABASE_URL` | Yes (Neon) |
| `NEXTAUTH_SECRET` | Yes |
| `NEXTAUTH_URL` | Yes |
| `DEALER_ID` | Yes |
| `DEMO_MODE` | Yes (`true`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes |
| `SENTRY_ORG` | Yes (`wolfpack-dc`) |
| `SENTRY_PROJECT` | Yes (`wolfpack-auto`) |
| `SENTRY_AUTH_TOKEN` | Yes |
| `RESEND_API_KEY` | Yes |
| `RESEND_FROM_EMAIL` | Yes (`onboarding@resend.dev`) |
| `PII_ENCRYPTION_KEY` | Yes (AES-256-GCM, 32-byte) |

---

## System Health Dashboard Status

| Component | Status |
|-----------|--------|
| Database | Connected, 68ms latency |
| Circuit Breaker | CLOSED (healthy) |
| Redis | Not configured (in-memory fallback -- working fine) |
| Analytics (Postgres) | Configured, events flowing |
| Resend (email) | Configured |
| Sentry (errors) | Configured, verified |
| Twilio (SMS) | Not configured (not needed yet) |

---

## Ready for Hoxsie Testing

The platform is ready for demo/evaluation:
- DEMO_MODE=true means no login required for admin access
- All features functional in shadow mode + live DB
- Sentry will capture any errors he encounters
- Analytics pipeline will track his usage

## Pre-Launch Checklist (Before Real Customer Data)

- [ ] Buy a domain (wolfpackauto.com or similar)
- [ ] Remove DEMO_MODE=true from Vercel
- [ ] Create admin login for Hoxsie
- [ ] Add custom domain to Resend (enables sending to any email)
- [ ] MFA enrollment for admin users

## How to Run

```bash
cd /Users/nicholashomyk/mono/AgenticQA/wolfpack-auto
npm run dev                    # localhost:3000
npx vercel --prod              # deploy to production
npx vercel env ls              # list all env vars
```

---

## Key Files Changed This Session

| File | Change |
|------|--------|
| `src/instrumentation.ts` | NEW -- Sentry server/edge init |
| `src/instrumentation-client.ts` | NEW -- Sentry client init |
| `sentry.client.config.ts` | DELETED (migrated) |
| `sentry.server.config.ts` | DELETED (migrated) |
| `sentry.edge.config.ts` | DELETED (migrated) |
| `src/lib/security-headers.ts` | Added Sentry ingest to CSP connect-src |
| `src/app/api/admin/system/health/route.ts` | Fixed Sentry env var name, replaced Plausible with Postgres analytics |
| `next.config.mjs` | Added Sentry ingest to CSP (backup, middleware is primary) |
| `README.md` | Complete rewrite with accurate architecture |
| `docs/wolfpack-auto-whitepaper.md` | Updated numbers, added Sentry/Resend/PII |
| `docs/architecture.md` | Updated migrations count, removed stale services, added monitoring docs |
| `docs/getting-started.md` | Updated env var table |
| `demo/wolfpack-auto-release-report.md` | Updated infra status, next steps |
