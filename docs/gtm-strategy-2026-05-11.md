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
