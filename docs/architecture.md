# Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.3+ |
| Language | TypeScript | 5.5+ |
| UI | React | 18.3+ |
| Styling | Tailwind CSS | 3.4+ |
| Auth | NextAuth.js (JWT strategy) | 4.24+ |
| Database | PostgreSQL (via `pg`) | 8.12+ |
| Cache / Rate Limiting | Redis (via `ioredis`) | 5.4+ |
| Search | Elasticsearch | 8.13+ |
| Vector Store | Qdrant (analytics) | -- |
| Graph DB | Neo4j (analytics graph) | -- |
| Object Storage | AWS S3 | -- |
| Email | Resend | 6.9+ |
| Payments | Stripe | 21.0+ |
| Image Processing | Sharp | 0.33+ |
| MFA | OTPAuth (TOTP) | 9.5+ |
| Validation | Zod | 3.23+ |
| Monitoring | Sentry | 10.46+ |
| SSL | acme-client | 5.4+ |
| Testing (E2E) | Playwright | 1.44+ |
| Testing (Unit) | Jest + ts-jest | 30.3+ / 29.4+ |
| Linting | ESLint (next config) | 8.57+ |

## Directory Structure

```
wolfpack-auto/
  src/
    app/                          # Next.js App Router
      (public pages)              # /, /about, /contact, /financing, /inventory, etc.
      admin/                      # Admin panel pages (40+ pages)
        page.tsx                  # Dashboard
        inventory/                # Inventory management
        leads/                    # Lead management
        deals/                    # Deal desking
        service/                  # Service department
        accounting/               # Accounting & commissions
        ...                       # 35+ more admin modules
      api/                        # API routes
        admin/                    # Authenticated admin API (90+ routes)
        analytics/                # Public analytics endpoints
        auth/                     # NextAuth endpoints
        contact/                  # Public contact form
        health/                   # Health check
        inventory/                # Public inventory API
        ...
    components/                   # Shared React components
      AdminSidebar.tsx            # Admin navigation (40 items)
      admin/                      # Admin-specific components
    lib/                          # Business logic modules
      analytics-engine.ts         # Triple-write analytics (PG + Qdrant + Neo4j)
      analytics-hooks.ts          # Typed event tracking (12 event categories)
      auth.ts                     # NextAuth config with MFA support
      auth-guard.ts               # requireAuth() / requireRole() guards
      compliance-scorer.ts        # OEM brand compliance (4 categories, 100pts)
      document-analyzer.ts        # Document compliance (21 rules, TILA/FCRA/ECOA)
      funnel-health.ts            # Lead pipeline health metrics
      lead-scorer.ts              # Rule-based lead intent scoring
      learning-aggregator.ts      # Computes insights from event data
      pricing-engine.ts           # Days-on-lot pricing intelligence
      trade-in-valuator.ts        # Trade-in value estimation
      security-headers.ts         # CSP, HSTS, X-Frame-Options, etc.
      ...                         # 60+ library modules
    db/
      migrations/                 # 21 SQL migration files
        001_initial_schema.sql
        ...
        030_floor_plan.sql
      migrate.ts                  # Migration runner
      seed.ts                     # Seed data
    middleware.ts                  # Edge middleware (tenant resolution, auth, CSRF, security headers)
  tests/                          # Test suites
    smoke.spec.ts                 # Smoke tests
    e2e/                          # End-to-end tests (30+ files)
    shadow-hardening/             # Shadow mode verification (30+ files)
    shadow/                       # Shadow integration tests
    api/                          # API-level tests
    pages/                        # Page-level tests
    load/                         # k6 load tests
    rls/                          # Row-level security tests
  scripts/                        # Operations scripts
    predeploy-gate.sh             # Pre-deploy verification
    nightly-safety-net-check.sh   # Nightly safety net
    shadow-test.sh                # Shadow mode test runner
    ...
```

## Shadow Mode Pattern

Every API route in the platform follows the "shadow mode" pattern. When `DATABASE_URL` is not set, routes return realistic sample data instead of failing. This enables:

1. **Instant development** -- `npm run dev` works with zero infrastructure
2. **Demo readiness** -- the full admin panel renders with realistic data
3. **Test isolation** -- tests can run without a database

The pattern in every route:

```typescript
export async function GET() {
  // If no database, return sample data
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ data: SAMPLE_DATA });
  }

  // Otherwise, query the real database
  const result = await query("SELECT ...", [dealerId]);
  return NextResponse.json({ data: result.rows });
}
```

## Authentication Flow

1. **Edge Middleware** (`src/middleware.ts`) intercepts every request
2. Routes starting with `/admin` or `/api/admin` require authentication (unless `DEMO_MODE=true`)
3. Unauthenticated users are redirected to `/admin/login`
4. Authentication uses NextAuth.js with the Credentials provider
5. Passwords are hashed with bcrypt, verified via `bcryptjs`
6. On successful password auth, if MFA is enabled:
   - JWT is issued with `mfa_pending: true`
   - User must complete TOTP challenge via `/api/admin/mfa/verify`
   - On TOTP success, a new JWT is issued with `mfa_verified: true`
7. JWT includes: `id`, `email`, `name`, `dealer_id`, `role`, `lastActivity`
8. Sessions expire after 8 hours, with a 30-minute idle timeout
9. Login rate limiting: 5 attempts per 15 minutes per email (Redis-backed in production, in-memory fallback)

