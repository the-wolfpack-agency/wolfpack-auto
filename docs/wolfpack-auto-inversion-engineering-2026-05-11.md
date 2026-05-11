# Wolfpack Auto: Engineering Inversions Against Legacy DMS

**Author:** Nick Homyk (CTO)
**Date:** 2026-05-11
**Status:** Engineering vision draft, pending product sign-off
**Companion to:** `gtm-strategy-2026-05-11.md`, `overlay-strategy-one-pager.md`

---

## Why this doc exists

Earlier strategy work treated Wolfpack Auto as a better DMS than CDK, Reynolds, Dealertrack, or Tekion. That framing concedes the conceptual model to incumbents. Their products are universally hated for reasons that go beyond features and live in the architectural assumptions baked in during the 1990s. Matching parity with a hated product is not a winning strategy.

This doc is for the engineering team. It lists fifteen specific architectural and UX inversions where Wolfpack can engineer the product from first principles instead of from incumbent feature checklists. Each inversion includes the legacy pain, our different posture, a credible engineering approach, and an honest assessment of how hard it actually is. The point is to make explicit decisions about what we are doing differently and why, not to pile up marketing claims.

---

## The fifteen inversions

### 1. Conversational workflow as primary interface, menus as fallback

**Legacy pain:** CDK Drive's main interface is a green-screen menu navigated by hotkeys and codes. Reynolds ERA-IGNITE is similar. Dealership staff spend significant unproductive time clicking through nested menus to do tasks they could describe in one sentence.

**Our inversion:** The primary input is natural language (typed, voice, or photo). The dealership says what they want; our agents translate that into structured operations against the data layer. Menus exist as a fallback for staff who prefer them, but the default path is conversational.

**Engineering posture:** Build an intent classifier on top of the Instinct cost-routing core. Every workflow has a structured-operation equivalent that an LLM can map an intent to. State is event-sourced so every conversational command becomes a recorded action with an audit trail.

**Honest difficulty:** Medium-hard. The intent classifier needs to be reliable above 95 percent for trust. Voice input is the hardest part because dealership floors are loud. We can ship typed and photo-based input fast; voice input is a phase-two deliverable.

### 2. Person-centric data model, not deal-centric

**Legacy pain:** CDK and Reynolds organize the universe around deals and vehicles. A customer who buys in 2018, services through 2022, and trades in 2024 lives in three different records that the DMS does not unify well. This is the single most consequential schema mistake of legacy DMS.

**Our inversion:** The customer is the primary record. Deals, services, leads, communications, and trade events all attach to one person across rooftops, channels, and years. Multi-rooftop dealer groups see the full cross-store history of every person.

**Engineering posture:** Person identity service from day one. Match keys: phone, email, SSN-last-four, driver's license number, address fingerprint. Deduplication runs continuously. Every other table foreign-keys to `persons`. CDK can never catch up to this without rewriting their core schema, which they cannot afford to do without breaking thirty years of customer integrations.

**Honest difficulty:** Medium. Identity resolution at scale is well-trodden. Hard part is gracefully handling identity merges and unmerges when humans correct misidentifications.

### 3. Event-driven architecture, not batch-and-report

**Legacy pain:** CDK runs on nightly batch jobs. Reports are stale by morning. Notifications arrive hours after the event. The dealership's real-time reality is invisible to the DMS.

**Our inversion:** Every state change is an event published to an internal event bus. Subscribers (UI, integrations, notifications, analytics, audit log) react in milliseconds. Reports are projections computed continuously, not jobs that run at 3am.

**Engineering posture:** Event sourcing as the foundation. Postgres logical replication feeds Qdrant and Neo4j (already wired via our triple-write pattern). Server-sent events push UI updates. Internal pub/sub bus on top of Redis or Postgres LISTEN/NOTIFY.

**Honest difficulty:** Medium. Already partially in our stack via triple-write. Cost of going all-in is mostly the discipline of writing every mutation as an event from day one.

### 4. Real-time inline compliance copilot, not separate compliance module

**Legacy pain:** CDK has a compliance module you go to AFTER structuring a deal. By then a TILA disclosure error or Reg B violation is already on the deal jacket and the customer has signed. The fine arrives later. Dealers pay millions a year in fines that were avoidable at the deal-structure step.

**Our inversion:** Compliance runs inline, in real time, on the deal-structuring screen. As the F&I manager adjusts APR, term, products, and fees, our agent shows green or red against TILA, FCRA, Reg B, Reg V, ECOA, FTC dealer rule, plus state-specific extensions. Violations are caught before signature, not after funding.

**Engineering posture:** Rule engine + agent reasoning layer. Rule engine handles the deterministic statutory checks. Agent handles the judgment-call edges where context matters. Both run sub-second on every keystroke against the in-progress deal. Already articulated as Wedge E in the GTM strategy; this is the engineering manifestation.

