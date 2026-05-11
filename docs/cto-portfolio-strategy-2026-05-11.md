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
| Wolfpack Instinct | High ($2-15M) | Medium (trade secrets + time-to-market, NOT patents) | Open category, early-mover advantage | Very high | High + internal value floor | **SHIP NOW with cost-efficiency positioning** |
| Wolfpack LMS | Medium ($1-5M) | Low | Slow but stable | Medium | Very high | **BUNDLE** with consulting, don't standalone |
| Wolfpack Weekend | Medium (client engagement near approval) | Low-Medium (services + tooling) | Validated by inbound demand | Medium | High (services-heavy auto work) | **ACTIVATE** as client engagement |
| Templatized client sites | Active service line (clients live) | Low (in templates), Medium (in CI/CD spine) | In production | Medium | Very high | **KEEP** as service line, productize the CI/CD spine separately |
| AgenticQA (internal) | Indirect | High (proprietary) | Hot | Very high | Medium | **INTERNAL WEAPON**, spin out year 2 |

### 1.1 Per-product detail

**Wolfpack Auto.** The GTM strategy doc identified five disruption angles (Wedges D-H) that materially outperform the original "build a better DMS" framing. Wedge E (compliance engine) ships fastest, Wedge D (overlay on CDK) is the moat-breaking long bet. Estimated 12-month ARR ceiling $5-25M depending on wedge execution.

**Wolfpack Instinct.** Innovative IP, positioned in a category no one else is claiming: **AI cost-efficiency.** Every other AI vendor right now is selling capability (more tokens, more agents, bigger context, fancier reasoning). Nobody is selling cost reduction. Instinct applies AI in a smart, limited, expensive-call-avoiding manner that gives clients the AI outcomes they want at a fraction of the LLM spend they currently waste. A company that swaps direct OpenAI / Anthropic API usage for Instinct-mediated calls immediately saves 50-80%.

This positioning is structurally defensible because **Anthropic and OpenAI cannot compete in it.** Their revenue model depends on customers spending more on tokens, not less. The labs have a fundamental conflict of interest with the "save money on AI" pitch. Claude Operator / GPT Operator are agent products, not cost-optimization products — different category, different buyer, not in competition with Instinct.

Even more important: **Wolfpack uses Instinct internally for its own consulting operations.** Work-pattern analysis, decision support, organizational intelligence, deliverable production. This dogfooding is the most credible proof point we have, and it sets a floor on the bet's value — even if external market adoption is slow, internal use compounds our consulting margins and gives us a structural edge over agency competitors who pay full freight on AI APIs.

**Wolfpack LMS.** Useful inside our consulting upskilling business. Standalone? Crowded category (Cornerstone, Docebo, 360Learning) with low pricing power. Recommendation: tie tightly to the upskilling consulting offering. Bundle as part of every change-management engagement. Do not market or sell standalone.

**Wolfpack Weekend.** Status changed from speculative to near-revenue (2026-05-11): a client engagement is in late-stage approval, which converts Weekend from a parked side-project into an active client deliverable. The previous "park" guidance is rescinded. Treat Weekend as a productized services engagement: deliver the client project well, capture learnings, then decide whether the second client extends to two or stays a one-off. The right shape for Weekend is probably "white-label experience platform we deploy under client brands" rather than a self-serve SaaS, which suits our small team better than a horizontal product play.

**Templatized client sites.** Status updated 2026-05-11: this is an active service line with clients in production. Previous "productize or kill" framing is rescinded. Keep delivering client sites as core service work. The real strategic asset here is not the templates themselves (commodity) but the CI/CD spine underneath them: the agentic-update pipeline, the Vercel deploy templates, the per-client content workflows. Productize that spine separately as an internal capability (reusable across every Wolfpack product), and treat the templated-sites delivery as a stable revenue line that funds product investment without distracting from it.

**AgenticQA.** Our internal CI/CD agent platform. The unfair advantage in everything else we ship. Productizing it now competes with our customer focus on Auto and Instinct. Keep as internal weapon for 2026. Spin out in 2027 as the "Wolfpack Method" developer-tools product if the AI-native CI/CD category emerges (Cursor, Sourcegraph Cody, GitHub Copilot are early signals).

---

## 2. The 2026 product bet

The recommendation is to bet on three products and park or kill the rest.

### Bet 1: Wolfpack Auto via Wedge E + Wedge D

- **Lead with Wedge E (compliance engine).** Fastest revenue, lowest CAC. Target $1-3M ARR by month 12.
- **Build Wedge D (overlay) in parallel.** This is the strategic bet that breaks CDK's moat. Target alpha by month 9, GA by month 15.
- **Hold Wedge A (DMS replacement) as the destination.** Once overlay customers depend on us, they migrate.

See `docs/gtm-strategy-2026-05-11.md` and `docs/overlay-strategy-one-pager.md` for detail.

### Bet 2: Wolfpack Instinct as AI cost-efficiency platform

