# AgenticQA Engineering Digest — Build Spec

**Status:** SPEC (not yet implemented) · **Owner:** Nick Homyk (CTO) · **Drafted:** 2026-05-13

## Problem

AgenticQA's pipeline already produces rich per-run artifacts: app-security audit JSON, CI/CD audit JSON, history-exposure findings, Playwright failure traces, coverage diff, 9 agent outputs (QA / Performance / Compliance / DevOps / SRE / SDET / Fullstack / RedTeam / Pentest). Today these are surfaced as GitHub Actions logs — an internal-only artifact that requires log-diving to interpret.

**The gap:** Competitors (Snyk, Vanta, SonarQube) ship dashboards. Engineering teams need work plans — *who* fixes *what*, *when*, with *enough context* to start immediately. That gap is the productization unlock.

## Goal

A weekly (configurable) digest sent to engineering owners (email + Slack) that converts the previous N runs' findings into a triaged, assigned, time-estimated work plan. Optionally auto-files Linear/GitHub Issues with pre-set owner + priority.

## Non-goals

- Replacing the existing CI dashboards (they stay; this is additive)
- Triaging every finding (capped at top 5 must-fix + top 5 should-fix per digest)
- AI-detecting bugs (detection is codified per the zero-token invariant; AI is only for triage assignment)

## Architecture — two layers

### Layer 1: Surfacing (codified, zero AI tokens)

Reads all CI artifacts produced by `agenticqa-full-pipeline.yml`, aggregates by category, renders to markdown. Zero AI cost; runs on every digest cadence (cron).

**Inputs (already produced today):**
- `cicd-audit.json`, `app-audit.json`, `history-audit.json` from AgenticQA-core full-audit-suite
- Playwright test results (`test-results/` artifacts)
- Coverage diff from jest
- 9 agent outputs (SDET, Compliance, etc.) from existing reusable workflows
- GitHub: PR list, CODEOWNERS, recent commit blame
- `analytics_events` table: `system.*` events tagged by surface

**Outputs:**
- `engineering-digest.md` — human-readable report
- `engineering-digest.json` — structured data (for Linear/Jira import)
- Slack-flavored markdown for the webhook
- Email-flavored HTML for SES/Resend

### Layer 2: Assignment (AI-justified, one batched call per digest)

Reads the surfaced findings + context (file paths, blame, CODEOWNERS, team role map from `instinct_team_members`) and emits per-finding:
- Suggested owner (rationale: "John last touched this file, owns auth domain")
- Severity tier (must-fix / should-fix / nice-to-have)
- Effort estimate (xs/s/m/l)
- Suggested PR description draft
- Optional: opened-PR link if AgenticQA's auto-fix agent can patch it

**Cost guardrail:** ONE Anthropic call per digest, batched over top-N findings (N ≤ 20). Caps tokens at ~25k input / ~5k output. Cost: ~$0.30/digest.

**Why this is the AI carve-out:** "Who should own this and what's it worth" is genuinely ambiguous and benefits from contextual reasoning. Detection stays codified. This satisfies the zero-tokens-first invariant.

## File layout

```
src/lib/digest/
  collector.ts          # reads CI artifacts, normalizes to a common shape
  triager.ts            # rule-based pre-triage (severity rules, dedup)
  assigner.ts           # Anthropic call: ONE batched assignment pass
  renderer.ts           # markdown + Slack + email outputs
  publisher.ts          # webhook + email send + optional Linear/GH Issue file
  __tests__/
    collector.test.ts
    triager.test.ts
    assigner.test.ts          # mocked Anthropic
    renderer.snap.test.ts     # snapshot tests for each output format
    end-to-end.test.ts        # full pipeline with fixture artifacts

src/app/api/admin/digest/
  preview/route.ts      # GET — preview today's digest without sending
  generate/route.ts     # POST — manually trigger a digest
  history/route.ts      # GET — list past digests
  __tests__/
    contracts.test.ts

src/db/migrations/
  NNN_engineering_digest.sql
    # CREATE TABLE engineering_digests (id, dealer_id, generated_at,
    #                                    digest_md, digest_json,
    #                                    assignments_jsonb, sent_at)
    # CREATE TABLE digest_outcomes (digest_id, finding_id, status,
    #                               resolved_at, actual_owner, actual_effort)

.github/workflows/
  weekly-digest.yml     # cron-driven; calls /api/admin/digest/generate
```