**Honest difficulty:** Medium. Compliance rules are well-documented. Per-state nuance is the pain. Hardest part is making the UI surface the warnings without making the F&I manager hate the system; we cannot just block their work.

### 5. Mobile-first across every workflow

**Legacy pain:** Service writers carry tablets running CDK in a browser. The browser-based CDK experience is terrible because CDK was designed for desktop. F&I managers cannot work from anywhere but their office. Sales managers tracking floor activity have to walk back to their desk.

**Our inversion:** Every workflow renders on a phone. Every screen is touch-first. Critical workflows (vehicle walkaround, lead intake, service write-up, deal approval) are designed mobile-first and adapted up to desktop, not the other way around.

**Engineering posture:** Next.js + responsive design enforced via Playwright tests at every viewport. Phone-specific patterns (camera capture, voice input, geolocation) are first-class, not bolt-on. Already mostly implemented in current Wolfpack Auto code; just need to enforce as a non-negotiable invariant in every new feature.

**Honest difficulty:** Low to medium. The hard part is discipline. Easy to slide into desktop-only patterns when a feature is complex.

### 6. AI workflow inference instead of explicit data entry

**Legacy pain:** Dealership staff type. A lot. Customer phone number gets typed three times (sales intake, F&I deal, service appointment) because the DMS does not bridge them. License info gets typed from a paper copy. Vehicle data gets typed from a window sticker.

**Our inversion:** Photo of driver's license auto-extracts identity. Photo of window sticker auto-extracts VIN + trim + options. Photo of a competitor's offer extracts the deal terms. Photo of a check extracts amount and routing. The dealership stops typing.

**Engineering posture:** OCR + structured extraction pipeline using vision models. Photo upload becomes a structured object via Instinct's cost-efficient routing (cheap model first, fall back to expensive only when extraction confidence is low). All extracted data is editable before commit; we never act on extracted data the staff has not confirmed.

**Honest difficulty:** Medium. OCR quality on field photos is the limiting factor. Lighting, glare, angle. We can hit good-enough quickly; perfect is a year-long quality climb.

### 7. Unified pricing, no per-module tax

**Legacy pain:** CDK pricing is per-module, per-seat, per-integration, per-feature. Adding online retailing costs extra. Adding F&I menu costs extra. Adding a third-party integration costs extra plus a Fortellis fee. The bill is impossible to predict.

**Our inversion:** One flat platform fee per rooftop, all-in. Inventory, CRM, F&I, service, accounting, integrations, reporting. No add-on tax. Stripe-style transparent pricing on the public website. Dealer principal can sign a contract in an afternoon instead of a six-month negotiation.

**Engineering posture:** Not really an engineering decision, but enforced via product architecture. Every "module" is just another view into the same data layer, with the same auth and the same billing relationship. Building feature toggles for "did this customer pay for this module" creates the wrong organizational incentives. Refuse to build them.

**Honest difficulty:** Trivial engineering. Hard organizational discipline because it forecloses some revenue optimization plays.

### 8. Open API by default, paid only for support and write-rate

**Legacy pain:** CDK Fortellis charges third parties to access dealer data the dealer owns. Integration partners pay to play. New entrants are throttled at the source. CDK's moat is partly built on integration friction.

**Our inversion:** Free authenticated read API for every dealer's own data. Documented OpenAPI spec. Webhooks free. Outbound write API paid, rate-limited, supported. Every integration partner becomes a Wolfpack advocate because we made their life easier than CDK ever would.

**Engineering posture:** Already mostly there via our auto-generated OpenAPI (`public/openapi.json` covering 278 routes today). What is missing is the deliberate posture: read access without certification, write access with reasonable rate limits, public documentation. Plus a developer portal at `developers.wolfpack-auto.com`.

**Honest difficulty:** Low engineering, medium product. The hard part is the political decision to invert the integration tax model.

### 9. Self-serve onboarding for independents, white-glove for groups

**Legacy pain:** Onboarding to CDK takes 6 to 12 months and costs $100K-500K in consulting. Reynolds is similar. Independent dealers cannot afford this and end up on cobbled-together stacks of QuickBooks plus CRM tools.

**Our inversion:** Independent dealer signs up online, runs through a four-hour wizard, and is live the same day. Multi-rooftop franchise groups get our white-glove onboarding team, but the migration tools themselves are the same self-serve pipeline plus a customer success layer on top.

**Engineering posture:** Migration toolchain as a first-class product, not an internal services capability. Every CDK / Reynolds / Dealertrack schema we have ever seen becomes an automated import. Already articulated as Wedge G in the GTM strategy. Engineering investment is real but bounded; agentic data engineering is exactly what our stack is built for.

