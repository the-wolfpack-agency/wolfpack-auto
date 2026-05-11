# What Legacy DMS Over-Optimize, and Where We Simplify

**Author:** Nick Homyk (CTO)
**Date:** 2026-05-11
**Status:** Strategic engineering doc
**Companion to:** `wolfpack-auto-inversion-engineering-2026-05-11.md`

---

## The honest framing

Legacy DMS (CDK Drive, Reynolds ERA-IGNITE, Dealertrack DMS, Tekion ARC) are not bad products at everything. They are extremely good at a narrow set of problems and unaddressed at everything else. Understanding which is which is the strategic frame for Wolfpack Auto.

**What legacy DMS over-optimize for:**
- Survive audit. Every receivable, payable, journal entry, and transaction recorded with full provenance.
- Generate the monthly factory statement for the OEM.
- Satisfy compliance record-keeping (TILA, FCRA, ECOA, Reg B, Reg V, GLBA, state laws).
- Print legally correct documents (titles, lender paperwork, lien filings, registrations).
- Calculate tax in 50 states (correctly enough to not get sued).
- Process insurance and warranty claims with the right document trail.

These are real and necessary. CDK is good at them. We need to be good at them too, but they are table stakes, not differentiators.

**What legacy DMS are bad at or do not compete in:**
- The customer experience of finding, buying, and financing a car.
- The employee experience of using the system on a daily basis.
- Anything physical or spatial about the dealership itself.
- Learning from data and improving over time.
- Modern integration patterns (API, webhooks, real-time events).
- Mobile use cases.

This is where Wolfpack Auto wins, because incumbents structurally cannot turn their attention here without abandoning the compliance and audit work that keeps them paid. Building a customer-experience-first DMS is not a feature competition; it is a category redefinition.

The rest of this doc walks the six areas you raised and identifies what is over-engineered today, what is actually broken, and how we simplify.

---

## 1. Car finding process

### What incumbents over-optimize

CDK and Reynolds inventory modules have hundreds of filterable fields. Stock walks generate thirty-dimension reports. The inventory schema accommodates every possible vehicle attribute the OEM might require for warranty filings, fleet contracts, or pricing-program eligibility. Vehicle records carry 200+ columns.

This is over-engineered for back-office reasons. The sales floor reality is that nobody uses 95 percent of those fields. Reps default to two or three filters (make, model, price range), then walk the customer to the lot.

### What is actually broken

- The customer cannot find the car easily themselves. Inventory search is rep-mediated, not customer-mediated, even though customers want to self-serve now.
- Photos are inconsistent across the inventory because each rep uploads them on their phone. Some cars have eight beautiful shots; others have two blurry ones taken in the rain.
- "Comparable vehicles" recommendations are rule-based (same make, similar year, similar price) and produce uninteresting suggestions. They do not learn from what actually closed.
- Cars sit on the lot because nobody physically walks them. The system knows what is in inventory but not what is selling or what is dying.
- Stock walking is a paper-and-clipboard exercise at most stores in 2026.

### What we simplify

- Customer-facing inventory search that takes natural language input. "Compact SUV, all-wheel drive, under 35K, room for three car seats." LLM ranks the inventory, returns the top eight matches with explanation.
- Standardized vehicle photo pipeline. Every car gets photographed the same way (same angles, same backgrounds, AI-corrected lighting). Already partly built in Wolfpack Auto's vehicle-backgrounds work.
- Learned "likely to sell" and "likely to die on the lot" scores. Trained on each dealer's own historical data. Cars that match closed-deal patterns get surfaced; cars that match aged-out patterns get flagged for price action.
- Mobile stock walk app. Rep walks the lot, taps "I just looked at this car," logs visual condition, the system updates the world model. Eliminates the paper clipboard.
- Vehicle history attached to inventory: how many times has each car been walked past, viewed online, asked about, test driven. Powered by the IoT layer (Section 5).

**Engineering cost:** Low-medium. Natural-language search is already a default capability in our stack. The hard part is the photo pipeline and the inventory analytics, both of which are bounded engineering work.

---

## 2. Car buying process

### What incumbents over-optimize

Deal jackets in CDK have 47 different document types. The deal-structuring UI is built to satisfy every possible state lender form, every captive finance contract, every CPO program, every lease vs. retail distinction. Buyer's order forms were designed for dot-matrix printers in 1992 and then "digitized" by photographing the paper form and rendering it on screen.