## Data inputs in detail

| Source | Shape | Filter for digest |
|---|---|---|
| `cicd-audit.json` | array of `{rule, severity, file, line, snippet}` | `severity in (high, critical)` only |
| `app-audit.json` | same shape | same |
| Playwright JSON | `{spec, status, duration, retries, error}` | `status === "failed" OR retries >= 2` |
| Jest coverage | per-file delta | files with `delta < -5pp` |
| Agent outputs | `{agent, severity, message, evidence}` | severity high+ |
| Dependabot alerts | GitHub API | high + critical |
| CodeQL alerts | GitHub API | high + critical |
| `analytics_events` | `system.capability_denied`, `system.error_*` | last 7d count > threshold |

All inputs → normalized to common `Finding` interface:
```ts
interface Finding {
  id: string;                    // stable hash of {source, file, line, rule}
  source: 'cicd' | 'app' | 'history' | 'playwright' | 'coverage' | 'agent-X' | 'dependabot' | 'codeql' | 'analytics';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  file?: string;                 // for blame + CODEOWNERS lookup
  line?: number;
  evidence: string;              // raw snippet or context
  first_seen: string;            // ISO date — was this in last digest?
  last_seen: string;
}
```

## Triage rules (codified, applied before AI assignment)

1. **Dedup**: same `id` across multiple sources collapses to one (with merged evidence)
2. **Carryover suppression**: if same finding appeared in prior digest, drop unless severity escalated
3. **False-positive suppression**: applies allow-list rules from `digest-allowlist.yml` (similar to scanner-allowlist patterns we already have)
4. **Severity floor**: drop anything below `medium` unless count > 10 (then aggregate as "noise spike — review")
5. **Cap**: top 5 must-fix (critical + high) + top 5 should-fix (medium with recent regression) = 10 max

Items 1-5 run in `triager.ts` with no AI calls. Result: a pre-triaged list of ≤10 findings ready for assignment.

## AI assignment prompt shape

System: "You triage engineering findings into work items. Output JSON only."

User: structured context — full CODEOWNERS file, list of team members with roles, recent commit log (last 14d), and the pre-triaged findings list.

Output schema (strict JSON):
```json
{
  "assignments": [
    {
      "finding_id": "...",
      "owner_id": "...",
      "owner_rationale": "<1 line>",
      "tier": "must_fix" | "should_fix",
      "effort": "xs" | "s" | "m" | "l",
      "pr_description_draft": "<3-5 lines>"
    }
  ]
}
```

Cost: ~25k input tokens (CODEOWNERS + commit log + 10 findings with context), ~5k output. One call per digest. Caps total at ~$0.30/digest.

## Output formats

### `engineering-digest.md` (the human-readable artifact)

```markdown
# Engineering Digest — 2026-05-13 → 2026-05-20

## Must-fix this week (5)

### 1. [HIGH] Cross-tenant SQL — admin/leads/route.ts:42
**Owner:** Jane (auth team) · **Effort:** M · **Source:** app-audit
Finding: `dealer_id` not enforced on UPDATE. Tenant boundary breach.
Suggested PR: `fix(admin): enforce dealer_id on lead UPDATE — closes audit A4-22`

### 2. [HIGH] Test regression — porsche-summary spec
...

## Should-fix (5)
...

## Outcomes since last digest
- 3 must-fix items from 2026-05-06 digest: 2 resolved, 1 carried over
- New regressions: 2 (visible above)

## Trends
- CodeQL high count: 11 → 0 (-11) ✓
- Test pass rate: 94% → 98% (+4pp) ✓
- New endpoints without rate-limiting: 0 ✓
```

### `engineering-digest.json` (Linear/Jira import format)

Standard issue-import shape so it can be piped to `linear-cli`/`jira-cli` or the GraphQL APIs.

## Test plan