**Honest difficulty:** Medium-hard. Schema mapping at the edges is where most of the bugs live. We will not nail every migration on the first dealer. Failure mode is critical because data loss kills trust forever; parallel-run reconciliation is the discipline that prevents that.

### 10. Embedded BI, not bolt-on reporting

**Legacy pain:** Dealers buy a separate BI tool (Tableau, PowerBI, custom) because their DMS reporting is static and slow. The DMS sees the data but does not let dealers query it.

**Our inversion:** Every dealer can query their own data in plain English. "How many CRVs sold last month by salesperson?" returns a chart in two seconds. Saved queries become dashboards. Dashboards become alerts. No separate BI tool needed.

**Engineering posture:** Natural-language-to-SQL over Postgres, with semantic context from Qdrant on past queries the dealer ran. Cached results via Redis. Output renders as Markdown, table, or chart. Built on top of Instinct's cost-routing so a typical question costs us cents in LLM spend, not dollars.

**Honest difficulty:** Medium. NL-to-SQL has matured enough to be production-credible for the kinds of queries dealers actually ask. Edge cases (multi-rooftop, multi-year, multi-currency) need careful guards.

### 11. Single product surface, not five linked products

**Legacy pain:** CDK Drive plus CDK CRM plus CDK Service plus CDK Online Retailing plus CDK Marketing are technically integrated but the integration is shallow. Different UX, different keyboard shortcuts, different data models, different bills.

**Our inversion:** One product. One UX. One auth. One billing relationship. The "modules" are just navigation, not separate engineering surfaces.

**Engineering posture:** Already true in our codebase. The discipline is to never let a new module become a separate codebase. New domain capabilities become new routes inside the same Next.js app, sharing the same auth, the same data layer, the same UX primitives.

**Honest difficulty:** Trivial engineering at our current scale. Risk emerges around the 100-engineer mark when teams want to own separate codebases. Address that later, not now.

### 12. Continuous learning system on every dealer's data

**Legacy pain:** CDK does not learn from its customers. The same product ships to the dealer in Iowa and the dealer in California with the same defaults, the same workflows, the same recommendations. Every dealer's data is wasted potential.

**Our inversion:** Each dealer's data trains routing decisions, deal recommendations, service drive optimization, customer-disappearance prediction, and inventory pricing. Aggregated patterns across all dealers improve recommendations for everyone, anonymized. Each customer becomes a smaller advocate for staying with us as their tenure increases.

**Engineering posture:** Already articulated in our analytics brain and ML learning loop docs. Engineering work is mostly already done; the inversion is treating it as the primary product feature, not a back-of-house improvement. Surface "what your data taught us this month" as a visible product surface for the dealer.

**Honest difficulty:** Low engineering, medium product surface design. The hard part is making the learning visible without being creepy.

### 13. AI sales-rep simulator for onboarding new staff

**Legacy pain:** A new salesperson takes 2 to 4 weeks of shadowing plus 40 hours of CDK training to become productive. Dealership staff turnover is 50 percent annually in some markets. This is a continuous cost dealers eat.

**Our inversion:** New staff member spends two days in a simulator where they sell cars to AI customers running through realistic objection patterns. Their performance is scored, their weak points coached, their confidence built. They walk on the floor on day three already knowing the system.

**Engineering posture:** Multi-agent simulation harness on top of Instinct. AI customer agents have realistic personalities, financial profiles, vehicle preferences, and objection patterns drawn from anonymized dealer data. Coaching agent observes the trainee, surfaces feedback, tracks progress over multiple sessions.

**Honest difficulty:** Medium. The simulator quality determines whether dealers trust it. Easy to build a bad simulator; harder to build one that actually trains. Worth piloting with one early customer before declaring it a product.

### 14. Webhook + event stream to anywhere

**Legacy pain:** Want your CRM updated when a deal funds? Pay Fortellis. Want Slack notified? Pay Fortellis. Want your BI dashboard refreshed in real time? Pay Fortellis. Or wait for the nightly batch.

**Our inversion:** Every dealer event is published to a public webhook endpoint of their choosing. They can stream events to Slack, their CRM, their BI tool, their custom apps. Standard webhooks, signed payloads, replay on failure. Free.

**Engineering posture:** Already partly there via `webhook_outbound_subscriptions` (migration 034). Make it first-class: documented event schema, dealer-configurable filters, retry policy with exponential backoff, dead-letter queue, status dashboard.

**Honest difficulty:** Low engineering. The discipline is publishing every event we generate, not just the ones we think dealers might want.

### 15. Outcomes-tied pricing for managed customers

