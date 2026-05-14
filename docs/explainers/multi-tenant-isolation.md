# Multi-tenant isolation — explained for non-engineers

> A 1-minute read for execs, 5-minute read for PMs/sales, 10-minute deep-dive for new engineers. All claims below are backed by code linked at the bottom. CI fails if any source file changes without this doc being re-translated (see manifest).

```yaml
# Source manifest (CI checks staleness on every push)
sources:
  - docs/architecture.md                          # canonical architecture
  - docs/security-posture.md                      # security narrative
  - src/lib/tenant-resolver.ts                    # how a request → which dealer
  - src/lib/tenant-context.ts                     # how dealer_id flows into queries
  - src/lib/auth-guard.ts                         # the requireAuth() entry point
  - src/db/migrations/055_enforce_rls.sql         # row-level-security policies
  - scripts/verify-rls.ts                         # the test that enforces it
last_translated: 2026-05-14
last_verified_by_ci: <auto-updated on every push>
```

---

## 1-minute version (for a CEO / VP)

Imagine a hotel where every guest gets their own room. The hotel staff has master keys, but a guest's keycard only opens their own door. If a guest's keycard somehow worked on another room — that's a five-alarm incident.

Wolfpack Auto is that hotel. Every dealership ("tenant") that uses us has their own complete dataset — vehicles, leads, deals, accounting — and they can ONLY see their own. The database itself refuses to return another dealer's data, even if a developer wrote buggy code that asked for it. The refusal happens at the lowest possible layer: Postgres itself, not the application.

**What you tell a buyer:** "Your data and your competitor's data live on the same servers, but they cannot see each other. Not 'should not.' *Cannot.* Verified by an automated test that runs on every code change."

---

## 5-minute version (for a PM, sales engineer, or onboarding new hire)

### What problem this solves

A dealer management system has to host many dealerships at once. Without isolation, a bug in the leads page could accidentally show Dealer A's customer list to Dealer B. That's not just bad UX — in many jurisdictions it's a regulatory violation (state DMV rules, FTC Safeguards Rule for financial info, state-specific consumer-data laws).

The naive way: every database query says "WHERE dealer_id = $current_dealer". The risk: one forgotten WHERE clause anywhere in the codebase, and the wall breaks.

The Wolfpack way: **defense in depth** — three layers, each of which alone is enough to stop the leak.

### Analogy: the hotel with three locks

| Layer | Hotel analogy | Wolfpack reality |
|---|---|---|
| **Layer 1: Front desk** | Receptionist checks your reservation when you arrive | `requireAuth()` runs at the start of every admin route; rejects requests without a valid session |
| **Layer 2: Floor button** | Elevator only stops at your floor | `tenant-resolver.ts` reads the dealer_id from your session and "tags" the entire request with it |
| **Layer 3: Door lock** | Your keycard physically can't open another room | Row-Level Security (RLS) policies in Postgres reject any query that tries to read rows belonging to a different dealer |

If a developer accidentally forgets one of the first two, the third still holds. The database itself acts as the last line of defense — it cannot be bypassed by a coding mistake.

### Everyday consequences

**Works (every day):** A dealer in Texas logs in, sees their leads, their inventory, their deal pipeline. They cannot accidentally or intentionally see a dealer in Florida's data, even if they try to type the URL directly with the other dealer's ID.

**Breaks (catastrophic):** If layer 3 had a bug and let through cross-tenant queries — that's a multi-dealer data breach. Customer financial data (credit applications, SSNs in F&I forms) could leak. Wall Street Journal headline. Regulatory fines. Sales pipeline death.

That's why this layer matters more than any single feature. It's the foundation everything else sits on.

### What competitors do

- **Tekion / CDK / Reynolds**: traditional dealer DOS vendors. Usually one application code path per tenant. Some have RLS, some rely on application-layer checks only. Older vendors built on monolithic architectures often don't have RLS — they trust the application layer entirely.
- **Generic SaaS platforms with multi-tenancy**: usually rely on application-layer "WHERE tenant_id = X" filtering. One missed filter = a leak. Snyk's own breach story (2023) and several auto-DMS incidents in 2024 were exactly this class of bug.
- **Our position**: we run all three layers AND we automatically verify the database layer on every code change.

### What we do better

