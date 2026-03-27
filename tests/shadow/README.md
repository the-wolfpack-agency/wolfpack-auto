# Shadow Testing

Shadow testing spins up a **production-identical environment** backed by a real Neon DB branch, runs Playwright tests against it, then tears everything down. No staging server required — every run is fresh and isolated.

## What It Proves

- API contracts match the documented response shapes
- Lead and contact form submissions persist correctly end-to-end
- Multi-tenant data isolation holds (Dealer A cannot see Dealer B's data)
- Security headers are present on every response
- Rate limiting fires at the expected thresholds
- CSRF protection is wired correctly

## Quick Start (local, no Neon branch)

Use an existing database URL directly — fastest path for local iteration:

```bash
SHADOW_DATABASE_URL=<your-neon-or-local-postgres-url> \
  python scripts/shadow_runner.py --skip-branch
```

This skips branch creation, runs migrations + seed, starts Next.js on port 3100, runs the suite, then shuts down.

## Full Shadow Run (creates an isolated Neon branch)

```bash
NEON_API_KEY=<your-neon-api-key> \
NEON_PROJECT_ID=<your-neon-project-id> \
DATABASE_URL=<your-main-db-url> \
  python scripts/shadow_runner.py
```

Steps executed:
1. Create Neon branch `shadow-test-{timestamp}` from main
2. Poll until branch is ready
3. Run all migrations in `src/db/migrations/` (ordered by filename)
4. Seed 2 dealers, 10 vehicles, 3 leads
5. Start `next start` on port 3100 with `DATABASE_URL=<branch-url>`
6. Wait for `/inventory` to return < 500
7. Run `npx playwright test --config=playwright.shadow.config.ts`
8. Capture Playwright exit code
9. Kill Next.js server
10. Delete Neon branch
11. Exit with Playwright's exit code

## Run Shadow Tests Against an Already-Running Server

```bash
SHADOW_URL=http://localhost:3100 \
  npx playwright test --config=playwright.shadow.config.ts
```

Useful if you already have a shadow server running (e.g. from a previous `--keep-branch` run).

## Flags

| Flag | Description |
|------|-------------|
| `--skip-branch` | Use `SHADOW_DATABASE_URL` directly; skip Neon branch creation/migration. Requires `SHADOW_DATABASE_URL` to be set. |
| `--keep-branch` | Do not delete the Neon branch after the run. Useful for debugging failing tests against the live branch. |
| `--test-filter PATTERN` | Playwright `--grep` pattern to run a subset of shadow tests. |

## Test Files

| File | What it covers |
|------|---------------|
| `shadow-integration.spec.ts` | Full-stack vertical slices: lead submission → DB persistence → admin verification, CSRF flow, rate limiting, security headers |
| `shadow-api.spec.ts` | API contract tests: exact response shapes, status codes, validation errors, all public endpoints |
| `shadow-multitenant.spec.ts` | Tenant isolation: Dealer 1 data never visible to Dealer 2, admin scoping, branding routes |

## Seeded Test Data

All shadow test data uses the prefix `shadow-test-` and can be identified and cleaned up with:

```sql
DELETE FROM leads   WHERE email LIKE '%@shadow-test.invalid';
DELETE FROM vehicles WHERE description LIKE '%Shadow test%';
DELETE FROM dealers  WHERE slug LIKE 'shadow-test-%';
```

Dealer IDs used in tests:
- Dealer 1: `a1000000-0000-0000-0000-000000000001` (slug: `shadow-test-dealer-1`)
- Dealer 2: `a2000000-0000-0000-0000-000000000002` (slug: `shadow-test-dealer-2`)

## Prerequisites

```bash
pip install requests          # for shadow_runner.py
psql --version                # for running migrations
npx playwright install        # first-time browser install
```

## CI Integration

Add to your GitHub Actions workflow:

```yaml
- name: Shadow test
  env:
    NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
    NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: python scripts/shadow_runner.py
```

The runner exits with Playwright's exit code, so the CI step fails if any test fails.

## Why Not Staging?

A dedicated staging environment drifts — schema changes, stale data, shared state between runs. Shadow testing is ephemeral by design: each run gets a fresh Neon branch with migrations applied in order, deterministic seed data, and a clean server process. There is no drift because there is no persistence between runs.
