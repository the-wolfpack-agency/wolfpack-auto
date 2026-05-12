/**
 * Texas title/lien client (TxDMV).
 *
 * Honesty: TxDMV's "Title Check" tool (https://www.txdmv.gov/motorists/buying-or-selling-a-vehicle/title-check)
 * is a web form that returns title-brand info for a VIN, but it is rate-
 * limited, CAPTCHA-gated, and explicitly NOT intended for programmatic use.
 * The structured TxDMV vehicle-data API is a paid subscription service.
 *
 * Per Stream E's "honest mode", we mark Texas as
 * `supported: false, reason: 'paid_subscription_required'`. We do NOT scrape
 * the public form (ToS prohibits automated access) and we do NOT mock data.
 *
 * TODO(stream-e-v2): apply for TxDMV vendor access OR partner with an
 * NMVTIS-approved data provider (LexisNexis VINguard, Carfax for Dealers,
 * Experian AutoCheck) which aggregates TX title brands legally.
 */

import type { TitleLienClient, TitleLienResult } from "./types";

export const txClient: TitleLienClient = {
  state_code: "TX",
  supported: false,
  async lookup(vin: string): Promise<TitleLienResult> {
    return {
      vin: vin.toUpperCase(),
      state_code: "TX",
      supported: false,
      reason: "paid_subscription_required",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    };
  },
};
