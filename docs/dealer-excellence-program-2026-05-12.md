# Dealer Excellence Program

**Date:** 2026-05-12
**Author:** Wolfpack CTO
**Status:** Strategic offering structure. Companion to `wolfpack-team-capabilities-2026-05-12.md`.

The Dealer Excellence Program is the productized form of the integrated work Wolfpack already delivers to OEMs and dealers. It bundles training, content production, software platform, in-person event delivery, and ongoing optimization into an annual engagement. The platform we have been building (Wolfpack Auto + Literacy OS + F&I Audit) is the spine and renewal mechanism. The team delivers the outcomes.

---

## Why a program, not a SaaS

Three reasons the program structure fits Wolfpack better than pure SaaS:

1. **The team's strengths compose into a multi-surface engagement.** Pure SaaS leaves Max, Zocchi, Alicia, Megan, and Jorge's domain expertise out of the value chain. The program puts each of them on the critical path.
2. **OEMs already buy this shape of engagement.** PCNA, Audi Brand Experience, Toyota Dealer Excellence — these are existing budget lines that fund multi-year dealer-improvement programs. We are not creating demand; we are professionalizing how the demand is served.
3. **Switching cost is structural, not feature-based.** Once a dealer is mid-program with active certifications, scheduled events, and produced content, replacing Wolfpack means restarting the year. SaaS switching costs are usually weak; program switching costs are strong.

---

## Program structure (annual engagement)

### Onboarding wave (months 1-2)

**Owner:** Alicia (project management + class setup background)

- F&I Penetration Audit delivered as the engagement-opening insight document. Megan-designed PDF. Establishes baseline.
- Operational baseline assessment across role-specific dashboards (Wolfpack Auto + Literacy OS surfaces).
- White-glove implementation of the platform. Integration with existing DMS (CDK / Reynolds / Cox-feed-based) where applicable; full Wolfpack Auto deployment for net-new programs.
- Initial certification curricula introduced. Schedule of the year's training events confirmed with the dealer (or with the OEM, when OEM-mandated).

### Training delivery (months 1-12, continuous)

**Owner:** Zocchi (curriculum design + trainer); supported by Alicia (event delivery)

- Role-specific certification programs delivered through the Literacy OS platform. Sales, F&I, BDC, service advisor, service manager, marketing, GM tracks.
- Quarterly in-person training events. Hospitality-grade delivery, dealership-specific or hosted by Wolfpack at an OEM-aligned venue.
- Continuous content updates as ontology mappings expand and as OEM-specific brand or process requirements evolve.
- Completion certificates and performance benchmarks tracked in the platform.

### Content production (months 1-12, continuous)

**Owner:** Max (video / production lead); supported by Megan (design)

- Vehicle walkaround video production at scale. Dealer-branded or OEM-co-branded.
- Inventory commercials and seasonal campaigns. Broadcast-quality output.
- Training video library production. Tied to the curriculum delivered through the Literacy OS.
- Event capture for in-person training. Reusable content asset stream.
- Social-content production aligned with OEM brand guidelines.

This surface is a major Wolfpack-only capability. No DMS competitor and no LMS competitor produces broadcast-quality video as a program deliverable. It is the most differentiated piece of the offering.

### Ongoing optimization (months 3-12)

**Owners:** Jorge + Hoxsie (industry-domain consulting) + Homyk (platform-driven insights)

- Platform analytics continuously surface improvement opportunities through the Literacy OS lens (lot-language metrics with named actions).
- Wolfpack consulting team meets monthly with the dealer's leadership to translate metrics into action plans.
- F&I directors, service managers, salespeople receive role-specific coaching through the platform plus quarterly in-person reinforcement.
- Each engagement maintains a running "performance journal" that documents what was tried, what worked, and what didn't, for renewal-cycle storytelling.

### Renewal motion (months 11-12)

**Owners:** Hoxsie + Jorge + the team member who owned the engagement

- Outcomes report. JD Power score impact where applicable. CSI changes, F&I gross changes, service revenue changes, deal funnel improvements.
- Performance benchmarks against dealer peer set and against the dealer's own baseline.
- Renewal at base tier, expanded scope, or escalation to additional rooftops or sister-brand engagements.

---

## How each shipped product surface plugs in

- **Wolfpack Auto (the DOS):** primary platform spine. Hosts dashboards, integrates with DMS, captures analytics, runs the workflows the team designs. Multi-tenant by OEM/dealer; theming layer allows OEM-co-branded instances.
- **Literacy Ontology engine (migration 075):** the authoring substrate Zocchi works in. Every translation, action, and onboarding curriculum is structured data the platform renders into role-specific surfaces.
- **F&I Penetration Audit (migration 074):** the engagement-opening deliverable. Run at intake and annually as a re-baselining tool. Output feeds the Literacy OS recommendations during the year.
- **BYO-credentials infrastructure (migration 069):** integration layer for whatever real-data sources the dealer or OEM has (Plaid, Carfax, Edmunds, future KBB-via-vAuto, etc.). Reduces partnership burden on Wolfpack.
- **Dealer-own-data analytics (migrations 071-072):** the dashboards Zocchi's curricula reference. "Your F&I attach rate is X. Here's the training module that addresses it." Direct link from metric to learning.
- **Real USPS + state-title framework (migration 073):** operational quality-of-life layer; not a primary program deliverable but valuable for in-program adoption.

