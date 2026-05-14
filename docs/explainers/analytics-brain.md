# Analytics Brain — explained for non-engineers

> 1-minute for execs · 5 for sales/PMs · 10-min deep dive for new engineers. Every claim grounds in source files listed in the manifest.

```yaml
sources:
  - src/lib/analytics-engine.ts                 # the brain itself + generateInsights()
  - src/lib/analytics-hooks.ts                  # the typed event registry
  - src/lib/triple-write.ts                     # how memory persists across stores
  - src/lib/micro-behavioral-signals.ts         # signal rollups
  - src/lib/qdrant-client.ts                    # semantic memory
  - src/lib/neo4j-client.ts                     # relationship memory
  - docs/analytics-and-learning.md              # closed-loop architecture narrative
last_translated: 2026-05-14
```

---

## 1-minute version (for an exec)

Every day a dealership produces thousands of small moments: a customer clicked the SUV gallery, a salesperson moved a deal to "presented," a service appointment was rescheduled, an F&I product was added then removed. Individually these are noise. Collectively they're a fingerprint of *how this business actually works*.

Most software ignores them. It captures the big events ("deal closed") and throws the small ones away.

Wolfpack Auto's Analytics Brain captures every event with a typed name (e.g. `deal.fi_product_removed`), stores it three different ways (a regular database for facts, a vector index for "what's similar to this," and a graph for "what's connected to this"), and emits **insights** — short, plain-English observations like "Your APR rejection rate jumped 30% this week — could be the new lender, could be tighter credit, worth checking."

The brain gets sharper the longer the dealer uses the product, because it has more events to compare against history. Year two is meaningfully more useful than year one. Year five is a moat.

**What you tell a buyer:** "Other software shows you reports. This one notices things and tells you when something's off — *before* it shows up in the monthly P&L."

---

## 5-minute version (for a salesperson, GM, or new hire)

### What problem this solves

A dealership runs on intuition. The GM who's been there 15 years can walk the floor and feel that "service is off this week" before any report says so. They notice that two of their best salespeople are quietly frustrated, that the trade desk is being too aggressive on one truck model, that Friday afternoon test drives are converting at half the usual rate.

That intuition is irreplaceable — but it walks out the door when the GM leaves. And it doesn't scale: one GM can't sense-make for 50 stores.

The Analytics Brain doesn't replace the GM. It **assists** them by watching every small event the human can't see, computing the patterns, and surfacing the ones worth attention.

### Analogy: the night security guard who memorizes the building

