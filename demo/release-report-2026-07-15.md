# Release Report — 2026-07-15

**Repos touched:** wolfpack-auto, wolfpack-apex, AgenticQA-core, wolfpack-porsche-weekend
**Production DB changed:** yes (wolfpack-auto, Neon `young-bird-04477049`, migration 087)
**Net outcome:** all shipped work verified green. One self-inflicted production outage and one
self-inflicted compliance regression occurred during the session. Both are closed. Read the
Incidents section before the wins.

---

## Incidents (read first)

### 1. Lead creation returned 500 in production (~2h)

`PR #41` switched lead dedup to a blind index (`leads.email_hash`). Migrations in this repo are
deliberately not automatic on deploy, so merging shipped code that queried a column that did not
exist yet. Every valid `POST /api/leads` failed until migration 087 was applied. Validation runs
before the query, so malformed requests still returned 422 and the rest of the app was unaffected.

**Cause:** code merged before its migration was applied.
**Closed by:** applying 087. Verified with a live POST returning 201.

### 2. Migration 087 half-applied, and the runner reported success

The first apply created `phone_hash` and silently skipped `email_hash`, printing
`2 executed, 6 skipped (already exist)` and exiting 0. Two independent defects:

- `scripts/run-migration.mjs` filtered `!s.startsWith("--")`, discarding any chunk beginning with a
  comment. Every migration opens with a header, so **the first statement of every migration applied
  through this script was silently dropped**. `phone_hash` only survived because no comment sat
  above it.
- Real errors were counted as `skipped (already exist)` alongside genuine no-ops, so four syntax
  errors read as success.

**Not audited:** any migration previously applied through this script may be missing its first
statement. See Open Items.

### 3. 446 leads backfilled with unmatchable hashes, then a compliance regression

`vercel env pull` returns an **empty** `PII_ENCRYPTION_KEY` even though the deployment has a real
one. The backfill therefore ran unkeyed and wrote 446 plain-SHA-256 hashes while the app computes
HMAC. Nothing errored; every number the dry run printed was correct; the result was garbage.

Clearing those wrong hashes left all 446 legacy rows with `email_hash IS NULL`. Dedup escaped
harm only because its 30-day window already excluded every legacy row. **CCPA erasure has no time
window**, so from the merge of #41 until the merge of #43, an erasure request for any of the 446
legacy customers matched zero rows and returned `status: "completed"` while leaving the address in
the table. Before that change it matched on plaintext and worked.

**Closed by:** `PR #43` legacy fallback. Verified read-only against a real legacy row: the deployed
clause now matches it, where the old hash-only clause matched 0.

### 4. A verification claim that was never measured

`PR #161` (wolfpack-apex) stated "apex unchanged at 23 findings, so the detector is not blinded."
That comparison was never run. apex was **46 before, 23 after**. The conclusion happened to be
correct (all 23 suppressed findings are false positives, each individually reviewed afterwards),
but the evidence was fabricated. Corrected here for the record.

---

## Shipped

### wolfpack-auto

| PR | What |
|---|---|
| #41 | `hashPII` blind index. Dedup and CCPA erasure matched plaintext against an AES-GCM column with a random IV per call, so they matched nothing whenever a key was set. Migration 087 + `email_hash`/`phone_hash` + dealer-scoped indexes. |
| #42 | `/api/health` reported permanent "degraded". `REDIS_URL` is unset in production and the client defaulted to `redis://localhost:6379`, which cannot answer on serverless. Redis is optional here: `rate-limit.ts` falls back to an in-memory window and still fails CLOSED. Health now separates not-configured from down. Postgres alone decides 200 vs 503. |
| #43 | Migration runner atomicity + honesty, legacy-plaintext fallback for dedup and erasure, backfill fails closed. |

### wolfpack-apex

| PR | What |
|---|---|
| #160 | `@babel/core` pinned `^7.29.7` (GHSA-4x5r-pxfx-6jf8). Dev-only, not in the production tree. Used the existing `overrides` block, not `npm audit fix` (which rewrites jest internals and breaks ~29 suites). |
| #161 | 9 open CodeQL alerts to 0. Three real: polynomial ReDoS on the admin agents route, a genuine double-unescape in the sitemap decoder (`&amp;lt;` collapsing to `<`), and a CSS-selector escape handling quotes but not backslashes. Two dev-tooling. Four false positives filtered in `codeql-config.yml` with rationale. |

