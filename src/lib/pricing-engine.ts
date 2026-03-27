/**
 * Dynamic Inventory Pricing Intelligence Engine
 *
 * Rule-based pricing analysis using the dealer's own inventory data.
 * No external APIs required — all signals come from the vehicles table.
 */
import { query } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface VehiclePricingAnalysis {
  vehicleId: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  condition: string;
  currentPrice: number;
  recommendedPrice: number;
  priceAdjustment: number;       // positive = increase, negative = decrease
  adjustmentPercent: number;
  marketPosition: "below_market" | "at_market" | "above_market";
  daysOnLot: number;
  turnScore: number;             // 0-100, higher = selling faster
  action: "reduce_price" | "hold_price" | "increase_price" | "promote";
  actionReason: string;
  urgency: "immediate" | "soon" | "monitor" | "none";
}

export interface PricingReport {
  generatedAt: Date;
  totalVehicles: number;
  immediateAction: VehiclePricingAnalysis[];  // needs price change now
  soonAction: VehiclePricingAnalysis[];        // watch in 7 days
  monitorAction: VehiclePricingAnalysis[];     // healthy
  projectedRevenueImpact: number;             // estimated $ if all recommendations followed
  avgDaysOnLot: number;
  stalledVehicles: number;                    // > 60 days on lot
}

/* -------------------------------------------------------------------------- */
/* Internal DB row shape                                                      */
/* -------------------------------------------------------------------------- */