Picture a security guard who's been at the same building for 20 years. They've walked the halls every night. They know:
- The third-floor printer always whirs at 2 am (scheduled job — fine)
- The HVAC kicks on twice an hour in winter (normal)
- The elevator on the west side has a slight squeak when carrying > 4 people (worth flagging to maintenance, not urgent)
- But yesterday the storeroom door was unlocked at 11 pm (that's *new* — they investigate)

That's not surveillance. That's **pattern recognition from continuous observation**. The guard doesn't need to know what every event means — they just know what's *normal* vs *new*.

The Analytics Brain is that guard for a dealership. It watches:
- Page views, clicks, scroll depth, form interactions on every public page
- Deal events (created, presented, accepted, F&I product attached, funded, unwound)
- Service events (appointment created, no-show, repair order opened, comeback)
- Inventory events (added to lot, priced, repriced, days-on-lot crossing thresholds)
- Lead events (created, contacted, status changed, scored, converted)

Then asks: what's normal? what's new? what's worth a human's attention?

### What dealers actually see

The brain produces **insights** that show up in the admin dashboard as plain-English statements with a timestamp and a "see details" link:

```
┌──────────────────────────────────────────────────────────────┐
│ This week                                                     │
├──────────────────────────────────────────────────────────────┤
│ 🔥 Your service no-show rate jumped from 8% to 14%.          │
│    Pattern: most no-shows are Tuesday afternoons.            │
│    [Investigate →]                                           │
│                                                               │
│ 📈 Lead-to-test-drive conversion is up 22% for SUVs.         │
│    Pattern: customers who view financing FIRST convert       │
│    2.3x more.                                                │
│    [Why? →]                                                  │
│                                                               │
│ ⚠️ Three F&I products are being removed at 3x the rate       │
│    they were last month: "Paint Protection," "GAP",          │
│    "Theft Recovery." Pricing change recently?                │
│    [See removals →]                                          │
└──────────────────────────────────────────────────────────────┘
```

Each insight is generated by a rule the brain learned from prior data — not a hand-coded if-statement. The dealer doesn't need to ask "what's wrong this week?" — the brain volunteers.

### Everyday consequences

**Works:** A dealer notices the F&I removal insight on Monday, checks pricing, discovers a menu typo that made GAP look $400 more expensive than it was, fixes it, recovers $30k of F&I gross by end of month. The brain pays for itself in one insight.

**Breaks (silent):** If the brain stops getting events (e.g., the analytics hook regressed), it'd run on stale data and surface noise. The closed-loop architecture (see deep-dive) detects this: when event-volume drops > 50% week-over-week, an admin alert fires.

### What competitors do

- **Standard auto DOS reports**: pre-built reports the user has to remember to open. "Service no-show rate" exists in CDK and Reynolds — but nobody opens it until they already suspect something. By then it's already a problem.
- **Tableau / Looker on top of DMS data**: requires a data analyst to build dashboards. Most stores don't have one. Dashboards built once, never updated.
- **AI startups with "dealer insights"**: typically rule-based ("if no-show > 10%, flag") — not learning, just thresholding. Doesn't adapt to your store's normal.
- **What we do differently**: the brain runs continuously, learns *your store's* normal (not industry-average), and surfaces deviations as plain-English statements with one-click drill-down.

### What we do better

| Capability | Standard DOS | Wolfpack Auto |
|---|---|---|
| Captures small behavioral events (not just transactions) | Rare | Yes — every event typed in `analytics-hooks.ts`, typo-safe at compile time |
| Stores events 3 ways (facts + similarity + relationships) | Just facts | Yes — Postgres + Qdrant (vector) + Neo4j (graph) via `triple-write.ts` |
| Generates plain-English insights, not just charts | Rare | Yes — 22+ insight generators in `analytics-engine.ts` |
| Adapts to YOUR store's normal | No | Yes — baselines computed per dealer over rolling windows |
| Volunteers patterns proactively | No | Yes — surfaced in the daily dashboard, not gated behind running a report |
| Connects related events ("the no-shows are mostly Tuesday afternoons after rain") | No | Yes — Neo4j graph relationships make this query natural |

The triple-write architecture is the deep-tech win here. Most products store data once (a database). When you want similarity ("which leads behave like this hot one?") or relationships ("which customers also share a household?"), you have to grind through SQL or give up. We've already paid the cost of asking those questions — in three different shapes — at write time.

### How a non-technical reader can verify

- "Every event is typed": [`src/lib/analytics-hooks.ts`](../../src/lib/analytics-hooks.ts) — search for `type DealEvent`, `type ServiceEvent`, etc. Every event the app fires must use one of these — TypeScript blocks typos at build time
- "Triple-write is real": [`src/lib/triple-write.ts`](../../src/lib/triple-write.ts) — see the three sequential `await` calls, one per store
- "Insights are generated, not hand-coded": [`src/lib/analytics-engine.ts`](../../src/lib/analytics-engine.ts) → `generateInsights()` function returns a `BehavioralInsight[]` computed at runtime
- "Per-dealer baselines": every insight query filters by `dealer_id` (RLS-enforced)

---

## 10-minute deep dive (for a new engineer)

Read in order:

1. **Architecture narrative**: [`docs/analytics-and-learning.md`](../analytics-and-learning.md) — the closed-loop story
2. **Event registry**: [`src/lib/analytics-hooks.ts`](../../src/lib/analytics-hooks.ts) — the source-of-truth for event types. Every domain has its own union: `DealEvent`, `ServiceEvent`, `LeadEvent`, etc. Each is a string-literal union — typos fail at compile time.
3. **The hook**: `trackEvent()` in [`src/lib/analytics.ts`](../../src/lib/analytics.ts) — fire-and-forget, never blocks the user's request
4. **The brain**: [`src/lib/analytics-engine.ts`](../../src/lib/analytics-engine.ts)
   - `recordEvent()` → in-memory buffer → triple-write
   - `generateInsights()` → reads rollups, applies pattern detectors, returns plain-English statements
5. **Triple-write**: [`src/lib/triple-write.ts`](../../src/lib/triple-write.ts) — Postgres (source of truth) → Qdrant (vector embedding for similarity) → Neo4j (edge for relationships). If Qdrant or Neo4j is down, Postgres still wins; the system emits `system.triple_write_degraded` and keeps running.
6. **Signal aggregation**: [`src/lib/micro-behavioral-signals.ts`](../../src/lib/micro-behavioral-signals.ts) — rolls raw events into the signal rollups consumed by both the brain and the lead scorer (see [predictive-lead-scoring.md](predictive-lead-scoring.md))
7. **Insight schema**: [`src/db/migrations/054_micro_behavioral_views.sql`](../../src/db/migrations/054_micro_behavioral_views.sql) — pre-aggregated views for fast insight queries

### How to add a new insight

1. Add a function `detectXxx(): BehavioralInsight | null` in `analytics-engine.ts`
2. Wire it into `generateInsights()`
3. Add a unit test that constructs a known-good event stream and asserts the insight fires
4. Add a unit test that constructs a "no signal" stream and asserts the insight does NOT fire
5. Push — the new insight surfaces in the dashboard automatically

### What can still go wrong

- **Event volume drop unnoticed** — handled by `system.triple_write_degraded` and the load-baseline test
- **A new event type added without a unit test** — caught by the `verify:analytics-coverage` script (every typed event must have at least one corresponding test)
- **Insight false positives drowning the dashboard** — the `confidence` field gates display; insights below threshold stay in the audit log but don't surface

---

## Future potential (clearly aspirational)

The brain's architecture extends naturally to:
- **Cross-dealer benchmarking** with k-anonymity — "your no-show rate is 14% vs the median Toyota store's 8%" without revealing individual stores
- **Conversational insights** — ask the brain "why was last week off" in natural language; the brain runs the same insight queries it already has + uses RAG over the event store
- **Predictive escalation** — when an insight pattern correlates with a known historical loss event ("the last three times F&I removal spiked, gross dropped 12% within 30 days"), the brain promotes it from "notice" to "investigate now"

All three reuse the existing event store + triple-write + insight engine — no re-architecture required.

---

## Why this doc is trustworthy

- Every numerical claim ("22+ insights", "three stores per event", "typed event registry") points to a specific source file
- "Insights are plain-English" → run `generateInsights()` in a dev shell, see the strings come back
- "Triple-write is honest" → `tests/integration/triple-write.spec.ts` proves each store gets the same data
- "Per-dealer baselines" → RLS verification (`npm run verify:rls`) proves no cross-dealer leakage in queries

If any of these source files change, the manifest at the top forces a re-translation. The doc cannot make a claim that the code stops backing.
