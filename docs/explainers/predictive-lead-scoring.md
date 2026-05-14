# Predictive Lead Scoring — explained for non-engineers

> 1-minute for execs · 5 for sales/PMs · 10-min deep dive for new engineers. All "what we do" claims trace to the code in the manifest below.

```yaml
sources:
  - src/lib/predictive-lead-scorer.ts          # the scorer itself
  - src/lib/micro-behavioral-signals.ts        # the 45+ signals it reads
  - src/lib/analytics-engine.ts                # signal aggregation layer
  - src/lib/prediction-calibrator.ts           # accuracy-tracking & weight updates
  - docs/analytics-and-learning.md             # the closed-loop architecture
  - src/db/migrations/007_lead_scoring.sql     # data schema
last_translated: 2026-05-14
```

---

## 1-minute version (for an exec)

Your salespeople have 60 leads in their queue. Half are real buyers. The other half are tire-kickers, lost-keys-need-a-loaner, or competitors snooping. They don't know which is which, so they treat them all the same — and the real buyers go cold while they chase ghosts.

Wolfpack's Predictive Lead Scorer reads 45+ signals from how the lead actually behaves on the dealer site — how long they stayed, what they looked at, how many times they came back, whether they used the payment calculator — and produces a single score: **probability this person buys in the next 7 days**, plus the three behaviors that drove that score. Every salesperson opens the lead queue and sees the hot ones first.

It gets sharper every week because it watches its own predictions and re-weights the signals based on what actually closed. Six months in, the score is calibrated to *that specific dealership's customer mix* — not a generic industry average.

**What you tell a buyer:** "Your salespeople stop wasting time on the wrong leads. The system learns your customers, not someone else's."

---

## 5-minute version (for a salesperson, PM, or new hire)

### What problem this solves

Every dealership has the same complaint: too many leads, not enough hours. The math:
- A typical salesperson handles 80-120 leads/month
- 15-25% actually buy
- The other 75-85% are "noise" — not bad people, just not buying
- A salesperson who can't tell them apart spends 80% of their time on the 80% that won't close

The naive way: rank leads by how recently they arrived. This treats every lead identically; it's no better than alphabetical.

The 2010s SaaS way: lead score based on demographics (age, ZIP, credit tier). Better than nothing, but it ignores behavior — and behavior is the strongest signal.

