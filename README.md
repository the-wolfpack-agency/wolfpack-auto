# Wolfpack Auto

Modern automotive dealer website platform built with Next.js 14, TypeScript, and Tailwind CSS.

## Architecture

- **Next.js 14** (App Router) -- server-rendered pages, edge-ready
- **PostgreSQL 16** -- core relational data (dealers, leads, inventory metadata)
- **Redis 7** -- sessions, caching, rate limiting
- **Elasticsearch 8** -- fast faceted inventory search
- **Cloudflare R2** -- vehicle photo / media storage
- **Cloudflare Workers/Pages** -- edge rendering (production)

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env

# 4. Run dev server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/                  # Next.js App Router pages
    api/health/         # Health check endpoint
    inventory/          # Inventory listing + VDP
  lib/                  # Shared utilities
    db.ts               # PostgreSQL connection pool
    redis.ts            # Redis client
    security-headers.ts # Security header definitions
  middleware.ts         # Edge middleware (security headers)
  types/                # TypeScript type definitions
    vehicle.ts          # Vehicle / inventory types
    dealer.ts           # Dealer / rooftop types
    lead.ts             # Lead / inquiry types
```

## Security Headers

All responses include headers that Dealer.com is currently missing:

- `Strict-Transport-Security` with `preload`
- `Content-Security-Policy` (restrictive default-src)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone, geolocation, FLoC)

## Scripts

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Start development server |
| `npm run build`   | Production build         |
| `npm run start`   | Start production server  |
| `npm run lint`    | ESLint                   |
| `npm run type-check` | TypeScript check      |
