/**
 * Market Intelligence — shared types for valuation, comparables, and signals.
 *
 * One file per concept lives alongside this in src/lib/market-intel/:
 *   - nhtsa-client.ts          NHTSA VIN decoder (FREE public API — real)
 *   - valuation-providers.ts   abstraction + MockValuationProvider (default) +
 *                              KbbValuationProvider stub (partnership required)
 *   - comparable-finder.ts     mock comparable listings until Cars.com /
 *                              AutoTrader feed partnership lands
 *   - signal-generator.ts      pure function: snapshot + comps + days-on-lot
 *                              => vehicle_market_signal row
 */

/** Recommendation enum mirrored from migration 065 CHECK constraint. */
export type MarketRecommendation =
  | "HOLD"
  | "REPRICE_DOWN"
  | "REPRICE_UP"
  | "MOVE_TO_LOT_FRONT"
  | "MOVE_TO_BACK_LOT";

export type ConditionGrade = "excellent" | "good" | "fair" | "rough";

export type ValuationSource = "mock" | "kbb" | "nhtsa" | "manual" | "comp_median";

export type ComparableSource =
  | "mock"
  | "cars_com"
  | "autotrader"
  | "cargurus"
  | "manual";

/** Result of a valuation provider lookup. */
export interface MarketValue {
  source: ValuationSource;
  /** Always in cents to avoid float drift. */
  marketValueCents: number;
  conditionGrade: ConditionGrade;
  miles?: number;
  zipCode?: string;
  /** True when the value is synthesized (e.g. MockValuationProvider). */
  isMock: boolean;
  /** Surface to the UI so future devs can swap providers without confusion. */
  providerLabel: string;
  capturedAt: string;
  rawPayload?: Record<string, unknown>;
}

/** A single comparable listing for a target vehicle. */
export interface ComparableListing {
  compSource: ComparableSource;
  compVinOrId: string;
  compYear?: number;
  compMake?: string;
  compModel?: string;
  compTrim?: string;
  compPriceCents: number;
  compMiles?: number;
  compDistanceMiles?: number;
  compDealerName?: string;
  compUrl?: string;
  isMock: boolean;
  capturedAt: string;
}

/** Target vehicle input shape — what every market-intel function needs. */
export interface TargetVehicle {
  vehicleId: string;
  dealerId: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  miles?: number;
  ourPriceCents: number;
  zipCode?: string;
  conditionGrade?: ConditionGrade;
  /** Whole days since the vehicle was put on the lot. */
  daysOnLot: number;
}

/** Derived signal for the vehicle_market_signals table. */
export interface VehicleMarketSignal {
  vehicleId: string;
  dealerId: string;
  daysOnLot: number;
  marketVelocityDaysMedian: number | null;
  ourPriceCents: number;
  marketValueCents: number;
  priceDeltaCents: number;
  recommendation: MarketRecommendation;
  /** 0..1, used in the dashboard chip to convey trust. */
  confidence: number;
  rationale: string;
  comparablesCount: number;
  generatedAt: string;
}
