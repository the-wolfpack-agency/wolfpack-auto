/**
 * Market Intelligence — public surface.
 *
 * Composes valuation + comparables + signal generation + persistence into a
 * single entry point used by the API route + cron refresh.
 */

import { findComparables } from "@/lib/market-intel/comparable-finder";
import {
  auditRefresh,
  emitRefreshAnalytics,
  insertComparableListings,
  insertMarketValueSnapshot,
  tripleWriteMarketSignal,
  upsertVehicleMarketSignal,
} from "@/lib/market-intel/persistence";
import { generateSignal } from "@/lib/market-intel/signal-generator";
import { chooseValuationProvider } from "@/lib/market-intel/valuation-providers";
import type {
  ComparableListing,
  MarketValue,
  TargetVehicle,
  VehicleMarketSignal,
} from "@/lib/market-intel/types";

export * from "@/lib/market-intel/types";
export {
  MockValuationProvider,
  KbbValuationProvider,
  chooseValuationProvider,
  setValuationProviderForTest,
} from "@/lib/market-intel/valuation-providers";
export { findComparables, DEFAULT_RADIUS_MILES } from "@/lib/market-intel/comparable-finder";
export { generateSignal, medianComparablePriceCents } from "@/lib/market-intel/signal-generator";

export interface RefreshOptions {
  via: "api" | "cron";
  userId?: string;
  radiusMiles?: number;
  comparablesLimit?: number;
}

export interface RefreshResult {
  signal: VehicleMarketSignal;
  value: MarketValue | null;
  comparables: ComparableListing[];
}

/**
 * Refresh one vehicle's market intelligence end-to-end:
 *   1. Pull valuation from the active provider (mock by default).
 *   2. Pull comparables (mock until partnership feed lives).
 *   3. Generate the derived signal (pure function).
 *   4. Persist: snapshot + comps + signal upsert + triple-write fan-out.
 *   5. Emit analytics + audit-log.
 *
 * Never throws to the caller; returns null-safe data so the calling route
 * can render an explicit "no market data" empty-state when appropriate.
 */
export async function refreshVehicleMarketIntel(
  target: TargetVehicle,
  opts: RefreshOptions,
): Promise<RefreshResult> {
  const provider = chooseValuationProvider();

  let value: MarketValue | null = null;
  try {
    value = await provider.getMarketValue({
      vin: target.vin,
      year: target.year,
      make: target.make,
      model: target.model,
      miles: target.miles,
      zipCode: target.zipCode,
      conditionGrade: target.conditionGrade,
    });
  } catch (err) {
    console.warn("[market-intel] valuation provider failed (non-blocking):", err);
  }

  const comparables = await findComparables(target, {
    radiusMiles: opts.radiusMiles,
    limit: opts.comparablesLimit,
  });

  const signal = generateSignal({ target, snapshot: value, comparables });

  // Persist Postgres first (source of truth). Each helper swallows its own
  // errors so a partial failure doesn't break the caller. Snapshot + comps
  // are append-only — they only insert when DATABASE_URL is set.
  if (value) await insertMarketValueSnapshot(target, value);
  if (comparables.length) await insertComparableListings(target, comparables);
  await upsertVehicleMarketSignal(signal);

  // Triple-write fan-out (best-effort).
  tripleWriteMarketSignal(signal, target).catch(() => {});

  // Analytics + audit.
  emitRefreshAnalytics(signal, value, comparables.length);
  auditRefresh(signal, opts.userId, opts.via).catch(() => {});

  return { signal, value, comparables };
}

/* ------------------------------------------------------------------ */
/*  Read helpers (used by the GET API route + dashboard)               */
/* ------------------------------------------------------------------ */

export interface CurrentSignalResponse {
  signal: VehicleMarketSignal | null;
  recentSnapshots: Array<{
    source: string;
    market_value_cents: number;
    captured_at: string;
    is_mock: boolean;
  }>;
  topComparables: ComparableListing[];
}

/**
 * Load the latest signal + last 5 snapshots + top 5 cheapest comparables
 * for the dashboard market-intel card. All queries are dealer-scoped.
 */
