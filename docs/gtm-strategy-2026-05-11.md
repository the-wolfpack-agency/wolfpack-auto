# Wolfpack Auto GTM Strategy Report

**Date:** 2026-05-11
**Audience:** Wolfpack Agency leadership (CTO, CEO)
**Author:** Strategic review (acting as outside VC partner)
**Status:** Draft for internal alignment

---

## Executive summary

Wolfpack Auto is a modern, AI-native Dealer Management System (DMS) entering one of the largest displacement windows in 30 years. The 2024 CDK Global ransomware shutdown permanently shifted dealer sentiment toward modern competitors. Tekion has captured the franchised-dealer enterprise tier, but the **25,000-rooftop independent dealer market** and the **agency-managed-service tier** remain underserved.

The product has strong engineering foundations (AI throughout, triple-write data integrity, AgenticQA pipeline, 1,766+ tests, competitive parity with SE-FI, Hotjar, AutoNation features). The gaps are not technical: they are compliance certifications, OEM integrations, service-drive depth, sales execution, and channel partnerships.

A disciplined wedge strategy targeting independent dealers + managed-service franchised dealers can realistically deliver $5-15M ARR within 3 years and position the company for a strategic acquisition by Cox Automotive, S&P Global Mobility, Constellation Software, or a PE rollup at a $25-75M valuation. Without that discipline, the realistic outcome is $500K-1.5M ARR and a small tuck-in exit.

This report identifies what must be built, how to package and price the product, how to handle the agency-managed-service model, and what milestones must be hit to unlock outside capital and a defensible market position.

---

## 1. Market context

| Competitor | Pricing per rooftop | Reputation | Modernization |
|---|---|---|---|
| CDK Global | $20K to $50K / month | Hated post-2024 breach | Legacy |
| Reynolds & Reynolds | $15K to $30K / month | Older tech, conservative | Legacy |
| Dealertrack (Cox) | $8K to $20K / month | Better, owned by giant | Mixed |
| Tekion | $2K to $8K / month | Modern, AWS-native | Modern |
| Wolfpack Auto (proposed) | $500 to $5K / month | TBD | AI-native |

**US dealer footprint:**
- 17,000 franchised dealerships
- 25,000 independent dealerships
- 42,000 total rooftops

**Market sizing:**
- Total addressable market: $3-5B annual DMS spend
- Serviceable addressable market (rooftops × avg $15K ARR): ~$630M
- Realistic 3-year SOM for a new entrant: 100-500 rooftops, $1.5-15M ARR

**Why now:** The CDK Global 2024 breach is the most significant DMS-industry trust event in three decades. Dealers actively shopping alternatives. This window closes within 24 months as competitors consolidate the displaced customers.

---

## 2. Product gap analysis

Features required to compete, prioritized by sales-blocking severity.

### 2.1 Compliance and regulated workflows (table stakes)

| Gap | Severity | Description |
|---|---|---|
| OFAC screening | Critical | Required on every finance application |
| Red Flags Rule | Critical | Identity verification workflow |
| GLBA privacy | Critical | Privacy notices, opt-outs, audit trails |
| State DMV reporting | Critical | Title, registration, dealer sales reports |
| NHTSA recall lookup | High | VIN-decode integration |

**Without all five, franchised-dealer sales are impossible.**

### 2.2 OEM and finance integrations (must-have for franchised)

| Gap | Severity | Description |
|---|---|---|
| OEM incentive feeds | Critical | Toyota, Honda, Ford, GM minimum |
| OEM warranty claims | High | Per-OEM workflow |
| Credit-bureau pulls | Critical | Partner with RouteOne or Dealertrack |
| e-Contracting | High | Lender integration via RouteOne |
| Floor plan financing | Medium | Westlake, Ally, NextGear, Manheim |

### 2.3 Service drive (40-60% of dealer revenue)

| Gap | Severity | Description |
|---|---|---|
| Repair Order writing | Critical | Parts pulls, tech time tracking |
| Service advisor workflow | Critical | Multi-point inspections |
| Parts catalog | High | OEM + aftermarket integration |
| Online service scheduling | High | Customer-facing booking |

**This is the single largest revenue stream for franchised dealers. A weak service module kills enterprise sales.**

### 2.4 CRM, sales, and communications

