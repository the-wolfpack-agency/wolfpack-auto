# Analytics Brain, explained for non-engineers

> 1 minute for execs, 5 for sales and PMs, 10 minutes for new engineers. Every claim grounds in source files listed in the manifest.

```yaml
sources:
  - src/lib/analytics-engine.ts                 # the brain, generateInsights()
  - src/lib/analytics-hooks.ts                  # typed event registry
  - src/lib/triple-write.ts                     # how memory persists across stores
  - src/lib/micro-behavioral-signals.ts         # signal rollups
  - src/lib/qdrant-client.ts                    # semantic memory
  - src/lib/neo4j-client.ts                     # relationship memory
  - docs/analytics-and-learning.md              # closed-loop architecture narrative
last_translated: 2026-05-14
```

---

## 1-minute version (for an exec)

Every day a dealership produces thousands of small moments. A customer clicked the SUV gallery. A salesperson moved a deal to "presented." A service appointment was rescheduled. An F&I product was added, then removed. Individually these are noise. Collectively they are a fingerprint of how the business actually works.

Most software ignores them. It captures the big events ("deal closed") and throws the small ones away.

Wolfpack Auto's Analytics Brain captures every event with a typed name (e.g., `deal.fi_product_removed`), stores it three different ways (a regular database for facts, a vector index for similarity, a graph for relationships), and emits insights. Short, plain-English observations like: "Your APR rejection rate jumped 30 percent this week. Could be the new lender, could be tighter credit. Worth checking."

The brain gets sharper the longer the dealer uses the product, because it has more events to compare against history. Year two is meaningfully more useful than year one. Year five is a moat.

What you tell a buyer: other software shows you reports. This one notices things and tells you when something is off, before it shows up in the monthly P&L.

---

## 5-minute version (for a salesperson, GM, or new hire)

### What problem this solves

A dealership runs on intuition. The GM who has been there 15 years can walk the floor and feel that "service is off this week" before any report says so. They notice that two of their best salespeople are quietly frustrated. That the trade desk is being too aggressive on one truck model. That Friday afternoon test drives are converting at half the usual rate.

That intuition is irreplaceable. But it walks out the door when the GM leaves. And it does not scale. One GM cannot sense-make for 50 stores.

The Analytics Brain does not replace the GM. It assists them by watching every small event the human cannot see, computing the patterns, and surfacing the ones worth attention.

### Analogy: the night security guard who memorizes the building

Picture a security guard who has been at the same building for 20 years. They have walked the halls every night. They know the third-floor printer always whirs at 2 am (scheduled job, fine). The HVAC kicks on twice an hour in winter (normal). The west-side elevator has a slight squeak when carrying more than 4 people (worth flagging to maintenance, not urgent). But yesterday the storeroom door was unlocked at 11 pm. That is new. They investigate.

That is not surveillance. It is pattern recognition from continuous observation. The guard does not need to know what every event means. They just know what is normal and what is new.

The Analytics Brain is that guard for a dealership. It watches:
- Page views, clicks, scroll depth, form interactions on every public page
- Deal events (created, presented, accepted, F&I product attached, funded, unwound)
- Service events (appointment created, no-show, repair order opened, comeback)
- Inventory events (added to lot, priced, repriced, days-on-lot crossing thresholds)
- Lead events (created, contacted, status changed, scored, converted)

Then it asks: what is normal? What is new? What is worth a human's attention?

### What dealers actually see

The brain produces insights that show up in the admin dashboard as plain-English statements with a timestamp and a "see details" link:

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

Each insight is generated by a rule the brain learned from prior data, not a hand-coded if-statement. The dealer does not need to ask "what is wrong this week?" The brain volunteers.

### Everyday consequences

If it works: a dealer sees the F&I removal insight on Monday, checks pricing, discovers a menu typo that made GAP look $400 more expensive than it was, fixes it, recovers $30k of F&I gross by end of month. The brain pays for itself in one insight.

If it breaks (silent): if the brain stops getting events (e.g., the analytics hook regressed), it runs on stale data and surfaces noise. The closed-loop architecture (deep-dive) detects this: when event volume drops more than 50 percent week-over-week, an admin alert fires.

### What competitors do

- Standard auto DOS reports: pre-built reports the user has to remember to open. "Service no-show rate" exists in CDK and Reynolds, but nobody opens it until they already suspect something. By then it is already a problem.
- Tableau or Looker on top of DMS data: requires a data analyst to build dashboards. Most stores do not have one. Dashboards built once, never updated.
- AI startups with "dealer insights": typically rule-based ("if no-show > 10%, flag"). Not learning, just thresholding. Does not adapt to your store's normal.
- What we do differently: the brain runs continuously, learns your store's normal (not industry-average), and surfaces deviations as plain-English statements with one-click drill-down.

### What we do better