- **Ship v1.0 publicly within 30 days.** Pricing, marketing, sales materials all live.
- **Lead positioning: cost reduction, not capability.** "Cut your AI spend 50-80% without losing the outcomes." Anthropic and OpenAI cannot run this play because their revenue depends on customers spending more.
- **Pricing model tied to savings, not parity.** Charge a fixed monthly base ($499-1,999 / company) plus 30-50% of estimated savings, capped. Customer pays a fraction of what they currently waste on tokens. Win-win economics.
- **Target market: any company with a meaningful AI spend.** Enterprise IT / finance / engineering teams are seeing AI line items hit top-3 in their cloud bills. Strong inbound demand for "make this stop growing."
- **Distribution channel: our existing consulting client base + AI cost-audit lead-gen.** Offer a free "AI spend audit" as front-of-funnel. We use Instinct to do the audit. Two-thirds of audits convert to paid Instinct deployments.
- **Internal dogfooding as proof point.** Quantify and publish "Wolfpack reduced its own AI spend by $X/month using Instinct." This is the credibility our outbound needs.
- **Target $2-6M ARR by month 12.** Higher than originally projected because enterprise budgets for cost optimization are far easier to unlock than budgets for new productivity tools.

### Bet 3: Wolfpack LMS as consulting amplifier

- **Bundle LMS into every consulting engagement.** No standalone sales motion.
- **Position LMS as the persistence layer for change-management work.** Clients pay for change, LMS captures and reinforces it.
- **Target $500K-2M attached revenue by month 12.** Pricing built into consulting MSAs, not separate SKUs.

### Park or kill

- **Wolfpack Weekend** — activate as client engagement (status updated 2026-05-11). Treat as productized services, not standalone SaaS. Single dedicated track inside the consulting org. Do not yet build a second-client sales motion until the first client ships and we know the real economics.
- **Templatized client sites** — keep as active service line (status updated 2026-05-11). Productize the underlying CI/CD spine as an internal capability that compounds across all Wolfpack products. No separate sales motion needed.
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

- Founders' meeting on the kill / keep list. CEO must explicitly approve activating Weekend as a client engagement, keeping templated client sites as a service line, and deprioritizing AgenticQA productization (both Weekend and templated sites status updated 2026-05-11 based on inbound client demand).
- Founders' meeting on the Wolfpack Auto wedge decision (E primary, D long bet). This is the politically loaded one because the CEO's CDK relationships either become a leverage asset (D) or a relationship to protect (A/C). Force the choice.
- Decide on cheap provisional patent filings ($1-3K each) for any genuinely novel combinations. Do NOT position patents as a primary moat: the underlying techniques (model routing, response caching, browser automation, agentic auditing) have extensive prior art and would not survive examination at meaningful scope. Real defensibility lives in trade secrets, execution, switching cost, and time-to-market.
- Legal counsel for CDK overlay terms-of-service analysis. $25-50K spend.
- Communicate portfolio decision to team. People work on different things; not everyone gets to keep their favorite project. Manage this carefully.

### Phase 1 — Revenue and IP (Days 30-90)

**Output: 3-5 paying customers across the portfolio. Trade secret discipline and brand IP in motion.**

