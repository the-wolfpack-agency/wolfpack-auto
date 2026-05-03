# Security Policy

## Reporting a vulnerability

Please **do not file a public GitHub issue** for security reports.

Send vulnerability details to: **security@thewolfpack.agency**

Include:
- A description of the vulnerability and its impact.
- Reproduction steps (URL, payload, browser/version) or a small PoC.
- Suggested mitigation if you have one.

We aim to:
- Acknowledge within **72 hours**.
- Provide a triage decision within **7 days**.
- Ship a fix or workaround within **30 days** for high-severity issues.
- Publish a coordinated disclosure with credit (if you want it) once the fix is live.

We do **not** currently run a paid bug-bounty program; we're happy to give public credit and a swag-tier thank-you for substantive reports.

## Scope

In scope:
- The deployed Wolfpack Auto application (`wolfpack-auto.vercel.app` and any `*.thewolfpack.agency` host that maps to a wolfpack-auto deploy).
- The codebase on this repo's `main` branch.
- The dependencies declared in `package.json`.

Out of scope:
- Findings that require physical access to the user's device.
- Brute force / volumetric DoS reports — we already rate-limit; please don't actually try.
- Issues only reproducible on outdated browsers (>2 majors behind current Chrome / Firefox / Safari).
- Findings against demo data, sample dealers, or seed accounts that do not affect real-tenant data.
- Public information disclosure (e.g. version banners, OpenAPI spec at `/openapi.json` is intentionally public).

## Practices we follow

- **CodeQL** runs on every push (see `.github/workflows/codeql.yml`).
- **Secret scanning** + **push protection** are enabled at the repo level.
- **Branch protection** on `main` requires PR + Verify CI green + 1 CODEOWNERS-approved review.
- **Dependabot** is enabled for npm + GitHub Actions.
- **Migration safety** workflow (`.github/workflows/migration-safety.yml`) verifies every DB migration applies + reverses cleanly before merge.
- **Canary tests** run after every deploy (`.github/workflows/canary-post-deploy.yml`) — a failed canary auto-rolls back.
- All durable persistence goes through `src/lib/triple-write.ts` (Postgres + Qdrant + Neo4j fan-out).
- Secrets live in Vercel environment variables, **never in git**.

## Coordinated disclosure

If you've reported via email, please give us the disclosure-window above before public discussion. We will credit you on the fix's release notes if you'd like.

Thanks for helping us keep dealers' data safe.