The system is engineered to never leave a state where a deal cannot fund, which is a worthwhile goal. But it achieves that goal by making the deal-structuring path a maze of forms with hundreds of fields, dozens of which apply to any given deal.

### What is actually broken

- The customer signs 30+ documents at the end of the deal, in a small office, often after waiting two hours, with no idea what most of them say.
- Total time in dealership for a single purchase: 3-6 hours. The customer's actual interest in the purchase fades in the second hour and what comes after is friction they tolerate, not buy-in.
- Test drives are scheduled by phone and SMS. No online booking that talks to inventory and rep availability.
- Trade-in valuation is opaque. Different appraisers come up with different numbers. The customer has no way to validate the appraisal and no idea what their car is actually worth.
- Online retailing tools exist (CDK Online Retailing, Tekion Digital Retail) but the real deal still happens in person. Online is a lead-gen funnel, not a real purchase path.
- The customer does not know their out-the-door price until F&I, which is the last step. By then they have invested too much time to walk away.

### What we simplify

- Customer pre-signs the structural docs at home in 15 minutes. Arrives at the dealership only to physically inspect, test drive, and finalize. Total in-dealership time goes from 3 hours to 45 minutes.
- Out-the-door price published on the website per VIN, locked, with full line-item breakdown. No hidden fees revealed in F&I.
- Trade-in valuation via photo upload + VIN + odometer + condition self-report. Customer gets a firm offer that the dealer commits to honoring at trade-in, contingent only on physical inspection matching the report. Powered by computer vision and our analytics brain.
- Test drive booking online, with real-time inventory availability and rep schedules. Customer picks a 30-minute slot, the system confirms, the system reminds.
- "Buy mode" view for sales staff that surfaces ONLY what this specific deal needs. No 47-document jacket. Just the four documents that apply to THIS deal in THIS state for THIS customer profile, dynamically assembled.
- Real-time deal progress visible to customer on their phone. They see what is happening, what is left, when they will be done. Reduces the anxiety that fuels deal walk-aways.

**Engineering cost:** Medium. The hardest parts are the trade-in valuation model (real ML work, possibly partnered with Manheim Market Report data) and the document dynamic-assembly engine (state-aware, lender-aware). Both are bounded by well-understood techniques.

---

## 3. Financing and screening

### What incumbents over-optimize

CDK's lender portals each have separate UX, separate forms, separate workflows. F&I managers learn to navigate seven different lender portals (US Bank, Wells, Capital One, Ally, etc.), often with overlapping but slightly different applications. Compliance modules are separate from the deal screen.

The system optimizes for getting the legally correct disclosure trail no matter how the deal gets structured. It does not optimize for finding the best deal for the customer or the dealer.

### What is actually broken

- The customer fills out a credit application three times: at sales intake, at F&I, at the lender portal. Each is slightly different. Each takes 10-15 minutes.
- Credit gets pulled multiple times unnecessarily. Every pull counts as a hard inquiry against the customer's score. F&I managers know this is bad and try to game the system; the system makes the gaming necessary.
- Lender shopping is sequential. F&I submits to Lender A, waits, gets a stip-loaded approval, submits to Lender B, waits, restructures. Parallel submission exists in some systems but is rare.
- Deal restructuring after a lender comes back with stips takes 30-60 minutes of manual recalculation.
- The customer does not see their realistic APR + monthly range until F&I, even though every customer would prefer to know it during shopping.
- Subprime lender quirks (max LTV based on a specific NADA value, mileage limits, year limits, certain trim levels excluded) live in F&I-manager head knowledge. They are not encoded anywhere the system can use them.

### What we simplify

- One credit application. Customer fills it out once on the website at pre-shopping or in F&I, never again. Same form feeds every lender submission.
- One soft credit pull at pre-qualification. Parallel-submitted to 8-12 lenders simultaneously. Returns firm offers within 60 seconds. Customer sees their real options, picks the one that fits.
- Lender quirks (stip patterns, LTV rules, mileage caps, year limits) encoded in our lender-rules engine. Updated continuously based on observed approval and decline patterns. Each dealer's deal history makes our rules engine smarter for that dealer.
- Real-time deal restructuring. F&I changes term from 60 to 72; the system instantly recalculates payment, APR options, lender eligibility, gross profit, customer monthly. No spreadsheet wizardry.
- Inline compliance copilot (already articulated as Wedge E). Live warnings on TILA, FCRA, Reg B, Reg V, state usury rules. Catches violations during structuring, not after funding.
- Customer-facing financing transparency. They see realistic APR ranges based on their soft-pulled credit before they pick the car. No bait-and-switch in F&I.