| Gap | Severity | Description |
|---|---|---|
| 2-way TCPA SMS | High | Twilio integration |
| Phone integration | Medium | Call recording, click-to-call |
| Third-party lead capture | High | Cars.com, AutoTrader, CarGurus |
| BDC workflow | High | Inbound call/text/web routing |

### 2.5 Inventory and pricing

| Gap | Severity | Description |
|---|---|---|
| Auction integration | Medium | Manheim, ADESA |
| Trade-in appraisal | High | KBB, vAuto, J.D. Power |
| Market-based pricing | Medium | vAuto-style competitive analysis |
| Listing syndication | High | Cars.com, AutoTrader, CarGurus push |

### 2.6 Reporting and analytics

| Gap | Severity | Description |
|---|---|---|
| Dealer KPI dashboard | High | PVR, gross per unit, F&I product penetration, service ARO, days-to-turn |
| Multi-rooftop consolidation | Medium | For dealer groups |

### 2.7 Mobile experience

| Gap | Severity | Description |
|---|---|---|
| Native mobile app | High | Service advisors, lot porters, sales staff live on phones |

**Total gap inventory: 25 features.** Building all of them is a 5-year, $50M project. A wedge strategy is essential.

---

## 3. Wedge strategy

Three viable wedges. Picking the wrong one costs 18 months. Picking the right one unlocks Series A.

### Wedge A: AI-native DMS for independent dealers (recommended primary)

**Target:** 25,000 independent dealers, BHPH (buy here pay here) operators.
**Why:** Underserved by enterprise vendors. Cobbled-together stacks of legacy CRM + inventory tools. Lower compliance surface (no OEM integrations needed).
**Required scope:** Inventory, CRM, leads, simple service tracking, payments, basic financials. ~12 of the 25 features.
**Pricing:** $499-1,499 / month / rooftop.
**CAC:** $3-8K (inside sales + digital marketing).
**Time to MVP for first paying customer:** 30-45 days from current state.

### Wedge B: Managed DMS for franchised dealers (recommended differentiator)

**Target:** Small to mid-size franchised dealers (1-3 rooftops) who want outcomes, not software.
**Why:** Plays into Wolfpack Agency's services DNA. Outcomes-based pricing differentiates from every software competitor. Higher gross margin on services dollars.
**Required scope:** Same software as Wedge A + agency-staffed CSM team running reporting, lead routing, marketing.
**Pricing:** $5,000-25,000 / month flat on top of software subscription. Outcomes bonus on PVR uplift or unit growth.
**CAC:** $15-30K (consultative sales, longer cycle).
**Time to first paying customer:** 60-90 days.

### Wedge C: AI module plugged into existing DMS (de-prioritize for now)

**Target:** Dealers already on Tekion or CDK who want AI capabilities their DMS lacks.
**Why:** No data migration, fast onboarding. Lower TAM per customer.
**Required scope:** Lead scoring, F&I recommendations, service drive optimization. API integrations with Tekion + CDK partner ecosystem.
**Pricing:** $500-2,500 / month / rooftop.
**Time to first paying customer:** 90 days (depends on Tekion / CDK partner certification).

**Recommendation:** Lead with Wedge A for revenue velocity. Layer Wedge B as the agency's premium service offering. Defer Wedge C unless A doesn't move by quarter 2.

---

## 4. Packaging and pricing

Concrete SKU structure. Industry-standard per-rooftop pricing with seat add-ons.

### 4.1 Subscription tiers

**Wolfpack Core** — $499 / month / rooftop + $39 / user / month
- Inventory, basic CRM, leads, simple reporting, payments
- Target: independents, BHPH
- Realistic ARR per customer: $9K to $15K

**Wolfpack Pro** — $1,499 / month / rooftop + $69 / user / month
- Adds F&I (RouteOne integration), service drive, multi-channel comms, KBB/vAuto integration
- Target: small franchised (1-3 brand single-store dealers)
- Realistic ARR per customer: $35K to $70K

**Wolfpack Enterprise** — $4,999 / month / rooftop, custom from there
- Multi-rooftop, OEM-certified, dedicated CSM, custom reporting, SLA, sandbox environment
- Target: dealer groups (3+ rooftops)
- Realistic ARR per customer: $150K to $500K

### 4.2 Add-ons

**Wolfpack Managed** — $5,000 to $25,000 / month flat
- Agency-staffed CSM team running operations on behalf of the dealer
- Outcomes-based: PVR uplift, unit volume, service revenue per RO
- 6-month minimum commitment