| Capability | Standard DOS | Wolfpack Auto |
|---|---|---|
| Captures small behavioral events (not just transactions) | Rare | Every event typed in `analytics-hooks.ts`, typo-safe at compile time |
| Stores events 3 ways (facts, similarity, relationships) | Just facts | Postgres + Qdrant (vector) + Neo4j (graph) via `triple-write.ts` |
| Generates plain-English insights, not just charts | Rare | 22+ insight generators in `analytics-engine.ts` |
| Adapts to YOUR store's normal | No | Baselines computed per dealer over rolling windows |
| Volunteers patterns proactively | No | Surfaced in the daily dashboard, not gated behind running a report |
| Connects related events (e.g., "no-shows are mostly Tuesday afternoons after rain") | No | Neo4j graph relationships make this query natural |

The triple-write architecture is the deep-tech win here. Most products store data once (a database). When you want similarity ("which leads behave like this hot one?") or relationships ("which customers also share a household?"), you grind through SQL or give up. We have already paid the cost of asking those questions, in three different shapes, at write time.

### How a non-technical reader can verify

- "Every event is typed": [`src/lib/analytics-hooks.ts`](../../src/lib/analytics-hooks.ts). Search for `type DealEvent`, `type ServiceEvent`, etc. Every event the app fires must use one of these. TypeScript blocks typos at build time.
- "Triple-write is real": [`src/lib/triple-write.ts`](../../src/lib/triple-write.ts). See the three sequential `await` calls, one per store.
- "Insights are generated, not hand-coded": [`src/lib/analytics-engine.ts`](../../src/lib/analytics-engine.ts), `generateInsights()` function returns a `BehavioralInsight[]` computed at runtime.
- "Per-dealer baselines": every insight query filters by `dealer_id` (RLS-enforced).

---

## 10-minute deep dive (for a new engineer)

Read in order:

1. Architecture narrative: [`docs/analytics-and-learning.md`](../analytics-and-learning.md). The closed-loop story.
2. Event registry: [`src/lib/analytics-hooks.ts`](../../src/lib/analytics-hooks.ts). The source of truth for event types. Every domain has its own union: `DealEvent`, `ServiceEvent`, `LeadEvent`, etc. Each is a string-literal union. Typos fail at compile time.
3. The hook: `trackEvent()` in [`src/lib/analytics.ts`](../../src/lib/analytics.ts). Fire-and-forget, never blocks the user's request.
4. The brain: [`src/lib/analytics-engine.ts`](../../src/lib/analytics-engine.ts).
   - `recordEvent()` feeds an in-memory buffer, then triple-write.
   - `generateInsights()` reads rollups, applies pattern detectors, returns plain-English statements.
5. Triple-write: [`src/lib/triple-write.ts`](../../src/lib/triple-write.ts). Postgres (source of truth), Qdrant (vector embedding for similarity), Neo4j (edge for relationships). If Qdrant or Neo4j is down, Postgres still wins. The system emits `system.triple_write_degraded` and keeps running.
6. Signal aggregation: [`src/lib/micro-behavioral-signals.ts`](../../src/lib/micro-behavioral-signals.ts). Rolls raw events into the signal rollups consumed by both the brain and the lead scorer.
7. Insight schema: [`src/db/migrations/054_micro_behavioral_views.sql`](../../src/db/migrations/054_micro_behavioral_views.sql). Pre-aggregated views for fast insight queries.

### How to add a new insight

1. Add a function `detectXxx(): BehavioralInsight | null` in `analytics-engine.ts`.
2. Wire it into `generateInsights()`.
3. Add a unit test that constructs a known-good event stream and asserts the insight fires.
4. Add a unit test that constructs a "no signal" stream and asserts the insight does NOT fire.
5. Push. The new insight surfaces in the dashboard automatically.

### What can still go wrong

- Event volume drop unnoticed: handled by `system.triple_write_degraded` and the load-baseline test.
- A new event type added without a unit test: caught by the `verify:analytics-coverage` script (every typed event must have at least one corresponding test).
- Insight false positives drowning the dashboard: the `confidence` field gates display. Insights below threshold stay in the audit log but do not surface.

---

## Future potential (clearly aspirational)

The brain's architecture extends naturally to:
- Cross-dealer benchmarking with k-anonymity: "your no-show rate is 14 percent vs the median Toyota store's 8 percent," without revealing individual stores.
- Conversational insights: ask the brain "why was last week off" in natural language. The brain runs the same insight queries it already has and uses RAG over the event store.
- Predictive escalation: when an insight pattern correlates with a known historical loss event ("the last three times F&I removal spiked, gross dropped 12 percent within 30 days"), the brain promotes it from "notice" to "investigate now."

All three reuse the existing event store, triple-write, and insight engine. No re-architecture required.

---

## Why this doc is trustworthy

- Every numerical claim ("22+ insights," "three stores per event," "typed event registry") points to a specific source file.
- "Insights are plain-English": run `generateInsights()` in a dev shell, see the strings come back.
- "Triple-write is honest": `tests/integration/triple-write.spec.ts` proves each store gets the same data.
- "Per-dealer baselines": RLS verification (`npm run verify:rls`) proves no cross-dealer leakage in queries.

If any of these source files change, the manifest at the top forces a re-translation. The doc cannot make a claim that the code stops backing.