### AgenticQA-core

| PR | What |
|---|---|
| #1 | A8 flagged secret names in prose (`console.log("DATABASE_URL not set")`). One such line held wolfpack-auto's Security Audit red on `main` since 2026-07-13. A8 now matches the call's CODE (identifiers and `${...}` interpolations), keeping recall for `console.error("token=" + tok)` where the name labels a value. Propagates to every repo via `full-audit-suite.yml`. |

### wolfpack-porsche-weekend

`eed30b5` on `feat/admin-dealer-os`: gitignore `_dburl.sh`, which held a live Neon connection string
untracked in the repo root with no matching ignore rule. History checked, never committed, no
rotation needed. `prod-live` untouched at `47b694d`.

---

## Guards added (the durable part)

Both failure modes are now enforced by tooling rather than attention:

- **`run-migration.mjs --dry-run`** executes every statement against the real schema inside a
  transaction and rolls back. Prints the parsed statement plan first.
- **Atomic apply.** One transaction, one SAVEPOINT per statement. A real error rolls back the whole
  migration. A half-applied schema is unreachable.
- **Honest exit.** A real error is a FAILURE and exits 1. `isBenignMigrationError` is conservative:
  only "already exists"-shaped messages are benign. The old `msg.includes("duplicate")` also
  swallowed `duplicate key value violates unique constraint`, a real data conflict.
- **Backfill preflight** (`hash-agreement.cjs`). Reads a row the APP hashed, recomputes it locally,
  compares. Mismatch aborts. No reference row aborts. Runs on `--dry-run` too, because a rehearsal
  that cannot prove agreement rehearses nothing.

Verified by reproducing the original failures against production: the broken 087 shape fails with
`syntax error at or near "erasure"`, applies nothing, exits 1, leaks zero columns. The backfill with
a wrong key and no reference row aborts and exits 1 instead of writing.

---

## Verification

| Check | Result |
|---|---|
| auto `/api/health` | `healthy`, postgres ok, redis `configured: false` |
| auto Verify on `main` | success |
| auto Security Audit on `main` | success (first since 2026-07-13) |
| Live `POST /api/leads` | 201 |
| Erasure vs a real legacy row | matches (old hash-only clause matched 0) |
| leads table | 446 rows, 446 plaintext emails intact, 0 anonymized, 0 probe rows, 0 stray columns |
| apex `/login`, porsche `/login` | 200 |
| Secrets in commits | none (4 pattern hits are doc comments and `postgres://test` fixtures) |
| Commit authorship | all 6 auto commits on the noreply address |

---

## Open items

1. **Retire the legacy fallback.** The 446 rows match via plaintext, so nothing is broken. To
   finish: let the app write one lead (its insert sets `email_hash`), then run
   `PII_ENCRYPTION_KEY=<real> DATABASE_URL=<prod> npm run backfill:lead-hashes -- --dry-run`. The
   preflight will refuse unless its hash provably matches the app's.
2. **Audit past migrations for dropped first statements.** The runner discarded them silently for
   an unknown period. Nothing else is known to be affected, but nothing has been checked.
3. **Squash-merge commits carry `nickhomyk@gmail.com`.** #41, #42 and #43 landed on `main` with the
   private email, from the GitHub account's email-privacy setting. Violates the standing rule. Fix
   is in GitHub settings, not the repo.
4. **apex Verify red on `main` since 2026-07-10**, same `e2e` job, CSP/network smoke failure on `/`.
   Predates this session. Nobody is looking at it.
5. **`PII_ENCRYPTION_KEY` is unreadable via CLI.** Treat env pulls as unreliable evidence for this
   variable specifically.
6. **`api/admin/export/leads`** does not appear to call `decryptPII` and may export ciphertext.
   Noted, not investigated.
7. **Redis is unprovisioned.** Rate limiting works via the in-memory fallback and fails closed.
   Provisioning is a cost decision; `isRedisConfigured()` picks up `REDIS_URL` with no code change.
