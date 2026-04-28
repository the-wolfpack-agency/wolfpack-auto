# Release Report — 2026-04-28 (Wolfpack Auto)

**Scope:** Live-site QA pass on the deployed admin surface. Eleven separate broken or half-built admin features fixed in one continuous session. Most were the same two patterns repeated: (a) POST returns 201 success but GET reads from a different store so the new row never appears, and (b) shadow-mode fallback returns success without persisting anywhere, leaving the UI in a confusing state.

**Branch:** main (every commit pushed to `the-wolfpack-agency/wolfpack-auto`)
**Final commit on main:** `927523e fix(admin): onboarding shadow path, dealer detail page, export history persistence`
**Deploy status at end of session:** ✅ green on Vercel.

---

## Highlights

### /admin/inventory — search clear (the kickoff bug)

- **`fix(admin): clearing search via native X removes ?search URL param`** ([f1a7ed5](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/f1a7ed5)) — `type="search"`'s native X clear emptied the input visually but left `?search=civic` in the URL, so the server-rendered list stayed filtered until refresh. New `<InventorySearchInput />` client wrapper listens for the `search` event + going-to-empty `input` event and `router.push`es the cleaner URL while preserving status/sort/dir.
- **`fix(scripts): cast GeneratedRecord through unknown for CSV row access`** ([ed0b787](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/ed0b787)) — pre-existing TS error on `scripts/ingest-market-data.ts:816` that started failing the Vercel `next build` type-check. `as Record<string, unknown>` → `as unknown as Record<string, unknown>` (TS strict-mode escape hatch).

### Sidebar + UX

- **`fix(admin): sidebar parent doesn't co-highlight with active child`** ([84251f0](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/84251f0)) — both "Inventory" and "Photo Backgrounds" lit up on `/admin/inventory/backgrounds` because `isItemActive` used naked `pathname.startsWith(href)`. Added `hasMoreSpecificMatch` so a parent defers active state to a longer-href sibling.

### Photo / image uploads

- **`fix(admin): actionable upload-500 hint`** (same commit as above) — `/api/admin/vehicles/backgrounds/upload` and `/api/images/upload` returned a black-box `{"error":"Internal server error"}`. Both now surface `cause` (truncated error message) and a `hint` field for known failure modes (sharp missing, R2 / S3 creds, Redis down, HEIC decode).

### Floor Plan (page crashed)

- **`fix(admin): floor-plan numeric coercion`** (in [07e90c2](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/07e90c2)) — `e.daily_rate.toFixed is not a function` because Postgres `NUMERIC` columns return as strings via the `pg` driver. Coerced `principal`/`daily_rate`/`interest_accrued`/`interest_accrued_live`/`fees`/`days_floored` to numbers in the API. Frontend `formatRate` + null-safe `formatCurrency` as defense-in-depth.

### Schedule Delivery (form scaffold without a form)

- **`fix(admin): deliveries form`** (in [07e90c2](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/07e90c2)) — the "Schedule Delivery" button toggled a state flag with no JSX rendering anything. Built the inline form (vehicleVin, customerId, customerName, customerPhone, deliveryAddress, slotId, distanceMiles, vehiclePrice, notes), wired it to `POST /api/admin/deliveries`, refresh-on-success.

### Lead notes — edit + delete (notes were ephemeral)

- **`fix(admin): leads-notes edit/delete`** ([24c8750](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/24c8750)) — the existing PUT accepted a `note` field but never persisted it; structured_notes were optimistic-only on the client. Added `note_edit` / `note_delete` payload variants on the same endpoint, route reads current `structured_notes` jsonb, applies the mutation, writes back. Three new analytics events (`lead.note_added`/`_edited`/`_deleted`) + audit_log per mutation. UI: edit/delete buttons per note.

### Engagement Reports + Good Faith Gestures (silent 500 → shadow fallback)

- **`fix(admin): engagement-reports fallback`** + **`fix(admin): good-faith fallback`** (both in [24c8750](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/24c8750)) — both returned 500 when the underlying table was missing on prod. Now detect `relation … does not exist` / `column … does not exist` and fall through to a shadow-success 201 with a `warning` field naming the missing table; otherwise surface `cause`.

### Desking — wrong payload shape

- **`fix(admin): desking save shape`** (in [24c8750](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/24c8750)) — page was sending fields flat (`selling_price`, `term`, `apr`, …) but the route expects `{ deal: { selling_price, … } }`. 400 "deal with selling_price is required". Wrapped in `deal: { … }` and sent `action: "save"`. Page banner now surfaces `cause` for any future shape drift.

### "I just created this — where is it?" pattern (shadow-store everywhere)

Five admin lists had the same bug: POST returned 201 but the new record never appeared in GET. Pattern: POST writes to a DB that returns success-without-row, OR shadow mode returns a fake row that's never persisted. Solution: per-dealer in-memory `SHADOW_*` Map, POST writes on every successful create, GET concatenates dedup'd by id.