- **Wolfpack Auto Wedge E:** 3 design-partner dealers signed (via CEO's network). Compliance engine MVP shipped. First $50-150K of ARR.
- **Wolfpack Instinct:** v1.0 publicly live. Pricing page, sales materials, customer success playbook. First 10-25 paying users from consulting client base. $20-100K of ARR.
- **LMS:** Bundled into 3 active consulting engagements. No standalone marketing.
- **IP work:** Trademark filings on "Wolfpack Method" and product names. Optional cheap provisional patent filings ($1-3K each) on any genuinely novel combinations, treated as priority-date insurance rather than primary moat.
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

**Honest framing first.** Earlier drafts of this strategy positioned utility patents as a primary defensibility moat across all three products. That was overstated. The underlying techniques across overlay (RPA, browser automation), agentic compliance scanning (rule engines, domain-specific agents), and AI cost routing (model tiering, response caching, semantic deduplication) all have extensive prior art in commercial products and open-source libraries. A utility patent on any of these as a category would face strong novelty challenges at meaningful scope.

The real moats live elsewhere. We can still file cheap provisional patents on specific novel combinations as priority-date insurance, but they are not the moat.

**Real moats:**

1. **Trade secrets in our specific implementation.** Routing thresholds, prompt libraries, model-tier decision logic, cache eviction policies, agent fine-tuning approach, customer-success playbooks. Protected by not publishing them, by access controls, and by clear NDA discipline. Inexpensive to maintain, hard for competitors to replicate.
2. **Time-to-market on category positioning.** "AI cost-efficiency platform" (Instinct) and "overlay on legacy DMS without migration" (Wolfpack Auto Wedge D) are currently unclaimed positions. First mover defines the buyer's mental model. Six to twelve months of head start is worth more than a patent that takes three years to issue.
3. **Customer switching cost.** Once a customer routes traffic through Instinct or runs daily operations on a Wedge D overlay, swapping us out means re-instrumenting every workflow. That cost compounds with every integration. Pure engineering moat, not legal.
4. **Data network effects.** Every customer's workload teaches our router better routing decisions. Every dealer's deals teach our compliance scanner better rule precision. Competitors starting fresh cannot replicate this without months of customer data we already have.
5. **Internal Wolfpack dogfooding credibility.** Hard savings numbers from running on our own infrastructure are proof a competitor cannot copy in any amount of time.
6. **Distribution.** Auto industry warm relationships through the CEO, consulting client distribution for Instinct, FordDirect path via OneMagnify. Distribution beats most software moats over time.

**Optional cheap provisional patent filings.** $1-3K each. Treat as priority-date insurance, not strategic defensibility:
- Specific novel combinations in our compliance scanner that genuinely have no obvious prior art.
- Specific novel combinations in our overlay's semantic UI identification approach.
- Any genuinely new pattern we discover during the next twelve months.

Do not let the OneMagnify timeline or any customer engagement wait on patent filings.

**Brand IP:**

1. "Wolfpack Method" register the trademark. Position as the agency-plus-agentic-platform hybrid. Build content around it (whitepapers, case studies, conference talks).
2. Product names: Wolfpack Auto, Wolfpack Instinct, Wolfpack LMS. Trademark all.

Trademark is real defensibility for $250-1000 per mark. Patents are speculative defensibility for $15-25K each and three years. Allocate accordingly.

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

**Tension 2: Instinct's positioning needs to be sharp from day one.**

Earlier internal framing positioned Instinct as a Claude-Operator competitor. That framing is wrong and would cost us the bet. The correct frame is AI cost-efficiency, an unclaimed category where Anthropic and OpenAI structurally cannot compete (their revenue depends on token spend growing, not shrinking).

The 30-day ship is real but the urgency is not because labs will eat us. The urgency is because enterprise AI-spend pain is acute right now and the company that defines the cost-optimization category first owns it. We are early but not uncontested forever.

Internal dogfooding makes this bet lower-variance than the original framing implied. Worst case, we still get a more profitable consulting business from running on Instinct. Best case, we own a category that adds $2-6M ARR by month 12 and grows with every dollar enterprises spend on AI.

**Tension 3: The consulting business may not love the product company.**

As products grow, attention and capital shift away from consulting services. Senior agency staff may resist. This is normal portfolio dynamics, but it needs to be managed. The right framing: products extend the agency's reach and make consulting engagements more valuable, not the other way around.

---

## 9. Risks and how they kill the plan

Severity-ranked.

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| CEO/CTO misalignment on portfolio priorities | Catastrophic | Medium | Phase 0 alignment meeting. Written decision artifact. |
| Instinct mispositioned as Operator competitor instead of cost-efficiency platform | High | Medium | Lock positioning to cost reduction in all sales / marketing. Reject capability-comparison conversations. |
| CDK legal action on overlay (Wedge D) | High | Low-Medium | Pre-launch legal review. Customer-authorized agent framing. |
| Consulting cash flow disruption | High | Low | Diversify clients. Maintain 6-month operating runway. |
| Key engineer (CTO) bandwidth saturation | High | Medium | Phase 2 hire of AI/ML engineer. Document everything. |
| First Wolfpack Auto pilot churns publicly | Medium | Medium | Hand-pick pilots. Founder time on customer success. |
| Wolfpack Instinct fails to differentiate from Operator | Medium | Medium | Position around workflow depth, not model quality. |
| Trade secrets leaked during sales / audits | Medium | Medium | NDA discipline. Publish methodology summaries, never full implementations. Access controls on routing logic and prompt libraries. |
| SOC 2 Type I delays | Medium | Medium | Engage Vanta / Drata at month 2, not month 8. |

---

## 10. The single highest-leverage decision

Pick two or three products to bet on. Kill or park the rest. Communicate the decision clearly to the team.

The agency cannot scale six products with five people. We can scale two products well, and that is enough to generate $5-15M ARR by end of 2026 if we execute. That funds the next two products in 2027 from product revenue, not consulting revenue.

The single decision blocking everything else is founder alignment on the portfolio. Until that is settled, every engineering hour is at risk of being misallocated.

---

## 11. What I am asking the CEO for

If this strategy is approved:

1. **Sign off on the portfolio decision** (Wolfpack Auto + Wolfpack Instinct + Wolfpack LMS bundled; Weekend activated as client engagement; templated client sites kept as active service line; AgenticQA internal-only).
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
- Trademark filings on "Wolfpack Method" and product names within 60 days. Trade secret discipline (NDAs, methodology vs implementation separation) in place from day one.
- Real ARR by month 6, not aspirational ARR.
- Monthly founder-update doc tracking progress against this plan.

---

## 12. Closing

The agency has more strategic optionality than most companies five times its size. We have direct distribution into the auto industry, a technical stack that takes others two years to assemble, a CTO who can operate the full distributed-systems pipeline, and consulting cash flow that buys runway.

We are not constrained by talent or tech. We are constrained by focus.

Pick two or three products. Bet hard on them. Build the IP moat before the labs and the incumbents catch up. The window is 12-18 months. After that, the competitive landscape locks in and entry becomes 10x harder.

This plan does not require us to be lucky. It requires us to be disciplined.
