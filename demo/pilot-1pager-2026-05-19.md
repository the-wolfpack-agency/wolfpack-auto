# Wolfpack Auto — Dealership Pilot Program

**One-page pilot terms. Sign here. We start within 7 days.**

## What you get

A complete operating system for your dealership, replacing:

- **Photo / VDP tooling** — AI vehicle backgrounds, walkaround videos, automatic photo enhancement.
- **Pricing software** — daily AI-driven pricing recommendations with market context per vehicle.
- **Analytics dashboard** — plain-language insights that tell you what's *about* to happen, not just what already did.
- **Lead management** — scored leads, drip campaigns, F&I desking, deal funding, GL integration.
- **Service + parts** — appointment booking, repair-order tracking, parts inventory.
- **Accounting hooks** — automatic journal entries to your GL on every deal-fund event.

All of it in one platform. One subscription. One support contact.

## What it costs (pilot)

| Term | Pilot rate | Standard rate (post-pilot) |
|---|---|---|
| 30 days | **$X / month** (50% of standard) | $Y / month per location |

- **No setup fee.**
- **No per-seat charge.** Unlimited users on your team.
- **Cancel anytime during the pilot** — pay only for the days you used.

## What we need from you (week 1)

- A read-only export of your current DMS data (CSV is fine; we ingest most formats).
- Your dealership domain + logo for the customer-facing site.
- One designated point of contact for daily check-ins during the pilot.
- Access to your Google Analytics / website analytics if you have them (helps the brain calibrate).

## Timeline

| Week | What happens |
|---|---|
| Week 1 | Data ingest. Account setup. Branding. We do the work. |
| Week 2 | Team training (3 sessions, 30 min each). Sales, F&I, Service tracks. |
| Week 3 | Soft-launch. We watch the brain calibrate. You use it daily. |
| Week 4 | Pilot review. Decision point: continue at standard rate, modify, or stop. |

## Who owns the data

**You do.** Your data lives in your isolated tenant. We can't see other dealerships' data; they can't see yours. RLS-enforced at the database layer.

If you choose not to continue after the pilot, we hand you a SQL dump of your tenant within 5 business days and permanently delete our copy within 30. Confirmed in writing.

## Security posture

- Postgres on Neon (SOC 2 Type II).
- Hosted on Vercel (SOC 2 Type II).
- All admin endpoints require authenticated sessions with 15-minute JWT TTL + httpOnly refresh tokens.
- Audit log records every mutating action with hash-chained immutability.
- Every deploy passes our internal security scanner (AgenticQA) — 20 security checks against the OWASP Top 10 + custom dealer-specific patterns.

Full security posture: `https://wolfpack-auto.vercel.app/security-posture`.

## Support during the pilot

- **Slack channel** with you + your team + the Wolfpack engineering team. Direct line, no tickets.
- **Response time**: 4 business hours for any question, 1 business hour for any outage.
- **Weekly 30-min check-in** with the Wolfpack Agency CTO for the duration of the pilot.

## Exit clause

- Either party may terminate the pilot with 5 business days' written notice.
- On termination: data export delivered, both copies wiped per the data-ownership clause, no further charges.
- If you choose to continue past the pilot, the standard rate kicks in on day 31 and we sign a 12-month subscription agreement. No auto-renew without explicit opt-in.

## Signature block

Authorized for **Wolfpack Agency**:

- Name: __________________________________
- Title: __________________________________
- Date: ___________________________________
- Signature: ______________________________

Authorized for **<Dealership Legal Name>**:

- Name: __________________________________
- Title: __________________________________
- Date: ___________________________________
- Signature: ______________________________

---

Questions: homyk@thewolfpack.agency