**Implementation services** (one-time):
- Core: $5,000
- Pro: $15,000
- Enterprise: $25,000 to $100,000
- Includes data migration, training, configuration

### 4.3 Contract terms

- **Default:** Annual contract minimum, monthly invoicing
- **Discount:** 10-15% for annual prepay
- **Multi-year:** 3-year preferred, 15-25% additional discount
- **Cancellation:** 90-day notice, no refund on prepaid term

### 4.4 Customer lifetime value math

| Tier | ARR | Gross Margin | 5-year LTV | Max CAC (3:1) |
|---|---|---|---|---|
| Core | $12K | 70% | $42K | $14K |
| Pro | $50K | 65% | $163K | $54K |
| Enterprise | $300K | 60% | $900K | $300K |
| Managed (add-on) | $120K | 50% | $300K | $100K |

---

## 5. Managed services operations model

The agency-native differentiator. How to actually run this without it eating margin.

### 5.1 Team structure

- **Account Executive:** sells the engagement. 1 AE per $1.5-2.5M ARR responsibility.
- **Implementation Engineer:** runs the first 90 days (data migration, training, configuration). 1 IE per 8-12 active implementations.
- **Customer Success Manager (CSM):** ongoing operations. 1 CSM per 10-20 customers, depending on managed-vs-DIY mix.
- **Engineering escalation oncall:** 24/7 rotation. DMS downtime literally stops a dealer from selling.

### 5.2 Playbook library

Build standard plays the CSM customizes per customer in 1-2 weeks instead of from-scratch:

- Lead-routing rules per dealer type
- Inventory pricing cadence (weekly, daily, dynamic)
- Service follow-up templates by service type
- F&I product recommendation rules
- Recall outreach scripts
- Trade-in valuation tactics

### 5.3 Outcomes accountability

Write SLA-style outcomes into managed contracts:

> If PVR does not increase 5% year-over-year by month 12 of the engagement, monthly managed fee reduced 20% until target is met.

Forces real delivery. Forces dealer trust. Differentiates from every "we have software" competitor.

### 5.4 SLA commitments (all tiers)

- Uptime: 99.95% measured monthly (43 minutes downtime allowed)
- Support response: 30 minutes for Sev 1, 4 hours for Sev 2, 1 business day Sev 3
- Disaster recovery RTO: 4 hours
- Disaster recovery RPO: 15 minutes
- Status page: public, auto-updated
- Postmortems: published within 48 hours of any Sev 1 incident

---

## 6. VC due diligence checklist

Questions a Series A partner will ask. Have answers ready.

### 6.1 Strategy questions

1. **Why won't Tekion crush us?** Answer must be vertical-specialized (independents Tekion ignores) or service-led (managed offering Tekion doesn't have), not "we'll be cheaper."

2. **CAC payback period.** Target: under 18 months. With $30K ARR × 60% gross margin × 18 months = $27K maximum CAC. Requires inside sales + channel partners, not field sales.

3. **Why this team can win.** Engineering depth + agency services DNA. Honest weakness: no dealer-industry executive yet. Plan to hire ex-CDK / Tekion / Reynolds sales VP within 90 days.

### 6.2 Operational questions

4. **OEM certification roadmap.** Honda, Toyota, Ford, GM each have certified vendor programs. 12-18 months per certification. Start now, not later.

5. **Compliance scaffolding.** SOC 2 Type II audit: $50-100K, 9 months. Start month 1. GLBA-grade PII handling required.

6. **Insurance.** E&O insurance for DMS vendors handling dealer financials: $30-100K / year. Bound before first paying customer.

7. **Channel strategy.** 60-80% of DMS sales come through dealer consultants, NADA accountants, OEM specialists. Build referral program with 15-25% rev-share by month 6.

8. **NADA Show.** January annually, 28,000 dealers attend. Booth + sponsorship $50-200K. Pipeline-defining. Plan 6 months out.

### 6.3 Risk and defensibility

9. **Disaster recovery.** DMS downtime stops sales. SLA in writing. Multi-region failover. Public status page.

10. **Reference customers.** First 10 customers hand-picked, hand-held, turned into case studies + 3 reference calls each. Without 5+ named references, enterprise sales is impossible.

11. **Competitor response.** CDK will pay $200K to keep a customer, throw account managers at them, badmouth Wolfpack. Sales team needs counter-talk tracks.

