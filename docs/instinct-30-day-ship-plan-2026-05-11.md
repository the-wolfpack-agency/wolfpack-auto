# Wolfpack Instinct — 30-Day Ship Plan to v1.0 Public Launch

**Author:** Nick Homyk (CTO)
**Audience:** CEO + founding team
**Companion to:** `cto-portfolio-strategy-2026-05-11.md` (Section 2, Bet 2)
**Date:** 2026-05-11
**Status:** Execution plan, pending CEO sign-off on the items in Section 11.

---

## 1. Executive summary

In 30 days Wolfpack Instinct ships v1.0 as the AI cost-efficiency platform. The lead message is "Cut your AI spend 50-80% without losing outcomes." We deliver: a free AI-spend audit (the front-of-funnel tool, run by Instinct itself), a savings-measurement dashboard, a public pricing page on a base + savings-share model, a marketing site, a sales playbook, an internal-savings case study quantifying what Wolfpack saved running its own consulting operations on Instinct, and trade-secret discipline in place (methodology-vs-implementation separation, NDAs, access controls) so we can run paid audits without giving away the routing logic. Success at day 30 is 5 paying customers or 10 active audit pilots, public pricing live, and a trademark filing initiated on "Wolfpack Instinct" and "Wolfpack Method."

## 2. Current state assessment

The Instinct codebase (`wolfpack-apex`, renamed Instinct on 2026-04-06) is Next.js 16 on Vercel with Postgres (Neon), Qdrant for embeddings, JWT auth, Playwright + Jest test coverage, and migrations through 130. The HEAD as of the latest handoff (2026-05-03, commit `ec66ddc`) is clean: zero high or critical Dependabot or CodeQL findings.

The pieces that already exist and directly support cost-efficiency positioning:

- **Multi-provider AI router** in `src/lib/ai/`: Anthropic, Azure OpenAI, and a draft provider, with a `router.ts` and `response-cache.ts`. This is the technical core of cost routing.
- **Zero-token-first knowledge base** in `(dashboard)/knowledge/`: questions are cached so a repeat ask costs zero AI tokens. This pattern needs to be productized.
- **Brain pack RAG** in `src/lib/brain*`: offline brief cache, ANN index, embeddings; the deduplication and caching surfaces that let us avoid redundant model calls.
- **Doc generation and feature requests** with code-analysis-first paths that fall back to AI only when needed; the cost-saving framing is already implicit in the product.

What is NOT built and must ship in the 30 days:

- A standalone "AI spend audit" tool that ingests a customer's existing LLM call logs (OpenAI, Anthropic, Azure) and projects savings.
- A savings-measurement dashboard that quantifies dollar savings per workflow.
- A public pricing page with Stripe-wired base + savings-share billing. Stripe is not yet wired into Instinct (it lives in Wolfpack Auto). This is the biggest 30-day lift.
- Marketing site (currently the homepage is internal team-facing).
- Sales materials (one-pager, demo script, cold templates).
- Internal-savings case study with hard numbers.
- Trade-secret discipline: NDA template, methodology-summary-vs-full-implementation separation in our audit deliverables, access controls on routing logic and prompt libraries.
- Trademark filings for "Wolfpack Instinct" and "Wolfpack Method" ($250-1000 per mark).

## 3. v1.0 launch scope

**In scope:**

- Cost-efficiency core: prompt routing (cheap model first, expensive on fallback), semantic call deduplication, response caching, telemetry on every LLM call.
- AI spend audit tool: customer drops in a CSV / API key with read access to their LLM usage logs; we return a projected savings report.
- Savings-measurement dashboard for paying customers: dollars saved per workflow, per day, per model.
- Public pricing page with Stripe checkout for base tier and post-audit savings-share contract signing.
- Marketing landing site with cost-savings positioning.
- Sales playbook, demo script, lead-magnet copy, outbound templates.
- Internal Wolfpack dogfooding metrics published as a case study.

**Out of scope (deferred):**

- Mobile app.
- Advanced enterprise SSO (SCIM, SAML). NextAuth JWT is sufficient at this scale.
- Deep Microsoft 365 integration beyond what is already in the Instinct knowledge base.
- Generic agent features that distract from cost-efficiency. We are not building an Operator competitor.
- Per-seat pricing variants. Base + savings-share only.

## 4. 30-day milestone calendar

### Week 1 (days 1-7) — Positioning lock and audit tool MVP
- CEO sign-off on positioning and pricing (Section 7).
- Trade-secret discipline in place: NDA template, audit deliverable template that separates "savings summary methodology" (shareable) from "implementation specifics" (never shared).
- Trademark filings initiated for "Wolfpack Instinct" and "Wolfpack Method."
- Audit tool MVP: CSV ingest of LLM call logs, savings projection report rendered as PDF and dashboard view.
- Router + cache instrumented for full cost telemetry per workflow.

