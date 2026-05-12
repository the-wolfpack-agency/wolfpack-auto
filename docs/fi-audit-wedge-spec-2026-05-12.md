# F&I Penetration Audit — wedge product spec

**Date:** 2026-05-12
**Decision target:** founder alignment meeting
**Scope discipline:** this is ONE wedge product, not five. The point is to validate the wedge motion before adding more.

---

## The product in one sentence

A free 4-page PDF audit of a dealership's F&I performance that books a paid Wolfpack Auto demo with a warm prospect who has already shared their data.

## Why this one wins

1. **The data is already on the dealer's side.** F&I deals are in their DMS. We're not asking for anything sensitive; we're asking for an export they already pull for their own monthly reviews.
2. **The pain is the most lucrative line in the dealership.** F&I gross is ~$1,200-2,400 per deal on average. A 5% attach-rate improvement on a 100-deal/month store is $60-120k/year. Buyers pay attention.
3. **The DMS competitors do not surface this well.** CDK, Reynolds, and Dealertrack all have F&I reporting, but it's buried, slow, and pre-aggregated. A focused, readable 4-page PDF that ranks managers and products and recommends specific actions is materially better.
4. **The engine already exists.** Migration 072 + `src/lib/analytics-engine/fi-penetration.ts` from today's Stream D do the heavy lifting. The audit is a PDF generator on top.
5. **Defensibility is real.** The recommendations are based on the dealer's own data + industry benchmark comparisons. Anyone building from public data alone can't match it.

## ICP (ideal customer profile)

**Primary buyer (decision-maker):** F&I Director or General Sales Manager at a single rooftop doing 60-200 deals/month.

**Secondary buyer:** Dealer-group Controller or VP of F&I overseeing 3-20 rooftops.

**NOT the buyer:** the salesperson, the BDC, the receptionist, an OEM rep.

## The free-audit deliverable (4 pages, PDF)

### Page 1: Executive Summary

- Dealer name, audit period (last 3 months), deal count, total F&I gross.
- One headline number: "Your average F&I gross per deal is $X. Industry benchmark for your volume tier is $Y. Gap: $Z per deal, or $Z × monthly volume = $A/month."
- Three named opportunities, ranked by dollars-at-stake.

### Page 2: F&I Manager Scorecard

- Table: each F&I manager × attach rate on each product × average gross per deal × month-over-month delta.
- Top performer highlighted; bottom performer flagged.
- Honest call-out: "Manager M attached GAP on 38% of deals. Top performer attached on 71%. Coaching opportunity: $X/month."

### Page 3: Product Penetration Heatmap

- 6-month heatmap by product (warranty, GAP, tire-and-wheel, paint protection, etc.) × month.
- Identify products with declining attach trend.
- Identify products with high attach but low average gross (suggesting underpricing or low-margin products in rotation).

### Page 4: Recommendations

- Three concrete, named actions: e.g., "Schedule 1:1 coaching for Manager M on GAP positioning. Re-price tire-and-wheel from $799 to $899; market data supports this." 
- One soft hook: "Wolfpack Auto continuously surfaces these gaps and routes recommendations to F&I managers in real time. Book a 30-min demo." Calendly link.

## What gets built

### Backend (4-5 engineer-days)

1. **PDF report generator** — `src/lib/fi-audit/pdf-generator.ts`. Builds the 4-page deliverable from `v_fi_penetration` view output. Use `pdfkit` (commit to adding it; it's a small dependency).
2. **Industry benchmark dataset** — `src/lib/fi-audit/benchmarks.ts`. Static table keyed on volume tier (60-100/mo, 100-150, 150-200, 200+) with attach-rate and gross-per-product benchmarks. Source: NADA + manufacturer industry reports. Document sources in the file.
3. **Lead intake endpoint** — `src/app/api/audit-request/route.ts`. Public, rate-limited. Accepts: dealership name, contact email, deal CSV upload OR DMS connection placeholder. Triggers async audit generation.
4. **Audit run table** — migration 074 adds `fi_audit_runs` table for lead capture + audit history. Used by the BDC to follow up on warm leads.
5. **Outbound email** — sends the PDF to the dealer via Resend.

### Frontend (2-3 engineer-days)

1. **Landing page** — `src/app/audits/fi-penetration/page.tsx`. Single-purpose page. Three sections: (1) the pitch ("Free F&I audit. 4-page PDF. No call required."), (2) a single form (name, email, dealership, upload), (3) a sample audit page rendered inline for credibility.
2. **Sample audit PDF** — `public/sample-fi-audit.pdf`. Synthetic example for prospects who want to see the deliverable before submitting data.
3. **Follow-up email sequence** — three emails: instant audit delivery, 3-day "did you act on opportunity #1?" check-in, 10-day "book a demo" close.

### Sales motion (Hoxsie + future sales lead)

1. **Landing page lives at `audits.wolfpackauto.com/fi-penetration`** (or subpath on main site).
2. **LinkedIn outbound** — Hoxsie or the sales hire DMs F&I Directors in target markets with the audit link.
3. **Conference / trade-show distribution** — NADA Show (January), F&I Showcase (April). Hand out one-pagers pointing to the URL.
4. **Audit response triggers a CRM row** in Wolfpack Auto's own staff console (`/operator`) for follow-up.

## What this is NOT

- Not a standalone SaaS product. The free audit is a lead magnet for the full DOS.
- Not a permanent free tier. It's a one-time deliverable, then the dealer is in the sales funnel.
- Not multi-product. F&I-only. Don't bundle service or sales velocity. One audit, one product, one buyer persona, one decision.

## Success metrics (the only ones that matter)

| Metric | Target (90-day) |
|---|---|
| Audit requests submitted | 100 |
| Audits delivered | 80+ (allowing for incomplete/bot submissions) |
| Demo bookings off audit | 12+ (15% conversion) |
| Demo → paid pilot | 3-5 (25-40% conversion) |
| Paid pilots → annual contract | 60%+ |

If conversion to demo is below 10% in the first 30 days, the audit isn't good enough or the pitch isn't credible. Investigate.

## Risks

1. **Data privacy concern.** Dealers may hesitate to upload deal data. Mitigation: explicit data-handling page, optional anonymization mode (we accept the file, strip PII, return audit). Cite the existing security-posture page.
2. **Bot / scrape traffic.** Public form will get junk. Rate-limit and CAPTCHA the upload endpoint.
3. **No sales follow-up.** If audit delivers but no one calls the lead, conversion is zero. **THIS is the gating risk** — and it's the same risk as the broader sales-distribution premortem convergence point. The audit only works if there's a human chasing the lead.
4. **Sample audit credibility.** If the sample PDF looks generic or AI-generated, prospects bounce. Spend the design effort on making the deliverable look like a $5k consulting product, not a SaaS landing page.

## Engineering cost summary

- 6-8 engineer-days total
- 1 new migration (074)
- 1 new npm dep (`pdfkit`)
- Reuses: Stream D analytics engine, Resend integration, audit_log + analytics-hooks, Wolfpack staff console for follow-up

## Decision needed at founder meeting

**Single yes/no:** "Do we ship the F&I Penetration Audit as a free-deliverable lead magnet for Wolfpack Auto, before May 31?"

If yes: it goes into the next sprint, blocking the sales-lead hire on JD writeup completes first.
If no: we keep the analytics engine in the DOS bundle and move on.

Do not pick "yes AND we also do Lead Source ROI as a second audit and Tech Utilization as a third." That is the portfolio-dilution failure mode. One wedge. Validate the motion. Then expand.
