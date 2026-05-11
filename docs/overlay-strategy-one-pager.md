# Wolfpack Auto — Overlay Strategy One-Pager

**Date:** 2026-05-11
**Status:** Strategic proposal — pending founder decision
**Companion doc:** `docs/gtm-strategy-2026-05-11.md` (Wedge D)

---

## The bet in one sentence

Don't ask dealers to migrate off CDK / Reynolds. Sit on top of it. Their DMS becomes invisible plumbing; our agentic UX becomes their work surface.

## Why this is the right bet now

The DMS market has been frozen for 20 years by one fact: ripping out CDK takes 6-12 months, costs $100-500K in consulting, and risks every workflow the dealership runs on. CDK keeps its customers not because the product is good — it keeps them because the exit is unaffordable.

Every competitor (Tekion, Dealertrack, even modern entrants) has run into the same wall. They build a better DMS, then spend two years per customer convincing them migration risk is worth it. Most fail.

Three things changed in the last 24 months that make a different attack viable:

1. **Multi-agent orchestration matured** — we can chain LLM reasoning steps reliably enough to drive complex enterprise workflows end-to-end.
2. **Browser automation got production-grade** — Vibium-class tools (and our internal `BrowserProbeEngine`) can drive web apps reliably without the DMS vendor's cooperation.
3. **Dealers became AI-receptive** — ChatGPT awareness in dealership C-suite is at an all-time high. They want AI in their workflow but cannot wait for CDK to ship it (CDK has not shipped a meaningful AI product in five years).

These three together unlock a strategy that was technically impossible 24 months ago and is still 6-12 months ahead of any incumbent's roadmap.

## How it works

1. Sales rep / F&I manager / service writer logs into a Wolfpack Auto app.
2. They authenticate once with their CDK credentials (stored encrypted in our credential vault — same posture as 1Password / Bitwarden).
3. They interact with our AI-driven UX: natural-language commands, agent-suggested next-best actions, RAG retrieval over the dealer's own historical data.
4. Behind the scenes, our agents drive CDK via headless browser automation, executing the multi-step workflows the user described in plain language.
5. Every action is mirrored to our durable store (Postgres + vector + graph), giving us a complete shadow copy of the dealer's data over time.
6. When CDK has a published API for a workflow (some service drive endpoints, some inventory endpoints), we use the API. When it does not, we use browser automation. Transparent to the user which is which.
7. Over 12-18 months, the dealer's actual work happens in our UX. CDK becomes a database we read from. Migration becomes a one-click toggle once the customer is ready (or never — we can run this way indefinitely).

## What CDK / Reynolds / Tekion cannot do in response

