/**
 * Signal Generator — pure function that maps a target vehicle, its market
 * value snapshot, and its comparable listings into a single
 * `VehicleMarketSignal` row.
 *
 * Pure: no I/O, no cache, no DB. Deterministic for testability. Callers
 * compose this with valuation + comparable lookups outside.
 *
 * Recommendation rules (in priority order):
 *
 *  1. REPRICE_DOWN — our_price > market_value by > 8% AND days_on_lot > 30
 *  2. REPRICE_DOWN — days_on_lot > median * 1.5 (regardless of price delta)
 *  3. REPRICE_UP   — our_price < market_value by > 5% AND days_on_lot < 14
 *  4. MOVE_TO_LOT_FRONT — days_on_lot <= 7 AND priced within 3% of market
 *  5. MOVE_TO_BACK_LOT  — days_on_lot > 90 AND already priced below market
 *  6. HOLD — everything else
 *
 * Confidence:
 *  - 0.30 base
 *  - +0.40 if comparablesCount >= 4
 *  - +0.20 if marketValueCents > 0
 *  - +0.10 if marketVelocityDaysMedian is non-null
 *  - clamped to [0, 1]
 *
 * Rationale is plain dealership language per
 * `feedback_non_technical_ui.md` — no raw signals, no developer jargon.
 */

import type {
  ComparableListing,
  MarketRecommendation,
  MarketValue,
  TargetVehicle,
  VehicleMarketSignal,
} from "@/lib/market-intel/types";

export interface GenerateSignalInput {
  target: TargetVehicle;
  snapshot: MarketValue | null;
  comparables: ComparableListing[];
}

/**
 * Compute the median comparable price in cents. Returns null when no
 * comparables are available so the caller can downgrade confidence.
 */
export function medianComparablePriceCents(
  comps: ComparableListing[],
): number | null {
  if (!comps.length) return null;
  const sorted = [...comps].map((c) => c.compPriceCents).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

/**
 * Estimate the median days-on-lot velocity from comparables. The mock comps
 * don't carry that signal, so we use a heuristic: 35 days when comps exist,
 * otherwise null (callers downgrade confidence).
 *
 * When a real feed lands (Cars.com / AutoTrader), wire their listed-since
 * date into ComparableListing and compute a real median here.
 */
export function estimateVelocityDaysMedian(
  comps: ComparableListing[],
): number | null {
  if (!comps.length) return null;
  return 35;
}

/** Plain-language rationale per `feedback_non_technical_ui.md`. */
function explain(
  rec: MarketRecommendation,
  ctx: {
    daysOnLot: number;
    priceDeltaCents: number;
    velocityMedian: number | null;
    compsCount: number;
  },
): string {
  const delta$ = Math.round(Math.abs(ctx.priceDeltaCents) / 100);
  switch (rec) {
    case "REPRICE_DOWN":
      return ctx.priceDeltaCents > 0
        ? `Priced about $${delta$.toLocaleString()} above the local market and has sat for ${ctx.daysOnLot} days. Lower the asking price to bring it back in line.`
        : `On the lot ${ctx.daysOnLot} days, well past the typical ${ctx.velocityMedian ?? "30+"} day turn. A small price adjustment should help it move.`;
    case "REPRICE_UP":
      return `Priced about $${delta$.toLocaleString()} below comparable listings and getting attention quickly. There's room to raise the price.`;
    case "MOVE_TO_LOT_FRONT":
      return `Priced right and brand-new to the lot. Put it up front while interest is hot.`;
    case "MOVE_TO_BACK_LOT":
      return `${ctx.daysOnLot} days on the lot and already priced below market. Move it to the back lot or run a wholesale channel.`;
    case "HOLD":
    default:
      return ctx.compsCount === 0
        ? `Limited comparable data right now. Hold the price and watch traffic for a week.`
        : `Price and pace are in line with the local market. Keep it where it is.`;
  }
}

/**
 * Pure signal generator. Returns a fully populated `VehicleMarketSignal`
 * ready to upsert into vehicle_market_signals.
 */
export function generateSignal(input: GenerateSignalInput): VehicleMarketSignal {
  const { target, snapshot, comparables } = input;

  const compMedianCents = medianComparablePriceCents(comparables);
  // Prefer provider valuation when present; fall back to comparable median;
  // last resort is the dealer's own price.
  const marketValueCents =
    snapshot?.marketValueCents ?? compMedianCents ?? target.ourPriceCents;
  const priceDeltaCents = target.ourPriceCents - marketValueCents;
  const velocityMedian = estimateVelocityDaysMedian(comparables);

  // ---- Recommendation rules (priority order) ----
  // We have signal only when there is at least one comparable OR a snapshot;
  // without either we hold + flag low confidence.
  const haveSignal = comparables.length > 0 || snapshot !== null;

  let rec: MarketRecommendation = "HOLD";
  const overpriced =
    haveSignal &&
    marketValueCents > 0 &&
    priceDeltaCents / marketValueCents > 0.08 &&
    target.daysOnLot > 30;
  const slow =
    haveSignal &&
    velocityMedian !== null &&
    target.daysOnLot > velocityMedian * 1.5;
  const underpriced =
    haveSignal &&
    marketValueCents > 0 &&
    -priceDeltaCents / marketValueCents > 0.05 &&
    target.daysOnLot < 14;
  const fresh =
    haveSignal &&
    target.daysOnLot <= 7 &&
    marketValueCents > 0 &&
    Math.abs(priceDeltaCents) / marketValueCents <= 0.03;
  const stale = target.daysOnLot > 90 && priceDeltaCents < 0;

  // Priority: stale (very aged + underpriced) wins over the generic
  // "slow" REPRICE_DOWN because the dealer has already cut the price and
  // needs a wholesale exit, not another markdown.
  if (stale) rec = "MOVE_TO_BACK_LOT";
  else if (overpriced || slow) rec = "REPRICE_DOWN";
  else if (underpriced) rec = "REPRICE_UP";
  else if (fresh) rec = "MOVE_TO_LOT_FRONT";

  // ---- Confidence ----
  let confidence = 0.3;
  if (comparables.length >= 4) confidence += 0.4;
  if (marketValueCents > 0) confidence += 0.2;
  if (velocityMedian !== null) confidence += 0.1;
  confidence = Math.max(0, Math.min(1, +confidence.toFixed(3)));

  const rationale = explain(rec, {
    daysOnLot: target.daysOnLot,
    priceDeltaCents,
    velocityMedian,
    compsCount: comparables.length,
  });

  return {
    vehicleId: target.vehicleId,
    dealerId: target.dealerId,
    daysOnLot: target.daysOnLot,
    marketVelocityDaysMedian: velocityMedian,
    ourPriceCents: target.ourPriceCents,
    marketValueCents,
    priceDeltaCents,
    recommendation: rec,
    confidence,
    rationale,
    comparablesCount: comparables.length,
    generatedAt: new Date().toISOString(),
  };
}
