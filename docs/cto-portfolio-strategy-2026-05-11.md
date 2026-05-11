# Wolfpack Agency — CTO Portfolio Strategy 2026

**Author:** Nick Homyk (CTO)
**Audience:** CEO + founding team
**Scope:** Agency-wide (all Wolfpack products + IP strategy + team plan), NOT just Wolfpack Auto
**Date:** 2026-05-11
**Status:** Draft for founder review and alignment

---

## 0. Framing: stop thinking like an agency, start thinking like a portfolio investor

Wolfpack Agency is functionally a small portfolio investor. Consulting revenue funds product development. Products generate IP and recurring revenue. Product revenue funds growth and reduces dependence on services.

Every minute spent on a product that will not return capital is a minute stolen from products that will. Every product we keep alive without revenue is a tax on the products that could be winning.

This document does three things:

1. Audits every Wolfpack product against five strategic criteria.
2. Recommends a ruthless prioritization: keep 2-3, park the rest.
3. Lays out a 12-month plan to convert the kept products into the agency's first defensible IP and recurring revenue lines.

This is a CTO recommendation, not a final decision. Founder alignment is required on the kill / keep list before execution starts.

---

## 1. Portfolio audit

Each product graded on five axes:

- **Revenue potential** (realistic 12-month ARR ceiling)
- **IP defensibility** (can we patent / trade-secret / brand-moat it?)
- **Market timing** (is the window open or closing?)
- **Team fit** (does it use our actual technical advantages?)
- **Consulting DNA fit** (does it amplify or compete with our agency services?)

| Product | Revenue | IP defensibility | Timing | Team fit | DNA fit | Verdict |
|---|---|---|---|---|---|---|
| Wolfpack Auto | High ($5-25M) | Medium-High (with Wedge D/E) | Closing | High | Very high | **DOUBLE DOWN** with pivot |
| Wolfpack Instinct | High ($3-15M) | Medium | Closing FAST | Very high | High | **SHIP NOW or kill** |
| Wolfpack LMS | Medium ($1-5M) | Low | Slow but stable | Medium | Very high | **BUNDLE** with consulting, don't standalone |
| Wolfpack Weekend | Low (under $500K) | Low | Unproven | Low | Medium | **PARK** unless dealer demand validates |
| Templatized client sites | Low (under $300K) | Very low | Commodity | Low | Medium | **PRODUCTIZE or kill** |
| AgenticQA (internal) | Indirect | High (proprietary) | Hot | Very high | Medium | **INTERNAL WEAPON**, spin out year 2 |

### 1.1 Per-product detail

**Wolfpack Auto.** The GTM strategy doc identified five disruption angles (Wedges D-H) that materially outperform the original "build a better DMS" framing. Wedge E (compliance engine) ships fastest, Wedge D (overlay on CDK) is the moat-breaking long bet. Estimated 12-month ARR ceiling $5-25M depending on wedge execution.

**Wolfpack Instinct.** Innovative IP. AI agent for the Microsoft 365 stack and adjacent work surfaces. Anthropic and OpenAI are both shipping competing products (Claude Operator, GPT-Operator). The window is closing measured in months, not years. We have a structural advantage in two places: deeper integration with the specific workflows our consulting clients use (sales ops, finance ops, HR ops), and lower per-seat cost via efficient prompt routing. Ship 1.0 in 30 days or de-prioritize.

**Wolfpack LMS.** Useful inside our consulting upskilling business. Standalone? Crowded category (Cornerstone, Docebo, 360Learning) with low pricing power. Recommendation: tie tightly to the upskilling consulting offering. Bundle as part of every change-management engagement. Do not market or sell standalone.

**Wolfpack Weekend.** Niche dealer product. Solid v0.1 launch but unproven demand. Cost to maintain: low. Cost to commercialize: high. Park unless one of our auto consulting clients explicitly requests a deployment.

