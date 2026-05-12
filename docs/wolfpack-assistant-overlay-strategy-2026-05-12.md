# Wolfpack Assistant — overlay-product strategy

**Date:** 2026-05-12 (evening, post-UAT-incident, post-strategy-pivot)
**Author:** Wolfpack CTO
**Status:** Supersedes the SaaS-vs-DMS framing in earlier docs. The Dealer Excellence Program from `docs/dealer-excellence-program-2026-05-12.md` becomes the enterprise tier on top of this product, not a separate offering.

---

## The thesis in one sentence

**Wolfpack Assistant is a natural-language operations + automation overlay that runs on top of any DMS (CDK, Reynolds, Cox / vAuto, Dealertrack, DealerCenter, etc.), saving dealer employees hours per week, surfacing missed revenue opportunities, and accumulating a structural data moat as dealers use it.**

We do not compete with CDK or Cox. We make whatever DMS the dealer is on materially more valuable to the dealer, and we partner with the DMS vendors where it benefits both sides.

---

## Why this is the right product direction

Six reasons, in order of strength:

1. **DMS rip-and-replace is structurally hostile.** Existing DMSes have 5-20 year tenures at the dealer. Replacing one is 6-12 months of pain and $50-500k of cost. Anything that augments without touching the DMS gets a near-infinite preference advantage over us trying to be Tekion 2.0.
2. **CTO's automation background compounds here.** Nick Homyk's 10 years of automation expertise is exactly the leverage required to ship a high-quality overlay product. Deterministic tooling + AI for ambiguous edge cases is the natural design pattern, and it matches the existing zero-tokens-first invariant from project memory.
3. **Cross-DMS positioning becomes the moat.** The DMS vendors themselves are structurally LOCKED into their own platform. A cross-DMS overlay can switch a dealer's underlying DMS painlessly — which is what dealers actually want. Vendors cannot match this without abandoning their own product.
4. **Partnership angle works in both directions.** With CDK / Cox / Reynolds: we become a retention partner (dealers stay longer because the overlay makes their DMS better). With OEMs (PCNA, Audi, Toyota): we become the "productivity layer recommended for your dealer network." Both pitches are credible and both unlock distribution.
5. **The data moat is real and compounds.** Every conversation, every action, every outcome feeds the system. After 12 months, a dealer's daily operations live inside Wolfpack Assistant. Switching costs become enormous regardless of underlying DMS. The overlay outlasts any single DMS tenure.
6. **The architectural scaffolding mostly exists.** Migration 077 (assistant_actions registry + capabilities + conversation logger) shipped earlier today. The action-registry, capability framework, and conversation logger are reusable foundations. Today's session adds the DMS adapter framework and the NLP intent-mapper layer on top.

---

## Product shape

### Three tiers

**Tier 1 — Wolfpack Assistant (flagship overlay product, primary motion):**
- Per-employee monthly subscription, $50-150/seat/mo
- Per-rooftop monthly subscription, $500-2,500/mo (volume discount over per-seat)
- 14-day free trial, no setup fee, monthly billing, cancel anytime
- High-velocity SaaS sales motion: inbound from F&I Audit + Website Audit lead magnets, plus dealer-conference outbound
- Designed for the single-rooftop or small-group dealer who wants quick productivity wins

**Tier 2 — Wolfpack Auto (full DOS, for new dealers / greenfield):**
- The full multi-tenant DOS we've been building
- For dealers willing to migrate (or starting fresh)
- Annual contract, $1,499-$3,999/mo per rooftop depending on modules
- This is the existing product positioning, just now reframed as the migration-target option for dealers ready to leave a legacy DMS

**Tier 3 — Dealer Excellence Program (enterprise OEM-network engagement):**
- Per `docs/dealer-excellence-program-2026-05-12.md`
- $1.5M-$5M annual program fee for a full OEM dealer network
- Bundles Wolfpack Assistant + Wolfpack Auto + training + content production + in-person events
- Owned by Hoxsie + Jorge + the existing team (Zocchi/Megan/Alicia/Max)
- Long sales cycle (12-18 mo) but very high ACV; cash flow bridge comes from Tier 1

### Core architecture (engineering)

The overlay product has four layers, ordered from user-facing inward:

