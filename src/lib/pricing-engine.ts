/**
 * AI-Powered Pricing Recommendation Engine
 *
 * Comprehensive vehicle pricing intelligence that combines behavioral signals,
 * inventory analytics, seasonal patterns, and price elasticity modeling to
 * generate actionable pricing recommendations.
 *
 * All functions are pure (no side effects), testable, and work with the
 * existing InventoryVehicle type. Shadow/demo mode returns realistic mock
 * data when no DATABASE_URL is configured.
 *
 * Signal sources:
 *   - VDP views, calculator usage, comparisons (from analytics_events)
 *   - Inventory age, price position, comparable vehicles
 *   - Seasonal body-type multipliers
 *   - Exponential decay velocity model
 *   - Price elasticity curves
 */

import { query } from "@/lib/db";
import type { InventoryVehicle } from "@/lib/data";

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */

/** Action the dealer should take on this vehicle's price. */
export type PricingAction = "hold" | "reduce" | "increase" | "markdown" | "spotlight";

/** Aging tier classification. */
export type AgingTier = "fresh" | "normal" | "aging" | "stale" | "critical";

/** Confidence level for predictions. */
export type PricingConfidence = "high" | "medium" | "low";

/* -------------------------------------------------------------------------- */
/*  Vehicle Demand Score                                                       */
/* -------------------------------------------------------------------------- */

export interface VehicleSignals {
  vdp_views: number;
  inventory_avg_views: number;
  calculator_uses: number;
  comparison_wins: number;
  comparison_losses: number;
  photo_dwell_seconds: number;
  photo_zoom_count: number;
  lead_conversion_rate: number;
  search_ctr: number;
  time_on_page_seconds: number;
  inventory_avg_time_on_page: number;
  return_visitor_views: number;
}

export interface DemandScore {
  score: number;                       // 0-100
  label: "very_high" | "high" | "moderate" | "low" | "very_low";
  top_contributors: string[];          // top 3 signal names
  signals_evaluated: number;
}

/* -------------------------------------------------------------------------- */
/*  Price Position Analysis                                                    */
/* -------------------------------------------------------------------------- */

export interface PricePosition {
  percentile: number;                  // 0-100 (0 = cheapest, 100 = most expensive)
  market_midpoint: number;             // estimated fair market price from comparables
  comparable_count: number;
  is_outlier: boolean;
  outlier_direction: "above" | "below" | null;
  delta_from_midpoint: number;         // current_price - market_midpoint
  delta_pct: number;                   // percentage difference from midpoint
}

/* -------------------------------------------------------------------------- */
/*  Velocity Prediction                                                        */
/* -------------------------------------------------------------------------- */

export interface VelocityPrediction {
  estimated_days_to_sale: number;
  confidence: PricingConfidence;
  sale_probability_30_days: number;    // 0-1
  velocity_label: "fast" | "normal" | "slow" | "stalled";
}

/* -------------------------------------------------------------------------- */
/*  Optimal Price Calculation                                                  */
/* -------------------------------------------------------------------------- */

export interface CostBasis {
  acquisition_cost: number;            // what the dealer paid
  holding_cost_per_day: number;        // floor plan interest + lot cost per day
  target_days_to_sale: number;         // dealer's target (default 30)
}

export interface OptimalPrice {
  optimal_price: number;
  expected_margin: number;
  expected_margin_pct: number;
  expected_days_at_optimal: number;
  delta_from_current: number;          // optimal_price - current_price
  delta_pct: number;
  action: PricingAction;
  action_reason: string;
}

/* -------------------------------------------------------------------------- */
/*  Price Elasticity                                                           */
/* -------------------------------------------------------------------------- */

export interface PriceSensitivityPoint {
  price: number;
  probability: number;                // 0-1
}

export interface ElasticityAnalysis {
  elasticity_score: number;            // 0-1 (1 = highly price-sensitive)
  cliff_price: number | null;          // price point where demand spikes
  price_sensitivity_curve: PriceSensitivityPoint[];
}

/* -------------------------------------------------------------------------- */
/*  Aging & Markdown                                                           */
/* -------------------------------------------------------------------------- */

export interface AgingRecommendation {
  days_on_lot: number;
  tier: AgingTier;
  recommended_markdown_pct: number;
  markdown_price: number;
  demand_adjusted: boolean;            // true if markdown was softened due to high demand
  next_markdown_at_days: number | null;
  next_markdown_pct: number | null;
  schedule: Array<{ day: number; pct: number }>;
}

/* -------------------------------------------------------------------------- */
/*  Seasonal Adjustments                                                       */
/* -------------------------------------------------------------------------- */

export interface SeasonalAdjustment {
  body_type: string;
  month: number;
  seasonal_adjustment_pct: number;
  adjusted_optimal_price: number;
  season_label: string;
}

/* -------------------------------------------------------------------------- */
/*  Competitive Intelligence                                                   */
/* -------------------------------------------------------------------------- */

export interface CompetitiveSignal {
  type: "outcompeted" | "price_cluster" | "market_gap";
  description: string;
  affected_vehicles: string[];         // VINs
  recommended_action: string;
}

/* -------------------------------------------------------------------------- */
/*  Full Reports                                                               */
/* -------------------------------------------------------------------------- */

export interface PricingReport {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  current_price: number;
  demand: DemandScore;
  position: PricePosition;
  velocity: VelocityPrediction;
  optimal: OptimalPrice;
  elasticity: ElasticityAnalysis;
  aging: AgingRecommendation;
  seasonal: SeasonalAdjustment;
  competitive_signals: CompetitiveSignal[];
  generated_at: string;
}