**Templatized client sites.** Pure services work dressed as a product. Race-to-the-bottom commodity unless we either (a) productize the CI/CD pipeline as a standalone offering ("Wolfpack Sites" — Webflow + Vercel + agentic content updates for boutique consultancies) or (b) kill it and stop marketing the capability. Recommendation: productize if the engineering cost is under one engineer-month; otherwise kill.

**AgenticQA.** Our internal CI/CD agent platform. The unfair advantage in everything else we ship. Productizing it now competes with our customer focus on Auto and Instinct. Keep as internal weapon for 2026. Spin out in 2027 as the "Wolfpack Method" developer-tools product if the AI-native CI/CD category emerges (Cursor, Sourcegraph Cody, GitHub Copilot are early signals).

---

## 2. The 2026 product bet

The recommendation is to bet on three products and park or kill the rest.

### Bet 1: Wolfpack Auto via Wedge E + Wedge D

- **Lead with Wedge E (compliance engine).** Fastest revenue, lowest CAC. Target $1-3M ARR by month 12.
- **Build Wedge D (overlay) in parallel.** This is the strategic bet that breaks CDK's moat. Target alpha by month 9, GA by month 15.
- **Hold Wedge A (DMS replacement) as the destination.** Once overlay customers depend on us, they migrate.

See `docs/gtm-strategy-2026-05-11.md` and `docs/overlay-strategy-one-pager.md` for detail.

### Bet 2: Wolfpack Instinct GA in 30 days

- **Ship v1.0 publicly within 30 days.** Pricing, marketing, sales materials all live.
- **Position against Claude Operator / GPT Operator.** Differentiator: "We integrate with the specific workflows your team actually runs in M365 + Slack + Salesforce + HubSpot. Operators are demos. Instinct is production."
- **Target market: boutique consulting and professional services firms.** They are our consulting clients. We have direct distribution.
- **Target $1-3M ARR by month 12.** $99-499 / user / month, 10-50 user deals.

### Bet 3: Wolfpack LMS as consulting amplifier

- **Bundle LMS into every consulting engagement.** No standalone sales motion.
- **Position LMS as the persistence layer for change-management work.** Clients pay for change, LMS captures and reinforces it.
- **Target $500K-2M attached revenue by month 12.** Pricing built into consulting MSAs, not separate SKUs.

### Park or kill

- **Wolfpack Weekend** — park. Cost to maintain near zero. No active development.
- **Templatized client sites** — productize as "Wolfpack Sites" if it costs under one engineer-month, else kill. Decide by day 14.
- **AgenticQA** — keep as internal infrastructure. Spin out in 2027.

---

## 3. The unfair advantages we can actually deploy

Most early-stage software companies have none of these. We have all of them.

1. **CEO's auto-industry network.** Warm introductions to dealer principals, OEM executives, channel partners. Money cannot buy this.
2. **Existing AgenticQA platform.** Two years of pre-built infrastructure (9-agent pipeline, RAG, browser automation, triple-write durability). Competitors are still hiring a team to build this.
3. **Multi-product compounding.** Instinct's UX patterns improve Auto's UX. Auto's pipeline improves LMS analytics. LMS data trains Instinct's domain-specific agents. Each product makes the next cheaper to ship.
4. **Consulting cash flow.** We do not need to raise immediately. We can take the slower, more disciplined path to product-market fit without a 12-month runway clock.
5. **CTO full-stack capability.** Build, integrate, orchestrate, deploy. Most early-stage companies have a CEO + 2 hired engineers and ship slowly. We ship in days because the CTO operates the entire pipeline.
6. **Consulting services DNA.** Our products are designed to be implemented well, not just sold well. This is a structural advantage against vendors who sell software and abandon customers at the contract.

If we lean into all six, we can credibly ship two production-grade products in 12 months. Without them, we cannot.

---

## 4. Twelve-month phased plan

### Phase 0 — Strategic alignment (Days 0-30)

**Output: founder-aligned portfolio decision and execution mandate.**