- **Block us:** They could try, but it requires breaking customer-facing functionality (rate-limiting their own customers' authenticated sessions). Massive customer backlash.
- **Build their own AI overlay:** Cannibalizes their core product. Internal political impossibility at a 30-year-old company.
- **Acquire us:** Possible. But only after we have enough customers to be expensive.
- **Sue us:** Possible. Mitigations below.

The strategic point: every defense available to incumbents either harms their own customers or requires them to build the thing they refused to build for two decades. We are exploiting structural inability to react.

## Who buys it

**Primary buyer:** Dealer principal or general manager at a franchised dealership stuck on CDK for the next 3-5 years (typical CDK contract). They have AI fatigue from vendors who promise but never ship. They have CDK fatigue from a UX that has not been updated in a decade.

**Secondary buyer:** Independent dealer using a cobbled-together stack of CRM + spreadsheet + accounting. Overlay can integrate with their existing tools the same way it integrates with CDK.

**Champion inside the dealership:** The General Sales Manager. They feel the productivity cost of CDK every hour. They will fight internally to install us if we save 30 minutes per sales rep per day.

## Why our team specifically can build this

- **AgenticQA stack:** 9-agent orchestration, RAG, browser automation already production-deployed.
- **Vibium integration:** Live since April 2026; 197 tests; proven against real websites (the bounty-hunting pipeline scans hundreds of repos this way).
- **Triple-write architecture:** Postgres + Qdrant + Neo4j gives us the durable shadow copy of dealer data that enables eventual migration if customer wants it.
- **AI agency DNA:** Wolfpack Agency's identity is "agency that uses AI for outcomes," not "another SaaS vendor." Overlay strategy plays directly into that brand.
- **Speed:** Small team can ship the first pilot in 60-90 days. Incumbents need 18-24 months to even greenlight an internal version.

## Engineering scope and timeline

### Phase 1 (60-90 days): pilot-ready

- CDK browser automation harness (sales workflows only: lead intake, deal creation, F&I product attach). 4 engineers, 90 days.
- Encrypted credential vault. 1 engineer, 30 days.
- Agent orchestration layer (intent recognition, multi-step workflow execution, fallback to manual on failure). 2 engineers, 60 days.
- Dealer-facing UX (chat-first, with structured surfaces for inventory / leads / deals). 2 engineers, 60 days.
- Audit log + observability. 1 engineer, 30 days.

### Phase 2 (120-180 days): multi-DMS expansion

- Reynolds & Reynolds adapter.
- Dealertrack adapter.
- Service drive workflows.
- Accounting / GL read-only sync (write deferred for risk).

### Phase 3 (180-365 days): network effects

- Cross-dealer benchmarking (anonymized, opt-in).
- Wholesale auction integration (Manheim, ADESA).
- Lender / floor-plan finance integration (NextGear, Westlake, Auto Use).

## Legal posture

The two most-cited legal concerns and the mitigations:

**1. CDK terms of service may prohibit automated access.**
- Most DMS terms of service explicitly contemplate authorized agents acting on behalf of the licensed dealer (this is how CRM, marketing, and IDP integrations work today).
- Our automation acts under the dealer's own credentials, with the dealer's explicit authorization, doing exactly what the dealer would do manually. This is functionally indistinguishable from a virtual assistant or AI co-pilot, both of which are explicitly permitted in most DMS contracts.
- Pre-launch: dedicated legal review by an attorney familiar with DMS contracts (Foley & Lardner, DLA Piper auto practice). $25-50K cost. Worth it.

**2. Data extraction may be considered scraping.**
- We are not extracting and reselling data. We are using the dealer's data on the dealer's behalf, with their consent. Storage of a shadow copy is no different from any backup tool a dealer might use.
- Customer agreement explicitly assigns the dealer ownership and control of all data we touch. Our terms preserve their right to leave with their data at any time.
- Distinct from "competitive intelligence" scrapers (e.g., scraping inventory from competitor sites) which are legally riskier.

**3. CDK could change UI to break our automation.**
- Yes, and they have done this to others (per legal precedent: a small player tried inventory automation against CDK in 2019 and CDK changed selectors twice in 12 months).
- Mitigation: agent-driven scraping (LLM finds the right elements semantically) is far more resilient than CSS selector matching. We expect each UI change to cost us 1-3 days of recovery, not 1-3 months.
- Customers see the latency as our problem to solve, not theirs.

## Risks and how they kill the company

| Risk | Severity | Likelihood | Mitigation |
|------|---------|-----------|-----------|
| CDK legal action | High | Medium | Pre-launch legal review; act-as-dealer framing; customer indemnification |
| CDK UI volatility breaks automation | Medium | High | Semantic agent-driven scraping; on-call rotation for recovery |
| Customer data loss in our shadow store | Catastrophic | Low | Triple-write redundancy; daily backups; SOC 2 by month 6 |
| Slow CDK login / rate limit | Medium | Medium | Adaptive throttling; queue mode for bulk operations |
| Senior dealer staff resist new UI | High | Medium | Optional native CDK fallback button always available |
| Cannot get first 3 pilots | Existential | Medium | Founder network + dealer-industry sales lead hired in first 30 days |

## Financial summary

- **Engineering investment to pilot:** $300-500K (3-4 engineers, 90 days at full burn).
- **Total engineering investment to general availability (Phase 2):** $1.5-2.5M.
- **Revenue model:** $299-799 / user / month. Average dealership = 12 users (sales + F&I + service). $3.5-9.6K MRR per dealership.
- **Break-even:** 50-100 dealerships. Conservatively 12-18 months from start.
- **Year-3 revenue projection:** $25-100M ARR if we hit 500-1,500 dealerships across CDK / Reynolds / Dealertrack.
- **Comparison to Wedge A (DMS replacement):** Higher revenue per dealer (per-user not per-rooftop), lower CAC (no migration), faster sales cycle (no procurement death-march).

## The decision the founders need to make

Wedge D is not additive to Wedge A. It is a strategic replacement.

Choosing Wedge D means:
- Repositioning Wolfpack Auto from "DMS competitor" to "AI overlay platform" in all sales and marketing.
- Investing the next 6 months of engineering in overlay infrastructure, not DMS feature parity.
- Building legal posture for an adversarial relationship with CDK / Reynolds.
- Accepting that some prospects will refuse on principle (CDK loyalty, integrator network resistance).

Choosing to stay with Wedge A means:
- 18 months to a viable DMS competitor with all the OEM certifications, compliance modules, and integration costs.
- A market position where Tekion, CDK, and Reynolds each spend more on R&D than our total revenue.
- A conventional sales motion competing on feature checklists.

The overlay path is higher-variance and higher-ceiling. It is also the only path where Wolfpack's specific technical advantages (multi-agent, browser automation, agentic data engineering) become the unfair advantage rather than a marketing claim.

## Next steps if approved

1. **Day 0:** Founders' decision meeting. Approve or reject overlay strategy.
2. **Days 1-14:** Legal review with auto-practice attorney. Confirm contractual viability.
3. **Days 14-30:** Identify 5 candidate pilot dealers. Sign letters of intent.
4. **Days 30-90:** Build Phase 1 (sales workflows on CDK only). Pilot with 3 dealers.
5. **Days 90-180:** Validate retention, productivity, customer NPS. If green, expand to Reynolds + Dealertrack. If red, pivot back to Wedge A.
6. **Months 6-12:** General availability. Scale sales hiring.

## Files this proposal touches

- `docs/gtm-strategy-2026-05-11.md` — Wedge D section
- `docs/overlay-strategy-one-pager.md` — this document
- Future: `docs/overlay/legal-analysis.md`, `docs/overlay/cdk-adapter-spec.md`, `docs/overlay/pilot-customer-criteria.md`

## Open questions for founders

1. Risk tolerance: are we willing to operate in a potentially adversarial posture toward CDK?
2. Capital: do we have $1.5-2.5M of runway to fund Phase 1 + 2 without first-customer revenue?
3. Sales: who on the team or our network has direct relationships with 3-5 dealer principals who would pilot?
4. Brand: do we keep "Wolfpack Auto" or rebrand the overlay product? Possibly "Wolfpack Co-Pilot" or "Wolfpack Overlay."
5. Wedge A backup plan: if overlay fails the 90-day pilot, do we still pursue Wedge A from scratch, or pivot entirely (e.g., to Wedge E compliance)?