12. **Defensibility moats.** Switching costs once migrated (high), engineering moat on AI / triple-write (medium, 18-24 month lead), OEM certifications (high once acquired), customer success scoring (medium).

---

## 7. 90-day milestone plan

If pursuing outside capital, these are the hit-or-miss milestones.

### Days 0-30

- [ ] Pick the wedge (recommend: Wedge A primary, Wedge B layered)
- [ ] 3 named pilot customers in the wedge, on letter of intent
- [ ] SOC 2 Type II audit kicked off with vendor (Vanta, Drata, Secureframe)
- [ ] E&O insurance bound
- [ ] Hire: dealer-industry sales lead (ex-CDK / Tekion / Reynolds)
- [ ] Public pricing page deployed (transparency = trust in this industry)

### Days 31-60

- [ ] First 2 paying customers live on the platform
- [ ] 1 OEM certification application submitted (start with Toyota or Honda, easier than Ford / GM)
- [ ] Channel partner program live with 5 signed referral partners
- [ ] First case study drafted from pilot customer
- [ ] Implementation Engineer hired

### Days 61-90

- [ ] 5 paying customers
- [ ] $25-50K MRR
- [ ] Case study published, 2 reference calls available
- [ ] NADA Show 2027 booth booked and content drafted
- [ ] Customer Success Manager hired
- [ ] Sales Engineer hired

If 4 of 5 90-day milestones hit: Series A story writes itself. If not: the wedge is wrong or sales execution is wrong; iterate before raising.

---

## 8. Realistic outcomes

### With disciplined execution (3 years)

- ARR: $5-15M
- Rooftops: 150-500
- Valuation: $25-75M
- Acquisition path: Cox Automotive, S&P Global Mobility, Constellation Software, PE rollup
- IPO path: Not yet, but on the strategic radar for $200-500M acquisition

### Without disciplined execution (3 years)

- ARR: $500K-1.5M
- Rooftops: 20-40 (mostly founder-network)
- Valuation: $5-15M
- Acquisition path: Small strategic tuck-in
- Outcome: Living business, not VC-backable

### The honest delta

Engineering alone delivers the lower outcome. The higher outcome requires:

- Sales execution (channel partners, dealer-industry vets, NADA presence)
- Compliance investment (SOC 2, GLBA, OEM certifications)
- Implementation excellence (first 90 days determine retention)
- Service depth (60% of dealer revenue is service drive)

**The product gets you to the table. Distribution, compliance, and customer success determine which outcome you get.**

---

## 9. Next steps

Recommended immediate actions:

1. **Decision meeting:** founders pick the wedge (Wedge A primary, B layered) within 7 days.
2. **Compliance kickoff:** engage SOC 2 audit vendor and E&O insurance broker within 14 days.
3. **Hire #1:** dealer-industry sales lead. Job description posted within 14 days.
4. **Pilot pipeline:** identify and approach 10 candidate pilot customers within 30 days. Target 3 letters of intent by day 30.
5. **Pricing page:** transparent public pricing live within 30 days.
6. **Channel partner program:** draft referral program terms and identify first 10 candidate partners within 45 days.

---

## 10. Alternative disruption angles (Wedges D-H)

Wedges A-C frame Wolfpack Auto as a better DMS. That framing concedes the fight to incumbents who have 30 years of dealer relationships and OEM certifications we cannot buy on accelerated timeline. The five wedges below reframe the opportunity around our actual technical advantage (multi-agent orchestration, RAG, browser-based automation, AI-native UX) and target structural weaknesses in the incumbent stack.

These are not mutually exclusive with A-C. They are reframings worth evaluating before committing 18 months to the conventional path.

### Wedge D: AI overlay on top of legacy DMS (no migration required) — RECOMMENDED EVALUATION

**Target:** Dealers stuck on CDK / Reynolds / Dealertrack who hate their DMS but cannot afford the 6-12 month migration. Estimated 18,000 of the 32,000 franchised dealers.

**Why:** The #1 reason dealers do not switch DMS is migration friction, not product preference. We avoid the fight entirely by sitting on top of the existing DMS, not replacing it. Sales reps interact with our AI-driven UX; our agents read and write to CDK via the user's authenticated session (Vibium-style browser automation) and over published APIs where available. The DMS becomes invisible plumbing.

