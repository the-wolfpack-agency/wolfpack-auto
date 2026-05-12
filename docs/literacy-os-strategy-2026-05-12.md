# Dealership Literacy OS — strategic destination

**Date:** 2026-05-12
**Decision target:** founder alignment meeting
**Author:** Wolfpack CTO

This doc is the long-arc companion to `docs/fi-audit-wedge-spec-2026-05-12.md`. The Audit is what we ship in two weeks. This is what the Audit becomes part of over 18-36 months.

---

## TL;DR

Wolfpack Auto's product roadmap has a coherent destination: a **Dealership Literacy Operating System** that translates digital business concepts into the physical-dealership mental model dealers already think in. The F&I Penetration Audit and the Spatial Translation Tool are not three competing wedge products. They are the year-one entry points to a single year-2-3 strategic build.

The single founder-meeting decision is not "which of the three should we build." It is: **"Do we commit to the Literacy OS as the strategic destination, and ship the Audit + Spatial v1 as funnel into it?"**

Yes or no. One decision.

---

## What the Literacy OS is

A curated knowledge graph that maps **digital business concepts** to **physical dealership concepts**, paired with **role-aware surfaces** (dashboards, training, onboarding, in-context explanations) that render that mapping in language each role already speaks.

Every metric, every workflow, every recommendation, every alert in Wolfpack Auto becomes available in **lot-language** by default. The dealer doesn't learn the software; the software meets the dealer where they already are.

### The primitive: the ontology

The asset is the structured ontology, not any individual surface. The ontology has six entity types:

1. **Concepts** — digital and physical objects (VDP, homepage hero, lead, walk-in, billboard, F&I desk, bay).
2. **Mappings** — typed relations between concepts ("a VDP is the digital equivalent of a front-row vehicle"; "an abandoned lead form is the equivalent of a customer walking out of the F&I desk").
3. **Metrics** — measurable signals attached to concepts (scroll-depth, attach rate, days-on-lot, conversion rate, bay utilization).
4. **Translations** — role-specific phrasings of metrics in lot-language, keyed on (metric, role, context).
5. **Actions** — recommended interventions tied to (metric threshold crossed, role responsible, expected outcome).
6. **Outcomes** — measurable results of actions; feed back into the system so it learns which translations and actions actually move the needle.

### The views (rendered from the ontology)

- **Dealer-internal dashboard** — your business in your language, by surface (lot, website, F&I desk, service drive). Year-one Q3 deliverable; this is the Spatial Translation Tool we discussed.
- **Role-specific dashboards** — what each role needs to know, in their language, with actions they can take today. Year-two.
- **Onboarding curricula** — "your first week as a salesperson at this dealership" generated dynamically from the ontology + the specific dealership's data. Year-two.
- **Training modules** — embedded explanations for every workflow ("why this matters, what it's the digital equivalent of, how it affects you"). Year-two.
- **Cross-role visibility** — the customer journey across marketing → sales → service rendered in lot-terms. Year-three.
- **Customer-facing surface** — optional. Year-three. Only if there's pull.

---

## Why this is a credible product, not a vibes pitch

Three structural advantages Wolfpack has that the major competitors do not:

1. **Operating DOS as foundation.** The underlying data (analytics_events, fi_deals, leads, repair_orders, micro_behavioral views) is already flowing. Triple-write to Neo4j makes the ontology a natural fit — the graph store is already there. Competitors building from scratch would need to ship the DOS first.

2. **The "speak dealer, not data" rule already exists in the codebase.** `.ai/client-context.md` mandates plain-English copy on every dealer surface. The Literacy OS is the structured generalization of that already-enforced rule.

3. **Domain + engineering pairing.** Hoxsie owns dealer-industry domain context. Engineering owns the platform. Most software vendors have one or the other. Most consultancies have one. Almost nobody has both at this scale.

---

## The content problem and how we solve it without a senior content hire

The honest pushback on this concept is "you need a deep dealer-operations + digital-UX hybrid to author 200-500 curated mappings. That hire is hard, slow, and expensive."

The reframe: **we build the authoring engine first; we author the seed ontology incrementally; AI scales expansion within the structured framework.**

Three components:

1. **Ontology authoring tool** — CRUD interface for concepts, mappings, metrics, translations, actions. Audit-logged. Versioned. Today's session ships migration 075 and the lib that powers it.
2. **AI-assisted expansion** — given a starter ontology and a new metric or concept, an LLM proposes candidate translations and analogs. A human reviewer approves, rejects, or refines. This is exactly the cost-efficient-AI pattern that Wolfpack Instinct is positioned around: structured ontology controls the vocabulary, LLM as rendering layer, tight token budget, controlled output quality.
3. **Outcome feedback loop** — every translation and action emitted to a dealer gets tagged with an outcome (did the dealer click? did the recommended action get taken? did the metric move?). Low-performing translations get demoted; high-performing ones get promoted. The ontology learns.

Seed ontology in the first 90 days: 50-100 curated mappings, hand-written by CTO + Hoxsie working from the dealer pain examples in this doc. Year-one target: 300-500 mappings, 60% AI-proposed and human-approved, 40% hand-authored. Year-two target: 1,500-2,500 mappings.

The first authoring sessions are content-design work, not engineering work. They're 2-4 hour CTO + Hoxsie working sessions, every 2 weeks. Costs no incremental headcount in year one.

---

## Phased roadmap

### Year-one (now → 2027-01)

**Q2 (May-June, immediate):**
- Ship F&I Penetration Audit per `docs/fi-audit-wedge-spec-2026-05-12.md`. Two engineer-weeks. Revenue funnel.
- Ship literacy ontology engine: migration 075, lib, authoring API, seed of 50-100 starter mappings. Today's session lands this. The Audit's recommendations are rendered through the ontology — proves the engine works end-to-end on day one.
- Hire #1: dealer-industry sales lead (per existing premortem action item, unchanged).

**Q3 (July-September):**
- Ship Spatial Translation Tool v1 — 2D dealer-internal dashboard. The Audit is integrated; an audit-runner can drill from "your F&I gross is X" into "what does this look like across your business in lot-terms." 4-6 engineer-weeks.
- Sell 5-10 design-partner dealers at cost or free for year-one access. Validate the translations land.
- Ontology grows to ~150-300 mappings.

**Q4 (October-December):**
- Extend ontology to a second role surface (F&I role-specific dashboard, since the Audit already covers that data domain).
- Ship cross-surface drilling (from a lot-view metric, click into the website surface, click into the F&I desk surface — same data, three vantage points).
- Hire #2: dealer-literacy lead — senior content/UX/ops hybrid. The role is now buildable because the engine + seed ontology exists. The hire scales authoring, doesn't bootstrap it.

### Year-two (2027)

- Role-specific dashboards for sales, BDC, service advisor, service manager, marketing.
- Onboarding curricula surface ("your first week as [role]") generated from ontology + dealer-specific data.
- Training modules embedded across every workflow.
- 3D spatial visualization upgrade for year-one dashboard, if pulled by paying customers.
- Ontology at 1,500+ mappings.

### Year-three (2028)

- Full cross-role visibility — customer journey in lot-language across every touchpoint.
- IoT integration if dealer pull justifies it.
- Optional public customer-facing surface.
- Formal sub-brand: "Wolfpack Auto Literacy" (or whatever brand Hoxsie picks).
- License the ontology engine to non-auto verticals (HVAC, real estate, restaurants — any industry with a strong physical operator who is digitally illiterate). Strategic horizon, not a year-three commitment.

---

## Connection to Wolfpack Instinct

This matters and should be raised at the founder meeting.

Wolfpack Instinct is positioned as an AI cost-efficiency platform for internal Wolfpack agency operations. Its thesis is: structured ontology + LLM as rendering layer + tight token budget = high-quality output at low cost.

That is the **identical engineering pattern** as the Literacy OS. The ontology shape differs (agency operations vs. dealership operations), but the engine is the same.

**Engineering leverage opportunity:** build the ontology engine once, instantiate it twice. Wolfpack Instinct = agency ontology; Wolfpack Auto Literacy = dealer ontology. Two products, one platform underneath. The ontology engine itself becomes a future productizable surface (year-three+) for vertical-specific business-literacy platforms.

This is a real moat that nobody else is positioned to build, because no one else is simultaneously running an agency AND a vertical SaaS in a digitally-illiterate industry.

---

## Honest risks (the same five as my conversation pushback, restated for the founder)