| Layer | Test type | What it validates |
|---|---|---|
| `collector.ts` | Unit (jest) | Each input source parses correctly into `Finding[]`; malformed input doesn't throw |
| `triager.ts` | Unit | Dedup logic; severity floor; cap enforcement; carryover suppression matches expected output across 5 fixture digests |
| `assigner.ts` | Integration (mocked Anthropic) | Prompt structure is stable; output schema validation rejects malformed model responses; one-call-per-digest invariant |
| `renderer.ts` | Snapshot | Markdown, Slack, and email outputs match committed fixtures byte-for-byte (catches accidental format regressions) |
| `publisher.ts` | Integration (mocked webhook + email) | Idempotent send (re-running doesn't double-send); failure modes (webhook 5xx, email bounce) handled gracefully |
| End-to-end | Real CI artifacts → real Postgres → digest table row + mock-webhook fired | Proves the full pipeline produces a digest for a known-bad run |
| API contract | jest | `/api/admin/digest/preview` returns 200 with valid shape; `/generate` requires `admin.digest.send` capability |

Every test layer ships with the feature. The end-to-end test runs in the AgenticQA full pipeline as part of Phase 1 Tests.

## Data + learning wiring (per CLAUDE.md "no data lost")

- Every digest persists to `engineering_digests` (full markdown + structured assignments JSON)
- Every assignment writes an `analytics_events` row: `digest.assignment_created`
- Every outcome (resolved, ignored, reassigned) writes `digest.outcome_recorded`
- A learning view (`v_digest_assignment_accuracy`) reports per-owner accuracy: did the AI-suggested owner end up being the actual one who fixed it?
- Future Anthropic calls receive the prior-accuracy stats as system-prompt context. The system learns who owns what without manual configuration.

## Phased rollout

**Phase 1 (week 1):** Layer 1 only. Codified rules → markdown + Slack output. No AI. Internal Wolfpack use only.
**Phase 2 (week 2):** Add Layer 2 (AI assignment). Cap at 10 findings. Manual review before email send.
**Phase 3 (week 3):** Automated send. Linear/GitHub Issue auto-file with confidence threshold.
**Phase 4 (week 4):** Outcome tracking + learning loop. Productize as client-facing feature.

## Open questions

1. **Per-repo vs per-org digest?** A multi-product team might want one digest spanning wolfpack-auto + wolfpack-apex. Need to decide before Phase 1.
2. **Cadence:** Weekly default, or driven by event volume? E.g. ship a digest whenever 5+ must-fix items accumulate.
3. **Severity for non-security findings:** Test failures, coverage drops, perf regressions — what's the severity rubric?
4. **Auto-file vs draft-mode:** Should the digest auto-create Linear tickets or just propose them?
5. **Cost ceiling enforcement:** What happens if Anthropic is down or rate-limited? Fall back to rule-based assignment with `(unassigned)` markers?

## Why this is the productization unlock (one paragraph)

A scanner that surfaces 47 findings is a tool for security pros. A scanner that emails "Jane and Bob each have 2 things to fix this week, here are the proposed PRs" is a product for engineering leaders. The first is reporting; the second is delegation. Delegation is what makes AgenticQA valuable to non-technical stakeholders at client orgs — VP Eng, CTO, CEO — who don't read dashboards but DO read morning digests. That's the foot in the door for everything else.

## How to start

When you (or a future agent) sit down to build this:

1. Read `src/agents.py` (9-agent base class), `src/agenticqa/verification/feedback_loop.py` (existing outcome tracker), and `src/data_store/pattern_analyzer.py` — they have the data wiring shape this feature should extend.
2. Start with `collector.ts` against ONE artifact source (`app-audit.json`). Get markdown rendering working before adding more sources.
3. Use the existing `agenticqa-core` audit JSON shape as the schema source-of-truth — don't reinvent the `Finding` interface.
4. Write the snapshot tests in `renderer.snap.test.ts` FIRST against hand-curated fixtures. They'll lock the output format before the implementation drifts.
5. Defer the AI layer until Layer 1 is shipping value internally.

---

**Cross-references:**
- `~/.claude/.../memory/project_engineering_digest.md` — memory entry capturing the strategic context
- `~/.claude/.../memory/project_migration_correctness_tool.md` — sibling tool concept from the same 2026-05-13 session
- `docs/analytics-and-learning.md` — existing analytics/learning wiring this feature extends
- `.github/workflows/agenticqa-full-pipeline.yml` — the workflow whose artifacts feed the digest
