# Wolfpack Auto — Session Handoff
**Date:** March 29, 2026 (Session 2)
**HEAD commit:** `0fb68b2` — fix: deal desking date pickers match dropdown widths
**Deployed:** https://wolfpack-auto.vercel.app
**Repo:** nhomyk/wolfpack-auto (ALWAYS cd into wolfpack-auto/ for git ops)

---

## What Was Done This Session

### 1. Production Canary Suite (66 tests)
Closes the gap between "tests pass" and "production actually works." Runs against the live Vercel deployment after every deploy.

**New endpoint:** `/api/health/deep` — 4 probes:
- DB connectivity + 52 table count
- Write-read-delete roundtrip (canary_probes table)
- Elasticsearch ping + vehicle index check
- Analytics pipeline write-read-delete

**7 test files:**
- `canary-health.spec.ts` (9) — shadow detection, probe verification
- `canary-data-source.spec.ts` (6) — API responses from real DB
- `canary-write-roundtrip.spec.ts` (4) — INSERT→SELECT→DELETE
- `canary-analytics.spec.ts` (5) — events persist, learning active
- `canary-latency.spec.ts` (5) — cold/warm thresholds
- `canary-ui-render.spec.ts` (29) — 24 pages render, no crashes
- `canary-deep-health-unit.spec.ts` (8) — endpoint contract

**Automation:**
- GitHub Actions workflow: triggers on `deployment_status`, manual, nightly cron
- `--rollback` flag triggers `vercel rollback` on failure
- Integrated as Suite 8 in `npm run validate`
- Results logged to `.agenticqa/canary_history.jsonl`
- `system.canary_passed`/`system.canary_failed` events in analytics

### 2. Database Migration Fixes (036-038)
Canary uncovered missing tables/columns. All applied to live Neon DB:
- `deleted_at` column on 10 tables (soft delete)
- `customers`, `marketing_campaigns`, `dealer_users` tables
- `deals` view → `deal_worksheets`
- `service_parts` view → `parts_inventory`
- SEO, webhook, branding columns on dealers

### 3. Settings Page — Fully Functional
All 4 forms were 404-ing on save. Fixed:
- **LogoUploader.tsx** — click/drag-drop upload, preview, persist to DB, remove
- **BrandingForm.tsx** — colors + font with client-side PUT
- **SettingsForm.tsx** — reusable wrapper for any settings section
- **API** — added font_family, title_template, meta_description, webhook_url/events
- **15 tests** cover every form and button

### 4. Form & Action Regression Suite (40 tests)
Audited 103 API endpoints across all admin pages. Fixed 1 missing route (`/api/admin/resources/analytics`). Regression suite permanently prevents form-to-404 bugs.

### 5. Analytics Brain — Grouped Temperature Cards
9 identical "Buyer — 81" cards collapsed into one card with "×9" badge.

### 6. UI: Deal Desking Date Pickers
Date range pickers now match dropdown widths (flex-1 instead of fixed w-40).

---

## Commits This Session

| Hash | Description |
|------|-------------|
| `3678608` | feat: production canary suite — 66 tests |
| `3a22632` | fix: migration 036 — missing tables/columns/views |
| `fd34955` | ci: canary post-deploy GitHub Actions workflow |
| `f910f76` | fix: canary latency thresholds for Vercel Free |
| `67f715b` | feat: integrate canary into validation Suite 8 |
| `db05656` | feat: functional logo uploader |
| `e80b6e7` | fix: settings forms submit to real API |
| `6482e73` | fix: all settings forms save correctly |
| `feee8c1` | feat: form & action regression suite (40 tests) |
| `8726d5b` | fix: group duplicate lead temperature cards |
| `0fb68b2` | fix: deal desking date picker widths |

---

## npm Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run canary` | Full canary suite (66 tests) against CANARY_URL |
| `npm run canary:quick` | Deep health probe only (~10 seconds) |
| `npm run canary:rollback` | Full suite + auto-rollback on failure |
| `npm run test:canary` | Playwright canary only (no runner wrapper) |
| `npm run validate` | Platform integrity (8 suites, 300+ tests) |
| `npm run validate:quick` | Sidebar + renders only |

---

## How to Resume

```bash
cd /Users/nicholashomyk/mono/AgenticQA/wolfpack-auto
git pull
npm run dev                    # start locally
npm run validate               # verify everything works

# Production canary
CANARY_URL=https://wolfpack-auto.vercel.app npm run canary:quick

# Full canary against production
CANARY_URL=https://wolfpack-auto.vercel.app npm run canary
```

---

## Pre-Launch Checklist (Before Real Customer Data)

- [ ] Vercel Pro ($20/mo) — eliminates cold starts
- [ ] Neon Pro ($19-50/mo) — production database
- [ ] Custom domain ($12/year)
- [ ] Resend Pro ($20/mo) — real email notifications
- [ ] Remove DEMO_MODE=true from Vercel
- [ ] Set CANARY_SECRET in Vercel env vars
- [ ] Create admin logins for dealer staff
- [ ] MFA enrollment
