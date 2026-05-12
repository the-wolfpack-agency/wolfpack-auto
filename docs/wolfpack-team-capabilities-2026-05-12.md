# Wolfpack team capabilities and product implications

**Date:** 2026-05-12
**Author:** Wolfpack CTO
**Status:** Anchor doc for product strategy. Other docs reference this for the team-leverage frame.

This doc exists because earlier product planning treated Wolfpack like a 5-person tech startup looking for product-market fit. That framing was wrong. Wolfpack is a domain-led agency with deep auto-industry credentials and operating client relationships, where tech is a force multiplier on existing expertise rather than the primary value. Every product decision below should reflect that.

---

## Team composition (capability-first view)

| Member | Capability | Product seat |
|---|---|---|
| Nick Hoxsie (CEO) | Auto-industry domain, strategic relationships, OEM and dealer-principal trust at the executive level | OEM relationship lead (Porsche/PCNA); product strategy; renewal motion |
| Jorge | Deep industry knowledge across Audi, Kia, and others; cross-OEM relationships; client-facing strength | Cross-OEM relationship lead; industry intelligence; trade-show presence; pitch credibility |
| Zocchi | Highly regarded trainer and course content builder | Literacy OS ontology lead; curriculum design across role-specific surfaces; certification program author |
| Max | Video guru; professional commercials; rolling auto shots; broadcast-quality production | Dealer + OEM content production lead; vehicle walkaround/commercial pipeline; training-video studio; event capture |
| Megan | Master designer | Platform UI/UX; brand systems per OEM-themed instance; deliverable design (F&I Audit PDF, training assets, client-facing materials) |
| Alicia | Project management; hospitality background; client-class setup | White-glove onboarding; in-person training event delivery; client success and account management |
| Nick Homyk (CTO) | Tech leadership, AI, agent ontology, CI/CD, certified in Microsoft AI; built tech teams and full development processes; quality-process-led acquisition exit | Platform engineering; AI infrastructure; data flow and learning loops; quality and CI |
| Entire team | Strong with client relationships across all roles | Sales is distributed across the team; every team member is a credible client-facing presence |

Wolfpack has won PCNA's JD Power awards multiple years running on the back of training and dealer-excellence work. That outcome is the strongest single proof point Wolfpack has, and it is structurally hard for any pure-software competitor to match because the win is a function of the integrated work the team does, not of a feature set.

---

## Capability implications for the product roadmap

### What changes about the strategic frame

Wolfpack does not sell software. Wolfpack sells **measurable improvements in dealer performance**, delivered through an integrated program of training, content, software, and ongoing engagement. The software (Wolfpack Auto + Literacy OS + F&I Audit) is the durable spine and revenue-recurrence mechanism. The team is where the value originates.

This means we are not in CDK's or Tekion's market. We are in the market for the dealer's training, content, and customer-experience budget, with software as the delivery mechanism for outcomes the team can credibly produce.

### What changes about each in-flight product

- **Wolfpack Auto (the DOS):** repositions from "modern DMS competitor" to **OEM-aligned dealer-experience platform**. Integration with CDK / Reynolds / Cox is treated as table stakes, not competition. The platform delivers the team's outcomes; it does not try to replicate every feature in legacy DMSes.
- **Literacy OS:** the engineering primitive is the ontology engine. The CONTENT that fills it is Zocchi's authoring work, productized. The hire concern from `docs/literacy-os-strategy-2026-05-12.md` partially dissolves because the team already has the senior trainer / curriculum designer; what we hire later is content production scale.
- **F&I Penetration Audit:** reframes from cold-outbound SaaS lead-magnet to **engagement-opener for OEM and direct-dealer conversations**. The deliverable PDF gets Megan-designed. The audit results route into the Literacy OS recommendation flow once a dealer joins the program. Direct-to-dealer audit remains available for inbound leads who aren't part of an OEM engagement.
- **Video / content pipeline (NEW priority):** Max's capability is a moat I had not weighted. Vehicle walkaround content, dealer commercials, training video production, OEM-brand-compliant social content are areas where every dealer is weak and Wolfpack is broadcast-grade. This deserves its own product surface in the platform: a media library + asset management + brand-compliance workflow. New initiative; not in earlier roadmap docs.
- **Training-event infrastructure (NEW priority):** Alicia's hospitality and class-setup background means in-person training delivery is a credible Wolfpack offering, not just digital content. Platform should support event scheduling, registration, attendee tracking, completion certifications, and post-event follow-up. This is LMS-adjacent functionality that connects the digital Literacy OS to physical training delivery.

