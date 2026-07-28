# Release Report: 2026-07-28 (multi-day session, 2026-07-25 to 2026-07-28)

Cross-repo session. Two products shipped, plus one client deliverable and one
piece of durable tooling. Everything below is deployed to production and
verified on the live URL (typecheck + tests + build + live E2E where noted).

---

## wolfpack-auto (branch `feat/homepage-redesign-v01`, deployed to prod)

Live: https://wolfpack-auto.vercel.app

### Team invites and account email (the big one)
- **Invites now actually send.** Root cause was two-fold: the send was
  fire-and-forget so the UI showed "Invitation sent" even when nothing went,
  and the Resend sender was a sandbox address. Rebuilt onto **Microsoft Graph
  app-only Mail.Send** (the same M365 transport beyond-sku and Instinct use, no
  Resend, no DNS). `sendTeamInvite` now returns `{ delivered, reason, acceptUrl }`
  and the UI surfaces a copyable one-time link when delivery is unavailable
  instead of faking success. Commits `22dbe85`, `0ee8316`.
- **Rescind pending invites.** A pending invite locked its email globally (409
  on re-invite). Added a hard rescind for never-accepted invites that frees the
  email; accepted users still soft-deactivate. Commit `d1b5875`.
- **Forgot-password and all notifications routed through Graph.** The shared
  `dispatchEmail` now prefers Graph, so password reset, lead alerts, and
  confirmations use the working mailbox. Fixed the reset-link base URL bug.
  Commit `962f67d`.
- **Email header shows the full dealer name** (or logo), not a hardcoded "W".
  Commit `0ee8316`.

### Admin and onboarding
- **Onboarding redirect no longer traps deep admin pages.** It funneled every
  `/admin/*` page to Getting Started, so `/admin/team` (the very page the
  "invite a teammate" step links to) was unreachable. Now only the dashboard
  landing funnels. Commit `626664c`.
- **Admin console restyled** to the monochrome brand system (killed the navy
  tint), and the **sidebar brand now reads from the dealer config in Settings**
  (same source as the public site) instead of a hardcoded "Wolfpack Auto".
  Commits `8b87c0b`, `b895656`, `731b398`.

### Public site
- **/contact 500 + "[object Object]" banner fixed** (business_hours data-shape
  normalization). Commit `d8bf147`.
- **/help support search actually works** (reads the query, filters, shows
  results or an empty state). Commit `99d2868`.
- **Sub-page header/hero is one continuous color** (no two-tone seam). Commit
  `be26c0c`.
- **Mobile fixes:** payment selector width, trade-in callout overlap, and the
  trade-in graphic gap plus trust badges on mobile. Commits `82a5a2e`,
  `08d68a2`.
- **"Image coming soon"** placeholders replace bare icons / mismatched stock
  photos across Featured, Similar Vehicles, and Shoppers Also Viewed. Commits
  `b2b0745`, `c9379dd`, `731b398`.
- Compact schedule/address banner, route-aware nav background, long-name mobile
  nav fix, Module Access copy. Commits `6cfa1a2`, `0bc1710`, `2a841c0`, `b787bf9`.

### Infrastructure
- **Neon egress fix.** Five admin/status dashboards polled the DB on a timer
  that kept firing when the tab was backgrounded, burning "public network
  transfer" quota around the clock. Added `pollWhileVisible` (only polls while
  the tab is visible); a hidden tab now costs zero DB egress. Commit `4913e35`.
- Dealer-config cache shortened to 30s so Settings changes reflect fast.

---

## wolfpack-lms (branch `feat/scorm-import-and-hardening`, deployed to prod)

Live: https://wolfpack-lms.vercel.app (sign in `admin@demo.lms` / `lms`, then
Build)

- **Studio to LMS is connected.** SCORM import (`/api/scorm/import` +
  `src/lib/scorm-import.ts`) parses an imsmanifest (SCORM 1.2 and 2004) and
  creates a course through the course-store, so an imported course appears in
  the catalog immediately (shadow mode included). Secure by construction: no XML
  library (no XXE) and in-memory manifest extraction (no zip-slip). Fires
  analytics/xAPI so imported content enters the learning loop.
- **Import UI** on `/teach/courses` (upload a `.zip` or imsmanifest, see the
  created course). Verified live end to end.
- **Hardening:** 11 admin-route contract suites + 7 API contract suites + the
  import contract test + 2 Playwright E2Es (student journey and SCORM import),
  a real `verify.sh` gate + `npm run verify` + CI, migration-discipline docs.
- **Dependency hygiene:** eslint crash fixed (it runs now); `npm audit` 33 to 19
  (critical and all-low cleared).
- **Test count: 18 suites / 85 tests (baseline) to 38 suites / 208 tests.**
  typecheck clean, build green, both E2Es green on live.

---

## Client deliverable

- **The Moster Law Firm external website review** (security, privacy,
  accessibility, speed, SEO). Read-only scan, WordPress surface + CVE
  cross-reference against Wordfence/Patchstack/WPScan. 0 critical, 2 high, 10
  medium, 10 low. Delivered as an OGIAM-styled PDF plus a summary email (both on
  the Desktop). Findings included a disclosed admin username, named CVEs on
  outdated plugins, pre-consent advertising cookies, and site-wide accessibility
  gaps.

## Tooling

- **`~/.claude/style-guard.py`**: a deterministic pre-delivery check for em/en
  dashes and the private email. Run it on every deliverable (report, email,
  code, commit) before hand-off. Turns a recurring manual rule into a mechanical
  gate.