- Founders' meeting on the kill / keep list. CEO must explicitly approve parking Weekend, deferring templates decision, and deprioritizing AgenticQA productization.
- Founders' meeting on the Wolfpack Auto wedge decision (E primary, D long bet). This is the politically loaded one because the CEO's CDK relationships either become a leverage asset (D) or a relationship to protect (A/C). Force the choice.
- Patent attorney consult on three IP areas: overlay architecture, agentic compliance scanner, Instinct method.
- Legal counsel for CDK overlay terms-of-service analysis. $25-50K spend.
- Communicate portfolio decision to team. People work on different things; not everyone gets to keep their favorite project. Manage this carefully.

### Phase 1 — Revenue and IP (Days 30-90)

**Output: 3-5 paying customers across the portfolio. Patent filings in motion.**

- **Wolfpack Auto Wedge E:** 3 design-partner dealers signed (via CEO's network). Compliance engine MVP shipped. First $50-150K of ARR.
- **Wolfpack Instinct:** v1.0 publicly live. Pricing page, sales materials, customer success playbook. First 10-25 paying users from consulting client base. $20-100K of ARR.
- **LMS:** Bundled into 3 active consulting engagements. No standalone marketing.
- **IP filings:** Provisional patents on overlay architecture and agentic compliance scanner. Trademark filings on "Wolfpack Method."
- **First hire:** Dealer-industry sales lead (Wedge E + D enabler).

### Phase 2 — Proof and scale (Days 90-180)

**Output: customer logos. Case studies. Real ARR. SOC 2 evidence ready.**

- **Wolfpack Auto:** 10-15 paying compliance customers. Wedge D overlay alpha with 3 pilot dealers. $300K-1M ARR run rate.
- **Wolfpack Instinct:** 50-100 paying seats. Public case studies. $200-500K ARR run rate.
- **LMS:** 5-7 consulting engagements with LMS bundled. Attached revenue tracked separately to validate willingness-to-pay.
- **Brand and positioning:** "Wolfpack Method" as the unifying narrative across products. Investor and customer-facing pitch deck. Conference / NADA presence.
- **Compliance: SOC 2 Type I evidence collection complete.** Auditor engagement signed.
- **Hiring:** AI/ML engineer for Instinct. Customer success / implementation lead.

### Phase 3 — Scale or sell decision (Days 180-365)

**Output: clear path to $5-15M ARR run rate. Optional capital event.**

- **Wolfpack Auto:** 30-75 paying dealers. Wedge D overlay GA. $3-8M ARR run rate.
- **Wolfpack Instinct:** 200-500 paying seats. $1-3M ARR run rate.
- **LMS:** Embedded in standard consulting offering; not a separate revenue line but defensible margin amplifier.
- **Decision point at month 12:** bootstrap, seed round, strategic investment from auto / consulting / compliance vendor, or acquihire.
- **Portfolio expansion conversation:** AgenticQA spinout? Wedge F buyer-side agent seeding? OEM-direct (Wedge H) account-based marketing program?

---

## 5. IP strategy

**Three patents to file in 2026:**

1. **Agentic overlay on legacy enterprise software.** The Wedge D architecture: multi-agent orchestration driving legacy DMS / ERP / CRM via browser automation + API hybrids, with semantic UI element identification (resistant to vendor UI changes). Broadly applicable beyond auto.
2. **AI compliance scanner for regulated financial transactions.** The Wedge E architecture: multi-rule agentic audit of TILA / FCRA / Reg B / Reg V / ECOA / FTC dealer-rule compliance with per-state extensions. Applicable to mortgage, consumer finance, leasing.
3. **AI work-surface co-pilot with explicit workflow memory.** The Instinct architecture: agent-driven work-surface manipulation with persistent per-user workflow patterns learned from observed behavior. Differentiator from generic LLM "Operators."

**Three trade secrets to harden:**

1. Per-domain prompt engineering library for dealer F&I, sales, service, accounting workflows.
2. ML fine-tuning approach for our specific agents.
3. Customer-success playbooks (how we get 90%+ retention in markets where incumbents see 70%).

**Brand IP:**

1. "Wolfpack Method" — register the trademark. Position as the agency-plus-agentic-platform hybrid. Build content around it (whitepapers, case studies, conference talks).
2. Product names — Wolfpack Auto, Wolfpack Instinct, Wolfpack LMS, Wolfpack Sites (if kept). Trademark all.

---

## 6. Team plan

The current team (~5 people including CTO + CEO) can credibly execute three products with focused scope. Beyond that, we burn out and ship nothing well.

**Hires needed in 2026, in priority order:**

1. **Dealer-industry sales lead (month 1).** Without this hire, Wedge E will not move. Comp: $120-180K base + variable. Required experience: 5+ years selling into franchised dealer principals or general managers. Open the search now.
2. **AI/ML engineer for Instinct (month 3).** As we scale beyond a single CTO doing everything, Instinct needs a dedicated owner. Comp: $180-240K base + equity. Open after month-2 ARR validation.
3. **Customer success / implementation lead (month 5).** Once we have 10+ paying customers, churn becomes the constraint. Comp: $100-140K base + outcomes-tied bonus.
4. **Compliance counsel (part-time, retainer).** Wedge E credibility and our SOC 2 / GLBA / E&O coverage all flow through a dedicated legal partner. $5-10K / month retainer.

**Do not hire in 2026:**

- A second senior engineer for Wolfpack Auto. The agentic stack is structured to be operated by one engineer per product. Hiring a second engineer per product before $1M ARR per product is over-investment.
- A marketing lead. Founder-led marketing through Q3 at minimum.
- A CFO. Outsourced accounting + part-time CFO services are sufficient through $5M ARR.

---

## 7. Capital plan

Four options. The right answer depends on month-6 traction.

**Option A — Bootstrap on consulting cash flow.**
- Pros: Full ownership, no fundraising distraction, maximum optionality.
- Cons: Slower growth, can't outspend competitors on sales hiring.
- When right: If consulting revenue is $200K+ monthly and stable.

**Option B — Seed round once Wedge E has 5-10 paying customers.**
- Target: $2-5M at $15-30M valuation.
- Investors: AI-focused early-stage funds (Bloomberg Beta, Lerer Hippeau) plus one auto-vertical specialist if findable.
- Use of funds: Sales hiring acceleration, Wedge D engineering, SOC 2 / compliance posture.
- When right: Clear traction at month 6, want to compress timeline to category leadership.

**Option C — Strategic investment from an auto, consulting, or compliance vendor.**
- Target: $5-15M at $40-80M valuation.
- Possible investors: A dealer group (AutoNation Ventures, Asbury), an OEM venture arm (Toyota Ventures, GM Ventures, Ford X), a compliance vendor (Wolters Kluwer, RouteOne, Dealertrack adjacent).
- Pros: Brings warm enterprise distribution and signal of legitimacy.
- Cons: Possible strategic conflicts; channel-partner exclusivity expectations.
- When right: One of these parties shows organic interest after a 6-month track record.

**Option D — Acquihire or strategic acquisition.**
- Likely acquirers: A large consulting firm (Accenture, Bain, McKinsey) wanting AI-native delivery capability, OR a DMS vendor seeking a modern stack.
- When right: Founders decide they would rather build inside a bigger org than scale alone.

**Recommendation:** Bootstrap through month 6. Run Option B conversations starting month 7 if traction supports it. Keep Options C and D in peripheral vision but do not initiate.

---

## 8. The political reality the CEO needs to engage

There are three real tensions that this strategy surfaces and that the CEO needs to weigh in on personally.

**Tension 1: Wolfpack Auto's wedge choice is also a CEO relationship choice.**

The CEO has direct CDK relationships. Choosing Wedge D (overlay) means we operate adversarially to CDK over time. Choosing Wedge A (DMS replacement) is friendlier — we are a competitor, not a parasite — but a much weaker strategic position.

This is a decision the CEO has to make explicitly: are the CDK relationships an intelligence asset to leverage for an adversarial play, or an asset to protect by staying friendly competitor?

**Tension 2: Wolfpack Instinct is racing the AI labs.**

Anthropic and OpenAI are shipping competitive products. Our window is 6-12 months at most. Either we ship 1.0 in 30 days and lean into the differentiation, or we accept that Instinct becomes a Claude-Operator wrapper.

The honest read: this is a high-variance bet. If we ship well, we own a niche (boutique consulting work-surface automation) that the big labs will not bother with for 2-3 years. If we ship poorly, we waste 6 months and the bet becomes a sunk cost.

**Tension 3: The consulting business may not love the product company.**

As products grow, attention and capital shift away from consulting services. Senior agency staff may resist. This is normal portfolio dynamics, but it needs to be managed. The right framing: products extend the agency's reach and make consulting engagements more valuable, not the other way around.

---

## 9. Risks and how they kill the plan

Severity-ranked.

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| CEO/CTO misalignment on portfolio priorities | Catastrophic | Medium | Phase 0 alignment meeting. Written decision artifact. |
| Anthropic ships Operator that subsumes Instinct | High | High | Ship 1.0 in 30 days. Focus on integration-depth differentiation. |
| CDK legal action on overlay (Wedge D) | High | Low-Medium | Pre-launch legal review. Customer-authorized agent framing. |
| Consulting cash flow disruption | High | Low | Diversify clients. Maintain 6-month operating runway. |
| Key engineer (CTO) bandwidth saturation | High | Medium | Phase 2 hire of AI/ML engineer. Document everything. |
| First Wolfpack Auto pilot churns publicly | Medium | Medium | Hand-pick pilots. Founder time on customer success. |
| Wolfpack Instinct fails to differentiate from Operator | Medium | Medium | Position around workflow depth, not model quality. |
| Patent filings rejected | Low | Medium | File provisional patents quickly. Refine in continuation. |
| SOC 2 Type I delays | Medium | Medium | Engage Vanta / Drata at month 2, not month 8. |

---

## 10. The single highest-leverage decision

Pick two or three products to bet on. Kill or park the rest. Communicate the decision clearly to the team.

The agency cannot scale six products with five people. We can scale two products well, and that is enough to generate $5-15M ARR by end of 2026 if we execute. That funds the next two products in 2027 from product revenue, not consulting revenue.

The single decision blocking everything else is founder alignment on the portfolio. Until that is settled, every engineering hour is at risk of being misallocated.

---

## 11. What I am asking the CEO for

If this strategy is approved:

1. **Sign off on the portfolio decision** (Wolfpack Auto + Wolfpack Instinct + Wolfpack LMS bundled; Weekend parked; templates decided in 14 days; AgenticQA internal-only).
2. **Sign off on the Wolfpack Auto wedge decision** (Wedge E primary, Wedge D long bet, Wedge A held as destination).
3. **Open doors via your network:**
   - 10 warm introductions to dealer principals or GMs for Wedge E pilot conversations within 30 days.
   - 2-3 warm introductions to OEM executives for Wedge H seeding within 60 days.
   - 2-3 warm introductions to CDK / Reynolds executives for overlay-strategy legal preflight (handled diplomatically).
4. **Endorse the Instinct 30-day ship-now timeline** even if features are narrower than original scope.
5. **Approve the first hire** (dealer-industry sales lead) and the $25-50K legal-review spend on CDK overlay terms.

In exchange the CTO commits to:

- Shipping Wedge E pilot-ready in 90 days.
- Shipping Instinct 1.0 in 30 days.
- Patent filings on overlay + compliance + Instinct architectures within 60 days.
- Real ARR by month 6, not aspirational ARR.
- Monthly founder-update doc tracking progress against this plan.

---

## 12. Closing

The agency has more strategic optionality than most companies five times its size. We have direct distribution into the auto industry, a technical stack that takes others two years to assemble, a CTO who can operate the full distributed-systems pipeline, and consulting cash flow that buys runway.

We are not constrained by talent or tech. We are constrained by focus.

Pick two or three products. Bet hard on them. Build the IP moat before the labs and the incumbents catch up. The window is 12-18 months. After that, the competitive landscape locks in and entry becomes 10x harder.

This plan does not require us to be lucky. It requires us to be disciplined.