**Engineering cost:** Medium-hard. The lender rules engine is real ML + rules hybrid work. Real-time multi-lender parallel submission requires integrations with each lender's API or portal; the long tail of lender integrations is the work. RouteOne and Dealertrack Credit cover a lot of it but not all.

---

## 4. Easy onboarding and use by employees

### What incumbents over-optimize

CDK trains its power users for 40 hours and then optimizes the experience for those power users. Hotkey-driven workflows, hundreds of menus, customizable per-user views. The system is built for the senior F&I manager who has used CDK for 15 years and can navigate by muscle memory.

This is over-optimized because dealership staff turnover is 50 percent annually in many markets. At any given time, half the staff is in their first six months. They never reach the power-user state CDK assumes.

### What is actually broken

- A new salesperson takes 2-4 weeks of shadowing plus 40 hours of CDK training to become productive.
- New F&I manager: 30-60 days minimum before they can run a deal cleanly.
- New service writer: 2-3 weeks of side-by-side with a veteran.
- Job shadowing is the actual training mechanism, which means veteran staff spend significant unproductive time training newbies, which the dealership eats as a cost.
- Documentation is unfindable inside the system. Help links go to PDFs from 2018.
- Per-role views are an afterthought. Sales staff see F&I fields they should not be touching. F&I sees inventory adjustments they should not be making.

### What we simplify