export interface LotPricingReport {
  total_vehicles: number;
  avg_days_to_sale: number;
  revenue_velocity_per_day: number;
  aging_distribution: Record<AgingTier, number>;
  total_potential_uplift: number;
  inventory_health_score: number;      // 0-100
  action_summary: Record<PricingAction, number>;
  top_opportunities: Array<{
    vin: string;
    year: number;
    make: string;
    model: string;
    current_price: number;
    optimal_price: number;
    uplift: number;
    action: PricingAction;
  }>;
  generated_at: string;
}

/* ---------- Legacy types (backward compatibility with existing route) ------ */

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
  priceAdjustment: number;
  adjustmentPercent: number;
  marketPosition: "below_market" | "at_market" | "above_market";
  daysOnLot: number;
  turnScore: number;
  action: "reduce_price" | "hold_price" | "increase_price" | "promote";
  actionReason: string;
  urgency: "immediate" | "soon" | "monitor" | "none";
}

export interface LegacyPricingReport {
  generatedAt: Date;
  totalVehicles: number;
  immediateAction: VehiclePricingAnalysis[];
  soonAction: VehiclePricingAnalysis[];
  monitorAction: VehiclePricingAnalysis[];
  projectedRevenueImpact: number;
  avgDaysOnLot: number;
  stalledVehicles: number;
}

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

/** Default markdown schedule: { days_on_lot_threshold: markdown_pct }. */
const MARKDOWN_SCHEDULE: Array<{ day: number; pct: number }> = [
  { day: 30, pct: 3 },
  { day: 45, pct: 5 },
  { day: 60, pct: 8 },
  { day: 75, pct: 12 },
  { day: 90, pct: 15 },
];

/** Monthly seasonal multipliers by body type. Index 0 = January. */
const SEASONAL_MULTIPLIERS: Record<string, number[]> = {
  convertible: [
    -0.08, -0.06, 0.0, 0.03, 0.05, 0.05,
    0.05, 0.05, 0.03, 0.0, -0.04, -0.08,
  ],
  truck: [
    0.03, 0.02, 0.0, -0.01, -0.02, -0.02,
    -0.01, 0.0, 0.02, 0.03, 0.03, 0.03,
  ],
  suv: [
    0.03, 0.02, 0.0, -0.01, -0.02, -0.02,
    -0.01, 0.0, 0.02, 0.03, 0.03, 0.03,
  ],
  awd: [
    0.05, 0.04, 0.02, 0.0, -0.03, -0.03,
    -0.03, -0.03, 0.0, 0.03, 0.04, 0.05,
  ],
  "4wd": [
    0.05, 0.04, 0.02, 0.0, -0.03, -0.03,
    -0.03, -0.03, 0.0, 0.03, 0.04, 0.05,
  ],
  sedan: [
    0.0, 0.0, 0.01, 0.01, 0.01, 0.0,
    0.0, 0.0, 0.01, 0.01, 0.0, 0.0,
  ],
  coupe: [
    -0.02, -0.01, 0.01, 0.02, 0.03, 0.03,
    0.03, 0.02, 0.01, 0.0, -0.01, -0.02,
  ],
  hatchback: [
    0.0, 0.0, 0.01, 0.01, 0.02, 0.01,
    0.01, 0.01, 0.01, 0.0, 0.0, 0.0,
  ],
  van: [
    0.0, 0.01, 0.02, 0.03, 0.03, 0.04,
    0.04, 0.03, 0.02, 0.01, 0.0, 0.0,
  ],
  wagon: [
    0.0, 0.0, 0.0, 0.01, 0.01, 0.01,
    0.01, 0.01, 0.0, 0.0, 0.0, 0.0,
  ],
};

/** Season labels by month index (0 = Jan). */
const SEASON_LABELS = [
  "Winter", "Winter", "Spring", "Spring", "Spring", "Summer",
  "Summer", "Summer", "Fall", "Fall", "Fall", "Winter",
];

/* ========================================================================== */
/*  1. Vehicle Demand Score                                                    */
/* ========================================================================== */

