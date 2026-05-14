# Analytics Brain, explained

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

Every day a dealership produces thousands of small moments: a click on the SUV gallery, a deal moved to "presented," a service appointment rescheduled, an F&I product added and then removed. Individually noise. Collectively a fingerprint of how the business actually works. Most software captures the big events ("deal closed") and throws the small ones away.

The Analytics Brain captures every event with a typed name (e.g., `deal.fi_product_removed`), stores it three ways (a database for facts, a vector index for similarity, a graph for relationships), and emits short plain-English observations: "Your APR rejection rate jumped 30 percent this week. Could be the new lender, could be tighter credit. Worth checking."

The brain sharpens over time because it has more history to compare against. Year five is a moat.

What you tell a buyer: other software shows you reports. This one notices things and tells you when something is off, before it shows up in the monthly P&L.

---

## 5-minute version (for a salesperson, GM, or new hire)

### Analogy: the night security guard who memorizes the building

Picture a guard who has been at the same building for 20 years. They know the third-floor printer always whirs at 2 am (fine). The HVAC kicks on twice an hour in winter (normal). The west-side elevator squeaks slightly when carrying more than 4 people (worth flagging, not urgent). But yesterday the storeroom door was unlocked at 11 pm. That is new. They investigate.

That is not surveillance. It is pattern recognition from continuous observation. The guard does not need to know what every event means. They know what is normal and what is new.

The Analytics Brain is that guard for a dealership. It watches:
- Page views, clicks, scroll depth, form interactions
- Deal events (created, presented, accepted, F&I attached, funded, unwound)
- Service events (appointment, no-show, repair order, comeback)
- Inventory events (added, priced, repriced, days-on-lot thresholds)
- Lead events (created, contacted, scored, converted)

Then it asks: what is normal? What is new? What is worth a human's attention?

### What problem this solves

A dealership runs on intuition. The 15-year GM can walk the floor and feel that "service is off this week" before any report says so. That intuition walks out the door when the GM leaves, and it doesn't scale to 50 stores. The Brain doesn't replace the GM. It assists them by watching every small event the human cannot see and surfacing the patterns worth attention.

### What dealers actually see

Insights appear in the admin dashboard as plain-English statements with a timestamp and a "see details" link:

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

Each insight comes from a rule the Brain learned from prior data, not a hand-coded if-statement. The dealer doesn't have to ask "what is wrong this week?" The Brain volunteers.

### Everyday consequences

If it works: the dealer sees the F&I removal insight Monday, checks pricing, finds a menu typo that made GAP look $400 more expensive, fixes it, recovers $30k of F&I gross by end of month. One insight pays for the product.

If it breaks: if the Brain stops getting events (analytics hook regression), it surfaces noise on stale data. Detected by the load-baseline check — event volume drop over 50% week-over-week fires an admin alert.

### What competitors do

- Standard auto DOS reports (CDK, Reynolds): pre-built reports nobody opens until they already suspect a problem. By then it's too late.
- Tableau / Looker on DMS data: needs a data analyst. Most stores don't have one.
- AI startups with "dealer insights": typically rule-based ("if no-show > 10%, flag"). Not learning, just thresholding. Doesn't adapt to your store's normal.

What we do differently: the Brain runs continuously, learns your store's normal (not industry-average), and surfaces deviations as plain-English statements with one-click drill-down.

### What we do better

| Capability | Standard DOS | Wolfpack Auto |
|---|---|---|
| Captures small behavioral events (not just transactions) | Rare | Every event typed in `analytics-hooks.ts`, typo-safe at compile time |
| Stores events 3 ways (facts, similarity, relationships) | Just facts | Postgres + Qdrant (vector) + Neo4j (graph) via `triple-write.ts` |
| Generates plain-English insights, not just charts | Rare | 22+ insight generators in `analytics-engine.ts` |
| Adapts to YOUR store's normal | No | Baselines computed per dealer over rolling windows |
| Volunteers patterns proactively | No | Surfaced in the daily dashboard, not gated behind running a report |
| Connects related events (e.g., "no-shows are mostly Tuesday afternoons after rain") | No | Neo4j graph relationships make this query natural |

### How to verify

- "Every event typed": [`src/lib/analytics-hooks.ts`](src/lib/analytics-hooks.ts). Search `type DealEvent`, `type ServiceEvent`. TypeScript blocks typos at build time.
- "Triple-write is real": [`src/lib/triple-write.ts`](src/lib/triple-write.ts). Three sequential `await` calls, one per store.
- "Insights generated, not hand-coded": [`src/lib/analytics-engine.ts`](src/lib/analytics-engine.ts), `generateInsights()` returns a `BehavioralInsight[]` computed at runtime.
- "Per-dealer baselines": every insight query filters by `dealer_id` (RLS-enforced).

---

## 10-minute deep dive (for a new engineer)

Read in order:

1. Architecture narrative: [`docs/analytics-and-learning.md`](docs/analytics-and-learning.md). The closed-loop story.
2. Event registry + hook: [`src/lib/analytics-hooks.ts`](src/lib/analytics-hooks.ts) (typed unions per domain — typos fail at compile time) and `trackEvent()` in [`src/lib/analytics.ts`](src/lib/analytics.ts) (fire-and-forget, never blocks).
3. The brain: [`src/lib/analytics-engine.ts`](src/lib/analytics-engine.ts). `recordEvent()` buffers + triple-writes; `generateInsights()` runs pattern detectors over rollups.
4. Triple-write + rollups: [`src/lib/triple-write.ts`](src/lib/triple-write.ts) (Postgres source of truth, Qdrant for similarity, Neo4j for relationships; emits `system.triple_write_degraded` if Qdrant/Neo4j down) and [`src/lib/micro-behavioral-signals.ts`](src/lib/micro-behavioral-signals.ts) (rollups powering the Brain and the lead scorer).
5. Insight schema: [`src/db/migrations/054_micro_behavioral_views.sql`](src/db/migrations/054_micro_behavioral_views.sql). Pre-aggregated views for fast queries.

### How to add a new insight

1. Add `detectXxx(): BehavioralInsight | null` in `analytics-engine.ts`.
2. Wire into `generateInsights()`.
3. Add unit tests: known-good stream → fires; no-signal stream → does NOT fire.
4. Push. New insight surfaces in the dashboard automatically.

### What can still go wrong

- Event volume drop unnoticed: handled by `system.triple_write_degraded` + load-baseline test.
- New event type without a test: caught by `verify:analytics-coverage` (every typed event needs a test).
- Insight false positives drowning the dashboard: `confidence` field gates display. Below threshold → audit log only.

---

## Future potential

- Cross-dealer benchmarking with k-anonymity: "your no-show rate is 14 percent vs the median Toyota store's 8 percent," without revealing individual stores.
- Conversational insights: ask the Brain "why was last week off" in natural language, running the same insight queries with RAG over the event store.
- Predictive escalation: when a pattern correlates with a known historical loss, promote it from "notice" to "investigate now."

All three reuse the existing event store, triple-write, and insight engine.

---

> Trustworthy because: manifest at top + CI staleness check. If a source file changes, this doc gets flagged.