### What stays the same

- The engineering already shipped today (migrations 069-075) holds up under the reframe. The DOS infrastructure, BYO-credentials, dealer-own-data analytics, real Edmunds/USPS integration, F&I Audit, Literacy Ontology engine all remain correct work for the platform spine.
- The decision to position as "speak dealer, not data" in `.ai/client-context.md` becomes even more correct because the team's training expertise is the embodied form of that principle.
- The premortem convergence point on "portfolio dilution" is still live and arguably worse, because the team can credibly attempt more product surfaces than a typical 5-person team. Scope discipline matters more, not less.

---

## What this means for product priority

A revised year-one priority list under the team-led frame:

1. **Productize the Dealer Excellence Program** (see `docs/dealer-excellence-program-2026-05-12.md`). The annual engagement structure becomes the primary offering. Software is the delivery and renewal mechanism, not the SKU.
2. **Lead-OEM motion via existing relationships** (see `docs/oem-led-gtm-strategy-2026-05-12.md`). PCNA is the most likely lighthouse but is not the only path; Jorge's Audi/Kia connections, Hoxsie's broader OEM network, and team-member relationships at Porsche / Toyota / international OEMs are all valid entry points.
3. **Literacy OS authoring goes operational** under Zocchi as lead. Engine + first 200-500 mappings curated in the next 90 days. Zocchi + CTO collaborate; AI expansion runs as a tooling layer per the existing zero-tokens-first invariant (build the authoring tool, run it, review proposals; do not have AI free-form generate content).
4. **F&I Audit PDF gets a Megan-designed revision** before publishing to any OEM or direct-dealer prospect. The current generator output is functional; a designer pass makes it client-quality.
5. **Video pipeline initiative** scoped for year-one Q3-Q4. Max owns content production; CTO scopes the platform surfaces (media library, asset management, brand-compliance workflow). New migration target in the Q3 sprint.
6. **Training-event infrastructure** scoped for year-one Q4 alongside the Literacy OS Q3 work. Alicia owns delivery; platform supports scheduling and certification flows.

---

## Honest pushback I still want on record

The team-led reframe is more accurate than the tech-startup frame I had been using, but it does not eliminate every risk.

1. **Capacity is finite.** Five-to-seven people delivering an integrated services+software program at OEM scale is non-trivial. Year-one capacity planning has to be explicit. What does each team member spend their time on, and what gets dropped to make room? This needs a written allocation, not assumed.
2. **Services-led revenue is hard to model and slow to recognize.** Annual program contracts at OEM scale have long sales cycles (12-18 months from intro to signed PO), heavy deliverables, and renewal-cycle dependencies. Cash flow needs bridge revenue (consulting work, direct-to-dealer engagements) until the first OEM contract materializes.
3. **Team-led value is harder to defend if a key member leaves.** The platform spine is durable. The team-delivered value is concentrated in named individuals. Retention and documentation become strategic assets, not HR niceties.
4. **Brand and IP overlap with existing client work.** PCNA work that won JD Power awards may have IP or non-compete clauses we need to be careful about. Productizing methodology that was developed in client engagements requires legal review before broad distribution.

---

## Bottom line

The product strategy needs to be a team-led integrated offering, with software as the spine and recurring revenue mechanism, not a tech-startup SaaS hunt. The engineering shipped today is correct work for the platform; the GTM and product positioning need the reframe documented in the companion strategy docs.

Companion docs landing in the same session:
- `docs/dealer-excellence-program-2026-05-12.md` — the integrated services+software offering structure
- `docs/oem-led-gtm-strategy-2026-05-12.md` — the OEM-led go-to-market motion
- `docs/literacy-os-strategy-2026-05-12.md` — updated to reflect Zocchi/Megan/Alicia roles
- `docs/fi-audit-wedge-spec-2026-05-12.md` — updated as engagement-opener, not cold-outbound wedge
