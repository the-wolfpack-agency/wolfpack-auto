# Wolfpack Assistant Platform — multi-vertical strategy

**Date:** 2026-05-12 (evening, post-strategy-pivot, post-BBB-clarification)
**Author:** Wolfpack CTO
**Status:** Extends `docs/wolfpack-assistant-overlay-strategy-2026-05-12.md`. The flagship overlay is now framed as a multi-vertical platform with year-1 focus on automotive (flagship) and year-2 white-label to retail / e-commerce (BBB as first anchor).

---

## The platform in one sentence

**Wolfpack Assistant Platform is a vertical-agnostic AI overlay engine: one codebase, multiple branded vertical instances, each with its own adapter set, vocabulary, and go-to-market. Year-1 is automotive (flagship). Year-2 onwards is opportunity-driven vertical expansion against named prospects.**

---

## Verticals (named + sequenced)

| Vertical | Brand | ICP | Adapters | Timing |
|---|---|---|---|---|
| Automotive | Wolfpack Auto | Single-rooftop or small-group dealers | CDK, Cox/vAuto, DealerSocket, Reynolds, Dealertrack | Year 1 (flagship; live now) |
| Retail / E-commerce | "BBB Assistant" (TBD) | Beyond Inc / BBB and adjacent e-commerce brands | Shopify, BigCommerce, Adobe Commerce, Klaviyo, Attentive, Meta/Google Ads | Year 2 (named contact at BBB) |
| Future verticals | TBD | Opportunity-driven, only when team has named contact + skillset fit | Per-vertical | Year 3+ |

The principle: **named contact + skillset fit are the two gates** for any vertical expansion. No vertical gets engineering capacity without those.

---

## The BBB pitch shape (year-2 anchor)

BBB / Beyond Inc is **e-commerce only** (post-2023 bankruptcy + Overstock acquisition). The auto pitch (in-store touchpoints, IoT, parking lot, local-community) does NOT apply. Different pitch shape required.

### What BBB Assistant would actually deliver

**Operations layer:**
- Natural-language inventory management: "show me products that have <10 units left across all warehouses"
- Customer service routing automation: assistant triages incoming tickets, drafts responses, escalates by complexity
- Marketing campaign orchestration: "draft a Mother's Day email for our top 1000 lapsed customers"
- Order-status / return-status / fulfillment-status across Shopify + 3PL providers
- Cross-channel customer journey: see what an Instagram-ad lead does on the site, in email, post-purchase

**Insight surface:**
- Conversion-funnel health: which product pages cause drop-off, which CTAs convert
- Inventory turn analytics: which SKUs sit, which fly, what to reorder
- Customer cohort analytics: LTV by acquisition source, churn drivers
- Ad-spend ROI: by channel, by campaign, by cohort

**Cross-platform value:**
- Shopify + Klaviyo + Meta Ads + Google Ads all surface in one conversational interface
- Switching one of those out becomes painless (the assistant abstracts away the underlying tool)
- Data accumulates across tools → moat compounds

### Pricing for BBB-scale (Beyond Inc enterprise)

Different ICP from auto dealers. Enterprise procurement, annual contract:
- **Custom enterprise**: $120k-$480k annual, depending on adapter count + seat count + custom integration work
- Custom adapter development billed at $30-50k per platform (Shopify+ tier, custom 3PL, etc)
- Year-2 first signed contract is the GTM validation for the retail vertical

### Conversation script for Hoxsie's BBB contact (one-pager draft)

> "We've built an AI overlay that runs on top of whatever e-commerce stack a retailer is on. It learns the retailer's specific operations over time and surfaces opportunities + automates routine work. Most of our development has been validated in the automotive vertical, but the underlying engine is vertical-agnostic. We'd love to discuss whether the BBB e-commerce ops + marketing teams could use a custom-built instance — and what their biggest operational pain points are. No commitment, just a discovery conversation."

Goal of first call: identify ONE concrete pain point worth solving in a 90-day pilot. Not a contract. Not a demo. A pain point.

---

## Architecture investments shipping today

