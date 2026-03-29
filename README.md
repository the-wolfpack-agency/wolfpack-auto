# Wolfpack Auto

The Intelligent Dealer Operating System -- a unified platform that replaces 8-12 disconnected dealer tools with a single system that learns from every interaction.

Built with Next.js 15, TypeScript, PostgreSQL, and deployed on Vercel.

## Architecture

- **Next.js 15** (App Router) -- server-rendered pages with Edge middleware
- **PostgreSQL** (Neon) -- multi-tenant with Row-Level Security, 46 tables, 35 migrations
- **Redis** (optional) -- rate limiting and caching (in-memory fallback)
- **Qdrant** -- vector store for knowledge base and semantic search
- **Resend** -- transactional email (lead notifications, customer confirmations)
- **Sentry** -- error monitoring with source maps and session replay
- **Vercel** -- hosting, edge functions, auto-SSL

## Quick Start

```bash
# Install dependencies
npm install

# Run in shadow mode (no database required -- uses sample data)
npm run dev

# With database
npm run db:migrate && npm run db:seed && npm run dev
```

The app starts at [http://localhost:3000](http://localhost:3000). Admin panel at `/admin`.

## What's Included

- **55+ admin pages** -- grouped into 8 collapsible sidebar sections for intuitive navigation
- **80+ API routes** -- all with shadow mode fallback (work without a database)
- **2,500+ automated tests** -- unit, E2E, security regression, mutation testing, platform integrity validation
- **Document compliance engine** -- 20+ regulatory rules (TILA, FCRA, ECOA, FTC, GLBA)
- **Behavioral analytics brain** -- 30+ signals, closed-loop learning, compound insights
- **Zero-token security scanner** -- 298 patterns across 5 languages
- **Multi-tenant architecture** -- subdomain routing, RLS, dealer isolation
- **PII encryption** -- AES-256-GCM for customer data at rest
- **Circuit breaker** -- automatic shadow mode failover on DB outage
- **System health dashboard** -- real-time monitoring of all dependencies

## Project Structure

```
src/
  app/                    # Next.js App Router
    (public pages)        # /, /about, /contact, /inventory, /trade-in, /service-booking
    admin/                # 55+ admin pages
    api/                  # 80+ API routes
  components/             # Shared React components
  lib/                    # 60+ business logic modules
  db/migrations/          # 35 SQL migration files
  instrumentation.ts      # Sentry server/edge init
  instrumentation-client.ts # Sentry client init
  middleware.ts           # Edge middleware (tenant, auth, CSRF, security headers)
tests/
  e2e/                    # Playwright E2E tests (160+ files)
  shadow-hardening/       # Shadow mode verification
scripts/
  predeploy-gate.sh       # 4-step pre-deploy verification
  nightly-safety-net-check.sh # Mutation testing
  auto-rollback.sh        # Auto-rollback on failed deploy
docs/                     # Complete platform documentation (10 files)
```

## Security

- HSTS with preload, restrictive CSP, X-Frame-Options DENY
- TOTP MFA for admin accounts with backup codes
- Login rate limiting (5 attempts / 15 min)
- API rate limiting on 8 high-risk mutation routes
- Request body guard (1MB limit)
- CSRF double-submit cookie on public forms
- PII encryption (AES-256-GCM) for customer emails/phones
- Sentry error monitoring with CSP-compliant ingest

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (shadow mode) |
| `npm run build` | Production build |
| `npm test` | All Playwright tests |
| `npm run test:unit` | Jest unit tests |
| `npm run test:smoke` | Quick smoke tests |
| `npm run test:shadow` | Shadow hardening suite |
| `npm run predeploy` | Full pre-deploy gate (TS + lint + build + E2E) |
| `npm run nightly:safety-check` | Mutation testing of test suite |
| `npm run nightly:pentest` | 126 automated penetration tests |
| `npm run agenticqa:scan` | AgenticQA pipeline scan |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed sample data |

## Documentation

See [docs/](docs/) for complete platform documentation including architecture, API reference, testing guide, compliance rules, analytics system, and investor white paper.
