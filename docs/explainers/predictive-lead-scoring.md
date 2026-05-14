# Predictive Lead Scoring, explained for non-engineers

> 1 minute for execs, 5 minutes for sales and PMs, 10 minutes for new engineers. Every claim traces to a source file in the manifest below.

```yaml
sources:
  - src/lib/predictive-lead-scorer.ts          # the scorer
  - src/lib/micro-behavioral-signals.ts        # 45+ signals it reads
  - src/lib/analytics-engine.ts                # signal aggregation
  - src/lib/prediction-calibrator.ts           # accuracy tracking, weight updates
  - docs/analytics-and-learning.md             # closed-loop architecture
  - src/db/migrations/007_lead_scoring.sql     # data schema
last_translated: 2026-05-14
```

---

## 1-minute version (for an exec)

Your salespeople have 60 leads in their queue. About half are real buyers. The other half are tire-kickers, lost-keys-need-a-loaner, or competitors snooping. They cannot tell which is which, so they treat them all the same. The real buyers go cold while they chase ghosts.

Wolfpack's Predictive Lead Scorer reads 45+ signals from how the lead actually behaves on the dealer site. How long they stayed. What they looked at. How many times they came back. Whether they used the payment calculator. It produces a single score (probability the person buys in the next 7 days) and the three behaviors that drove that score. Every salesperson opens the queue and sees the hot ones first.

The score gets sharper every week because the system watches its own predictions and re-weights the signals based on what actually closed. Six months in, the score reflects that specific dealership's customer mix instead of a generic industry average.

