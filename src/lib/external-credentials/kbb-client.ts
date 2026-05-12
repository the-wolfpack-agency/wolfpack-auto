/**
 * KBB (Kelley Blue Book) BYO client — schema-only stub.
 *
 * HONEST STATUS (verified 2026-05-12):
 *   KBB does NOT issue per-dealer credentials in practice. A real KBB /
 *   Cox Automotive valuation feed requires a signed enterprise contract +
 *   dealer-group rollup, not a self-serve API key. We retain the BYO
 *   credential slot here so the schema is forward-compatible if Cox ever
 *   shifts to a self-serve model, but we do NOT pretend the slot is
 *   functional today.
 *
 *   For real per-vehicle valuations today, use src/lib/external-credentials/
 *   edmunds-client.ts (free public API, no credentials needed).
 *
 * This file declares the BYO credential SHAPE we would expect when/if KBB
 * partners with us, plus a `getValuation()` function that intentionally
 * returns an `unavailable` IntegrationError so call sites can degrade
 * gracefully without crashing.
 */

import type {
  IntegrationError,
  Result,
} from "@/lib/external-credentials/edmunds-client";
import { loadCredential } from "@/lib/external-credentials/index";

/**
 * BYO credential payload shape stored encrypted in
 * `dealer_external_credentials` for the 'kbb' provider slot.
 *
 * KBB historically uses OAuth2 client-credentials with a dealer-rollup ID
 * (`dealerGroupId`). If/when they expose a self-serve flow we encrypt the
 * full triplet so future code rotates them as a unit.
 */
export interface KbbCredentialShape {
  apiKey: string;
  apiSecret?: string;
  /** Cox Automotive dealer-rollup identifier (when applicable). */
  dealerGroupId?: string;
}

export interface KbbValuation {
  vin: string;
  providerLabel: string;
  tradeInValueCents: number;
  privatePartyValueCents: number;
  dealerRetailValueCents: number;
  capturedAt: string;
}

/**
 * Attempt to fetch a KBB valuation. Always returns an
 * `upstream_unavailable` error today — the schema is preserved for the
 * future-partnership path. Calling code MUST check `ok` and fall back to
 * Edmunds (real) when this returns unavailable.
 */
export async function getKbbValuation(args: {
  dealerId: string;
  vin: string;
}): Promise<Result<KbbValuation, IntegrationError>> {
  // Load the BYO credential row in case the dealer added one. We do not
  // use it today, but loading it stamps `last_used_at` audit so the
  // operator sees we are aware of their entry.
  await loadCredential(args.dealerId, "kbb", null, { markUsed: false });

  return {
    ok: false,
    error: {
      code: "upstream_unavailable",
      message:
        "KBB does not issue per-dealer self-serve credentials. Use Edmunds (free) or wait on the Cox Automotive partnership.",
    },
  };
}