### Week 2 (days 8-14) — Marketing site and savings dashboard
- Public marketing site live at `instinct.thewolfpack.agency`. Pricing page, landing page, audit lead magnet.
- Savings-measurement dashboard shipped to internal beta.
- Stripe wired for base tier checkout. Savings-share contract sign flow drafted (initial version routed through DocuSign or HelloSign).
- Internal Wolfpack savings number measured and documented.

### Week 3 (days 15-21) — Sales motion and friendly pilots
- 3 friendly pilots converted from CEO's consulting client list. Each gets a free audit followed by a conversion conversation.
- Sales one-pager PDF, demo script, and three cold-outbound email variants finalized.
- Internal-savings case study published. CTO LinkedIn post one of three goes live.
- First public listing on AI cost-tracking aggregator directories.

### Week 4 (days 22-30) — Public launch
- Public launch announcement on LinkedIn, X, Wolfpack blog. CTO LinkedIn posts two and three go live.
- 5 paying customers signed OR 10 active audit pilots in motion. Goal is paid customers; pilots are the fallback metric.
- Conference / podcast appearance booked if a viable slot exists in the next 30 days.
- Trademark filings submitted for "Wolfpack Instinct" and "Wolfpack Method."
- Day 30 review (Section 12).

## 5. Engineering scope

CTO (Nick Homyk) is the sole engineer. Help is flagged where bandwidth is the binding constraint.

**Week 1:**
- Build audit ingest endpoint at `POST /api/audit/ingest`. Accepts CSV or pasted JSON of LLM call logs. Validates shape, stores under a per-audit ID.
- Build audit analyzer in `src/lib/audit/`. For each call: classify task type, identify a cheaper-model equivalent, detect semantic duplicate calls, project cache hit rate. Output a savings projection.
- Wire cost telemetry into the existing router: every call records (provider, model, prompt-tokens, output-tokens, dollar cost, latency, cache hit). New migration adds an `ai_call_log` table.

**Week 2:**
- Savings dashboard at `/dashboard/savings`: timeline chart of dollars saved, breakdown by workflow, comparison to baseline projection.
- Pricing page at `/pricing`. Marketing landing at `/`.
- Stripe integration: install `@stripe/stripe-js` and Stripe Node SDK. Webhook handler at `/api/webhooks/stripe`. Migration adds `subscriptions` and `savings_share_contracts` tables. Help flag: this is the bandwidth-tightest week. If a part-time contractor exists, Stripe wiring is the cleanest hand-off.
- Internal dogfooding measurement: instrument every Wolfpack employee's Instinct usage with cost telemetry and produce a 14-day savings report.

**Week 3:**
- Self-serve audit onboarding: customer can run an audit without manual handholding. Audit report email auto-sent.
- Conversion flow: audit complete -> "Start your paid deployment" CTA -> Stripe checkout for base + DocuSign-routed savings-share addendum.
- Telemetry hardening: ensure no leakage of customer prompt content; only metadata persists.

**Week 4:**
- Bug bash and copy polish based on pilot feedback.
- Launch-day readiness: status page, rollback plan, on-call rota even if only the CTO.
- Trademark applications submitted.

**Data pipeline work:** every paying customer's LLM spend is tracked in `ai_call_log` with `dealer_id` -> `tenant_id` equivalent for multi-tenancy. Triple-write to Qdrant (semantic index of call types) and Neo4j (workflow graph) follows the same pattern as Wolfpack Auto. Savings are calculated nightly via a Vercel Cron at 03:00 UTC.

## 6. Marketing and sales materials needed

1. Pricing page copy and design. Three columns: base tier, professional tier, enterprise tier. Each with base price + savings-share percentage explanation.
2. Landing page copy. Headline: "Cut your AI spend 50 to 80 percent without losing outcomes." Subhead: "We measure what you save. You only pay a share of that." Three proof sections: how it works, internal Wolfpack case study, customer testimonial slot (filled by week 3 friendly pilots).
3. Sales one-pager PDF. Two pages. Page 1 the pitch, page 2 the math.
4. Demo script for inbound calls. Eight-minute version and two-minute version. Both end on "Let us run a free audit on your current AI spend."
5. AI spend audit lead-magnet copy. Email capture form, automated welcome, and a 24-hour follow-up if the audit is not run.
6. Cold outbound email templates, three variants: engineering-leader pitch (cost optimization angle), finance-leader pitch (cloud-bill control angle), AI-leader pitch (efficiency-without-degradation angle).
7. Internal-savings case study. Title: "How Wolfpack cut its own AI spend by [X] dollars per month." Real numbers, real workflows, real screenshots. This is the most credible asset we can produce.
8. Trade-secret protection package: NDA template for audit engagements, internal access-control review for routing logic and prompt libraries, audit deliverable template that documents the savings summary methodology but excludes the specific implementation details (the techniques themselves have substantial prior art; the defensible asset is our specific implementation and customer data accumulation, protected as trade secrets rather than patents).

## 7. Pricing decisions due in week 1