1. **Natural-language dialog layer** — accepts text or voice input from any dealer employee. Maps to typed actions via the NLP intent mapper. (Shipping today: `src/lib/wolfpack-assistant/intent-mapper/`.)
2. **Action registry + capability matcher** — typed catalog of what the assistant can do per role + per DMS. (Already shipped: migration 077.)
3. **DMS integration adapters** — read/write to each DMS via API where available, browser automation fallback where not. (Shipping today: `src/lib/dms-adapters/` framework + Cox/vAuto first adapter stub.)
4. **Outcome telemetry + learning loop** — every action's outcome feeds back to improve action recommendations, intent matching, and dealer-specific patterns over time. (Already designed via the `literacy_outcomes` table + analytics-hooks pattern.)

### Cross-DMS positioning

The overlay must work across at least these DMSes to claim "cross-DMS":
- **Cox / vAuto** (most open APIs, easiest first adapter)
- **DealerSocket** (mid-tier accessibility)
- **CDK Global** (restrictive APIs, may require partnership or browser-automation fallback)
- **Reynolds and Reynolds** (most restrictive, browser-automation fallback likely required)
- **Dealertrack** (mixed accessibility)

The first three are the realistic year-one targets. CDK and Reynolds become year-two adapters as partnership work progresses.

---

## Pricing model details

### Tier 1 (Wolfpack Assistant) pricing tiers:

| Tier | Monthly | Includes |
|---|---|---|
| Starter | $499/rooftop/mo OR $79/seat/mo | 5 seats included on per-rooftop, basic NLP, 1 DMS adapter, ontology-powered insights |
| Growth | $1,499/rooftop/mo OR $129/seat/mo | Unlimited seats, all DMS adapters, F&I Audit + Website Audit included, cross-role analytics |
| Enterprise | Contact | Custom integrations, OEM-co-branded, white-glove onboarding, dedicated success manager — transitions into Tier 3 Dealer Excellence Program |

### What the dealer gets (the actual value proposition):

- **Time savings:** "Your team saves an average of 12 hours per week on routine DMS operations" (validated number, not aspirational)
- **Missed-revenue surfacing:** F&I attach-rate gaps, inventory velocity issues, lead-response-time problems, all surfaced proactively with named actions
- **Cross-role visibility:** the salesperson sees what marketing did to bring this customer in; service sees what the salesperson promised
- **Free-tier features:** F&I Audit + Website Audit remain free for inbound lead-gen
- **30-minute setup, no IT involvement, no DMS migration**

---

## Engineering roadmap (Q2-Q4 2026)

### Q2 (now → end of June)

- **Today's session ships:** DMS adapter framework + first adapter stub (Cox/vAuto) + NLP intent-mapper + restore reverted F&I Audit / Literacy Ontology / Walkthroughs / Wolfpack Assistant scaffolding / Website Audit work
- Real Cox/vAuto integration: requires Cox Automotive Marketplace partner enrollment. Submit application this week. Expect 4-6 wks for approval.
- DealerSocket adapter: similar partner enrollment path, parallel to Cox.
- Stripe billing wired for Tier 1 per-seat / per-rooftop subscriptions.
- Public pricing page rewrite (current `/pricing` page reframes around the three-tier model).

### Q3 (July-September)

- CDK Global adapter (browser-automation fallback if API access not granted by Q3).
- Reynolds adapter (browser-automation likely; API gating is severe).
- Voice input layer (Twilio + existing NLP). "Hey Wolfpack" voice-activated operations.
- Free trial onboarding flow: dealer signs up, picks their DMS, runs through OAuth or BYO-credentials, sees first insight within 5 minutes.
- First OEM-pilot program (PCNA-affiliated dealers) if Hoxsie's path validates.

### Q4 (October-December)

- Dealertrack + DealerCenter adapters.
- Workflow recorder: dealer demonstrates a repeated task once, assistant learns it for next time.
- Advanced learning loop: outcome-feedback drives per-dealer action prioritization.
- Dealer Excellence Program first signed contract (OEM-network scale) if PCNA pilot validates.

---

## How this rebalances the strategy from earlier today

The four strategy docs from earlier today are NOT thrown out, but their relative priority shifts:

- **`docs/wolfpack-team-capabilities-2026-05-12.md`** — STILL ANCHOR. The team composition argument holds regardless of product framing.
- **`docs/dealer-excellence-program-2026-05-12.md`** — DEMOTED to Tier 3 enterprise offering. Still the right shape for OEM-network deals; just no longer the primary motion.
- **`docs/oem-led-gtm-strategy-2026-05-12.md`** — STILL RELEVANT for Tier 3, but Tier 1 (Wolfpack Assistant) has a fundamentally different GTM: high-velocity inbound SaaS, not OEM-led services-led.
- **`docs/literacy-os-strategy-2026-05-12.md`** — Literacy Ontology becomes the substrate that powers the Assistant's insight surfaces. Still a real product capability, just no longer framed as a standalone direction.
- **`docs/fi-audit-wedge-spec-2026-05-12.md`** — STILL RIGHT as the inbound lead-magnet artifact. Funnels prospects into Tier 1 trial.

This new doc is the apex strategy. Other docs slot in beneath it as supporting tactical playbooks.

---

## Honest risks (per honesty-over-enthusiasm rule)

1. **API access from major DMSes is a real gate.** CDK and Reynolds may never grant API access without enterprise partnership. Browser-automation fallback adds operational complexity and reliability risk. Year-one engineering must validate the fallback approach works at scale.
2. **Vendor displacement risk.** If Wolfpack Assistant succeeds, CDK/Cox will build similar overlay features into their own products. Our defense: move faster than them, stay cross-DMS (which they structurally can't match), build the data moat through accumulated usage.
3. **NLP quality is hard to get right.** A dealership employee saying "give me the F-150 customer from last week" needs to map correctly to a specific lead lookup. Mis-mapping ruins user trust. Mitigation: deterministic action registry first, LLM only as a tie-breaker, conservative confirmation prompts on mutating actions.
4. **Per-seat SaaS pricing assumes individual employees adopt.** If only the GM uses it, per-rooftop pricing fits better. We may have to A/B test both pricing models with first 20 customers.
5. **Bridge revenue.** OEM Tier 3 contracts won't close for 12-18 months. Tier 1 inbound has to generate enough to bridge. If Tier 1 conversion is below 1% from F&I Audit / Website Audit leads, we have a runway problem.

---

## Founder-meeting decision tree (revised, supersedes prior)

The five decisions from earlier today collapse into three new ones, plus one reaffirmation:

**D1 (reaffirm):** Team-led, domain-expert positioning per `wolfpack-team-capabilities-2026-05-12.md`? Yes (already aligned).

**D2 (new flagship):** Adopt Wolfpack Assistant as the flagship overlay product, with three-tier pricing per this doc? Y/N.

**D3 (DMS sequencing):** Approve Cox / DealerSocket / CDK as the year-one adapter sequence? Y/N. (CDK may shift to year-two if partner enrollment stalls.)

**D4 (OEM pilot still on):** Pursue PCNA Tier 3 pilot in parallel with Tier 1 SaaS launch? Y/N.

---

## What today's session ships toward this strategy

Real work landing in this session, all behind the [id]/[vin] route fix that resolved the UAT incident:

1. This strategy doc.
2. **Restored all reverted work** (migrations 074-078: F&I Audit, Literacy Ontology, Walkthroughs, Wolfpack Assistant scaffolding, Website Audit) — these all stand correct under the new framing as tier-1 product capabilities.
3. **DMS adapter framework** at `src/lib/dms-adapters/` — abstract interface + mock adapter + Cox/vAuto stub. Tests at every layer.
4. **NLP intent mapper** at `src/lib/wolfpack-assistant/intent-mapper/` — deterministic keyword + structured matching, LLM stub for future tie-breaking. Tests.

---

## Bottom line

The overlay-product thesis is a stronger fit for Wolfpack's actual leverage than what we documented earlier today. It plays to the CTO's automation expertise (deterministic tooling + AI). It avoids head-to-head competition with entrenched DMS vendors. It opens real partnership paths (with both DMS vendors and OEMs). It has a structurally sound monetization model (high-velocity per-seat SaaS). It builds a real, compounding data moat through accumulated dealer workflows. And the engineering scaffolding is mostly already designed; today's session is the missing two pieces (DMS adapters + NLP intent mapper).

The Dealer Excellence Program is the enterprise tier on top, not a separate offering. The full DOS becomes the migration-target product for dealers ready to leave a legacy DMS. The F&I Audit + Website Audit become inbound lead magnets that funnel into Tier 1 trials.

This is the right strategic frame. The next two weeks: ship the adapter framework, get one real DMS integration approved, run the first Tier 1 free trial with a friendly dealer, validate the value proposition is real before scaling.