| Capability | Standard | Wolfpack Auto |
|---|---|---|
| Application-layer auth | Yes | Yes (`requireAuth()` on every admin route) |
| Tenant context auto-resolution | Manual per-route | Centralized in `tenant-resolver.ts` — impossible to forget |
| Database-level RLS | Rare in legacy DOS | Yes — migration 055 enforces it on every table |
| Automated RLS verification | Almost no one | `npm run verify:rls` runs on every push, fails CI if any table lacks a policy |
| Cross-tenant test coverage | Spot-check at best | Dedicated `tests/rls/` suite — runs in CI |

The combination matters: lots of products have one or two of these. We have all five wired together AND verified continuously. That's not marketing — it's a verifiable CI run on every commit.

### How to verify any of these claims yourself

- "Every route requires auth": `grep -rL 'requireAuth' src/app/api/admin/` should return zero files (means every admin route has the guard).
- "RLS is enabled on every table": run `npm run verify:rls` locally — it lists any unprotected table and fails if it finds one.
- "Cross-tenant isolation is tested": `tests/rls/` directory.
- "This is checked on every change": `.github/workflows/agenticqa-full-pipeline.yml` contains the `schema-check` and verification jobs.

---

## 10-minute version (for a new engineer joining the team)

This is the deep technical detail — links straight into the code rather than re-explaining it. Read in order:

1. **Conceptual model:** [docs/architecture.md § Multi-tenant isolation](../architecture.md) — start here
2. **Request lifecycle:** [src/middleware.ts](../../src/middleware.ts) — see how dealer context gets resolved on every request
3. **The guard:** [src/lib/auth-guard.ts](../../src/lib/auth-guard.ts) — the `requireAuth()` function and what it returns
4. **The resolver:** [src/lib/tenant-resolver.ts](../../src/lib/tenant-resolver.ts) — how hostname/path/session → `dealer_id`
5. **The context:** [src/lib/tenant-context.ts](../../src/lib/tenant-context.ts) — how `dealer_id` flows into every DB call
6. **The RLS policies:** [src/db/migrations/055_enforce_rls.sql](../../src/db/migrations/055_enforce_rls.sql) — the database-level enforcement, one policy per table
7. **The verifier:** [scripts/verify-rls.ts](../../scripts/verify-rls.ts) — the test that ensures we never forget
8. **The test suite:** [tests/rls/](../../tests/rls/) — actual cross-tenant attack scenarios

### How to add a new table without breaking isolation

1. Create the table in a new migration with `dealer_id UUID NOT NULL REFERENCES dealers(id)`
2. Add `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;`
3. Add a USING policy: `CREATE POLICY <name>_tenant ON <name> USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);`
4. Run `npm run verify:rls` locally — if it passes, you've covered all three layers
5. CI runs the same check on push; merge blocked if you forgot a layer

### What can still go wrong

- **A developer disables RLS for "just one query"** with `SET LOCAL row_security = off;` — the test suite catches this in code review via grep gate
- **A developer queries `dealers` directly without setting `app.current_dealer_id`** — RLS rejects with empty results (a soft fail); load-baseline test catches this because pages render empty
- **A future tenant_id type drift** (UUID vs TEXT) — that's the bug class we eliminated on 2026-05-13. The schema-check gate prevents it returning.

---

## Future potential (clearly aspirational, not guaranteed)

This isolation pattern is the foundation we'd extend for:
- **OEM tenancy**: a manufacturer (e.g., Honda) seeing rollups across all their dealers without breaching dealer-level confidentiality. Layer 4 = a different `app.current_oem_id` setting with its own policy set.
- **Compliance reports**: regulators getting read-only access scoped to specific dealer cohorts. Same RLS shape, different USING clause.
- **Cross-dealer benchmarking with k-anonymity**: dealers see how they compare to their peer cohort without seeing individual peers' data. Aggregation views with minimum-cohort-size enforcement.

All three potential extensions build on the same three-layer architecture documented above — they don't require a re-architecture, just additional policies.

---

## Why this doc is trustworthy (the "this isn't marketing" footer)

- Every claim in the "5-minute" and "10-minute" sections traces to a specific source file listed in the manifest at top.
- The CI gate that protects this layer (`schema-check` + `verify:rls`) runs on every push to main. If it ever stops passing, this doc gets auto-flagged as stale.
- "Future potential" is the only forward-looking section; clearly labeled.
- No quantified claims appear without a verifiable test backing them. "100% of tables have RLS" → check the output of `verify:rls`. "Zero cross-tenant leaks in CI" → check the `tests/rls/` suite results.

If any reader (including a non-technical exec, an auditor, or a hostile client engineer) wants to validate this doc, they can run the listed commands locally or in CI and see the actual answer in under 5 minutes.
