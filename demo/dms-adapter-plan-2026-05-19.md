# DMS Adapter Plan — Wolfpack Auto

**Author:** CTO / 2026-05-19
**Status:** Strategy + scoped engineering plan. No code yet.
**Source of audit:** [demo/dealer-wedges-2026-05-19.md](dealer-wedges-2026-05-19.md)

---

## 1. The problem we're solving

Today's repo has three brand-name DMS adapter files — `cdk-adapter.ts`, `cox-vauto-adapter.ts`, `dealersocket-adapter.ts` — and **all three return `notConfigured()` on every call**. The only working ingest path is the `mock-adapter.ts` test scaffold and a generic CSV/SFTP drop. That means every "non-intrusive read-only DMS feed" pitch is a hypothetical until a real adapter ships.

A dealer asking *"how do you ingest my inventory?"* gets one of:
- "Manual CSV / SFTP drop daily." — true but unimpressive.
- "We're working on a CDK partnership." — true but unconvincing.
- "Live API." — false, today.

This document is the engineering plan to make option 3 true for **one** DMS, the right one.

## 2. The strategic call: pick ONE DMS first

We don't have the engineering budget to wire three real adapters in parallel. Order matters. Three candidate-DMS criteria:

| Criterion | Why it matters |
|---|---|
| **Market share among realistic pilot prospects** | We need adoption density in our network. CDK has the most installed base, but its API access is the most restricted. |
| **API access posture** | Some DMSes publish docs and self-serve credentials; others gate everything behind a partner contract. Self-serve wins for v1. |
| **Time-to-credential** | If we can get sandbox creds this week vs. quarter-long enrollment, that's the v1 pick. |
| **Read-only API quality** | Several DMSes expose inventory + leads but no deal/F&I data. For our wedge (inventory + leads only), read-only-light is fine. |

**Recommended v1 pick: VinSolutions or Cox/vAuto (Cox family), with a fast-follow generic CSV/SFTP poller for everything else.**

- **VinSolutions** is the most-used independent-dealer CRM. Cox owns it; the Cox Marketplace API gives read access to leads + inventory once you're enrolled. Enrollment is paperwork, not a multi-quarter contract.
- **Cox/vAuto** for pricing data; same Cox Marketplace umbrella.
- **CDK / Reynolds** as v2 — they require a more expensive partnership tier and the integration is heavier.
- **DealerSocket** as v3 — OAuth flow is published, but the API surface for analytics is thinner.

**Push-back on doing all three:** Anyone who tells you to "wire CDK and Reynolds at the same time" doesn't know how those partnerships work. Pick one, get to pilot revenue with that subset of the market, use the revenue to fund the next adapter.

## 3. Existing scaffolding we keep

The current stubs are well-shaped — they implement `DMSAdapter` from `src/lib/dms/types.ts` and have the right method signatures. We don't throw them away; we replace `notConfigured()` with real calls:

```ts
// Existing interface, unchanged
export interface DMSAdapter {
  isConfigured(): boolean;
  testConnection(): Promise<Result<{ ok: true }, IntegrationError>>;
  listVehicles(opts?: ListOpts): Promise<Result<DMSVehicle[], IntegrationError>>;
  listLeads(opts?: ListOpts): Promise<Result<DMSLead[], IntegrationError>>;
  // … listDeals, listServiceOrders, etc.
}
```

The `feed-processor.ts` is already DMS-agnostic — it normalizes whatever adapter emits into the canonical shape. Once a real adapter returns real vehicles, the entire downstream pipeline (analytics brain, photo studio auto-trigger which we shipped today, lead nurture) lights up automatically.

That's the leverage in this plan: **the rest of the platform is ready. We only have to bridge to one external system.**

## 4. Scope of work for v1 (VinSolutions, or equivalent)

### Phase 1 — Credentials + sandbox (Week 1, mostly paperwork)

- Apply for Cox Marketplace developer account. Goal: sandbox API key + test dealership credentials.
- Provision a secrets table row per tenant in `dms_adapter_credentials` (migration 079 already exists).
- Sign whatever DPA Cox requires for read-only access.
- ETA: 3-7 business days depending on Cox response time.

**Risk:** Cox enrollment is paperwork, not engineering. If it stalls, we fall back to a manual CSV / SFTP drop adapter (Phase 1b below) so a pilot dealer isn't blocked.

### Phase 1b — Generic SFTP/CSV adapter (fast-follow, 2-3 days of engineering)

Why: every DMS has *some* nightly data dump (overnight inventory CSV is industry standard since the 1990s). A generic SFTP adapter that pulls a known-shape CSV at 04:00 dealer-local-time is the universal fallback when the live API isn't available.

- New `src/lib/dms-adapters/sftp-csv-adapter.ts`. Reads SFTP credentials per dealer from `dms_adapter_credentials`.
- New `/api/cron/sftp-pull` cron — runs at 04:00 UTC, iterates configured dealers, pulls + parses + handoffs to existing `feed-processor.ts`.
- Same normalizer pipeline; same downstream wiring.

This lets us **onboard a paying dealer THIS MONTH** even if Cox enrollment is slow. The dealer's GM has to set up the nightly SFTP push from their DMS (most DMSes have a UI for this); after that, zero-touch.

### Phase 2 — VinSolutions live API (Week 2-3, real engineering)

Once Cox creds land:

- `vinsolutions-adapter.ts` implements `DMSAdapter`. Uses OAuth2 client-credentials flow (per-tenant client_id + client_secret stored encrypted in `dms_adapter_credentials`).
- `listVehicles()`: paginated `GET /api/v1/inventory?dealerId=X&modifiedSince=Y`. Cursor-based pagination, 100 vehicles per page.
- `listLeads()`: paginated `GET /api/v1/leads?dealerId=X&createdSince=Y`. Includes status, source, attributed salesperson.
- Rate-limit aware: Cox publishes rate caps; respect them via `lib/rate-limit.ts` (already wired for outbound).
- Token refresh: OAuth2 access tokens expire ~1 hour. `refresh.ts` orchestrator (already exists for Salesforce/HubSpot in wolfpack-apex; mirror the pattern).
- Idempotent ingest: `(dms_provider, external_id)` UNIQUE constraint on `vehicles` and `leads` already in the schema. Re-running pulls the same key, harmless.

### Phase 3 — Cox/vAuto pricing feed (Week 3-4)

If we want the pricing-recommendation wedge to fire on real data:

- `cox-vauto-adapter.ts` replaces the stub with real calls.
- Calls `/api/v1/marketdata/{vin}` per car for market-aware comparables.
- Feeds the existing `pricing-recommendations` engine (already built, just starved of data).

### Phase 4 — Reynolds, DealerSocket, CDK (Q3+)

Each follows the same pattern. The framework hardens with every adapter we ship. By the third one, the marginal cost is ~3 days, not 3 weeks.

## 5. Engineering cost estimate

| Phase | Effort | Calendar |
|---|---|---|
| 1 (creds + paperwork) | 1-2 hrs of CTO time + waiting | 1-2 weeks |
| 1b (SFTP/CSV fallback) | 2-3 days engineering | Concurrent with Phase 1 |
| 2 (VinSolutions live) | 5-7 days engineering | Week 2-3 (after creds) |
| 3 (Cox/vAuto pricing) | 3-4 days engineering | Week 3-4 |
| **v1 client-deployable** | **~10-14 engineering days total** | **~4 weeks elapsed** |

This assumes a single engineer (the CTO). With a contractor sharing the load: ~2 weeks elapsed.

## 6. Cost: subscription + per-dealer overhead

- Cox Marketplace developer account: **free** for sandbox; production access is per-dealer billed by Cox to the dealer (we don't pay).
- VinSolutions per-dealer activation: typically a one-time setup the dealer does in their VinSolutions admin; **no recurring cost to us**.
- Engineering: amortized across all future pilots.

The economics are kind: the integration cost is engineering time, not per-call API fees.

## 7. Security + compliance

- Per-tenant OAuth credentials encrypted at rest with AES-256-GCM (same pattern as wolfpack-apex's CRM connectors).
- Read-only scope only. No writes against the dealer's DMS in v1 — that's a contractually distinct privilege and we don't need it for the wedges we're pitching.
- Dealer data flows: their DMS → our adapter → our Postgres tenant row → analytics brain → outbound email to GM. **Dealer data never leaves their tenant's RLS scope.**
- Cox publishes a data-handling spec; we conform to it explicitly in our security posture page.

## 8. What we're explicitly NOT doing in v1

To prevent scope creep:

- **No write-back to the dealer's DMS.** Read-only. Round-trip CRM is a separate effort with its own contract requirements.
- **No real-time webhooks.** Pull-based polling on a 15-min cadence. Push integrations are v2.
- **No deal/F&I extraction.** Inventory + leads only. F&I tables stay in our schema, sourced from our admin UI, until a paying dealer asks for live extraction.
- **No service-department integration.** Service ROs are a different VinSolutions module; v3.

## 9. Success criteria for v1

- One dealer's inventory shows up in `/admin/inventory` end-to-end, sourced via live VinSolutions API.
- The analytics brain at `/admin/analytics-brain` renders real insights from that dealer's data.
- Photo studio auto-generates backgrounds for new inventory rows (wired earlier today in commit `9216d39`).
- Cron pulls inventory + leads every 15 min for that one dealer, no manual intervention.
- End-to-end latency: dealer adds a car in VinSolutions UI → ~15 min later it's in our inventory list → ~45 min later it has an AI-generated background photo.

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Cox enrollment stalls | SFTP/CSV adapter (Phase 1b) unblocks the same dealer with a nightly file drop. |
| Cox revokes API access if our usage pattern flags as abuse | Strict rate-limit + audit-log every outbound call. Their dashboard shows us as a well-behaved consumer. |
| Pilot dealer is on a DMS we haven't built (Reynolds, CDK) | Offer the SFTP/CSV path for v1, commit to a native adapter in 8-12 weeks for paying dealers. |
| Engineering velocity slips behind paperwork | Phase 1b is the firebreak. If Cox is slow, we still ship something. |

## 11. The honest pitch to a prospect

> "Our v1 integration with your DMS is read-only and runs nightly. Once you set up the standard CSV export (most DMSes have a UI for this), we ingest your inventory and leads, run our analytics brain on top, and email you 3 plain-English insights weekly. No writes against your DMS. No risk to your existing workflow. If the data tells us this is working for you after 30 days, we'll wire the live VinSolutions/Cox API so the cadence drops from nightly to 15-minute."

That's a pitch we can defend honestly. Today, we can't.

---

## Open questions for the CTO

1. **Pick the v1 DMS now or wait for a prospect to dictate?** I lean toward picking VinSolutions/Cox now so we're not blocked when a prospect appears. The Cox enrollment is the long pole.
2. **SFTP/CSV adapter — build it before or alongside the live API work?** Recommend before, because it unblocks any pilot regardless of DMS.
3. **Who runs the Cox enrollment paperwork?** I'd default to the CTO (Nick H. as backup) — engineering can't move forward without it.

If you want me to start Phase 1b (SFTP/CSV adapter) this week as a no-blocker engineering effort, I can scope it to 2-3 days.