To enable year-2 multi-vertical expansion without rewrites, today's session adds three small, disjoint pieces:

### 1. Vertical-aware action registry (migration 080)

Add `vertical text NOT NULL DEFAULT 'any'` column to `assistant_actions`. Values: `auto | retail | service | any`. The capability matcher filters actions by the user's tenant's vertical so a retail tenant doesn't see auto-specific actions like `fi.reorder_product_menu`. An auto tenant doesn't see `commerce.reorder_email_campaign`.

Re-tag the 17 seed actions to the appropriate vertical (most are `auto`; a handful are `any`).

### 2. Touchpoint module abstraction (migration 081, partial — touchpoint_events table)

`touchpoint_events` table records every QR/NFC/RFID/iBeacon scan with vertical-agnostic shape:
- `id`, `dealer_id` (rename to `tenant_id` for vertical-agnostic), `touchpoint_type` (qr | nfc | rfid | beacon | webhook), `touchpoint_id`, `payload`, `scanned_at`, `customer_id?`, `outcome`.

QR-code first implementation: dealer prints a QR code on a vehicle, brochure, or business card. Customer scans → event flows to assistant → contextual follow-up triggered. Year-2 retail use: BBB prints QR on receipts → customer scan triggers feedback survey + re-engagement.

### 3. E-commerce adapter framework (migration 082)

Mirror of DMS adapter framework (migration 079) but for e-commerce platforms:
- `ecommerce_adapter_credentials` table — same shape, different `provider` enum (`mock_shop | shopify | bigcommerce | adobe_commerce | klaviyo | attentive | meta_ads | google_ads`)
- Adapter interface with capabilities like `read_products`, `read_orders`, `read_customers`, `write_campaign_draft`, `read_funnel_analytics`
- Mock adapter for development
- Shopify stub with `TODO(shopify-app-credentials)` — Shopify partner enrollment required
- Klaviyo, BigCommerce, Adobe Commerce stubs

Year-1 doesn't ship any real e-commerce adapter implementation. Stubs validate the design + reserve the architecture so year-2 retail expansion is config + content, not rewrites.

---

## What this means for the 5 strategy docs from earlier today

- `docs/wolfpack-team-capabilities-2026-05-12.md` — UNCHANGED. Team composition argument applies across verticals.
- `docs/dealer-excellence-program-2026-05-12.md` — UNCHANGED. Enterprise tier for OEM-network deals.
- `docs/oem-led-gtm-strategy-2026-05-12.md` — UNCHANGED. Applies to auto vertical year-1.
- `docs/literacy-os-strategy-2026-05-12.md` — UNCHANGED. Ontology becomes vertical-aware in a future migration.
- `docs/fi-audit-wedge-spec-2026-05-12.md` — UNCHANGED. Auto-specific lead magnet.
- `docs/wolfpack-assistant-overlay-strategy-2026-05-12.md` — STILL CORRECT, but this doc supersedes the implicit "auto-only" framing.

---

## Year-1 priorities (reaffirmed, not changed)

Multi-vertical platform thinking does NOT change the year-1 execution priorities:

1. **Auto-only sales motion** through year 1.
2. **Auto-only customer acquisition** (PCNA pilot, F&I Audit landing-page inbound, direct-dealer trials).
3. **Auto-only marketing/positioning** (Wolfpack Auto remains the public brand year 1).
4. **No engineering capacity to retail until year 2** — only the three small architecture investments shipping today.

The platform thinking is a **future-proofing investment**, not a year-1 distraction. We bake in the multi-vertical architecture now so year-2 expansion is cheap. We don't pitch BBB or any retail prospect until auto is at 50+ paying dealers.

---

## Bottom line

The platform engine is vertical-agnostic. Year-1 ships against auto. Year-2 white-labels to retail with BBB as the anchor (real contact via team). The three architecture investments shipping today make year-2 cheap. The sales motion remains disciplined: one vertical at a time, gated on named contact + skillset fit.

This is the right shape: ambitious vision, disciplined execution, opportunity-driven sales expansion.