**Required scope:** Browser-automation harness with credential vault, CDK/Reynolds screen-scraping adapters, agent orchestration layer translating user intent into multi-step DMS workflows, audit trail of every action, fallback to native DMS UI when an action is not yet automated. NOT building a DMS — building the experience layer.

**Pricing:** $299-799 / month / user (per sales rep / F&I manager), not per rooftop. Pricing aligned with productivity gain, not feature parity.

**CAC:** $2-5K. Low because dealers do not have to migrate or retrain. Free 30-day pilot is feasible.

**Time to first paying customer:** 60-90 days. Hardest milestone is reliable CDK screen-scraping; we have the Vibium-derived stack to do this.

**Tech advantage:** Multi-agent orchestration + browser automation + RAG over the dealer's own DMS data. Incumbents (CDK, Tekion) literally cannot build this — it cannibalizes their core product.

**Risks:**
- CDK terms-of-service prohibit screen-scraping for some customer-facing products. Legal analysis required.
- CDK could rate-limit or detect our automation. Mitigation: degrade gracefully to manual mode and surface latency to user.
- Some workflows (large bulk updates, accounting batch posts) may exceed practical scraping throughput. Mitigation: hybrid native-API + scraping; transparent to user which is which.

**Why this is the leading alternative:** Inverts the migration problem that has frozen DMS competition for 20 years. Closest historical analog: Stripe sitting on top of legacy banks. See separate one-pager: `docs/overlay-strategy-one-pager.md`.

### Wedge E: Compliance and audit engine (two-sided wedge)

**Target:** All 50,000 US dealers but especially the 18,000 franchised who face active FTC / state DOJ enforcement scrutiny under the new FTC Combating Auto Retail Scams rule (2026 enforcement ramp).

**Why:** Regulatory FOMO drives adoption with less procurement friction than DMS replacement. Every deal in CDK gets audited by our agents for TILA, FCRA, Reg B, Reg V, FTC dealer rule, ECOA, GLBA violations before it funds. One avoided $40K fine pays for two years of subscription. Same playbook we already run for code vulnerabilities in AgenticQA's 20-scanner pipeline — just retargeted at F&I deals.

**Required scope:** Read-only DMS integration (or scraping via Wedge D), rule engine for each major federal + state statute, deal-by-deal audit reports, dealer-principal dashboard, automated regulator-ready evidence packages, customer-facing transparency documents on demand.

**Pricing:** $399-1,499 / month / rooftop. Add-on: $99 per audited deal for outsourced fix-it workflow.

**CAC:** $1-3K. Lowest of any wedge because the buyer is the dealer principal or compliance officer, not the GM. Less GM political resistance.

**Time to first paying customer:** 45-60 days. Build on existing AgenticQA scanner architecture.

**Tech advantage:** Our self-hack scanner muscle, transplanted from code to F&I. Multi-agent reasoning over deal documents (jacket review, signature validation, disclosure verification) is exactly what our pipeline already does for codebases.

**Risks:**
- Some incumbent DMSes have rudimentary compliance modules. Differentiate on depth (post-funding audits, not just blocking pre-funding gates) and breadth (state laws, not just federal).
- Legal liability if we "miss" a violation. Mitigation: positioned as advisory tool, not insurance. Customer remains the responsible party. Errors and omissions insurance.

**Why this is also leading:** Lowest sales friction, fastest revenue, builds compliance reputation that becomes a moat for full DMS expansion later.

### Wedge F: Buyer-side AI agent (two-sided marketplace)

**Target:** 17 million US consumers buying a car each year, especially first-time buyers and those who hate the dealership experience.

**Why:** Two-sided network effect. Consumer adoption of an AI shopping agent forces dealers to install a counter-agent to respond at machine speed and protect F&I gross. We sell the dealer-side as defense once buyer-side reaches a threshold (estimated 100K monthly active buyers).

**Required scope:** Consumer-facing app / web tool that searches inventory across the country, evaluates pricing fairness, drafts negotiation scripts, structures financing options, screens out lemons via VIN history and recall data. Backend orchestrates outbound communications to dealer F&I and sales staff on the buyer's behalf.

**Pricing:** Consumer side: freemium ($0 base, $19 / month premium for negotiation assistance, lender pre-approval). Dealer side: $199-499 / month / rooftop to interoperate with buyer agents at scale.