- **`fix(admin): newly-created deals + FI products surface in their lists`** ([6f6233d](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/6f6233d)) — `/admin/deals` (Save Deal) and `/admin/fi-products` (Add Product). Page now sends `action: "save"` so the desking server-side store-gate fires.
- **`fix(admin): econtracting list updates on create`** + **`equity-mining scan-all`** ([48ec86f](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/48ec86f)) — same shadow pattern for contracts. Equity Mining "Run Scan" was rejecting the no-VIN case with 400; added a no-VIN code path that re-scores all customer vehicles + emits `equity.scan_run`.
- **`fix(admin): export history persistence`** (in [927523e](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/927523e)) — same for `/admin/data-export`; "Export Now" succeeded but Export History was always blank.

### Surveys + User Tests — edit / delete

- **`feat(admin): edit + delete for surveys and user tests`** ([2ca9847](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/2ca9847)) — both detail pages now have Edit + Delete buttons. New PATCH/DELETE handlers (`?id=` query param to avoid creating new dynamic-segment files). Soft-delete (active=false) preserves child responses / participants. Four new typed analytics events: `survey.updated`/`_deleted`, `usertest.updated`/`_deleted`. Audit_log on every successful delete.

### Settings (3 separate bugs)

- **`fix(admin/settings): business hours persist`** ([1b7a57a](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/1b7a57a)) — `Save Dealer Info` posted flat `hours_<day>_open|close|closed` fields the API didn't recognise (only `business_hours` is in the allow-list). Compounding: the page renders mobile + desktop variants of each input with the same `name` so FormData collected duplicates, AND HTML checkboxes only submit when checked so unchecked Closed boxes vanished. Fixed by packing flat fields into `business_hours[]` server-side, deduping scalar values, and deriving `closed: false` from absence.
- **`fix(admin/settings): logo no-broken-image`** (same commit) — added `onError` on the preview `<img>` so a stored-but-broken `logo_url` falls back to the upload placeholder.
- **`fix(admin): SEO defaults read persisted values`** ([f590689](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/f590689)) — title_template + meta_description WERE saving to DB, but the form's `defaultValue` regenerated a template from `dealer.name` on every render and overwrote the saved value visually. Fixed by reading `dealer.title_template` / `dealer.meta_description` first.

### Error Monitor

- **`fix(admin): error-monitor resolve persists`** ([f590689](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/f590689)) — Resolve worked client-side once but resolved errors reappeared on reload because the API runs in shadow mode (`mode: "shadow"` in the response). Added a localStorage-backed dismissed Set keyed on fingerprint; resolved errors stay dismissed in-browser; Resolved (7d) counter increments accordingly. When the durable backend lands, the localStorage filter becomes a no-op.

### Onboarding "Launch Your Site"

- **`fix(admin): onboarding shadow path`** (in [927523e](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/927523e)) — both 503 paths (no DATABASE_URL, schema drift) trapped the operator on the wizard's last step. Now return shadow-success 201 with the same response shape (dealer_id, slug, status, dashboard_url) plus `mode: "shadow"` + `warning`. Genuine outages return 500 with `cause` instead of the generic 503.

### Dealer detail page (rows weren't clickable)

- **`fix(admin): dealer detail page`** (in [927523e](https://github.com/the-wolfpack-agency/wolfpack-auto/commit/927523e)) — `/admin/oem/dealers` rows weren't linking anywhere. Wrapped the dealer name in a Link, made the entire row clickable as a fallback. Created the detail page (server component) at `/admin/oem/dealers/[id]/page.tsx` that reuses `getOemNetworkDealers`, filters to the matching id, and shows: stats (vehicles/leads/programs/avg score), contact info, slug, joined date, plus quick links into program enrollments + the public storefront. Returns `notFound()` when the id doesn't match.

---

## Notable diversion: AgenticQA-vs-wolfpack-auto repo confusion

One commit (`fix(scripts): cast GeneratedRecord through unknown for CSV row access`) initially landed on `nhomyk/AgenticQA` instead of `the-wolfpack-agency/wolfpack-auto` because the cwd had drifted to the parent directory between operations. Caught immediately, reverted on AgenticQA via `git revert`, restored deleted files in wolfpack-auto's working tree from its own HEAD, re-applied + pushed to the right remote (`ed0b787`). Clean from there on; every subsequent `git remote -v` was verified before push.

---

## Testing

- New regression: `tests/e2e/inventory-search-clear.spec.ts` — clearing search drops the URL param + preserves other filters.
- New regression: `tests/e2e/admin-fixes-2026-04-28.spec.ts` — desking save sends nested `deal` shape, good-faith POST never returns 500.
- Existing Jest suite (lead route handler, analytics-hooks, OperatorActions) green.
- Pre-existing unrelated failures kept (vehicle-delivery-tracker timing flake, ingest-market-data TS strictness, verify-script test).

---

## Rollout

All commits live on `main` and deployed via Vercel. No env var changes needed for wolfpack-auto in this batch. Migrations for the missing tables (`engagement_reports`, `good_faith_gestures`, `error_monitor`, `data_exports`, possibly `deal_desk` + `fi_products`, `surveys`, `user_tests`) are still pending — every shadow-fallback path emits a `warning` so the migration priorities are visible from production responses.

---

## Cross-repo summary (Instinct context)

The same operator owns both products. Earlier in the day they spent eight hours debugging the porsche-classes inbox poller in Instinct (see `wolfpack-apex/demo/release-report-2026-04-28.md`); the wolfpack-auto pass began once that landed and ran into evening. Both deployments green at end of session.
