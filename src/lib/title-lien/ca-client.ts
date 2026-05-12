/**
 * California title/lien client.
 *
 * Honesty: California DMV does NOT expose a true free public API for title +
 * lien lookups. The DMV public records portal exists, but it is form-based
 * (Form INF 70) and not API-accessible. The "California DMV Information API"
 * is paid and gated behind a vendor agreement.
 *
 * Per Stream E's "honest mode" requirement, we mark CA as
 * `supported: false, reason: 'state_not_supported_yet'` and leave a TODO
 * with the actual data source. We DO NOT mock a response.
 *
 * TODO(stream-e-v2): integrate with one of:
 *   - DMV INF 70 records request (manual workflow; not API)
 *   - Paid partnership (e.g., Carfax Title History, NMVTIS data provider)
 *   - State DMV vendor API once Wolfpack qualifies for access
 */

import type { TitleLienClient, TitleLienResult } from "./types";

export const caClient: TitleLienClient = {
  state_code: "CA",
  supported: false,
  async lookup(vin: string): Promise<TitleLienResult> {
    return {
      vin: vin.toUpperCase(),
      state_code: "CA",
      supported: false,
      reason: "state_not_supported_yet",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    };
  },
};