---

## Pricing model implications

The program is priced as an annual engagement, not a per-seat SaaS subscription. Pricing has three components:

1. **Platform license** — base per-rooftop or per-OEM-network annual fee for software access.
2. **Program delivery** — Wolfpack-team services for training, content production, event delivery, and consulting. Priced based on scope (number of rooftops, depth of curriculum, content production volume).
3. **Outcomes-linked bonus** — optional tier where a portion of the program fee is tied to measurable outcomes (JD Power score movement, CSI improvement, F&I gross uplift). High-trust mechanism, only offered with OEM-level engagements where the data is auditable.

Anchor pricing (subject to validation with first lighthouse customer):

- OEM-network engagement (50+ rooftops): $1.5M-$5M annual program fee, multi-year contract.
- Single-rooftop direct-dealer engagement: $60K-$180K annual, depending on scope.
- Inbound-only F&I Audit (engagement-opener, no commitment): free deliverable as lead-generation tool.

These numbers are placeholders for the founder-meeting conversation, not final pricing. The point is the SHAPE of the model: services-led with software as the spine, not pure SaaS.

---

## How this connects to the OEM-led GTM motion

See `docs/oem-led-gtm-strategy-2026-05-12.md` for the full GTM doc. Short version: OEMs buy program engagements; individual dealers buy them at smaller scale. PCNA is the most likely lighthouse but not the only path. Jorge's Audi and Kia relationships, Hoxsie's broader OEM network, and team-member relationships at other OEMs are all valid entry points.

The F&I Audit functions in both motions. In OEM-led, it is part of the annual scope. In direct-to-dealer, it is the free engagement-opener that converts to a paid program.

---

## What this changes about engineering priority

The platform engineering already shipped is correct work. What changes is the order of remaining priorities:

### Year-one Q2 (now → end of June)

- Polish and publish F&I Audit landing page (Megan does the PDF redesign).
- Ontology seed grows from 63 entries to 150-200 entries (Zocchi + CTO content-design sessions).
- Engineering: ship a basic media-library surface in the platform (Q2 stub for Max's content workflow) and a basic event-management surface (Q2 stub for Alicia's training delivery). Both are small initial commits that establish the data model; full features land in Q3-Q4.

### Year-one Q3 (July-September)

- Spatial Translation Tool v1 (2D, dealer-internal). Uses Literacy OS recommendations.
- Media library + content production workflow (Max's primary platform surface).
- First OEM-pilot deployment if PCNA or another partner has greenlit.

### Year-one Q4 (October-December)

- Training-event infrastructure (Alicia's primary platform surface).
- Multi-OEM theming and white-labeling architecture.
- Outcomes-reporting surface for renewal-motion conversations.

### Year-two and beyond

- Per `docs/literacy-os-strategy-2026-05-12.md` (updated). Role-specific dashboards, deeper cross-role visibility, optional 3D upgrade, IoT integration if pulled.

---

## Risks (honest list)

1. **Capacity:** five-to-seven people delivering a multi-surface annual program at OEM scale will run hot. Year-one capacity planning is mandatory. Explicit allocation per team member, with what gets deprioritized to make room.
2. **Services-revenue recognition is slower than SaaS.** Annual program contracts at OEM scale take 12-18 months from intro to PO. Cash flow needs bridge revenue.
3. **Brand and IP overlap with existing client work.** PCNA-developed methodology may have IP clauses limiting external commercialization. Legal review before broad distribution.
4. **Team-concentrated value is harder to defend on departure.** The platform spine is durable; the team-delivered value lives in named individuals. Retention is strategic, not HR.
5. **Single-OEM lighthouse risk.** Over-indexing on PCNA early creates concentration risk. Pipeline diversity (Audi, Kia, Toyota, etc.) matters even when growth is slow.

---

## Decision needed at founder meeting

**D1: Adopt the Dealer Excellence Program as the primary product offering, with software as the spine?** Y/N.

If yes: pricing model, capacity allocation, and engagement structure get formalized within 30 days. Year-one targets reset around program engagements rather than SaaS ARR.

If no: continue the SaaS-product approach with the F&I Audit as a lead magnet. Acknowledge that the team's deepest capabilities (Zocchi training, Max video, Alicia delivery) become under-leveraged.

---

## Bottom line

Wolfpack's unfair advantage is the integrated work the team can deliver. The Dealer Excellence Program is the structure that monetizes that advantage at scale. The platform we have been building is the right spine; the GTM motion needs to reflect that we sell outcomes, not features. The competition is not CDK or Tekion; it is the dealer's training and customer-experience budget, where Wolfpack is already trusted and the only competitors are generic consultancies who do not have the platform.