**CAC:** Consumer: $5-20 (digital marketing, organic, referral). Dealer: $500-2K once buyer flywheel exists.

**Time to first paying customer:** Consumer: 90 days. Dealer-side defense product: 12-18 months once buyer-side hits scale.

**Tech advantage:** Same multi-agent stack inverted to act for the consumer instead of the dealer. The consumer agent uses our DMS overlay (Wedge D) tech to interact with dealer websites and CRMs directly.

**Risks:**
- CarMax, Carvana, TrueCar, AutoTrader own current consumer mindshare. Differentiation: actual negotiation, not just lead-gen.
- Two-sided marketplaces take 24-36 months to reach network density. Cash burn risk.
- Adversarial dynamic with dealers complicates dealer-side sales. Mitigation: separate brand for buyer-side ("Wolfpack Auto Shop") to preserve dealer-side credibility.

**Strategic value:** Five-year vision worth seeding now. Optional: license the buyer-side tech to a strategic partner (TrueCar, Edmunds) instead of building distribution ourselves.

### Wedge G: Migration-as-a-Service ("Off-CDK in 30 days")

**Target:** Same 18,000 franchised dealers as Wedge D, but with the opposite philosophy — these are dealers who want to migrate and just need it to not take a year.

**Why:** Migration consulting today costs $100-500K and takes 6-12 months. Our agents do the data mapping, normalization, parallel-run validation, and integration testing that humans bill $300/hour for. Price: $25-75K flat, eat the rest with agents. Then upsell our DMS or a Wedge D overlay relationship.