- AI sales-rep simulator (covered in inversion doc, #13). New rep spends two days against AI customers running realistic objection patterns. Walks on the floor on day three already productive.
- Role-aware default views. Sales staff never see F&I-only fields. F&I never sees inventory cost adjustments. Visibility derived from role + dealer policy + state regulations, not configured per user.
- Inline assistant that answers "how do I X" in context, without leaving the workflow. "How do I add a co-buyer to this deal?" gets a one-paragraph answer plus a button that does it.
- Onboarding wizard for new staff: 30 minutes, covers the workflows that role will actually do. Not a 40-hour course.
- Built-in training mode. New rep can practice creating deals, running credit, structuring F&I without affecting real data. System tracks their progress, surfaces gaps, certifies them when ready.
- Continuous coaching layer. System notices when a rep takes much longer than peers on a workflow and suggests a 2-minute tutorial. Notices when a rep deals always include a particular fee they could be missing and prompts.

**Engineering cost:** Medium. The simulator is the biggest piece (covered in inversion doc). Role-aware views and inline help are bounded work. The continuous-coaching layer is interesting ML work; first version can be rule-based with ML enhancements later.

---

## 5. IoT and physical-world intelligence

This is where Wolfpack genuinely defines a new category. No incumbent DMS has any IoT or spatial-world capability. Tekion has thin "dealership intelligence" via parking-lot camera integrations from third parties, but it is shallow and not core to the product.

### What incumbents do not do at all

- Locate staff in real time.
- Locate vehicles in real time (beyond the static "this VIN is in inventory" record).
- Locate customers on the lot.
- Surface foot traffic patterns.
- Track key fob movement (a known shrinkage and security pain point).
- Track service-bay productivity at the step level.
- A/B test physical layouts.
- Build any kind of digital twin of the dealership.

### What we build

**BLE/UWB tags on staff name badges.**
- System knows who is where, in real time. Average customer wait time before greeting drops because the BDC manager knows which sales rep is free.
- Customer dwell time per area becomes visible. "This customer has been in the showroom for 14 minutes unattended" pings the floor manager.
- Manager-to-rep proximity tracking helps with the deal manager check-in pattern that increases close rates.

**Tags on key fobs in the key box.**
- "Which sets of keys are out, with which rep, for how long" answered in real time.
- Catches stolen-key incidents quickly. Catches slow test drives. Identifies reps who are not returning keys.
- A real shrinkage and security problem in every dealership, addressed for the first time.

**Tags on vehicles, or use existing telematics when available.**
- Which cars get walked past most. Which cars get sat in but not test driven. Which cars never get touched.
- Surfaces the "dead zone" cars that need price action, repositioning, or merchandising attention.
- Cross-references with deals that closed: which physical positions sell better than others.

**Opt-in customer phone signal via QR scan.**
- Customer scans a QR code on the lot to get a digital walkaround experience tied to specific vehicles.
- In exchange, anonymized heat map of customer foot traffic, lingering time per car, conversion funnel by lot section.
- Privacy-preserving by default. No tracking without explicit opt-in. Aggregated analytics only.

**Computer vision in service bays.**
- Time per service step. Idle time per technician. Where the real bottleneck is in the service drive flow.
- Hourly productivity by technician, by bay, by service type.
- Replaces the 1980s clipboard-and-stopwatch approach to service productivity.

**Smart parking spots (cheap RFID + battery readers, or vision-based).**
- Real-time inventory location. "Where is the 2024 Civic in white" answers instantly instead of via radio call to the lot porter.
- Reduces wasted minutes per deal looking for the car at delivery.

### Honest correction on the low-energy IoT layer

An earlier draft of this section leaned heavily on NFC tap workflows: technicians tapping into bays, F&I managers tapping desks, sales reps tapping cars. That framing is wrong because asking dealership staff to tap things all day is the same friction pattern that made the timeclock universally hated. Nobody is going to remember or want to do it. Any IoT strategy that depends on deliberate tap actions will fail in production.

The correct framing is passive detection: signals that are emitted and read automatically, with no deliberate user action. Staff and customers do nothing different from what they already do, and the system observes them.

### Passive detection options that actually work

**Phone as tag (the cheapest, lowest-friction option).**
Every staff member already carries a smartphone. The Wolfpack mobile app, installed on staff phones, broadcasts a continuous low-power BLE advertisement carrying that staff member's ID. Receivers placed around the dealership detect these advertisements passively. Staff never tap anything. Their phone is the tag. Same pattern Apple uses for Find My and AirTag. Battery cost on the phone is negligible because BLE advertisements are extremely low power. Zero new hardware on the person.

For customers, the same approach works opt-in. "Open the Wolfpack app while you visit for personalized service" gets the customer to install the app, and from that moment their phone is also detected passively at the dealership. They get a better in-store experience (digital walkaround for the car they sat in, personalized rep matching, faster F&I); we get the spatial behavior data.

**Passive BLE badges for staff who do not carry phones.**
Some service technicians do not carry phones on the shop floor for safety and durability reasons. For them, a ruggedized BLE badge clipped to their uniform broadcasts continuously. Battery lasts 1-2 years. Replacement cost is trivial. Cost per badge: $5-20.

**Passive UHF RFID gates for vehicle inventory.**
Cars get a windshield RFID sticker once on intake. Drive-through gate readers at lot entries, exits, and service bay roll-up doors detect the cars passively as they move through. Real-time inventory location with zero porter action required. Reader cost per gate: $1-3K. Tag cost per vehicle: $0.10. A typical dealership needs 4-8 gates total.

**Computer vision for customer detection where opt-in is impractical.**
Customers without the app cannot be detected by BLE. Cameras with on-device person detection and de-identified tracking (no biometric storage, just "person at this location at this time") cover the gap. Already a mature category in retail analytics (RetailNext, Sensormatic). Cost per camera: $300-1,000. Five to ten cameras cover most dealerships.

### Where NFC still makes narrow sense

NFC is not useless. It is useful in the narrow class of workflows where the tap IS the natural action, not friction added to an existing workflow.

- **Key boxes.** Taking the keys off a hook is the action. An NFC reader inside the keybox detects the key fob as the technician removes it. No tap action by the user; the act of taking the key is itself the read. The system instantly knows who has the keys.
- **Walkaround handoffs.** Customer pulls out their phone to scan a QR code or NFC tag on a vehicle they like. The tap is the customer's deliberate action to get information. They WANT the tap because it delivers value (digital brochure, real-time inventory check, deal pre-qualification).
- **Vehicle delivery completion.** Customer signs final paperwork by tapping their phone. The tap IS the signature gesture, equivalent to an Apple Pay confirmation. No added friction.

Outside these narrow workflows where the tap delivers user-visible value, we do not use NFC.

### Service people connected to floor areas via passive detection

- Every technician carries either their phone with the Wolfpack app or a $10 ruggedized BLE badge clipped to their uniform.
- BLE receivers in each service bay detect bay entry and exit passively. No tap. The system knows tech 7 entered bay 3 at 09:14 and left at 10:42, including any breaks in between when they walked back to the parts counter.
- The same receivers handle the showroom, F&I offices, parts area, customer lounge, and parking lot zones.
- Aggregated over time, the system surfaces real productivity, real wait times, real bottleneck zones, and real dwell patterns. Without any deliberate action from the staff.

### Hotspot surfacing without tap actions

- Heatmaps are derived from continuous passive BLE signal from staff and customer phones plus de-identified computer vision of unaffiliated customers.
- "Cars walked past most" emerges from camera vision plus customer phone passive detection in the lot. No NFC needed.
- "Highest-dwell sales offices" emerges from BLE receiver data. No NFC needed.
- "Slowest service bay this week" emerges from BLE tech badges plus UHF RFID gate reads on vehicle entry/exit. No NFC needed.

### Updated engineering cost

The corrected hardware picture, with NFC reduced to its narrow useful role:

- **Phone-as-tag layer (free).** Wolfpack mobile app on staff phones costs nothing in hardware. Opt-in customer phones the same.
- **BLE receivers.** $50-150 per receiver, 15-30 per dealership for full floor coverage. Total: $1,000-4,500 per dealership.
- **BLE badges for non-phone staff (techs).** $5-20 per badge, replaced every 1-2 years. Total: $200-500 per dealership.
- **UHF RFID gates for vehicle inventory.** $1-3K per gate, 4-8 gates per dealership. Total: $4,000-24,000 per dealership.
- **Computer vision cameras.** $300-1,000 per camera, 5-10 cameras per dealership. Total: $1,500-10,000 per dealership.
- **Narrow-use NFC.** Keybox readers, vehicle stickers for handoff. Total under $500 per dealership.

Full deployment range: $7,000-40,000 per dealership depending on which capabilities the dealer wants. Far less than the $80K BLE-only ceiling I cited in the earlier draft, and entirely without the tap friction.

We can also offer a cheap entry tier where a small independent dealer gets phone-as-tag plus a handful of BLE receivers for under $2,000 per dealership and still gets meaningful staff and customer movement intelligence. That tier scales up as they grow.

All signal sources (BLE from phones, BLE from badges, UHF RFID from vehicle stickers, computer vision events, and the narrow NFC uses) normalize into the same `spatial_events` schema at the edge. The intelligence layer above is sensor-agnostic, so dealers can start cheap and expand without any data-model migration.

We do not build the hardware. We build the intelligence layer that turns raw signals into actionable dealership insights. The moat is the AI on top, not the tags or the receivers.

### Why incumbents cannot follow

CDK has no IoT capability and no path to one. Tekion has shallow integrations. None of them have the agentic + ML stack to turn raw spatial data into the plain-English insights dealers actually want. We can have a six-month head start before they can even articulate what to build.

---

## 6. World model of the dealership

This is the deepest version of the IoT bet. Build a digital twin of the physical dealership.

### What this means concretely

A spatially-aware data model where the dealership is not just a database of records but a 3D entity with named regions, parking spots, functional areas, and movement patterns.

- Each parking spot is a named entity (`lot.section_B.row_3.spot_14`) with current occupant, occupancy history, performance metrics (cars sold from this spot vs. cars that aged out from this spot).
- Each functional area (showroom, sales offices, F&I rooms, service drive, parts counter, customer lounge, technician bays) has assigned KPIs and observed performance.
- Each workflow is physical-flow-aware: "customer arrived at front door at 14:02, greeted by Sarah at 14:03, walked to showroom by 14:04, matched with Mike at 14:11, walked to lot section B at 14:18, spent 23 minutes on cars 12-18, sat in car 14, returned with Mike at 14:41 to sales office, F&I started at 17:32, signed at 18:42."

### What this enables

- Heat maps of customer movement. Which areas convert; which areas customers avoid. Direct A/B testing of layout changes.
- Conversion funnel attribution: "Customers who sat in a car for more than 4 minutes converted at 31 percent; under 4 minutes converted at 9 percent." Direct training value for sales reps.
- Simulation of layout changes. "What if we moved the F&I offices closer to the front door? What if we put the Civic display in spot 14 instead of spot 9?" Run the simulation against historical traffic patterns.
- Service bay flow optimization. Identify the technician motion patterns and bottleneck points; reorganize the bay layout based on observed flow.
- Inventory placement intelligence. Some spots have measurably higher conversion. Move high-margin or aged inventory into those spots; move low-margin or fresh inventory to less prime spots.

### Engineering cost: real

Computer vision pipeline trained on dealership cameras + drone imagery for initial 3D model construction. Real-time spatial indexing (a 3D R-tree or similar) for current-state queries. Event sourcing of every spatial event (already a core architecture decision). LLM layer that turns spatial data into plain-English insights.

Honest estimate: $200-500K of engineering across 9-12 months for a credible v1. Plus hardware partnership cost per dealership.

This is not cheap. But it is also not what we ship in month 1. This is a year-two and year-three differentiator. The decision to make now is whether we build the FOUNDATION (event sourcing of spatial events, abstraction over IoT signal sources, the data model for `dealership_spaces` and `spatial_events`) into the schema from day one so we are not retrofitting later.

### Why this matters strategically

Every dealer who installs Wolfpack walks into a digital twin of their own business. They see their dealership the way it actually behaves, not the way they think it behaves. The first dealer who deploys this becomes a permanent reference customer because the insights are too valuable to give up.

No incumbent has this. No incumbent has a path to this. The "DMS is a database" framing prevents them from imagining it. We have the agentic stack and the computer vision capability to actually build it.

### Deeper: auto-generate the world model from public and financial data

The world model is not just "where are customers and staff." It is the entire physical and economic reality of the dealership, automatically constructed from inputs that already exist.

**Inputs we can pull automatically:**

- **Property records.** Parcel data (acreage, footprint, zoning), property tax history, ownership records, assessed value, sale history. Available via county-assessor APIs and aggregators like ATTOM Data.
- **Satellite and aerial imagery.** Lot dimensions, parking spot count, building footprint, surrounding context. Available via Google Earth, Mapbox, or commercial imagery providers.
- **Building floor plans.** Architectural drawings if dealer has them; CV-driven extraction from photos and walkthrough video if not. We build the floor plan automatically.
- **Utility billing.** Power, water, gas, waste collection. Most utilities offer customer-authorized API access. Monthly cost per square foot derivable directly.
- **Lease or mortgage data.** From accounting ledger if dealer is on our books, or via accounting integrations (QuickBooks, Sage, ADP).
- **Insurance policies.** Property, liability, workers comp, garagekeepers, errors and omissions. Annual cost per coverage line.
- **Labor records.** From the dealer's payroll system. Headcount, fully-loaded labor cost, distributed by department and function.
- **HVAC and facility maintenance.** From the dealer's facility management software or scanned invoice OCR.

**What this enables:**

The world model now connects spatial behavior to economic reality.

- "Your service drive generates $X gross per bay-hour and consumes $Y in floor space lease + utilities + labor + tools. Net margin per bay-hour: $Z. Compared to peer dealers in your region: above or below median."
- "Your front-row inventory generates 3.2x the gross per car of your back-lot inventory but occupies the same land at the same lease cost. Move aged units to back-lot, move fresh to front. Expected gross uplift: $X/month."
- "Your showroom is 8,000 sqft and produces $X in monthly gross. Cost: $Y in lease, utilities, cleaning, and staff. Net margin per sqft: $Z. Reallocating 1,200 sqft from low-traffic Section C to expanded F&I queue space could lift throughput by an estimated $W/month based on observed F&I bottleneck patterns."
- "Adding a fourth F&I office would cost an estimated $X in construction based on local contractor pricing benchmarks. Based on observed F&I queue times, it would generate roughly $Y in additional monthly capacity. Estimated payback: Z months."
- "Your power consumption per sqft is 22 percent above peer median. Top single opportunity: HVAC scheduling in the service bay area. Potential savings: $X/month."
- For dealer groups evaluating an acquisition: "Based on the candidate dealership's public data plus your operating efficiency benchmarks, predicted year-one operating margin under your management is $X. Sensitivity analysis on the three biggest variables: ..."

No DMS today does any of this. CDK does not even track building costs as part of dealership performance. We can. The data inputs already exist; they just have never been pulled together into a coherent economic-spatial model.

**Engineering cost:** Real but bounded. Each input (property records, utilities, payroll, accounting) is a partnership integration plus a normalization layer. Twelve to eighteen months for a credible v1 across all six input streams, parallelizable across the team.

The intelligence layer (cost-per-square-foot analytics, ROI simulations, peer benchmarking) is straightforward once the data is in. Most of the work is data acquisition and integration, not novel algorithms.

### The operational unlock: pre-fabricated IoT deployment

The deepest commercial advantage of the world model is not what it tells the dealer once installed. It is what it lets us pre-build before the dealer is even live.

**Today's IoT deployment problem.** When a dealership installs IoT infrastructure (BLE beacons, RFID readers, computer vision cameras, environmental sensors), the process takes 4-6 weeks. Site survey to find optimal beacon placement. Cable runs. Network configuration. Tag pairing with the right inventory IDs. Custom calibration per dealership. Testing. Retesting. Most retail IoT projects fail or run massively over budget because of this deployment friction.

**Our inversion.** Because we have already auto-generated the world model from public and financial data BEFORE the dealer signs, we know:
- Lot dimensions and exact parking spot count and geometry.
- Building floor plan with named functional areas.
- Wifi coverage characteristics (from on-site survey, but informed by floor plan).
- Power outlet locations and circuit topology.
- Typical staff and customer movement patterns predicted from layout and peer-dealer data.

This means we can pre-fabricate the IoT kit at our warehouse:
- Right number of BLE beacons for THEIR lot size, not a generic batch.
- Pre-assigned MAC addresses pre-mapped to specific spot IDs in our database.
- Pre-printed beacon labels matching their actual spot signage.
- Service bay sensors pre-paired with bay IDs.
- Key box readers pre-paired with their keybox positions.
- Camera mounts cut to match their bay ceiling heights.
- Installation diagrams generated from the floor plan, ready for a regional cabling contractor.

**Deployment day becomes install-and-power-on, not configure-and-test.**

A new dealer goes from "we just signed with Wolfpack" to "spatial intelligence is live and writing data" in one or two days. Not four to six weeks.

**Why incumbents cannot copy this.** This pre-fab strategy requires three things working together:
1. The auto-generated world model (which depends on the agentic + CV stack we have).
2. A hardware logistics operation (warehouse, kitting, shipping, install partners).
3. A pricing model that bundles hardware deployment into the platform fee rather than treating it as a $200K consulting project.

CDK has none of these and no path to acquire them. Tekion has the software stack but no hardware operations or world-model capability. We can build the entire chain.

**Strategic implication for Wolfpack Auto's go-to-market.** This becomes the most compelling demo any prospect can experience: "We will have your spatial intelligence live within 30 days of signing, with hardware you do not have to procure, configure, or troubleshoot."

That demo is impossible for any incumbent to match. It is also impossible for any future competitor to match without spending 18-24 months building the world-model + hardware logistics chain we will already have built.

**Engineering and operations cost:** Hardware logistics is the new capability. Estimated $100-300K to set up the warehouse, kitting workflow, install-partner network. Recurring per-deployment hardware cost is the IoT bill of materials, passed through to dealer at small markup ($30-80K hardware per dealership).

Honest framing: this is real operational complexity our team has not done before. The decision is whether to partner with a deployment specialist (e.g., a regional A/V or low-voltage cabling firm) for the physical install, while keeping the kitting and software-configuration capability in-house. Recommended posture: partner for physical install, own the kit-and-configure layer ourselves.

---

## Engineering principles this all enables

The six areas above are not six independent projects. They share a common engineering substrate that, if we build it right from the start, makes every area cheaper to deliver.

1. **Event sourcing of every dealership event**, physical and digital. A customer entering the showroom is an event. A deal restructuring is an event. A vehicle being moved to a new lot spot is an event. Same event bus for both.
2. **Person-centric data model.** Customers, staff, leads, prospects all live in the `persons` table with full history and unified identity. (Inversion #2 from companion doc.)
3. **Spatial data model.** `dealership_spaces` table with parking spots, rooms, areas, indexed for real-time queries. New schema work to add.
4. **Sensor abstraction layer.** Our code does not know whether a location signal came from BLE, UWB, RFID, computer vision, or manual entry. All sensor signals get normalized at the edge.
5. **AI inference layer over everything.** Plain-English insights on top of raw events. Powered by Instinct's cost-routing so even continuous insight generation is cheap.

The reason to make these decisions now, even before we have the IoT product, is to avoid expensive schema migrations later when we add the physical-world layer.

---

## What to actually build in what order

Honest sequencing, anchored to the company's current state and resources.

**Year 1, Phase 1 (months 1-3):**
- Lock the event-sourcing foundation as the architecture default.
- Add `persons`, `dealership_spaces`, `spatial_events` schema even though we do not populate spatial events yet.
- Ship the conversational customer-facing inventory search (Section 1).
- Ship the inline compliance copilot (Section 3, also Wedge E in GTM).

**Year 1, Phase 2 (months 4-6):**
- Ship the customer-facing financing transparency (Section 3).
- Ship the out-the-door price commitment and trade-in valuation tools (Section 2).
- Ship the role-aware default views and inline assistant (Section 4).

**Year 1, Phase 3 (months 7-9):**
- Pilot IoT with one design-partner dealer. BLE name badges and key fob tags. Cheap MVP to validate that the data is real and useful.
- Ship the AI sales-rep simulator (Section 4).
- Ship learned vehicle "likely to sell" scores (Section 1).

**Year 2:**
- Expand IoT to vehicle and parking-spot tracking.
- Begin computer-vision pipeline for service-bay productivity.
- Build the first version of the world model and digital twin.
- Layout simulation features.

**Year 3:**
- Full digital twin per dealership.
- Cross-dealer benchmarking via anonymized aggregated spatial data.
- Predictive layout recommendations.

---

## Honest assessment

This is an ambitious portfolio of inversions. Not all of it ships on time. The IoT and world-model bets are real engineering effort that we should not underestimate. Hardware partnerships add procurement and logistics complexity our team has not previously dealt with.

The right reading of this doc is not "we ship all of this in 12 months." It is "we make architectural decisions now (event sourcing, spatial schema, sensor abstraction) so that when we have customers and revenue to justify the IoT investment, we are 18 months ahead of where we would otherwise be."

Some of these inversions land cheap and fast (Sections 1, 3, 4 are mostly software work in our existing stack). Some are real bets that pay off over years (Sections 5 and 6 are the moats that compound).

The reason to think about all six together is to make sure the schema and architectural decisions support all of them. Once a foundation is wrong, retrofitting is expensive. Picking the right foundation now is the cheapest decision we can make.

The competitive question is the same as the inversions doc: incumbents can copy individual capabilities slowly, but they cannot copy a coherent platform that ships all of this in 18-24 months because their architectural assumptions prevent it. The window is real and worth using.

---

## Scope discipline note (added 2026-05-11)

The IoT and world-model content above is year-two and year-three thinking. It is NOT a year-one build mandate. Reading this doc as a checklist for what to build next would be a mistake.

Year-one engineering focus stays on the revenue-generating software bets: Wedge E compliance engine, Wedge D overlay on legacy DMS, and Instinct cost-efficiency. Those are what generate paying customers. They are also what we have the capability to ship in 12 months with the current team.

The IoT layer is in this doc for three reasons, all of which are compatible with NOT building it in year one:

1. **Cheap architectural prep.** Adding `spatial_events` and `dealership_spaces` tables to the schema, and a sensor abstraction interface in the codebase, takes hours. These sit empty in year one but mean we are not refactoring the schema in year two when we add IoT. This is the only year-one work we actually do on IoT.
2. **Sales narrative.** Having the IoT and world-model vision in the pitch deck helps land enterprise dealer-group deals NOW. Dealers buy systems with a future, not just current features. The vision sells; we deliver the software now and the spatial layer later.
3. **Phone-as-tag for free.** The Wolfpack mobile app needs to exist anyway. Making it capable of phone-as-tag broadcasting from day one is an hours-not-weeks investment because we are building the app regardless.

What we do NOT do in year one:
- Invest in hardware logistics, kitting operations, or install-partner networks.
- Build BLE receiver software, UHF RFID gate integration, or computer vision pipelines.
- Distract Wedge E or Wedge D engineering with IoT work.
- Sign hardware vendor partnerships before we have paying customers asking for IoT.

What triggers year-two IoT work:
- 5-10 paying Wolfpack Auto customers, of whom at least 3 are asking for spatial intelligence specifically.
- Validated demand: customers willing to pay an explicit upcharge for the IoT layer, not just willing to have it bundled.
- Engineering bandwidth: at least one additional engineer beyond the current team specifically allocated to IoT work.

If those three triggers do not hit by month 12, the IoT bet is deferred to year three, not killed but not invested in.

The CTO portfolio strategy doc said "the agency is not constrained by talent or tech, it is constrained by focus." That advice applies to this doc as well. Read this section first whenever planning sprint work.