export async function loadCurrentMarketIntel(
  vehicleId: string,
  dealerId: string,
): Promise<CurrentSignalResponse> {
  const empty: CurrentSignalResponse = {
    signal: null,
    recentSnapshots: [],
    topComparables: [],
  };
  if (!process.env.DATABASE_URL) return empty;

  try {
    const { query } = await import("@/lib/db");
    const [signalRow, snapRows, compRows] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT vehicle_id, dealer_id, days_on_lot, market_velocity_days_median,
                our_price_cents, market_value_cents, price_delta_cents,
                recommendation, confidence, rationale, comparables_count,
                generated_at
           FROM vehicle_market_signals
          WHERE vehicle_id = $1 AND dealer_id = $2
          LIMIT 1`,
        [vehicleId, dealerId],
      ),
      query<Record<string, unknown>>(
        `SELECT source, market_value_cents, captured_at,
                COALESCE((raw_payload->>'isMock')::boolean, source = 'mock') AS is_mock
           FROM market_value_snapshots
          WHERE vehicle_id = $1 AND dealer_id = $2
          ORDER BY captured_at DESC
          LIMIT 5`,
        [vehicleId, dealerId],
      ),
      query<Record<string, unknown>>(
        `SELECT comp_source, comp_vin_or_id, comp_year, comp_make, comp_model,
                comp_trim, comp_price_cents, comp_miles, comp_distance_miles,
                comp_dealer_name, comp_url, captured_at,
                COALESCE((raw_payload->>'isMock')::boolean, comp_source = 'mock') AS is_mock
           FROM market_comparable_listings
          WHERE vehicle_id = $1 AND dealer_id = $2
          ORDER BY captured_at DESC, comp_price_cents ASC
          LIMIT 5`,
        [vehicleId, dealerId],
      ),
    ]);

    const sRow = (signalRow.rows as Record<string, unknown>[])[0];
    const signal: VehicleMarketSignal | null = sRow
      ? {
          vehicleId: String(sRow.vehicle_id),
          dealerId: String(sRow.dealer_id),
          daysOnLot: Number(sRow.days_on_lot) || 0,
          marketVelocityDaysMedian: sRow.market_velocity_days_median == null
            ? null
            : Number(sRow.market_velocity_days_median),
          ourPriceCents: Number(sRow.our_price_cents) || 0,
          marketValueCents: Number(sRow.market_value_cents) || 0,
          priceDeltaCents: Number(sRow.price_delta_cents) || 0,
          recommendation: sRow.recommendation as VehicleMarketSignal["recommendation"],
          confidence: Number(sRow.confidence) || 0,
          rationale: String(sRow.rationale ?? ""),
          comparablesCount: Number(sRow.comparables_count) || 0,
          generatedAt: sRow.generated_at instanceof Date
            ? sRow.generated_at.toISOString()
            : String(sRow.generated_at),
        }
      : null;

    return {
      signal,
      recentSnapshots: (snapRows.rows as Record<string, unknown>[]).map((r) => ({
        source: String(r.source),
        market_value_cents: Number(r.market_value_cents) || 0,
        captured_at: r.captured_at instanceof Date
          ? r.captured_at.toISOString()
          : String(r.captured_at),
        is_mock: Boolean(r.is_mock),
      })),
      topComparables: (compRows.rows as Record<string, unknown>[]).map((r) => ({
        compSource: r.comp_source as ComparableListing["compSource"],
        compVinOrId: String(r.comp_vin_or_id),
        compYear: r.comp_year == null ? undefined : Number(r.comp_year),
        compMake: r.comp_make ? String(r.comp_make) : undefined,
        compModel: r.comp_model ? String(r.comp_model) : undefined,
        compTrim: r.comp_trim ? String(r.comp_trim) : undefined,
        compPriceCents: Number(r.comp_price_cents) || 0,
        compMiles: r.comp_miles == null ? undefined : Number(r.comp_miles),
        compDistanceMiles: r.comp_distance_miles == null
          ? undefined
          : Number(r.comp_distance_miles),
        compDealerName: r.comp_dealer_name ? String(r.comp_dealer_name) : undefined,
        compUrl: r.comp_url ? String(r.comp_url) : undefined,
        isMock: Boolean(r.is_mock),
        capturedAt: r.captured_at instanceof Date
          ? r.captured_at.toISOString()
          : String(r.captured_at),
      })),
    };
  } catch (err) {
    console.error("[market-intel] loadCurrentMarketIntel failed:", err);
    return empty;
  }
}