- **Base monthly tiers:** Starter 499 dollars per month per company (up to 50K calls per month). Professional 999 dollars per month (up to 250K calls). Enterprise 1,999 dollars per month (unlimited within fair use).
- **Savings share:** 40 percent of measured monthly savings versus pre-Instinct baseline.
- **Cap:** Savings share capped at 3x the monthly base tier. Above the cap the customer keeps 100 percent. This caps perception of runaway billing.
- **Free trial / pilot:** Audit is always free. First 30 days post-conversion the savings share is waived (base only) so the customer sees savings before paying for them.
- **Annual prepay discount:** 15 percent off the base tier if paid annually. Savings share remains monthly.

These numbers go on the pricing page only after CEO sign-off in week 1.

## 8. Distribution strategy (days 1-30)

- **Warm outbound to consulting clients.** Top priority. CEO supplies 10 warm intros (Section 11). CTO runs the audit conversation. Friendly pilots cost nothing to convert because the audit is free.
- **Free AI-audit lead magnet.** Drives inbound. Promoted via LinkedIn posts, the Wolfpack newsletter if one exists, and the landing-page CTA.
- **CTO LinkedIn content.** Three posts in the 30-day window: post one is the internal-savings case study, post two is a teardown of a real customer's wasted spend (with permission), post three is the architectural philosophy post on why labs cannot offer cost-efficiency (revenue conflict argument).
- **One conference or podcast appearance.** Pitch any AI-cost or FinOps-focused podcast in the next two weeks. If no booking, defer to month 2.
- **Aggregator directory listings.** Submit to any AI cost-tracking or FinOps-tools directories that exist (Vantage, Tabular, etc.).

## 9. Success criteria at day 30

- 5 paying customers OR 10 active audit pilots in motion.
- Public pricing page live and tested through Stripe checkout end-to-end.
- Internal-savings case study published with real Wolfpack numbers.
- Trademark applications submitted for "Wolfpack Instinct" and "Wolfpack Method."
- Trade-secret discipline live: NDA template, audit-deliverable template, access controls on routing logic.
- At least three pieces of inbound-marketing content live (LinkedIn posts, blog, landing page).
- Audit tool publicly available with self-serve onboarding (no CTO involvement required to start one).

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| CTO bandwidth saturation across multiple products. | Defer non-Instinct work where possible. Flag Stripe wiring (week 2) as the candidate for outside help if needed. |
| Sales pitches Instinct as Operator competitor. | Lock positioning in week 1. CEO endorsement of "different category" framing. Demo script explicitly rejects the comparison. |
| Customers prefer per-seat pricing. | Frame base + savings-share as "you pay a fraction of what you would otherwise waste." If a customer pushes back hard, hold the line; per-seat does not capture the value we deliver. |
| Audit projects 60 percent savings but customer realizes 30 percent. | Be conservative in projection model. Always report a range, never a point estimate. Use historical Wolfpack savings as the ground-truth calibrator. Audit terms-of-service include a no-warranty clause on projection accuracy. |
| Free-tier abuse (lookers, not buyers). | Audit costs us little to run because Instinct runs it. Cap free audits to one per company domain. Require corporate email to start. |

## 11. What I am asking the CEO for

1. 10 warm introductions to consulting clients for the audit pilot, delivered by day 7.
2. 5,000 dollars marketing budget for landing-page production and LinkedIn ads.
3. Approval to publish internal Wolfpack savings numbers in the case study.
4. Explicit endorsement to NOT pitch Instinct against Claude Operator or GPT Operator. If a prospect asks, the answer is "different category."
5. Sign-off on the pricing model (Section 7) by end of week 1.

## 12. Day 30 review

We look at four numbers and answer one question.

**Numbers:**
1. Paid customers signed (target: 5).
2. Active audit pilots in motion (target: 10 if paid is below 5).
3. Cash booked (target: 5,000 to 15,000 dollars MRR).
4. Inbound audit requests in the last 7 days (signal of demand).

**Question:** Is the cost-efficiency positioning landing with the buyer or are we hearing "this is interesting but" responses?

**If on or above target:** Move to Phase 1 of the portfolio strategy. Open hiring conversation for the AI/ML engineer (month 3 hire in the parent strategy doc).

**If below target on customers but inbound is strong:** Positioning is right, conversion is the bottleneck. Tighten the demo script, add a friction-removing free month, push CEO for 10 more warm intros.

**If below target and inbound is weak:** Positioning is not landing. Rerun the landing-page copy, test a sharper headline, and consider a 60-day extension before declaring the bet alive or dead.

**If paid customers are zero and pilots are below 5:** Honest conversation with the CEO. Either the positioning is wrong, the market is not ready, or our distribution is too thin. Park the public launch and rebuild as a consulting-attached product for 90 days.

The plan is built so that even the worst-case outcome leaves Wolfpack with a more profitable consulting business running on its own internal Instinct. Downside is bounded. Upside is a category-defining product in 12 months.