**Required scope:** Automated CDK / Reynolds / Dealertrack data extraction harness, schema-mapping agent (LLM-driven), normalization rules library, parallel-run reconciliation engine (verify our data matches CDK's day-over-day), cutover orchestration, training materials. Lots of agentic reasoning over messy real-world data.

**Pricing:** $25-75K flat fee for migration, scoped by dealership size. Optional ongoing $399-1,499 / month / rooftop for the destination DMS (ours or partner).

**CAC:** $5-10K. Sells against the misery of CDK contracts coming up for renewal.

**Time to first paying customer:** 90-120 days. Hardest milestone is reliable cross-DMS schema mapping; agents help but real-world data is hostile.

**Tech advantage:** Agentic data engineering at machine pace. Each migration teaches the system; the 10th customer migrates in days, not weeks, because we have seen the schemas before.

**Risks:**
- Brittle. One missed field on a real customer can wipe out trust for the whole program. Mitigation: rigorous parallel-run validation gates; never cut over without full reconciliation.
- Legal exposure if the destination DMS loses data. Mitigation: heavy insurance, contractual reps and warranties from customer that source data is accurate.
- Dependency on having a destination DMS people want to migrate to. Either ours (back to Wedge A/B) or a partnership.

**Strategic value:** Even if we never become a DMS company, this is a $50-200M revenue line on its own. And it eliminates the #1 reason dealers stay on legacy systems.

### Wedge H: OEM-direct platform (high-ceiling, slow-cycle)

**Target:** OEMs trying to own customer relationships directly (Tesla, Rivian, Polestar, Ford with Ford Direct, GM with Cadillac Subscription, Volvo Cars Recharge). Plus large fleet operators (Hertz EV fleet, Enterprise, Uber, last-mile delivery fleets).

**Why:** OEMs and fleets are actively trying to dis-intermediate the dealer network. They need a Wolfpack-Auto-shaped platform to run direct sales, fleet leasing, service-on-OEM-payroll, OTA recall coordination, EV charging operations, subscription billing. Average contract value 10-50x a dealer. Customer count tiny (12-15 OEMs that matter globally, ~500 large fleet operators).

**Required scope:** Multi-rooftop / multi-region / multi-language platform with EV-native primitives (charging schedules, OTA orchestration, battery health tracking), subscription billing, fleet leasing and asset management, recall coordination, telematics integration, OEM-specific finance product modeling.

**Pricing:** $250K-2M annual contract value. Five-year terms typical. Implementation services $100K-500K.

**CAC:** $50-250K. Long enterprise sale cycles (9-18 months). Heavy account-based marketing, conference presence at OEM technology summits, executive sponsors.

**Time to first paying customer:** 12-24 months. Pilot first, then production. Faster with an OEM relationship via warm intro.

**Tech advantage:** Multi-tenant from day one. Already supports the abstractions OEMs need (multi-location, multi-currency, programmatic API access). Our triple-write architecture (Postgres + vector + graph) is uniquely suited to telematics + OTA event streams that legacy DMSes cannot process at OEM scale.

**Risks:**
- Long sales cycle = high cash burn before revenue.
- OEM procurement processes are brutal (vendor security reviews, ISO 27001, sometimes Auto-ISAC membership required).
- Sales motion requires senior enterprise sellers we do not currently have. ~$300K base + variable.
- Dealer-side product becomes politically awkward: OEMs see us as their tool, dealers see us as their tool. Resolve before pursuing both.

**Strategic value:** Highest ceiling. One Ford contract = 50 dealer contracts. But it requires a different team, different sales motion, and different proof points than dealer-side.

### Comparison summary: all eight wedges

| Wedge | First $ in | TAM @ year 3 | Tech advantage leverage | Sales friction | Strategic ceiling |
|-------|-----------|----|---|---|---|
| A — AI-native DMS (independents) | 30-45d | $50-150M | medium | medium | medium-high |
| B — Managed DMS (franchised) | 60-90d | $30-100M | medium | high | medium-high |
| C — AI module on existing DMS | 90d | $15-40M | medium | low | low-medium |
| **D — Overlay on legacy DMS** | **60-90d** | **$100-400M** | **very high** | **low** | **very high** |
| **E — Compliance engine** | **45-60d** | **$50-200M** | **very high** | **very low** | **medium-high** |
| F — Buyer-side agent | 90d (free) / 18mo (revenue) | $200M-1B+ | high | n/a (consumer) | very high |
| G — Migration-as-a-Service | 90-120d | $50-200M | very high | medium | medium |
| H — OEM-direct platform | 12-24mo | $200M-2B | high | very high | extremely high |

### Revised recommendation

The original document recommended Wedge A + B. After the alternatives analysis:

1. **Lead with Wedge E (compliance engine).** Fastest revenue, lowest CAC, regulatory tailwind, builds the trust foundation that everything else stands on. Uses our existing AgenticQA scanner infrastructure with minimal new development.

2. **Build Wedge D (overlay) in parallel.** This is the bet that breaks the migration moat protecting incumbents. Six-month engineering effort, but inverts the entire industry's competitive dynamic. See `docs/overlay-strategy-one-pager.md` for the detailed case.

3. **Hold Wedge A as the destination.** Once Wedge D customers are dependent on us as their UX, offer them the option to migrate underlying DMS to ours. Wedge A becomes the back-end upgrade rather than the front-door product.

4. **Wedges B, G, H as strategic options.** Stand them up as separate revenue lines once D and E reach proof points. Each can grow to $50-200M independently. H is the swing-for-the-fences if a Ford or Rivian relationship lands.

5. **Deprioritize Wedge C.** Subsumed by Wedge D — overlay is a superset of the AI-module value proposition.

6. **Wedge F as optional 5-year seed.** Either build a small consumer beachhead now or license tech to a strategic partner later. Do not staff it heavily until D and E are proven.

**This is a meaningful pivot from the original recommendation.** The original was correct given a conventional "build a better DMS" framing. The alternatives matter because Wolfpack's actual technical advantage (multi-agent orchestration + browser automation + agentic data engineering) is wasted on conventional DMS competition and uniquely applicable to overlay, compliance, and migration. The incumbents cannot build any of D / E / G in the next 36 months without cannibalizing themselves.

---

## Appendix A: Open questions for founders

1. What is the realistic monthly operating cash burn at current team size?
2. Is there appetite for outside capital, or is bootstrapped growth the preferred path?
3. Which OEMs does the team have existing relationships with that could accelerate certification?
4. What is the current customer pipeline state (signed letters of intent, demos scheduled, advanced discussions)?
5. Are there existing dealer-industry advisors or board members who could open sales doors?
6. What is the legal entity structure and is it set up for outside investment?
7. Is the IP cleanly assigned to the company entity?
8. What is the current employee equity pool and runway assumption?

## Appendix B: Resource references

- NADA Show: nada.org/conventions
- SOC 2 audit vendors: Vanta, Drata, Secureframe
- Dealer-industry sales recruitment: NADA Career Center, AICPA Auto Dealer practice
- OEM certification programs: contact franchise developer at each OEM
- E&O insurance brokers specialized in SaaS for regulated industries: AmTrust, Hiscox, Chubb
