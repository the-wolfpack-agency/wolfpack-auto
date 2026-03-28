# Getting Started -- Developer Onboarding

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **PostgreSQL** 15+ (optional -- the platform runs in shadow mode without it)
- **Redis** 7+ (optional -- rate limiting falls back to in-memory)
- **Git**

For E2E tests:
- **Playwright** browsers: `npx playwright install`

## Clone and Install

```bash
git clone <repo-url>
cd wolfpack-auto
npm install
```

## Environment Variables

Create a `.env.local` file. The platform runs without any env vars in shadow mode (sample data, no database). For full functionality:

### Required for Production

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/wolfpack`) |
| `NEXTAUTH_SECRET` | Random 32+ character string for JWT signing |
| `NEXTAUTH_URL` | Full URL of the deployment (e.g. `https://app.wolfpackauto.com`) |

### Recommended for Production

| Variable | Purpose |
|----------|---------|
| `PII_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption of customer PII |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error monitoring (client + server + edge) |
| `SENTRY_ORG` | Sentry org slug (for source map uploads) |
| `SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Sentry auth token with `org:ci` scope |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | Sender email (default: `Wolfpack Motors <leads@wolfpackauto.com>`) |
| `DEALER_ID` | Default dealer ID for single-tenant deployments |

### Optional

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Redis connection for rate limiting and caching (in-memory fallback) |
| `QDRANT_URL` | Qdrant URL for knowledge base vector storage |
| `STRIPE_SECRET_KEY` | Stripe key for billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `OEM_ID` | OEM identifier for OEM-scoped admin portals |
| `DEMO_MODE` | Set to `true` to bypass auth (demos only, never production) |
| `MARKETING_SITE_URL` | URL to redirect unknown tenants (default: `https://wolfpackauto.com`) |

### Generate Secrets

```bash
bash scripts/generate_secrets.sh
```

## Running Locally

```bash
# Shadow mode (no database required -- uses sample data)
npm run dev
```

The app starts at `http://localhost:3000`. Admin panel is at `/admin`.

### With Database

```bash
# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed

# Start dev server
npm run dev
```

### Provision a New Dealer

```bash
tsx scripts/provision_dealer.ts
```

## Running Tests

```bash
# All Playwright tests
npm test

# Unit tests (Jest)
npm run test:unit

# Smoke tests only
npm run test:smoke

# E2E tests
npm run test:e2e

# Shadow hardening tests
npm run test:shadow

# With UI (headed browser)
npm run test:headed

# Interactive Playwright UI
npm run test:ui
```

## Making Changes

1. Create a feature branch
2. Make changes -- all API routes follow the shadow mode pattern (see [Architecture](./architecture.md))
3. Run `npm run type-check` to verify TypeScript
4. Run `npm run lint` to check ESLint rules
5. Run `npm run test:smoke` for a quick sanity check
6. Run `npm run predeploy` for the full pre-deploy gate

## Deploy Process

1. Push to `main` branch
2. Vercel auto-deploys from `main`
3. Pre-deploy gate runs automatically via `npm run predeploy`
4. Database migrations run via `npm run db:migrate`

For manual deploy verification:

```bash
npm run predeploy        # Full gate (type-check + lint + tests)
npm run predeploy:quick  # Quick gate (type-check + lint only)
```

## Related Documentation

- [Architecture](./architecture.md) -- technical details, directory structure, deploy pipeline
- [Testing Guide](./testing.md) -- comprehensive test information
- [Platform Map](./platform-map.md) -- every page and route in the system
