/**
 * Florida title/lien client (FLHSMV).
 *
 * Honesty (per Stream E "no silent mocks" rule):
 *
 *   FLHSMV publishes a "Motor Vehicle Information Check" page
 *   (https://services.flhsmv.gov/MVCheckWeb/) which returns title status,
 *   brand history, and lien indicator for a VIN.  Two practical problems
 *   with treating it as a free public API:
 *
 *     1. The endpoint is CAPTCHA + cookie gated. There is no documented
 *        JSON contract, and the published Terms of Service explicitly
 *        prohibit automated access.
 *     2. The FLHSMV Bulk Data Subscription Service (the official
 *        programmatic option) is a paid, contract-required vendor channel.
 *
 *   Per CLAUDE.md "no silent data loss" + "honesty over enthusiasm" — and
 *   the Stream E spec ("if any of these state APIs turn out to require a
 *   paid subscription or aren't truly publicly accessible, mark them
 *   clearly… rather than mocking a response") — we return
 *   `supported: false, reason: 'paid_subscription_required'` for Florida.
 *
 *   This is a deliberate, audit-trail-honest stub. The dispatcher and
 *   route still cache the result so we don't re-attempt every page load,
 *   and analytics fire `title_lien.state_not_supported` so we can size
 *   the demand before paying for a real data source.
 *
 *   TODO(stream-e-v2): subscribe to FLHSMV Bulk Data, or partner with an
 *   NMVTIS-approved aggregator (LexisNexis VINguard, AutoCheck,
 *   Carfax-for-Dealers Title History) which legally redistributes FL
 *   title brand + lien data on a per-VIN basis.
 *
 * The interior helper `parseFlhsmvResponse` is exported so unit tests can
 * exercise the parser shape once a real (or partner) endpoint is wired in.
 */

import type { TitleLienClient, TitleLienResult } from "./types";

/**
 * Structural parser for a future FLHSMV-shaped JSON response.
 *
 * Today FLHSMV does not return JSON publicly, so this function is exercised
 * only by tests with hand-built fixtures matching the publicly-documented
 * field names. It is exported (not just internal) so that when the partner
 * integration lands, the route + cache + analytics already know the shape.
 */
export function parseFlhsmvResponse(raw: {
  vin?: string;
  titleStatus?: string;
  hasLien?: boolean;
  lienholderName?: string | null;
}): {
  has_lien: boolean | undefined;
  title_status: string | null;
  lienholder_name: string | null;
} {
  return {
    has_lien:
      typeof raw.hasLien === "boolean" ? raw.hasLien : undefined,
    title_status:
      typeof raw.titleStatus === "string" && raw.titleStatus.trim().length > 0
        ? raw.titleStatus.trim()
        : null,
    lienholder_name:
      typeof raw.lienholderName === "string" && raw.lienholderName.length > 0
        ? raw.lienholderName
        : null,
  };
}

export const flClient: TitleLienClient = {
  state_code: "FL",
  supported: false,
  async lookup(vin: string): Promise<TitleLienResult> {
    return {
      vin: vin.toUpperCase(),
      state_code: "FL",
      supported: false,
      reason: "paid_subscription_required",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    };
  },
};