**Legacy pain:** CDK pricing is fixed regardless of dealer success. The DMS bills the same whether the dealership grew 30 percent or shrank 30 percent.

**Our inversion:** For managed-service customers (Wedge B in the GTM strategy), we share in outcomes. Our managed-customer fee is partly fixed and partly tied to gross PVR uplift, lead-to-sale conversion, or unit growth. We win when they win.

**Engineering posture:** Outcomes measurement layer that joins dealer-level KPIs to our managed-services billing. Monthly reconciliation against agreed targets. Same data plumbing that runs the savings-measurement layer in Instinct.

**Honest difficulty:** Low engineering, medium contractual complexity. The hard part is writing the outcomes contracts so neither side feels gamed.

---

## Engineering principles that make these inversions cheap to build

The fifteen inversions above are not fifteen separate engineering bets. They share a small set of architectural principles that, if we get them right, make every inversion easier to ship:

1. **Event sourcing as the foundation.** Every mutation is an event. Every view is a projection. Audit, replay, and time-travel come for free.
2. **One data layer for the dealership.** Postgres for source of truth, Qdrant for semantic, Neo4j for relationships. Triple-write pattern already in place.
3. **LLM-mediated input, structured output.** Voice / photo / chat in, structured operations out. Cheap-routing under the hood via Instinct.
4. **Real-time first.** Server-sent events to every connected UI. Webhooks to every external system. No batch jobs that are not literally end-of-day accounting.
5. **Mobile-first viewport.** Enforced via Playwright at every viewport for every new feature.
6. **API-first.** Every screen has an API, every API has a documented OpenAPI spec, every spec is publicly accessible.
7. **Tenancy and identity at the foundation.** Multi-rooftop, person-centric, RLS-enforced. Built once, never refactored.
8. **AI cost discipline.** Every LLM call goes through our cost-routing layer. No naked API calls.

These principles are not aspirational; they are how new code gets accepted in code review. If a feature ships without event sourcing, with desktop-only views, or with a per-module silo, it fails review and gets rewritten.

---

## What to actually build first

Sequence matters. We do not build fifteen things at once.

**Phase 1 (already in motion via Wedges D and E):**
- Inversion 4 (inline compliance copilot) ships with Wedge E.
- Inversion 8 (open API, free read access) is mostly already true; we make it deliberate.
- Inversion 11 (single product surface) is already our architectural posture.
- Inversion 14 (webhook + event stream) is already partly built and gets hardened.

**Phase 2 (months 3-6):**
- Inversion 1 (conversational workflow) gets the first credible MVP on sales-intake + lead routing.
- Inversion 6 (AI workflow inference) ships photo-based extraction for driver's license + window sticker first.
- Inversion 7 (unified pricing) becomes our public pricing page (already shipped this week).
- Inversion 10 (embedded BI) ships natural-language-to-SQL on the dashboard.

**Phase 3 (months 6-12):**
- Inversion 2 (person-centric data) gets the multi-rooftop unification layer.
- Inversion 3 (event-driven architecture) becomes the explicit default for every new feature.
- Inversion 9 (self-serve onboarding plus Wedge G migration tooling) ships as a productized capability.
- Inversion 12 (continuous learning visible to dealer) gets a dashboard surface.

**Phase 4 (year two):**
- Inversion 13 (sales-rep simulator) is a phase-two product extension.
- Inversion 15 (outcomes-tied pricing for managed) ships with the managed-services Wedge B expansion.
- Inversion 5 (mobile-first across every workflow) becomes a formal compliance gate for new feature shipping.

---

## Honest assessment

This list is engineering-credible because every inversion either uses our existing stack or extends it in a direction we already have proven capability in (multi-agent, RAG, browser automation, triple-write, cost-routing). None of it requires us to be lucky on a research breakthrough.

The biggest risk is not engineering, it is discipline. The temptation to ship features that match incumbent parity will be constant once we have paying customers asking for "the thing CDK does." Refusing to ship parity features that violate these principles is the hardest part.

The second biggest risk is sequencing. We cannot do all fifteen inversions in year one. The Phase 1-4 ordering above is a real prioritization, not aspirational. If we try to do everything we will ship nothing well.

The competitive question is whether incumbents can copy any of this. The honest answer is: yes, on individual inversions, but slowly. CDK can add a chat UI in 18 months. Reynolds can add webhooks in 12 months. Tekion can add NL-to-SQL in 9 months. Our advantage is not any single inversion; it is shipping all fifteen as the default product over a 12-18 month window while incumbents are still trying to add the first.

The window closes when one of those three has a credible AI-native product that hits even half of these inversions. Estimated window: 18-24 months before serious competitor reaction. Plenty of time if we ship with discipline. None of it if we drift into incumbent-parity work.