### Role-Based Access

Three roles: `admin`, `manager`, `staff`. API routes use:

- `requireAuth()` -- any authenticated user
- `requireRole(["admin"])` -- admin only
- `requireRole(["admin", "manager"])` -- admin or manager

## Multi-Tenancy

The platform supports three tenant resolution methods:

1. **Subdomain**: `dealer-slug.wolfpackauto.com` -- slug extracted in Edge Middleware
2. **Custom domain**: `www.dealername.com` -- passed as `domain:hostname` for DB lookup
3. **Platform domains**: `wolfpackauto.com` -- serves marketing site, no tenant

Tenant identity flows through the system via:
- `x-dealer-slug` / `x-dealer-domain` request headers (set by middleware)
- `dealer_id` on the JWT (set at login)
- Row-Level Security (RLS) in PostgreSQL -- every table scoped by `dealer_id`

## Security Headers

Applied to every response by Edge Middleware:

| Header | Value |
|--------|-------|
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| Content-Security-Policy | Restrictive CSP (self-only, no unsafe-eval in prod) |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| X-XSS-Protection | `1; mode=block` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Camera, microphone, geolocation, FLoC restricted |

Server identification headers (`X-Powered-By`, `Server`) are stripped.

## CSRF Protection

Public form endpoints (e.g., `/api/contact`) are protected by double-submit cookie CSRF:
- Middleware sets a CSRF cookie on first request
- Client sends the cookie value back in the `x-csrf-token` header
- Middleware validates the match on POST/PUT/PATCH/DELETE

## Database Migrations

21 migration files in `src/db/migrations/`:

| Migration | Purpose |
|-----------|---------|
| 001 | Initial schema (dealers, vehicles, leads, dealer_users) |
| 002 | Dealer custom domains |
| 003 | DMS feed processing |
| 004 | OEM program management |
| 005 | Billing (Stripe integration) |
| 006 | Compliance checks |
| 007 | Lead scoring fields |
| 008 | Pricing recommendations |
| 009 | EV-specific fields |
| 010 | Trade-in valuations |
| 020 | MFA (TOTP secrets, backup codes) |
| 021 | F&I deals and products |
| 022 | Service department and parts |
| 023 | Comms automation (templates, sequences) |
| 024 | Deal accounting (commissions, sales log) |
| 025 | Reviews and reputation |
| 026 | Lender portal |
| 027 | Credit bureau integration |
| 028 | Document vault |
| 029 | Compliance checks tables |
| 030 | Floor plan financing |

Rollback scripts are available in `src/db/migrations/rollback/` for migrations 001-005.

Commands:
```bash
npm run db:migrate           # Run pending migrations
npm run db:seed              # Seed sample data
npm run db:reset             # Drop + recreate + migrate + seed
npm run test:migrations      # Validate migration files
bash scripts/rollback_migration.sh <number>  # Rollback specific migration
```

## Deploy Pipeline

1. Push to `main` triggers Vercel deployment
2. Build: `next build`
3. Pre-deploy gate: `npm run predeploy` (type-check + lint + smoke tests)
4. Vercel deploys to edge + serverless
5. Database migrations: `npm run db:migrate` (run manually or via CI)
6. Nightly safety net: `npm run nightly:safety-check`

## Related Documentation

- [Platform Map](./platform-map.md) -- every page and route
- [API Reference](./api-reference.md) -- all API routes
- [Getting Started](./getting-started.md) -- setup instructions

---

## High Availability Infrastructure

### Circuit Breaker (`src/lib/circuit-breaker.ts`)
Wraps all database queries with automatic failover:
- **CLOSED** (normal): queries go to DB
- **OPEN** (after 3 consecutive failures): queries return empty/shadow data for 30 seconds
- **HALF_OPEN** (after cooldown): one test query sent — success closes the breaker, failure reopens it
- State transitions logged and tracked via `system.circuit_breaker_opened/closed` analytics events
- `safeQuery()` in `src/lib/db.ts` provides the wrapped interface

### Safe-Fetch (`src/lib/safe-fetch.ts`)
Wraps all external HTTP calls:
- 10-second timeout via AbortController (configurable)
- 1 automatic retry on network errors (not on 4xx/5xx)
- `TimeoutError` and `NetworkError` classes for typed error handling

### Request Body Guard (`src/lib/request-guard.ts`)
- `parseBody<T>(request, maxBytes)` enforces 1MB default limit
- Returns 413 Payload Too Large on oversized requests
- Prevents memory exhaustion from malicious large payloads

### Analytics Persistence
Events are written to the PostgreSQL `analytics_events` table as PRIMARY storage:
- `persistEvent()` in `analytics-hooks.ts` writes every event to DB
- Plausible (external) is SECONDARY — works when configured, not required
- `/api/admin/analytics/health` monitors the pipeline: event counts, module coverage, healthy/degraded status

### Auto-Rollback (`scripts/auto-rollback.sh`)
- Hits `/api/admin/system/health` every 5 minutes (cron)
- If status is critical (503), triggers `vercel rollback --yes`
- Logs all rollback actions
- Tracks via `system.auto_rollback` analytics event
