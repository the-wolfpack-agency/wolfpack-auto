# Wolfpack Auto -- Platform Documentation

Wolfpack Auto is a multi-tenant dealer operating system (DOS) built with Next.js 15, PostgreSQL, Redis, Elasticsearch, Qdrant, and Neo4j. It provides dealerships with a complete suite of tools for inventory management, lead handling, deal desking, F&I, service scheduling, compliance, accounting, marketing, and customer relationship management -- all behind a single admin panel with row-level security, multi-factor authentication, and a behavioral analytics engine that compounds knowledge over time.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Platform Map](./platform-map.md) | Single source of truth -- every page, API route, and feature mapped |
| [Admin Pages](./admin-pages.md) | Reference for all admin panel pages with UI elements and connections |
| [API Reference](./api-reference.md) | Every API route: method, auth, shadow mode, request/response shape |
| [Testing Guide](./testing.md) | How to run tests, test inventory, pre-deploy gates, nightly safety net |
| [Analytics & Learning](./analytics-and-learning.md) | Event types, learning aggregator, closed-loop architecture |
| [Compliance](./compliance.md) | All 21 compliance rules, regulatory references, document analysis |
| [Architecture](./architecture.md) | Tech stack, directory structure, shadow mode, auth flow, multi-tenancy |
| [Getting Started](./getting-started.md) | Developer onboarding: prerequisites, setup, local dev, deploy |

## Quick Start

```bash
# Install dependencies
npm install

# Run locally (shadow mode -- no database required)
npm run dev

# Run tests
npm test                  # Playwright E2E
npm run test:unit         # Jest unit tests
npm run test:smoke        # Smoke tests only

# Pre-deploy gate (type-check + lint + tests)
npm run predeploy

# Database migrations (requires DATABASE_URL)
npm run db:migrate
npm run db:seed
```

## Demo Access

When `DEMO_MODE=true` is set, the admin panel is accessible without authentication. A demo credential is also available:

- Email: `demo@wolfpackauto.com`
- Password: `demo`

## Deploy

The platform is designed for Vercel deployment. See [Architecture](./architecture.md) for the full deploy pipeline and [Getting Started](./getting-started.md) for environment variable setup.