The Wolfpack way: 45+ behavioral signals + outcome-learning loop = a score that improves the more leads close (or don't).

### Analogy: the maître d' who remembers

Picture a restaurant maître d' who's been at the same spot for 10 years. They know:
- Couples who linger near the wine list usually order a bottle (high check)
- People who arrive after 9 pm split appetizers (low check)
- Friday-night walk-ins ordering espresso first are usually here for the music, not the menu
- Regulars who skip the daily special are buying their usual

That's not magic — it's **patterns learned from watching outcomes**. New maître d's eventually pick up the same patterns by serving thousands of tables.

The Predictive Lead Scorer is that maître d' for car shoppers. The signals are different — VDP (vehicle detail page) views, payment-calculator use, scroll depth, return visits — but the mechanism is identical. Watch behavior, watch outcomes, learn the correlation, predict the next outcome.

### What the dealer actually sees

In the lead queue:

```
┌─────────────────────────────────────────────────────────────┐
│ Lead          Score   Likely-buy-by   Top signals          │
├─────────────────────────────────────────────────────────────┤
│ Jane Doe      🔥 87   3 days          • Returned 4x         │
│                                       • Used calculator    │
│                                       • 18-min site time   │
│                                                             │
│ Mike Smith    🌶️ 64   7 days          • Compared 3 trims   │
│                                       • Scrolled financing │
│                                                             │
│ Lisa Park     ❄️ 22   30+ days        • Single visit       │
│                                       • Didn't engage      │
└─────────────────────────────────────────────────────────────┘
```

A salesperson works Jane first, Mike second, and lets Lisa marinate (or assigns her to a follow-up drip campaign instead of a phone call). They get more closes per hour because they spent their hours on the right people.

### Everyday consequences

**Works:** A dealer's BDC (call center) reorganizes the morning call list by score every morning. After 3 months, close rate per phone hour goes from 1.2 to 1.8. That's 50% more closes from the same labor. At avg $2,800 gross-per-deal, a 5-person BDC adds ~$50k/month in incremental gross.

**Breaks:** If the model never improves, you've reinvented "leads with > 2 visits." If it improves on the wrong outcomes (e.g., short-term closes only), you might over-weight impulse buyers and miss the patient ones. The calibrator step (see deep-dive) handles this — but if it stops running, the model staleens.

### What competitors do

- **Salesforce / HubSpot for Auto**: usually demographic-only scoring. Ignores actual on-site behavior. Generic across the entire industry — a Honda dealer's model is the same as a Mercedes dealer's, which is obviously wrong.
- **Auto-specific CRMs (VinSolutions, Dealersocket, Elead)**: behavioral signals exist but are usually 5-10 hand-coded rules ("visited > 3x = hot"). No learning loop — same rules in 2018 as today.
- **DIY ML attempts by big-group dealers**: typically a data scientist trains a model once on historical data, then nobody updates it. Decays within 6 months.

The pattern: most lead scoring is either **too generic** (industry-average), **too static** (no learning), or **too expensive** (requires a data team to maintain). Each is a different way of saying "your salespeople still don't trust it."

### What we do better

| Capability | Standard tooling | Wolfpack Auto |
|---|---|---|
| Behavioral signals (not just demographics) | 5-10 hand-coded rules | 45+ signals computed from `analytics_events` |
| Confidence indicator | Usually missing | High / medium / low based on signal density |
| Top contributing signals shown to the salesperson | Black box | Top 3-5 shown alongside the score |
| Outcome learning loop | Almost never | `prediction-calibrator` watches actual deal outcomes and adjusts signal weights |
| Per-dealer calibration | One model for everyone | Weights drift per dealer over time so a Mercedes lot scores differently than a Kia lot |
| Recommended next action | Not present | The score includes a specific action (call now / hand to BDC / drip campaign) |

All six together is the differentiator. Any one of them alone is achievable; the *combination* + the *closed-loop learning* is the unlock.

### How a non-technical reader can verify the claims

- "It actually uses 45 signals": [`src/lib/predictive-lead-scorer.ts`](../../src/lib/predictive-lead-scorer.ts), grep for the `SignalVector` interface — every field is one signal
- "It learns from outcomes": [`src/lib/prediction-calibrator.ts`](../../src/lib/prediction-calibrator.ts) — see the `updateWeights` function and the unit tests
- "Per-dealer weights": the weights are stored per `dealer_id` in `lead_scoring_weights` (migration 007)
- "Verified in tests": `npm run test:unit -- predictive-lead-scorer` — 60+ tests including the learning loop

---

## 10-minute deep dive (for a new engineer)

Read these in order:

1. **Conceptual overview**: [`docs/analytics-and-learning.md`](../analytics-and-learning.md) § "Closed-loop architecture"
2. **The scorer**: [`src/lib/predictive-lead-scorer.ts`](../../src/lib/predictive-lead-scorer.ts)
   - Inputs: a lead_id + a SignalVector (45+ fields)
   - Pipeline: feature-extraction → weighted scoring → confidence calibration → action recommendation
   - Sparse-data fallback: when signals are missing, generates a low-confidence score from lead metadata alone — never throws
3. **Signal generation**: [`src/lib/micro-behavioral-signals.ts`](../../src/lib/micro-behavioral-signals.ts) and [`src/lib/analytics-engine.ts`](../../src/lib/analytics-engine.ts) — these read raw `analytics_events` rows and roll them into the 45-dim SignalVector
4. **The learning loop**: [`src/lib/prediction-calibrator.ts`](../../src/lib/prediction-calibrator.ts) — runs nightly (via cron), reads predictions made N days ago, compares against actual deal outcomes (closed? what window?), adjusts signal weights via gradient descent
5. **The data schema**: [`src/db/migrations/007_lead_scoring.sql`](../../src/db/migrations/007_lead_scoring.sql) — `lead_scoring_weights`, `lead_scores`, `score_predictions` tables
6. **Where it surfaces**: `src/app/(admin)/admin/leads/page.tsx` (the UI), and `/api/admin/leads/scored` (the API contract test is at `src/__tests__/admin-api-contracts.test.ts`)

### How to extend without breaking the loop

- Adding a new signal: add the field to `SignalVector`, add the computation in `micro-behavioral-signals.ts`, add a default weight, push. The calibrator will tune the weight from production data within 2-4 weeks.
- Changing a prediction window (currently 7d): update the `buy_window` enum AND retrain weights against new outcomes — never just change the enum.
- Stale-model detection: if the calibrator hasn't run in 7 days, the admin Health page (see Trust admin page concept) surfaces "model is stale" — a signal not to trust scores until refresh.

---

## Future potential (clearly aspirational)

Same model architecture extends to:
- **Service-appointment no-show prediction** — predict which booked appointments won't show, so the dealer triple-books cautiously. Same signals (engagement, return-visits, etc.) different outcome (showed-up? T/F).
- **Trade-in offer-acceptance prediction** — predict whether a given trade offer will be accepted. Lets the desk make a tighter first offer.
- **F&I product-attach prediction** — predict which deals will accept which F&I products. Drives the menu order.

All three reuse the same `prediction-calibrator` infrastructure — only the outcome event changes. That's why the closed-loop architecture is load-bearing: it lets us add new predictions without rebuilding the learning machinery each time.

---

## Why this doc is trustworthy

- Every numeric / capability claim is grounded in a specific source file listed in the manifest above
- "We have 45+ signals" → check the `SignalVector` interface line count
- "Weights are per-dealer" → check the schema in migration 007
- "Calibrator runs nightly" → check `cron-prediction-calibrator.ts` and `scripts/nightly-*.sh`
- "Recommended action included" → check the `recommended_action` field in `PredictiveScore`

If any of these stop being true, the source file's hash changes, the CI staleness check flags this doc, and we re-translate — or close the gap. The doc cannot make a claim that the code doesn't back.