export function calculateDemandScore(signals: VehicleSignals): DemandScore {
  const contributions: Array<{ name: string; value: number }> = [];

  // VDP view ratio: how this vehicle's views compare to inventory average
  const viewRatio = signals.inventory_avg_views > 0
    ? signals.vdp_views / signals.inventory_avg_views
    : 0;
  const viewScore = Math.min(1, viewRatio / 2); // 2x avg = max
  contributions.push({ name: "VDP views vs inventory average", value: viewScore * 20 });

  // Calculator usage (strong buy signal)
  const calcScore = Math.min(1, signals.calculator_uses / 3);
  contributions.push({ name: "Payment calculator usage", value: calcScore * 20 });

  // Comparison wins
  const totalComparisons = signals.comparison_wins + signals.comparison_losses;
  const compWinRate = totalComparisons > 0
    ? signals.comparison_wins / totalComparisons
    : 0.5;
  const compScore = totalComparisons > 0 ? compWinRate : 0;
  contributions.push({ name: "Comparison win rate", value: compScore * 15 });

  // Photo engagement
  const photoScore = Math.min(1,
    (signals.photo_dwell_seconds / 60 + signals.photo_zoom_count / 5) / 2
  );
  contributions.push({ name: "Photo engagement depth", value: photoScore * 10 });

  // Lead conversion rate
  const convScore = Math.min(1, signals.lead_conversion_rate / 0.05); // 5% = max
  contributions.push({ name: "Lead conversion rate", value: convScore * 15 });

  // Search CTR
  const ctrScore = Math.min(1, signals.search_ctr / 0.15); // 15% = max
  contributions.push({ name: "Search click-through rate", value: ctrScore * 5 });

  // Time-on-page vs avg
  const timeRatio = signals.inventory_avg_time_on_page > 0
    ? signals.time_on_page_seconds / signals.inventory_avg_time_on_page
    : 0;
  const timeScore = Math.min(1, timeRatio / 2);
  contributions.push({ name: "Time on page vs average", value: timeScore * 10 });

  // Return visitor views
  const returnScore = Math.min(1, signals.return_visitor_views / 5);
  contributions.push({ name: "Return visitor views", value: returnScore * 5 });

  const rawScore = contributions.reduce((sum, c) => sum + c.value, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Label
  let label: DemandScore["label"];
  if (score >= 80) label = "very_high";
  else if (score >= 60) label = "high";
  else if (score >= 40) label = "moderate";
  else if (score >= 20) label = "low";
  else label = "very_low";

  // Top contributors
  const topContributors = contributions
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((c) => c.name);

  return {
    score,
    label,
    top_contributors: topContributors,
    signals_evaluated: contributions.length,
  };
}

/* ========================================================================== */
/*  2. Price Position Analysis                                                 */
/* ========================================================================== */

export function analyzePricePosition(
  vehicle: InventoryVehicle,
  inventory: InventoryVehicle[],
): PricePosition {
  // Find comparable vehicles: same make, same model, +/- 2 years, +/- 20K miles
  const comparables = inventory.filter((v) =>
    v.vin !== vehicle.vin &&
    v.make === vehicle.make &&
    v.model === vehicle.model &&
    Math.abs(v.year - vehicle.year) <= 2 &&
    Math.abs(v.mileage - vehicle.mileage) <= 20000 &&
    v.price > 0
  );

  if (comparables.length === 0) {
    return {
      percentile: 50,
      market_midpoint: vehicle.price,
      comparable_count: 0,
      is_outlier: false,
      outlier_direction: null,
      delta_from_midpoint: 0,
      delta_pct: 0,
    };
  }

  const prices = comparables.map((v) => v.price).sort((a, b) => a - b);
  const allPrices = [...prices, vehicle.price].sort((a, b) => a - b);

  // Percentile: position of this vehicle's price in the sorted list
  const rank = allPrices.indexOf(vehicle.price);
  const percentile = Math.round((rank / (allPrices.length - 1)) * 100);

  // Market midpoint (median of comparables, not including self)
  const mid = Math.floor(prices.length / 2);
  const market_midpoint = prices.length % 2 === 0
    ? Math.round((prices[mid - 1] + prices[mid]) / 2)
    : prices[mid];

  const delta_from_midpoint = vehicle.price - market_midpoint;
  const delta_pct = market_midpoint > 0
    ? Math.round((delta_from_midpoint / market_midpoint) * 1000) / 10
    : 0;

  // Outlier: >15% above or below comparables
  const is_outlier = Math.abs(delta_pct) > 15;
  const outlier_direction: PricePosition["outlier_direction"] = is_outlier
    ? (delta_pct > 0 ? "above" : "below")
    : null;

  return {
    percentile,
    market_midpoint,
    comparable_count: comparables.length,
    is_outlier,
    outlier_direction,
    delta_from_midpoint,
    delta_pct,
  };
}

/* ========================================================================== */
/*  3. Velocity Prediction                                                     */
/* ========================================================================== */

export function predictVelocity(
  vehicle: InventoryVehicle & { days_on_lot?: number },
  demandScore: DemandScore,
): VelocityPrediction {
  const daysOnLot = vehicle.days_on_lot ?? 0;

  // Base days-to-sale from category averages (dealer industry benchmarks)
  let baseDays: number;
  const bodyLower = vehicle.bodyStyle?.toLowerCase() ?? "";
  if (bodyLower.includes("truck") || bodyLower.includes("suv")) {
    baseDays = 28;
  } else if (bodyLower.includes("sedan") || bodyLower.includes("coupe")) {
    baseDays = 35;
  } else if (bodyLower.includes("van")) {
    baseDays = 40;
  } else {
    baseDays = 32;
  }

  // Adjust by demand score: high demand = faster sale
  const demandMultiplier = 1.5 - (demandScore.score / 100); // 0.5x for score=100, 1.5x for score=0
  const demandAdjustedDays = baseDays * demandMultiplier;

  // Adjust for days already on lot (exponential decay — harder to sell the longer it sits)
  const agingPenalty = daysOnLot > 30 ? (daysOnLot - 30) * 0.5 : 0;

  const estimatedDays = Math.max(1, Math.round(demandAdjustedDays + agingPenalty - daysOnLot));

  // Confidence
  let confidence: PricingConfidence;
  if (demandScore.signals_evaluated >= 6 && demandScore.score > 30) {
    confidence = "high";
  } else if (demandScore.signals_evaluated >= 3) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Sale probability in 30 days using exponential decay: P = 1 - e^(-lambda * t)
  // lambda calibrated so that baseDays = ~63% probability (1 - 1/e)
  const effectiveBaseDays = demandAdjustedDays + agingPenalty;
  const lambda = 1 / Math.max(1, effectiveBaseDays);
  const saleProbability30 = Math.round((1 - Math.exp(-lambda * 30)) * 100) / 100;

  // Label
  let velocity_label: VelocityPrediction["velocity_label"];
  if (estimatedDays <= 15) velocity_label = "fast";
  else if (estimatedDays <= 35) velocity_label = "normal";
  else if (estimatedDays <= 60) velocity_label = "slow";
  else velocity_label = "stalled";

  return {
    estimated_days_to_sale: estimatedDays,
    confidence,
    sale_probability_30_days: saleProbability30,
    velocity_label,
  };
}

/* ========================================================================== */
/*  4. Optimal Price Calculation                                               */
/* ========================================================================== */

const DEFAULT_COST_BASIS: CostBasis = {
  acquisition_cost: 0,
  holding_cost_per_day: 35,      // ~$1,050/month industry average
  target_days_to_sale: 30,
};

export function calculateOptimalPrice(
  vehicle: InventoryVehicle & { days_on_lot?: number },
  demandScore: DemandScore,
  costBasis: Partial<CostBasis> = {},
): OptimalPrice {
  const cost: CostBasis = { ...DEFAULT_COST_BASIS, ...costBasis };
  const currentPrice = vehicle.price;
  const daysOnLot = vehicle.days_on_lot ?? 0;

  // If no acquisition cost known, estimate at 80% of current price
  const effectiveCost = cost.acquisition_cost > 0
    ? cost.acquisition_cost
    : currentPrice * 0.80;

  // Total holding cost already incurred
  const holdingCostIncurred = daysOnLot * cost.holding_cost_per_day;

  // Remaining allowable holding cost before target
  const remainingDays = Math.max(0, cost.target_days_to_sale - daysOnLot);
  const futureHoldingCost = remainingDays * cost.holding_cost_per_day;

  // Minimum acceptable price: cost + all holding costs + minimum margin (5%)
  const minAcceptable = effectiveCost + holdingCostIncurred + futureHoldingCost;
  const minWithMargin = minAcceptable * 1.05;

  // Demand-adjusted optimal price
  // Higher demand = can price higher; lower demand = must price competitively
  const demandFactor = demandScore.score / 100; // 0-1
  // Range: 0.92x to 1.08x of current price based on demand
  const priceMultiplier = 0.92 + (demandFactor * 0.16);

  let optimalRaw = currentPrice * priceMultiplier;

  // Don't let optimal price go below minimum acceptable
  optimalRaw = Math.max(optimalRaw, minWithMargin);

  // Round to nearest $100
  const optimal_price = Math.round(optimalRaw / 100) * 100;

  const expected_margin = optimal_price - effectiveCost - holdingCostIncurred;
  const expected_margin_pct = effectiveCost > 0
    ? Math.round((expected_margin / effectiveCost) * 1000) / 10
    : 0;

  // Estimate days at optimal price
  const daysMultiplier = optimal_price < currentPrice ? 0.8 : optimal_price > currentPrice ? 1.2 : 1.0;
  const expectedDays = Math.max(1, Math.round(
    (cost.target_days_to_sale - daysOnLot) * daysMultiplier
  ));

  const delta_from_current = optimal_price - currentPrice;
  const delta_pct = currentPrice > 0
    ? Math.round((delta_from_current / currentPrice) * 1000) / 10
    : 0;

  // Determine action
  let action: PricingAction;
  let action_reason: string;

  if (delta_pct < -3) {
    action = daysOnLot > 60 ? "markdown" : "reduce";
    action_reason = daysOnLot > 60
      ? `Vehicle has been on lot ${daysOnLot} days. Recommend markdown of ${Math.abs(delta_pct)}% to accelerate sale.`
      : `Demand analysis suggests a ${Math.abs(delta_pct)}% reduction will optimize margin and velocity.`;
  } else if (delta_pct > 3) {
    action = "increase";
    action_reason = `Strong demand (score: ${demandScore.score}) supports a ${delta_pct}% price increase.`;
  } else if (demandScore.score >= 70 && daysOnLot < 15) {
    action = "spotlight";
    action_reason = "High demand on fresh inventory. Feature this vehicle prominently to maximize margin.";
  } else {
    action = "hold";
    action_reason = "Current price is well-positioned relative to demand and market conditions.";
  }

  return {
    optimal_price,
    expected_margin,
    expected_margin_pct,
    expected_days_at_optimal: expectedDays,
    delta_from_current,
    delta_pct,
    action,
    action_reason,
  };
}

/* ========================================================================== */
/*  5. Price Elasticity                                                        */
/* ========================================================================== */

export function calculateElasticity(
  vehicle: InventoryVehicle,
  demandScore: DemandScore,
): ElasticityAnalysis {
  const currentPrice = vehicle.price;

  // Elasticity score: inverse of demand — low demand = highly elastic (price sensitive)
  const elasticity_score = Math.round((1 - demandScore.score / 100) * 100) / 100;

  // Build price sensitivity curve: for each $500 decrement, estimate change in buy probability
  const curve: PriceSensitivityPoint[] = [];
  const steps = 10; // +/- 5 steps of $500
  const baseProbability = demandScore.score / 100;

  let cliffPrice: number | null = null;
  let maxProbJump = 0;

  for (let i = -steps; i <= steps; i++) {
    const price = currentPrice + (i * 500);
    if (price <= 0) continue;

    const priceDelta = (price - currentPrice) / currentPrice;
    // Logistic curve: probability changes based on price delta and elasticity
    const elasticityEffect = priceDelta * elasticity_score * 3;
    const probability = Math.max(0.01, Math.min(0.99,
      1 / (1 + Math.exp(-( (baseProbability * 4 - 2) - elasticityEffect )))
    ));

    curve.push({
      price: Math.round(price),
      probability: Math.round(probability * 100) / 100,
    });

    // Track the "cliff" — largest probability jump for a $500 decrease
    if (i < 0 && curve.length >= 2) {
      const prev = curve[curve.length - 2];
      const jump = probability - prev.probability;
      if (jump > maxProbJump) {
        maxProbJump = jump;
        cliffPrice = price;
      }
    }
  }

  return {
    elasticity_score,
    cliff_price: maxProbJump > 0.05 ? cliffPrice : null,
    price_sensitivity_curve: curve,
  };
}

/* ========================================================================== */
/*  6. Aging & Markdown Recommendations                                        */
/* ========================================================================== */

export function getAgingRecommendation(
  vehicle: InventoryVehicle & { days_on_lot?: number },
  demandScore: DemandScore,
): AgingRecommendation {
  const daysOnLot = vehicle.days_on_lot ?? 0;

  // Classify tier
  let tier: AgingTier;
  if (daysOnLot <= 15) tier = "fresh";
  else if (daysOnLot <= 30) tier = "normal";
  else if (daysOnLot <= 60) tier = "aging";
  else if (daysOnLot <= 90) tier = "stale";
  else tier = "critical";

  // Find the applicable markdown from the schedule
  let baseMarkdownPct = 0;
  for (const step of MARKDOWN_SCHEDULE) {
    if (daysOnLot >= step.day) {
      baseMarkdownPct = step.pct;
    }
  }

  // Adjust for demand: high demand = soften markdown, low demand = steepen
  const demandFactor = demandScore.score / 100;
  let adjustedMarkdownPct: number;
  let demandAdjusted = false;

  if (demandFactor >= 0.6 && baseMarkdownPct > 0) {
    // High demand — reduce markdown by up to 50%
    adjustedMarkdownPct = Math.round(baseMarkdownPct * (1 - demandFactor * 0.5) * 10) / 10;
    demandAdjusted = true;
  } else if (demandFactor < 0.3 && baseMarkdownPct > 0) {
    // Low demand — increase markdown by up to 25%
    adjustedMarkdownPct = Math.round(baseMarkdownPct * 1.25 * 10) / 10;
    demandAdjusted = true;
  } else {
    adjustedMarkdownPct = baseMarkdownPct;
  }

  const markdownPrice = Math.round(vehicle.price * (1 - adjustedMarkdownPct / 100) / 100) * 100;

  // Next markdown step
  const nextStep = MARKDOWN_SCHEDULE.find((s) => s.day > daysOnLot);

  return {
    days_on_lot: daysOnLot,
    tier,
    recommended_markdown_pct: adjustedMarkdownPct,
    markdown_price: markdownPrice,
    demand_adjusted: demandAdjusted,
    next_markdown_at_days: nextStep ? nextStep.day : null,
    next_markdown_pct: nextStep ? nextStep.pct : null,
    schedule: MARKDOWN_SCHEDULE,
  };
}

/* ========================================================================== */
/*  7. Seasonal Adjustments                                                    */
/* ========================================================================== */

export function getSeasonalAdjustment(
  bodyType: string,
  basePrice: number,
  month?: number,
): SeasonalAdjustment {
  const currentMonth = month ?? new Date().getMonth(); // 0-indexed
  const normalizedBodyType = normalizeBodyType(bodyType);

  const multipliers = SEASONAL_MULTIPLIERS[normalizedBodyType]
    ?? SEASONAL_MULTIPLIERS["sedan"]!; // fallback to sedan (stable)

  const adjustmentPct = multipliers[currentMonth] * 100;
  const adjustedPrice = Math.round(basePrice * (1 + multipliers[currentMonth]) / 100) * 100;

  return {
    body_type: normalizedBodyType,
    month: currentMonth + 1, // 1-indexed for display
    seasonal_adjustment_pct: Math.round(adjustmentPct * 10) / 10,
    adjusted_optimal_price: adjustedPrice,
    season_label: SEASON_LABELS[currentMonth],
  };
}

function normalizeBodyType(bodyType: string): string {
  const lower = (bodyType ?? "").toLowerCase();
  if (lower.includes("convertible")) return "convertible";
  if (lower.includes("truck") || lower.includes("pickup")) return "truck";
  if (lower.includes("suv") || lower.includes("crossover")) return "suv";
  if (lower.includes("4wd") || lower.includes("4x4")) return "4wd";
  if (lower.includes("awd") || lower.includes("all-wheel") || lower.includes("all wheel")) return "awd";
  if (lower.includes("van") || lower.includes("minivan")) return "van";
  if (lower.includes("coupe") || lower.includes("sport")) return "coupe";
  if (lower.includes("hatchback") || lower.includes("hatch")) return "hatchback";
  if (lower.includes("wagon")) return "wagon";
  return "sedan";
}

/* ========================================================================== */
/*  8. Competitive Intelligence Signals                                        */
/* ========================================================================== */

function generateCompetitiveSignals(
  vehicle: InventoryVehicle,
  inventory: InventoryVehicle[],
): CompetitiveSignal[] {
  const signals: CompetitiveSignal[] = [];
  const comparables = inventory.filter((v) =>
    v.vin !== vehicle.vin &&
    v.make === vehicle.make &&
    v.model === vehicle.model &&
    Math.abs(v.year - vehicle.year) <= 2
  );

  if (comparables.length === 0) return signals;

  // Detect price clustering (multiple vehicles within 3% of same price)
  const priceBuckets = new Map<number, string[]>();
  for (const v of [...comparables, vehicle]) {
    const bucket = Math.round(v.price / 500) * 500;
    if (!priceBuckets.has(bucket)) priceBuckets.set(bucket, []);
    priceBuckets.get(bucket)!.push(v.vin);
  }

  for (const [bucketPrice, vins] of priceBuckets) {
    if (vins.length >= 3) {
      signals.push({
        type: "price_cluster",
        description: `${vins.length} similar vehicles clustered around $${bucketPrice.toLocaleString()}. This is likely the market rate.`,
        affected_vehicles: vins,
        recommended_action: "Price at or slightly below this cluster to win comparison shoppers.",
      });
    }
  }

  // Detect market gaps (popular price brackets with no inventory)
  const allPrices = comparables.map((v) => v.price).sort((a, b) => a - b);
  if (allPrices.length >= 2) {
    for (let i = 0; i < allPrices.length - 1; i++) {
      const gap = allPrices[i + 1] - allPrices[i];
      if (gap > 3000) {
        const gapMid = Math.round((allPrices[i] + allPrices[i + 1]) / 2 / 100) * 100;
        signals.push({
          type: "market_gap",
          description: `No ${vehicle.make} ${vehicle.model} inventory between $${allPrices[i].toLocaleString()} and $${allPrices[i + 1].toLocaleString()}. The $${gapMid.toLocaleString()} price point may attract underserved buyers.`,
          affected_vehicles: [vehicle.vin],
          recommended_action: `Consider pricing at $${gapMid.toLocaleString()} to fill this market gap.`,
        });
      }
    }
  }

  return signals;
}

/* ========================================================================== */
/*  9. Full Report Generators                                                  */
/* ========================================================================== */

/**
 * Generate a complete pricing report for a single vehicle.
 * Pure function — no database calls, no side effects.
 */
export function generateVehiclePricingReport(
  vehicle: InventoryVehicle & { days_on_lot?: number },
  inventory: InventoryVehicle[],
  signals?: Partial<VehicleSignals>,
  costBasis?: Partial<CostBasis>,
): PricingReport {
  // Build full signals with defaults for missing data
  const fullSignals: VehicleSignals = {
    vdp_views: 0,
    inventory_avg_views: 1,
    calculator_uses: 0,
    comparison_wins: 0,
    comparison_losses: 0,
    photo_dwell_seconds: 0,
    photo_zoom_count: 0,
    lead_conversion_rate: 0,
    search_ctr: 0,
    time_on_page_seconds: 0,
    inventory_avg_time_on_page: 1,
    return_visitor_views: 0,
    ...signals,
  };

  const demand = calculateDemandScore(fullSignals);
  const position = analyzePricePosition(vehicle, inventory);
  const velocity = predictVelocity(vehicle, demand);
  const optimal = calculateOptimalPrice(vehicle, demand, costBasis);
  const elasticity = calculateElasticity(vehicle, demand);
  const aging = getAgingRecommendation(vehicle, demand);
  const seasonal = getSeasonalAdjustment(
    vehicle.bodyStyle,
    optimal.optimal_price,
  );
  const competitive_signals = generateCompetitiveSignals(vehicle, inventory);

  return {
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    current_price: vehicle.price,
    demand,
    position,
    velocity,
    optimal,
    elasticity,
    aging,
    seasonal,
    competitive_signals,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate lot-level aggregate pricing analytics.
 * Pure function — takes the inventory array and per-vehicle reports.
 */
export function generateLotReport(
  inventory: InventoryVehicle[],
  reports?: PricingReport[],
): LotPricingReport {
  // Generate reports if not provided
  const vehicleReports = reports ?? inventory.map((v) =>
    generateVehiclePricingReport(v, inventory)
  );

  if (vehicleReports.length === 0) {
    return {
      total_vehicles: 0,
      avg_days_to_sale: 0,
      revenue_velocity_per_day: 0,
      aging_distribution: { fresh: 0, normal: 0, aging: 0, stale: 0, critical: 0 },
      total_potential_uplift: 0,
      inventory_health_score: 50,
      action_summary: { hold: 0, reduce: 0, increase: 0, markdown: 0, spotlight: 0 },
      top_opportunities: [],
      generated_at: new Date().toISOString(),
    };
  }

  // Aging distribution
  const agingDist: Record<AgingTier, number> = { fresh: 0, normal: 0, aging: 0, stale: 0, critical: 0 };
  for (const r of vehicleReports) {
    agingDist[r.aging.tier]++;
  }

  // Action summary
  const actionSummary: Record<PricingAction, number> = { hold: 0, reduce: 0, increase: 0, markdown: 0, spotlight: 0 };
  for (const r of vehicleReports) {
    actionSummary[r.optimal.action]++;
  }

  // Average estimated days to sale
  const avgDays = Math.round(
    vehicleReports.reduce((sum, r) => sum + r.velocity.estimated_days_to_sale, 0)
    / vehicleReports.length
  );

  // Revenue velocity: total inventory value / avg days to sale
  const totalValue = vehicleReports.reduce((sum, r) => sum + r.current_price, 0);
  const revenueVelocity = avgDays > 0 ? Math.round(totalValue / avgDays) : 0;

  // Total potential uplift: sum of positive deltas
  const totalUplift = vehicleReports.reduce((sum, r) => {
    if (r.optimal.delta_from_current > 0) return sum + r.optimal.delta_from_current;
    return sum;
  }, 0);

  // Inventory health score: weighted average of demand, aging, and velocity
  const avgDemand = vehicleReports.reduce((s, r) => s + r.demand.score, 0) / vehicleReports.length;
  const freshPct = (agingDist.fresh + agingDist.normal) / vehicleReports.length;
  const velocityScore = vehicleReports.filter((r) =>
    r.velocity.velocity_label === "fast" || r.velocity.velocity_label === "normal"
  ).length / vehicleReports.length;

  const healthScore = Math.round(
    avgDemand * 0.3 + freshPct * 100 * 0.4 + velocityScore * 100 * 0.3
  );

  // Top opportunities: vehicles with largest uplift potential
  const topOpportunities = vehicleReports
    .filter((r) => r.optimal.delta_from_current !== 0)
    .sort((a, b) => Math.abs(b.optimal.delta_from_current) - Math.abs(a.optimal.delta_from_current))
    .slice(0, 10)
    .map((r) => ({
      vin: r.vin,
      year: r.year,
      make: r.make,
      model: r.model,
      current_price: r.current_price,
      optimal_price: r.optimal.optimal_price,
      uplift: r.optimal.delta_from_current,
      action: r.optimal.action,
    }));

  return {
    total_vehicles: vehicleReports.length,
    avg_days_to_sale: avgDays,
    revenue_velocity_per_day: revenueVelocity,
    aging_distribution: agingDist,
    total_potential_uplift: totalUplift,
    inventory_health_score: Math.max(0, Math.min(100, healthScore)),
    action_summary: actionSummary,
    top_opportunities: topOpportunities,
    generated_at: new Date().toISOString(),
  };
}

/* ========================================================================== */
/*  Legacy generatePricingReport (backward compat with existing route)         */
/* ========================================================================== */

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

function calcDaysOnLot(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
}

function calcTurnScore(daysOnLot: number): number {
  const raw = 100 - daysOnLot * 1.5;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function reductionFactor(
  daysOnLot: number,
  condition: string,
): { factor: number; action: VehiclePricingAnalysis["action"]; reason: string; urgency: VehiclePricingAnalysis["urgency"] } {
  if (daysOnLot <= 15) {
    if (condition === "new") {
      return {
        factor: -0.01,
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
      factor: 0.025,
      action: "reduce_price",
      reason: `${daysOnLot} days on lot — recommend 2-3% price reduction to improve velocity`,
      urgency: "soon",
    };
  }
  if (daysOnLot <= 60) {
    return {
      factor: 0.05,
      action: "reduce_price",
      reason: `${daysOnLot} days on lot — recommend 4-6% price reduction; vehicle approaching stall threshold`,
      urgency: "soon",
    };
  }
  return {
    factor: 0.10,
    action: "promote",
    reason: `${daysOnLot} days on lot — vehicle is stalled; recommend 8-12% reduction and active promotion`,
    urgency: "immediate",
  };
}

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

export async function generatePricingReport(
  dealerId: string,
): Promise<LegacyPricingReport> {
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

    const rawRecommended =
      factor < 0
        ? currentPrice * (1 + Math.abs(factor))
        : currentPrice * (1 - factor);

    const recommendedPrice = Math.max(1, Math.round(rawRecommended / 100) * 100);
    const priceAdjustment = recommendedPrice - currentPrice;
    const adjustmentPercent =
      currentPrice > 0
        ? Math.round((priceAdjustment / currentPrice) * 1000) / 10
        : 0;

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

  const immediateAction = analyses.filter((a) => a.urgency === "immediate");
  const soonAction = analyses.filter((a) => a.urgency === "soon");
  const monitorAction = analyses.filter(
    (a) => a.urgency === "monitor" || a.urgency === "none",
  );

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

/* ========================================================================== */
/*  Shadow / Demo Data                                                         */
/* ========================================================================== */

const DEMO_INVENTORY: (InventoryVehicle & { days_on_lot: number })[] = [
  {
    vin: "1HGCV1F34PA000001", year: 2025, make: "Honda", model: "Accord", trim: "EX-L",
    price: 32500, msrp: 34500, mileage: 1200, fuel: "Gasoline", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-blue-500 to-blue-700", condition: "new",
    bodyStyle: "Sedan", photo: "/cars/accord.jpg", days_on_lot: 8,
    is_ev: false, ev_range_miles: null, ev_drivetrain: null,
    federal_tax_credit_eligible: false, federal_tax_credit_amount: 0,
  },
  {
    vin: "5TDKK3DC8PS000002", year: 2024, make: "Toyota", model: "Highlander", trim: "XLE",
    price: 41200, msrp: 43500, mileage: 8500, fuel: "Gasoline", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-green-500 to-green-700", condition: "used",
    bodyStyle: "SUV", photo: "/cars/highlander.jpg", days_on_lot: 34,
    is_ev: false, ev_range_miles: null, ev_drivetrain: null,
    federal_tax_credit_eligible: false, federal_tax_credit_amount: 0,
  },
  {
    vin: "1FTFW1E80PFA00003", year: 2024, make: "Ford", model: "F-150", trim: "XLT",
    price: 48900, msrp: 52000, mileage: 12000, fuel: "Gasoline", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-red-500 to-red-700", condition: "used",
    bodyStyle: "Truck", photo: "/cars/f150.jpg", days_on_lot: 67,
    is_ev: false, ev_range_miles: null, ev_drivetrain: null,
    federal_tax_credit_eligible: false, federal_tax_credit_amount: 0,
  },
  {
    vin: "5YJ3E1EA8PF000004", year: 2024, make: "Tesla", model: "Model 3", trim: "Long Range",
    price: 38500, msrp: 42000, mileage: 5200, fuel: "Electric", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-purple-500 to-purple-700", condition: "used",
    bodyStyle: "Sedan", photo: "/cars/model3.jpg", days_on_lot: 22,
    is_ev: true, ev_range_miles: 358, ev_drivetrain: "AWD",
    federal_tax_credit_eligible: true, federal_tax_credit_amount: 7500,
  },
  {
    vin: "KNAE35LC0P5000005", year: 2024, make: "Kia", model: "EV6", trim: "Wind",
    price: 43200, msrp: 48000, mileage: 3100, fuel: "Electric", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-teal-500 to-teal-700", condition: "used",
    bodyStyle: "SUV", photo: "/cars/ev6.jpg", days_on_lot: 45,
    is_ev: true, ev_range_miles: 310, ev_drivetrain: "AWD",
    federal_tax_credit_eligible: true, federal_tax_credit_amount: 7500,
  },
  {
    vin: "2C3CDXCT8PH000006", year: 2025, make: "Dodge", model: "Charger", trim: "SXT",
    price: 36800, msrp: 38500, mileage: 500, fuel: "Gasoline", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-orange-500 to-orange-700", condition: "new",
    bodyStyle: "Sedan", photo: "/cars/charger.jpg", days_on_lot: 3,
    is_ev: false, ev_range_miles: null, ev_drivetrain: null,
    federal_tax_credit_eligible: false, federal_tax_credit_amount: 0,
  },
  {
    vin: "4S3GTAL69P3000007", year: 2024, make: "Subaru", model: "Outback", trim: "Limited",
    price: 34900, msrp: 38000, mileage: 15800, fuel: "Gasoline", transmission: "CVT",
    gradient: "bg-gradient-to-r from-emerald-500 to-emerald-700", condition: "used",
    bodyStyle: "Wagon", photo: "/cars/outback.jpg", days_on_lot: 92,
    is_ev: false, ev_range_miles: null, ev_drivetrain: null,
    federal_tax_credit_eligible: false, federal_tax_credit_amount: 0,
  },
  {
    vin: "WBAPH5C58BA000008", year: 2023, make: "BMW", model: "X3", trim: "xDrive30i",
    price: 42500, msrp: 49000, mileage: 22000, fuel: "Gasoline", transmission: "Automatic",
    gradient: "bg-gradient-to-r from-slate-500 to-slate-700", condition: "used",
    bodyStyle: "SUV", photo: "/cars/x3.jpg", days_on_lot: 55,
    is_ev: false, ev_range_miles: null, ev_drivetrain: null,
    federal_tax_credit_eligible: false, federal_tax_credit_amount: 0,
  },
];

const DEMO_SIGNALS: Record<string, Partial<VehicleSignals>> = {
  "1HGCV1F34PA000001": {
    vdp_views: 42, inventory_avg_views: 18, calculator_uses: 5,
    comparison_wins: 8, comparison_losses: 2, photo_dwell_seconds: 95,
    photo_zoom_count: 7, lead_conversion_rate: 0.04, search_ctr: 0.12,
    time_on_page_seconds: 180, inventory_avg_time_on_page: 90, return_visitor_views: 6,
  },
  "5TDKK3DC8PS000002": {
    vdp_views: 28, inventory_avg_views: 18, calculator_uses: 2,
    comparison_wins: 5, comparison_losses: 4, photo_dwell_seconds: 55,
    photo_zoom_count: 3, lead_conversion_rate: 0.025, search_ctr: 0.08,
    time_on_page_seconds: 120, inventory_avg_time_on_page: 90, return_visitor_views: 3,
  },
  "1FTFW1E80PFA00003": {
    vdp_views: 8, inventory_avg_views: 18, calculator_uses: 0,
    comparison_wins: 1, comparison_losses: 6, photo_dwell_seconds: 20,
    photo_zoom_count: 1, lead_conversion_rate: 0.005, search_ctr: 0.03,
    time_on_page_seconds: 40, inventory_avg_time_on_page: 90, return_visitor_views: 0,
  },
  "5YJ3E1EA8PF000004": {
    vdp_views: 55, inventory_avg_views: 18, calculator_uses: 8,
    comparison_wins: 12, comparison_losses: 3, photo_dwell_seconds: 110,
    photo_zoom_count: 9, lead_conversion_rate: 0.06, search_ctr: 0.18,
    time_on_page_seconds: 220, inventory_avg_time_on_page: 90, return_visitor_views: 9,
  },
  "KNAE35LC0P5000005": {
    vdp_views: 15, inventory_avg_views: 18, calculator_uses: 1,
    comparison_wins: 3, comparison_losses: 5, photo_dwell_seconds: 35,
    photo_zoom_count: 2, lead_conversion_rate: 0.015, search_ctr: 0.06,
    time_on_page_seconds: 70, inventory_avg_time_on_page: 90, return_visitor_views: 1,
  },
  "2C3CDXCT8PH000006": {
    vdp_views: 38, inventory_avg_views: 18, calculator_uses: 4,
    comparison_wins: 7, comparison_losses: 2, photo_dwell_seconds: 80,
    photo_zoom_count: 6, lead_conversion_rate: 0.035, search_ctr: 0.11,
    time_on_page_seconds: 155, inventory_avg_time_on_page: 90, return_visitor_views: 5,
  },
  "4S3GTAL69P3000007": {
    vdp_views: 3, inventory_avg_views: 18, calculator_uses: 0,
    comparison_wins: 0, comparison_losses: 4, photo_dwell_seconds: 10,
    photo_zoom_count: 0, lead_conversion_rate: 0.0, search_ctr: 0.02,
    time_on_page_seconds: 25, inventory_avg_time_on_page: 90, return_visitor_views: 0,
  },
  "WBAPH5C58BA000008": {
    vdp_views: 12, inventory_avg_views: 18, calculator_uses: 1,
    comparison_wins: 2, comparison_losses: 4, photo_dwell_seconds: 30,
    photo_zoom_count: 2, lead_conversion_rate: 0.01, search_ctr: 0.05,
    time_on_page_seconds: 55, inventory_avg_time_on_page: 90, return_visitor_views: 1,
  },
};

/**
 * Get demo pricing reports for all shadow-mode vehicles.
 */
export function getDemoPricingReports(): PricingReport[] {
  return DEMO_INVENTORY.map((vehicle) => {
    const signals = DEMO_SIGNALS[vehicle.vin] ?? {};
    return generateVehiclePricingReport(vehicle, DEMO_INVENTORY, signals);
  });
}

/**
 * Get demo lot report.
 */
export function getDemoLotReport(): LotPricingReport {
  const reports = getDemoPricingReports();
  return generateLotReport(DEMO_INVENTORY, reports);
}

/**
 * Get demo report for a specific VIN.
 */
export function getDemoPricingReportByVin(vin: string): PricingReport | null {
  const vehicle = DEMO_INVENTORY.find((v) => v.vin === vin);
  if (!vehicle) return null;
  const signals = DEMO_SIGNALS[vin] ?? {};
  return generateVehiclePricingReport(vehicle, DEMO_INVENTORY, signals);
}
