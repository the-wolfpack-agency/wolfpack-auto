# Three Non-Intrusive Dealer Wedges — Strategic Report

**Author:** CTO / 2026-05-19
**Source audit:** Deep-dive of [https://wolfpack-auto.vercel.app](https://wolfpack-auto.vercel.app) + repo (`wolfpack-auto` HEAD `9216d39`)
**Audience:** Internal — pitch + engineering prioritization
**Related:** [dms-adapter-plan-2026-05-19.md](dms-adapter-plan-2026-05-19.md) · [dealer-demo-script-2026-05-19.md](dealer-demo-script-2026-05-19.md) · [pilot-1pager-2026-05-19.md](pilot-1pager-2026-05-19.md)

---

## TL;DR

Three ways to land Wolfpack Auto at a dealership **without forcing them to change anything they already do.** Ranked by signal-to-effort. Wedge 1 is shippable this month. Wedge 2 needs ~2 days of plumbing. Wedge 3 needs ~2 days plus a decision about CRM round-trip.

---

## Why "non-intrusive" is the framing

Dealerships are creatures of habit. The BDC lives in VinSolutions. The F&I manager lives in their Dealertrack desking screen. The service advisor lives in their service POS. Any product that asks them to learn a new tool fails the first week — not because the new tool is worse, but because it competes with muscle memory.

The right wedge is one where the dealer's *current* tool keeps running, and Wolfpack Auto sits adjacent — feeding signal, capturing overflow, automating a single bottleneck. Once the dealer trusts the wedge, the second product is an easier conversation.

This is the "sit beside, don't replace" playbook. Three concrete instances follow.

---

## Wedge 1 — Photo studio as a managed service

### The pitch
> "Send us your inventory feed. We'll restyle every VDP photo with a studio-quality AI background — your existing inventory tool keeps running. New cars get an AI background within an hour of hitting your lot. We hand the files back to your S3. Your shoppers see better photos. You change nothing."

### What changes for the dealer
- They give us read access to their inventory CSV / SFTP feed (or their existing photo S3 bucket).
- That's it. Their inventory listing tool, their VDP, their workflow — all unchanged.

### What Wolfpack does
- Ingest the dealer's inventory feed via `src/lib/dms/feed-processor.ts` (already idempotent).
- After a new vehicle row lands, auto-enqueue a background-generation job (wired in commit `9216d39` today via `void generateBackground(...)`).
- Run `src/lib/background-removal.ts` → `src/lib/background-generator.ts`.
- Push the restyled JPEG back to a known S3 prefix the dealer's VDP already reads.

### Live state (as of HEAD `9216d39`)
- Background-generator fal.ai wrapper: **real** (`src/lib/background-generator.ts`).
- Auto-trigger on DMS ingest: **shipped today** (`feed-processor.ts:enqueue`).
- DMS ingest live: **only via mock or SFTP/CSV**. Real CDK/Reynolds/Cox adapters are stubs — see [DMS adapter plan](dms-adapter-plan-2026-05-19.md).
- Required env: `FAL_API_KEY`, `AWS_*`, `S3_BUCKET`. The first is not in Vercel prod yet.
- Demo blocker: **need a paying fal.ai account before any pilot**.

### Demo proof (60 seconds)
1. Take 5-10 photos from the dealer's actual VDP (with permission).
2. Drop them into our sandbox.
3. Within 30 seconds per car, show before/after on screen.
4. Hand them a folder of restyled JPEGs.

That's the entire demo. No login required.

### Pricing wedge
- **$200-400/month per location**, flat regardless of inventory size.
- Replaces a $1,500-3,000/month photo-studio service or in-house photographer.
- Net dealer savings: $1,000-2,500/month per location.

### Risks
- **fal.ai cost.** Each background generation is ~$0.05-0.20. A 200-car lot with weekly refresh = ~$40-160/month. Our margin is ~$100-300/lot if we charge $400. Need to track per-tenant cost.
- **Photo quality variance.** Some VDP source photos are unsalvageable (poor lighting, angle). We need a quality-score gate so we don't generate garbage and fail the demo.
- **Brand consistency.** Some dealers want their lot in every background. We need a "use my dealership lot photo as the base" option for paid tier.

### Signal-to-effort score: **9/10**
- Most demonstrable. Lowest dealer overhead. Real engineering already done.
- Only gap: needs fal.ai billing + real DMS ingest. Both are solvable in ~1 week.

---

## Wedge 2 — Insights email to the GM

### The pitch
> "Once a week, the General Manager gets a 3-bullet email: what's about to fall through the cracks. 'These 30 leads are about to go cold.' 'Friday close rates are 22% below Tuesday — your Friday team is short.' 'Two cars are at risk of falling under invoice.' Three sentences. No login required. Cancel anytime."

### What changes for the dealer
- They give us read-only access to their DMS feed (CSV/SFTP nightly drop is fine).
- The GM gets one email per week. That's it.

### What Wolfpack does
- Ingest the dealer's leads + deals + inventory via the same `feed-processor.ts` path.
- Run `src/lib/analytics-engine.ts` over the data (already built — 30+ behavioral signal generators).
- Pick the top 3 insights by signal strength + business impact.
- Render them in plain English (per `feedback_non_technical_ui` — no jargon).
- Send via `src/lib/email.ts` with the dealer's branded FROM (per the per-dealer email branding shipped today).

### Live state
- Analytics engine: **real** (`src/lib/analytics-engine.ts` + `src/lib/insights/*`).
- 30+ signal generators: **real** (per `project_analytics_brain.md` memory).
- Insights → email pipeline: **does not exist yet**. The analytics brain pushes to the `/admin/analytics-brain` dashboard, not to email. This is the ~2 days of plumbing.
- Cron framework: **real** (5 existing crons in `vercel.json`).
- Per-dealer FROM branding: **shipped today** (`src/lib/email.ts`).

### Engineering scope (2-3 days)
- New `src/lib/insights/weekly-digest.ts` — pulls top-3 insights for a dealer + renders email body.
- New `src/app/api/cron/weekly-digest/route.ts` — Monday 06:00 UTC; iterates active dealers; sends to `dealers.gm_email` (column TBD; might need a migration).
- New email template `src/lib/email-templates/weekly-digest.tsx`.
- Per-dealer opt-in flag on `dealer_settings` — never email a dealer who didn't enable it.
- Unsubscribe link (CAN-SPAM compliance).

### Demo proof
- Ingest their last 90 days of data via a CSV.
- Generate a sample email.
- Hand it to the GM in the demo. Let them read it.

### Pricing wedge
- **$100-200/month per location** for the email alone.
- The email IS the product. No dashboard tour required.
- Upsell to dashboard access (Wedge 4 / "platform" tier) once they trust the email.

### Risks
- **The email has to be accurate or trust dies.** If we tell the GM "30 leads are about to go cold" and only 5 actually are, the dealer cancels. Calibration matters.
- **GM email deliverability.** First send goes to spam half the time. Need DKIM/SPF set up per dealer or use a single Wolfpack-branded sender for the email and put the dealer's name in the body.
- **Manual operator labor at first.** Until the analytics engine is fully self-calibrating, expect to hand-review the first 4-8 weeks of emails before they go out.

### Signal-to-effort score: **8/10**
- Highly differentiating (no other dealer-tech sends weekly plain-English digests). Low dealer overhead. Real engineering pipeline 80% done.
- The 20% gap (insights → email + opt-in flag + unsubscribe) is ~2-3 days.

---

## Wedge 3 — Embedded widgets on the dealer's existing site

### The pitch
> "Add one line of HTML to your existing website. You get a trade-in valuation widget and a pre-qual financing widget that match your brand. Customers fill it out without leaving your site. Their leads land in our system for nurture; if your BDC wants them in your CRM, we send a daily summary. Don't change a thing about your existing site or your CRM."

### What changes for the dealer
- One `<script src>` tag in their site footer. Their web vendor handles this in <10 minutes.
- That's it.

### What Wolfpack does
- Serve a CORS-friendly embed bundle from `wolfpack-auto.vercel.app/embed/trade-in.js` (and `/embed/pre-qual.js`).
- The embed mounts a styled widget into a `<div id="wolfpack-trade-in">` on the dealer's page.
- Form submissions POST to our existing `/api/trade-in` and `/api/pre-qual` routes (already built).
- Captured leads flow into our `leads` table with `source = "embed:trade-in"` for attribution.
- Daily BDC summary email at 17:00 dealer-local-time: "12 new leads today via your website. Top 3: [names]. Full list attached."

### Live state
- `/trade-in` and `/pre-qual` pages: **real, working**.
- Lead capture API: **real** (`/api/leads/intake/route.ts`).
- Embed bundle: **does not exist yet**. ~2 days of work.
- CORS-friendly serve: needs a build script + `next.config` adjustment.
- Per-dealer theme/colors on the embed: needs a `theme` query parameter or a per-dealer publishable key system. ~1 day.

### Engineering scope (2-3 days)
- New `src/embed/` directory with esbuild bundle config.
- `/embed/trade-in.js` — minimal vanilla-JS bundle (~20kB gzipped) that renders the form.
- `/embed/pre-qual.js` — same pattern.
- Per-dealer publishable key in the script tag: `<script src="https://wolfpack-auto.vercel.app/embed/trade-in.js?key=PUB_dealer_abc"></script>`.
- CORS config so the embed can call our APIs from the dealer's domain.
- Daily BDC summary email (same pipeline as Wedge 2).

### Demo proof
- During the demo, paste the snippet into a CodePen (or their actual site if they're willing).
- Show the widget mounting.
- Submit a fake trade-in.
- Show the lead appearing in our `/admin/leads` table within seconds.

### Pricing wedge
- **$50-150/month per widget per location.**
- Pure overflow capture from their existing site.
- Cheap enough to be an impulse-buy after the demo.

### Risks
- **CRM write-back gap.** A BDC-led dealer who lives in VinSolutions will want leads in VinSolutions, not just in our DB. The daily-summary email is a stopgap; real CRM write-back is its own engineering effort. **If a BDC-heavy dealer is the first pilot, this wedge alone won't satisfy them.**
- **Brand consistency.** The embed must look like the dealer's site, not like Wolfpack's. Per-dealer CSS theming via the publishable key. ~1 day.
- **Conversion-rate risk.** If our embed converts worse than the dealer's existing form, we look bad. A/B test path needed eventually.

### Signal-to-effort score: **6.5/10**
- Lowest dealer overhead of any wedge (one script tag). Moderate engineering effort (~2-3 days). Biggest blocker is the CRM write-back conversation for BDC-led dealers.

---

## Comparison table

| Dimension | Wedge 1 (Photos) | Wedge 2 (Insights) | Wedge 3 (Embeds) |
|---|---|---|---|
| Dealer overhead | Grant feed access | Grant feed access | Paste one script tag |
| Engineering remaining | DMS adapter (real) + fal billing | ~2-3 days plumbing | ~2-3 days plumbing |
| First-pilot revenue | $200-400/mo | $100-200/mo | $50-150/mo |
| Best-fit dealer | Any with photos | Any with leads/deals | Any with a website |
| Demo difficulty | Easy (visual) | Easy (the email IS the demo) | Easy (paste + submit) |
| Risk if it fails | Photo quality looks bad | Wrong insights destroy trust | BDC misses leads they need |
| Signal-to-effort | **9/10** | **8/10** | **6.5/10** |

---

## Recommended sequencing

### This month
- **Wedge 1 (Photos)**: pitch to first 3 warm contacts. Demo with their actual photos.
- Concurrent engineering: real DMS adapter Phase 1b (SFTP/CSV) so the photo pipeline has real data, not just mocks. See [DMS adapter plan](dms-adapter-plan-2026-05-19.md).
- Operational: fal.ai billing account, Neon quota upgrade.

### Next month (assuming one Wedge 1 pilot signed)
- Ship **Wedge 2 (Insights)** plumbing — ~2-3 days. The Wedge 1 pilot can opt into this as a $100/mo upsell at zero marginal effort.
- Pitch Wedge 1 + Wedge 2 as a bundle to the next 5 contacts.

### Quarter
- Ship **Wedge 3 (Embeds)** plumbing — ~2-3 days. Build the embed once; it sells repeatedly with zero per-deal engineering.
- Real VinSolutions API adapter (Phase 2 per DMS plan) so the insights brain has near-real-time data.

### Wedge 4 — the platform (not pitched in v1)
The full `/admin/*` console becomes the upsell after 2-3 wedge pilots have proven Wolfpack's value. This is the "now log in and see everything else we built" pitch. Charged at $500-1,500/mo per location. **Don't lead with this** — the wedges fund the platform conversation.

---

## What I'd push back on

- **Pitching the platform first.** It's the most engineered surface but the highest dealer overhead. Wedges are the camel's nose; the platform is the camel.
- **Trying to wire CDK/Reynolds before VinSolutions.** Cox-family DMSes (VinSolutions, vAuto) have the cleanest API path. CDK is a higher-tier partnership conversation that costs more and ships slower.
- **Promising live CRM write-back in v1.** Defer that to "we'll send the BDC a daily summary email." Write-back is its own engineering effort with its own contract requirements (some CRMs charge per write).

## What I'd push for

- Honest pricing. **The wedges are cheap intentionally.** $200-400/month feels like a no-brainer at the GM level. Anything above $1k/month requires C-level approval at most dealerships, which is a 2-3 month sales cycle. Avoid that.
- A single, named pilot dealer for Wedge 1 by end of June. One real customer beats six prospects.
- Resist scope creep on the embed. v1 is trade-in + pre-qual. NOT live-chat, NOT inventory listing, NOT financing approval. Those are v2.

---

## Honest gaps to flag with the prospect

When pitching, lead with what we DON'T have so the prospect doesn't discover it later:

1. We don't have a CDK or Reynolds native adapter yet — v1 ingests CSV/SFTP overnight.
2. We don't write back to your existing CRM yet — daily BDC summary email instead.
3. We don't pull your Google/DealerRater reviews yet — that's on the roadmap, not in v1.
4. The dashboard works but it's not the v1 product. The email is.
5. Pilot is 30 days, half-rate, cancel anytime. The exit clause is real and honored.

That honesty buys credibility nothing else can.