1. **Scope is 18-36 months to full product.** Year-one delivers a slice; picking the right slice is the whole game. The phasing above is opinionated.
2. **Content quality determines everything.** The ontology engine will run. The translations only land if they're authored well. Year-one ontology MUST be hand-curated by people who know dealer operations cold. AI scales it; AI does not bootstrap it.
3. **Adoption is top-down or it doesn't happen.** GM has to mandate role-level use. Sales cycle to GM is longer than to F&I Director. The F&I Audit wedge buys us GM-level conversations cheaply; that's why it goes first.
4. **Training-market competitors are entrenched.** NADA Academy, Joe Verde, Cardone. Differentiator must be sharp: "this isn't training, this is operational literacy embedded in your daily tools." Position carefully.
5. **Framework lock-in moat is slow.** 12+ months for the framework to feel native to a dealership. Year-one design partners must be churn-free for the moat thesis to hold.

---

## Stress tests required before founder green-light

Two customer-discovery tasks, both stated dollar-amount answers required. Vague enthusiasm doesn't count.

1. **One current dealer or close prospect, when shown the role-specific translation examples (sales, F&I, BDC, service, GM), says: "yes, I'd pay $X/month for that, here's the pain it solves."** Target: 14 days from founder green-light. If we can't get one in 14 days, the concept is good but the timing or framing is off.
2. **One current dealership employee (any role), when walked through their role's translations, says: "yes, I'd actually use this in my daily work."** If they say "I'd never use a computer for this," we have a content/UX problem the ontology engine alone won't solve.

Both must pass before committing engineering capacity beyond year-one Q2 (Audit + ontology engine seed, both already in scope this session).

---

## Decision tree for founder meeting

Three sequential yes/no decisions, in this order:

**Decision 1: Ship F&I Penetration Audit by May 31?**
- Yes → goes into the next sprint. Validates audit-as-lead-magnet motion.
- No → audit work shelves. Doesn't affect the strategic question.

**Decision 2: Commit to Literacy OS as year-1-3 strategic destination?**
- Yes → ontology engine ships this session (today). Q3 builds Spatial Translation v1 on top. Audit's recommendations render through the ontology. Year-two and year-three roadmap from this doc becomes the engineering plan.
- No → ontology engine remains a Wolfpack Auto internal capability, not a strategic destination. Audit ships as standalone wedge per the Audit spec, with no follow-on.

**Decision 3: Authorize the two customer-discovery stress tests within 14 days?**
- Yes → CEO commits to having the two conversations. Results determine whether Q3 Spatial Translation v1 goes ahead.
- No → year-one stops at Audit + ontology engine seed. No Q3 Spatial build until stress tests pass.

The three decisions compose. A "yes / yes / yes" is the full strategic commitment. A "yes / no / no" is the wedge-only path. A "yes / yes / no" is a phased path: ship Audit, build engine, gate Q3 on customer validation.

---

## What today's session has already shipped toward this

Real, in main, pushed to `the-wolfpack-agency/wolfpack-auto`:

- **5 migrations (069-073)** closing the mock-to-real gap on yesterday's four shipped features, plus 4 dealer-own-data analytics surfaces that no DMS surfaces well. 438 new tests.
- **F&I Penetration Audit spec** at `docs/fi-audit-wedge-spec-2026-05-12.md`. Ready to execute.
- **This strategy doc** — `docs/literacy-os-strategy-2026-05-12.md`.
- **Literacy ontology engine (migration 075)** — schema, lib, authoring API, seed of ~50 starter mappings. (Landing this same session.)
- **F&I Audit complete build (migration 074)** — PDF generator, benchmarks dataset, lead intake, landing page, sample audit. (Landing this same session.)

Year-one Q2 is delivered before the founder meeting happens. Decisions are about year-one Q3 and beyond.

---

## Bottom line

The Audit is the wedge. The Spatial Tool is the proof. The Literacy OS is the destination. Today's session ships the wedge AND the engine that powers the destination, before any founder commitment is required. That's intentional — the founder meeting decides whether we accelerate into Q3 or pause at year-one Q2.

The vision is real. The engineering pattern is real. The risk is scope discipline and content quality, not technical feasibility.

One decision tree. Three yes/no answers. Then we know whether we're building the most defensible dealer-software product on the market or shipping a $499/month F&I tool. Either outcome is a win; the wrong move is doing both half-heartedly.