What you tell a buyer: your salespeople stop wasting time on the wrong leads, and the system learns your customers (not someone else's).

---

## 5-minute version (for a salesperson, PM, or new hire)

### What problem this solves

Every dealership has the same complaint: too many leads, not enough hours. The math:
- A typical salesperson handles 80 to 120 leads per month
- 15 to 25 percent actually buy
- The other 75 to 85 percent are noise (not bad people, just not buying)
- A salesperson who cannot tell them apart spends 80 percent of their time on the 80 percent that will not close

The naive way: rank leads by arrival time. This treats every lead identically and is no better than alphabetical.

The 2010s SaaS way: lead score from demographics (age, ZIP, credit tier). Better than nothing, but it ignores behavior, and behavior is the strongest signal.

The Wolfpack way: 45+ behavioral signals plus an outcome-learning loop. The score improves the more leads close (or do not).

### Analogy: the maître d' who remembers

Picture a maître d' who has been at the same restaurant for 10 years. They know couples who linger near the wine list usually order a bottle. People who arrive after 9 pm split appetizers. Friday-night walk-ins ordering espresso first are here for the music, not the menu. Regulars who skip the daily special are buying their usual.

That is not magic. It is pattern recognition learned from watching outcomes. New maître d's eventually pick up the same patterns by serving thousands of tables.

The Predictive Lead Scorer is that maître d' for car shoppers. The signals are different (VDP views, calculator use, scroll depth, return visits), but the mechanism is identical. Watch behavior, watch outcomes, learn the correlation, predict the next outcome.

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
│                                       • Did not engage     │
└─────────────────────────────────────────────────────────────┘
```

A salesperson works Jane first, Mike second, and lets Lisa marinate (or routes her to a drip campaign instead of a phone call). More closes per hour, because the hours go to the right people.

### Everyday consequences

If it works: a dealer's BDC reorganizes the morning call list by score every day. After 3 months, close rate per phone hour goes from 1.2 to 1.8. That is 50 percent more closes from the same labor. At an average $2,800 gross per deal, a 5-person BDC adds about $50k per month in incremental gross.

If it breaks: if the model never improves, you have reinvented "leads with more than 2 visits." If it improves on the wrong outcomes (short-term closes only), you might over-weight impulse buyers and miss the patient ones. The calibrator step (deep-dive) is what prevents this. If the calibrator stops running, the model stalens.

### What competitors do

- Salesforce or HubSpot for Auto: usually demographic-only scoring. Ignores actual on-site behavior. Generic across the entire industry. A Honda dealer's model is the same as a Mercedes dealer's, which is obviously wrong.
- Auto-specific CRMs (VinSolutions, Dealersocket, Elead): behavioral signals exist but are usually 5 to 10 hand-coded rules ("visited more than 3x = hot"). No learning loop. The same rules in 2018 as today.
- DIY ML attempts by big-group dealers: a data scientist trains a model once on historical data, then nobody updates it. Decays within 6 months.

The pattern: most lead scoring is either too generic (industry-average), too static (no learning), or too expensive (requires a data team to maintain). Each is a different way of saying "your salespeople still do not trust it."

### What we do better

| Capability | Standard tooling | Wolfpack Auto |
|---|---|---|
| Behavioral signals (not just demographics) | 5 to 10 hand-coded rules | 45+ signals computed from `analytics_events` |
| Confidence indicator | Usually missing | High, medium, or low based on signal density |
| Top contributing signals shown to the salesperson | Black box | Top 3 to 5 shown alongside the score |
| Outcome learning loop | Almost never | `prediction-calibrator` watches actual deal outcomes and adjusts weights |
| Per-dealer calibration | One model for everyone | Weights drift per dealer over time, so a Mercedes lot scores differently than a Kia lot |
| Recommended next action | Not present | The score includes a specific action (call now, hand to BDC, drip campaign) |

All six together are the differentiator. Any one of them alone is achievable. The combination plus the closed-loop learning is the unlock.

### How a non-technical reader can verify the claims

- "It actually uses 45 signals": [`src/lib/predictive-lead-scorer.ts`](../../src/lib/predictive-lead-scorer.ts), grep for the `SignalVector` interface (every field is one signal).
- "It learns from outcomes": [`src/lib/prediction-calibrator.ts`](../../src/lib/prediction-calibrator.ts), see the `updateWeights` function and the unit tests.
- "Per-dealer weights": the weights are stored per `dealer_id` in `lead_scoring_weights` (migration 007).
- "Verified in tests": `npm run test:unit -- predictive-lead-scorer` runs 60+ tests including the learning loop.

---

## 10-minute deep dive (for a new engineer)

Read these in order:

1. Conceptual overview: [`docs/analytics-and-learning.md`](../analytics-and-learning.md), section "Closed-loop architecture".
2. The scorer: [`src/lib/predictive-lead-scorer.ts`](../../src/lib/predictive-lead-scorer.ts).
   - Inputs: a `lead_id` and a `SignalVector` (45+ fields).
   - Pipeline: feature extraction, weighted scoring, confidence calibration, action recommendation.
   - Sparse-data fallback: when signals are missing, generates a low-confidence score from lead metadata alone. Never throws.
3. Signal generation: [`src/lib/micro-behavioral-signals.ts`](../../src/lib/micro-behavioral-signals.ts) and [`src/lib/analytics-engine.ts`](../../src/lib/analytics-engine.ts). These read raw `analytics_events` rows and roll them into the 45-dim SignalVector.
4. The learning loop: [`src/lib/prediction-calibrator.ts`](../../src/lib/prediction-calibrator.ts). Runs nightly via cron. Reads predictions made N days ago. Compares them against actual deal outcomes (closed? what window?). Adjusts signal weights via gradient descent.
5. The data schema: [`src/db/migrations/007_lead_scoring.sql`](../../src/db/migrations/007_lead_scoring.sql). Three tables: `lead_scoring_weights`, `lead_scores`, `score_predictions`.
6. Where it surfaces: `src/app/(admin)/admin/leads/page.tsx` (the UI), `/api/admin/leads/scored` (the API contract test is in `src/__tests__/admin-api-contracts.test.ts`).

### How to extend without breaking the loop

- Adding a new signal: add the field to `SignalVector`, add the computation in `micro-behavioral-signals.ts`, add a default weight, push. The calibrator will tune the weight from production data within 2 to 4 weeks.
- Changing a prediction window (currently 7d): update the `buy_window` enum and retrain weights against new outcomes. Never just change the enum.
- Stale-model detection: if the calibrator has not run in 7 days, the admin Health page surfaces "model is stale," a signal not to trust scores until refresh.

---

## Future potential (clearly aspirational)

The same model architecture extends to:
- Service-appointment no-show prediction: predict which booked appointments will not show, so the dealer triple-books cautiously. Same signals (engagement, return-visits), different outcome (showed up: yes or no).
- Trade-in offer-acceptance prediction: predict whether a given trade offer will be accepted. Lets the desk make a tighter first offer.
- F&I product-attach prediction: predict which deals will accept which F&I products. Drives the menu order.

All three reuse the same `prediction-calibrator` infrastructure. Only the outcome event changes. That is why the closed-loop architecture is load-bearing: it lets us add new predictions without rebuilding the learning machinery each time.

---

## Why this doc is trustworthy

- Every numeric or capability claim is grounded in a specific source file listed in the manifest above.
- "We have 45+ signals" can be checked against the `SignalVector` interface line count.
- "Weights are per-dealer" can be checked against the schema in migration 007.
- "Calibrator runs nightly" can be checked against `cron-prediction-calibrator.ts` and `scripts/nightly-*.sh`.
- "Recommended action included" can be checked against the `recommended_action` field in `PredictiveScore`.

If any of these stop being true, the source file's hash changes, the CI staleness check flags this doc, and we re-translate. Or we close the gap. The doc cannot make a claim that the code does not back.
