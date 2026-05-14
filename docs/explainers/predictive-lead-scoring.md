# Predictive Lead Scoring, explained

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

Your salespeople have 60 leads. About half are real buyers, half are tire-kickers or competitors snooping. They can't tell which is which, so they treat them all the same. The real buyers go cold while they chase ghosts.

Wolfpack's Predictive Lead Scorer reads 45+ signals from how a lead actually behaves on the dealer site (time on page, what they looked at, repeat visits, calculator use) and produces a single score plus the three behaviors that drove it. Salespeople work the hot ones first.

The score sharpens every week because the system watches its own predictions and re-weights signals based on what actually closed. Six months in, the score reflects that dealership's customer mix, not a generic average.

What you tell a buyer: your salespeople stop wasting time on the wrong leads, and the system learns your customers.

---

## 5-minute version (for a salesperson, PM, or new hire)

### Analogy: the maître d' who remembers

Picture a maître d' who has been at the same restaurant for 10 years. They know couples who linger near the wine list usually order a bottle. People who arrive after 9 pm split appetizers. Regulars who skip the daily special are buying their usual. That is pattern recognition learned from watching outcomes.

The Predictive Lead Scorer is that maître d' for car shoppers. The signals are different (VDP views, calculator use, scroll depth, return visits), the mechanism is identical. Watch behavior, watch outcomes, learn the correlation, predict the next.

### What problem this solves

A salesperson handles 80–120 leads per month. 15–25% buy. The other 75–85% are noise. Without help, they spend 80% of their time on the 80% who won't close.

Common approaches:
- Rank by arrival time. No better than alphabetical.
- Score by demographics (age, ZIP, credit). Ignores behavior, which is the strongest signal.
- Static rules ("if visits > 3, hot"). No learning, no per-store calibration.

The Wolfpack way: 45+ behavioral signals plus a calibrator that re-weights based on actual closes. The score improves the more leads close (or don't).

### What the dealer actually sees

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

Salesperson works Jane first, Mike second, routes Lisa to a drip campaign instead of a phone call.

### Everyday consequences

If it works: BDC reorganizes the call list by score daily. After 3 months, closes per phone hour go from 1.2 to 1.8 — 50% more closes from the same labor. At $2,800 average gross, a 5-person BDC adds about $50k/month.

If it breaks: a stalled calibrator means the model decays toward "leads with more than 2 visits." The admin Health page surfaces "model is stale" if the calibrator hasn't run in 7 days.

### What competitors do

- Salesforce / HubSpot: demographic-only scoring. Ignores on-site behavior. Same model for a Honda dealer and a Mercedes dealer.
- Auto-specific CRMs (VinSolutions, Dealersocket, Elead): 5–10 hand-coded rules. No learning loop. Same rules in 2018 as today.
- DIY ML by big groups: a data scientist trains once, nobody updates it. Decays within 6 months.

The common failure: too generic, too static, or too expensive to maintain.

### What we do better

| Capability | Standard tooling | Wolfpack Auto |
|---|---|---|
| Behavioral signals (not just demographics) | 5 to 10 hand-coded rules | 45+ signals computed from `analytics_events` |
| Confidence indicator | Usually missing | High, medium, or low based on signal density |
| Top contributing signals shown to the salesperson | Black box | Top 3 to 5 shown alongside the score |
| Outcome learning loop | Almost never | `prediction-calibrator` watches actual deal outcomes and adjusts weights |
| Per-dealer calibration | One model for everyone | Weights drift per dealer over time |
| Recommended next action | Not present | The score includes a specific action (call now, hand to BDC, drip campaign) |

### How to verify

- "45 signals": [`src/lib/predictive-lead-scorer.ts`](src/lib/predictive-lead-scorer.ts), grep `SignalVector` (every field is one signal).
- "Learns from outcomes": [`src/lib/prediction-calibrator.ts`](src/lib/prediction-calibrator.ts), see `updateWeights` + unit tests.
- "Per-dealer weights": stored per `dealer_id` in `lead_scoring_weights` (migration 007).
- "Tested": `npm run test:unit -- predictive-lead-scorer` runs 60+ tests including the learning loop.

---

## 10-minute deep dive (for a new engineer)

Read in order:

1. The scorer: [`src/lib/predictive-lead-scorer.ts`](src/lib/predictive-lead-scorer.ts). Inputs: `lead_id` + 45-field `SignalVector`. Pipeline: extract, weighted score, confidence, action. Sparse-data fallback never throws.
2. Signal generation: [`src/lib/micro-behavioral-signals.ts`](src/lib/micro-behavioral-signals.ts) and [`src/lib/analytics-engine.ts`](src/lib/analytics-engine.ts). Roll raw `analytics_events` into the 45-dim SignalVector.
3. The learning loop: [`src/lib/prediction-calibrator.ts`](src/lib/prediction-calibrator.ts). Nightly cron. Reads N-day-old predictions, compares to actual outcomes, adjusts weights via gradient descent.
4. Schema + UI: [`src/db/migrations/007_lead_scoring.sql`](src/db/migrations/007_lead_scoring.sql) (3 tables: `lead_scoring_weights`, `lead_scores`, `score_predictions`); `src/app/(admin)/admin/leads/page.tsx` (UI); `/api/admin/leads/scored` (contract test in `src/__tests__/admin-api-contracts.test.ts`).

### How to extend without breaking the loop

- New signal: add field to `SignalVector`, compute in `micro-behavioral-signals.ts`, add a default weight. The calibrator tunes from production data within 2–4 weeks.
- New prediction window (currently 7d): update the `buy_window` enum and retrain weights against new outcomes.
- Stale-model detection: admin Health page surfaces "model is stale" if the calibrator hasn't run in 7 days.

---

## Future potential

Same model architecture extends to:
- Service no-show prediction: same signals, different outcome.
- Trade-in offer-acceptance prediction: tighter first offers.
- F&I product-attach prediction: drives menu order.

All reuse the same `prediction-calibrator` infrastructure. Only the outcome event changes.

---

> Trustworthy because: manifest at top + CI staleness check. If a source file changes, this doc gets flagged.