interface VehicleRow extends Record<string, unknown> {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  condition: string;
  price: string | number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Core helpers                                                               */
/* -------------------------------------------------------------------------- */

function calcDaysOnLot(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
}

function calcTurnScore(daysOnLot: number): number {
  const raw = 100 - daysOnLot * 1.5;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Determine the reduction percentage based on days-on-lot curve.
 * Returns a value between 0 and 0.12 (0–12%).
 */
function reductionFactor(
  daysOnLot: number,
  condition: string,
): { factor: number; action: VehiclePricingAnalysis["action"]; reason: string; urgency: VehiclePricingAnalysis["urgency"] } {
  if (daysOnLot <= 15) {
    if (condition === "new") {
      return {
        factor: -0.01, // slight increase
        action: "increase_price",
        reason: "New vehicle, fresh on lot — slight price increase opportunity",
        urgency: "none",
      };
    }
    return {
      factor: 0,
      action: "hold_price",
      reason: "Vehicle is fresh on lot — hold current price",
      urgency: "none",
    };
  }

  if (daysOnLot <= 30) {
    return {
      factor: 0,
      action: "hold_price",
      reason: "Vehicle within normal selling window — hold price",
      urgency: "monitor",
    };
  }

  if (daysOnLot <= 45) {
    return {
      factor: 0.025, // reduce 2.5%
      action: "reduce_price",
      reason: `${daysOnLot} days on lot — recommend 2–3% price reduction to improve velocity`,
      urgency: "soon",
    };
  }

  if (daysOnLot <= 60) {
    return {
      factor: 0.05, // reduce 5%
      action: "reduce_price",
      reason: `${daysOnLot} days on lot — recommend 4–6% price reduction; vehicle approaching stall threshold`,
      urgency: "soon",
    };
  }

  // > 60 days
  return {
    factor: 0.10, // reduce 10%
    action: "promote",
    reason: `${daysOnLot} days on lot — vehicle is stalled; recommend 8–12% reduction and active promotion`,
    urgency: "immediate",
  };
}

/**
 * Classify market position by comparing vehicle price against the median
 * price of the same make/year group within the dealer's inventory.
 */
function calcMarketPosition(
  price: number,
  make: string,
  year: number,
  allVehicles: VehicleRow[],
): VehiclePricingAnalysis["marketPosition"] {
  const peers = allVehicles
    .filter((v) => v.make === make && Number(v.year) === year)
    .map((v) => Number(v.price))
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  if (peers.length === 0) return "at_market";

  // Median
  const mid = Math.floor(peers.length / 2);
  const median =
    peers.length % 2 === 0
      ? (peers[mid - 1] + peers[mid]) / 2
      : peers[mid];

  const upperBound = median * 1.10;
  const lowerBound = median * 0.90;

  if (price > upperBound) return "above_market";
  if (price < lowerBound) return "below_market";
  return "at_market";
}

/* -------------------------------------------------------------------------- */
/* Main export                                                                */
/* -------------------------------------------------------------------------- */

export async function generatePricingReport(
  dealerId: string,
): Promise<PricingReport> {
  let vehicles: VehicleRow[] = [];

  try {
    const result = await query<VehicleRow>(
      `SELECT id, vin, year, make, model,
              COALESCE(trim, '') AS trim,
              COALESCE(condition, 'used') AS condition,
              price, created_at
         FROM vehicles
        WHERE dealer_id = $1
          AND status = 'available'
        ORDER BY created_at ASC`,
      [dealerId],
    );
    vehicles = result.rows;
  } catch (err) {
    console.error("[pricing-engine] DB unavailable — returning empty report:", err);
    // Graceful degradation: return an empty report rather than crashing
    return {
      generatedAt: new Date(),
      totalVehicles: 0,
      immediateAction: [],
      soonAction: [],
      monitorAction: [],
      projectedRevenueImpact: 0,
      avgDaysOnLot: 0,
      stalledVehicles: 0,
    };
  }

  const analyses: VehiclePricingAnalysis[] = vehicles.map((v) => {
    const currentPrice = Number(v.price);
    const daysOnLot = calcDaysOnLot(v.created_at);
    const turnScore = calcTurnScore(daysOnLot);
    const marketPosition = calcMarketPosition(currentPrice, v.make, v.year, vehicles);

    const { factor, action, reason, urgency } = reductionFactor(daysOnLot, v.condition);

    // For increases (new + fresh), factor is negative → recommended > current
    // For reductions, factor is positive → recommended < current
    const rawRecommended =
      factor < 0
        ? currentPrice * (1 + Math.abs(factor))  // increase
        : currentPrice * (1 - factor);            // decrease

    // Round to nearest $100
    const recommendedPrice = Math.max(1, Math.round(rawRecommended / 100) * 100);

    const priceAdjustment = recommendedPrice - currentPrice;
    const adjustmentPercent =
      currentPrice > 0
        ? Math.round((priceAdjustment / currentPrice) * 1000) / 10
        : 0;

    // Refine action reason with market position context
    let finalReason = reason;
    if (marketPosition === "above_market" && action !== "reduce_price" && action !== "promote") {
      finalReason += " — note: vehicle is priced above the dealer median for this make/year";
    } else if (marketPosition === "below_market" && action === "hold_price") {
      finalReason += " — vehicle is priced below dealer median; consider slight increase";
    }

    return {
      vehicleId: v.id,
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      condition: v.condition,
      currentPrice,
      recommendedPrice,
      priceAdjustment,
      adjustmentPercent,
      marketPosition,
      daysOnLot,
      turnScore,
      action,
      actionReason: finalReason,
      urgency,
    };
  });

  // Partition by urgency
  const immediateAction = analyses.filter((a) => a.urgency === "immediate");
  const soonAction = analyses.filter((a) => a.urgency === "soon");
  const monitorAction = analyses.filter(
    (a) => a.urgency === "monitor" || a.urgency === "none",
  );

  // Revenue impact: sum of reductions only (positive adjustments don't count as savings)
  const projectedRevenueImpact = analyses
    .filter((a) => a.priceAdjustment < 0)
    .reduce((sum, a) => sum + Math.abs(a.priceAdjustment), 0);

  const avgDaysOnLot =
    analyses.length > 0
      ? Math.round(
          analyses.reduce((sum, a) => sum + a.daysOnLot, 0) / analyses.length,
        )
      : 0;

  const stalledVehicles = analyses.filter((a) => a.daysOnLot > 60).length;

  return {
    generatedAt: new Date(),
    totalVehicles: vehicles.length,
    immediateAction,
    soonAction,
    monitorAction,
    projectedRevenueImpact,
    avgDaysOnLot,
    stalledVehicles,
  };
}
