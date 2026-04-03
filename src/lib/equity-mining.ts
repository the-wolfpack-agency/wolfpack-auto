/**
 * Equity Mining — Core Logic
 *
 * Auto-appraises a customer's current vehicle and suggests replacement
 * vehicles at similar or lower monthly payments. High-value dealer tool
 * that mines service-history customers for trade-in opportunities.
 *
 * All operations fire analytics hooks so the learning system can
 * track conversion funnels and optimize targeting over time.
 */

import { decodeVIN } from "@/lib/dms/vin-decoder";
import { trackEquityMining } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type VehicleCondition = "excellent" | "good" | "fair" | "poor";

export interface AppraisalInput {
  vin: string;
  mileage: number;
  condition: VehicleCondition;
}

export interface AppraisalResult {
  vin: string;
  year: number | null;
  make: string | null;
  estimatedValue: number;
  depreciationFactors: {
    ageFactor: number;
    mileageFactor: number;
    conditionFactor: number;
  };
}

export interface EquityPosition {
  vehicleValue: number;
  loanBalance: number;
  equity: number;
  isPositive: boolean;
  description: string;
}

export interface ReplacementVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  price: number;
  estimatedMonthlyPayment: number;
  paymentDifference: number;
  segment: string;
}

export interface EquityOpportunity {
  customerId: string;
  customerName: string;
  currentVehicle: {
    vin: string;
    year: number;
    make: string;
    model: string;
    mileage: number;
    lastServiceDate: string;
  };
  equityPosition: EquityPosition;
  vehicleAgeYears: number;
  score: number; // 0-100 ranking score
  suggestedReplacements: ReplacementVehicle[];
}

export interface CampaignResult {
  dealerId: string;
  scannedAt: string;
  totalCustomersScanned: number;
  opportunitiesFound: number;
  opportunities: EquityOpportunity[];
  stats: {
    avgEquity: number;
    topSegments: string[];
    totalPotentialRevenue: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Base MSRP by vehicle segment — used as a starting point for depreciation.
 * In production this would come from market data APIs; these are reasonable
 * US-market averages for the algorithm to work offline.
 */
const SEGMENT_BASE_MSRP: Record<string, number> = {
  sedan: 32_000,
  suv: 42_000,
  truck: 48_000,
  coupe: 36_000,
  van: 38_000,
  luxury: 55_000,
  electric: 45_000,
  default: 35_000,
};

/** Annual depreciation rate (compounding) */
const ANNUAL_DEPRECIATION_RATE = 0.15;

/** Mileage penalty per mile over 12k/year average */
const EXCESS_MILEAGE_PENALTY_PER_MILE = 0.05;

/** Condition multipliers (1.0 = no adjustment) */
const CONDITION_MULTIPLIERS: Record<VehicleCondition, number> = {
  excellent: 1.1,
  good: 1.0,
  fair: 0.85,
  poor: 0.65,
};

/** Monthly payment calculation defaults */
const DEFAULT_LOAN_TERM_MONTHS = 72;
const DEFAULT_APR = 0.065;
const DEFAULT_DOWN_PAYMENT_PCT = 0.1;

/** Minimum equity mining vehicle age (years) */
const MIN_VEHICLE_AGE_YEARS = 3;

/** Maximum monthly payment difference for replacement suggestions */
const MAX_PAYMENT_INCREASE = 50; // dollars

/* -------------------------------------------------------------------------- */
/* Appraisal                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Estimate trade-in value using VIN decoder + mileage/condition depreciation.
 *
 * Algorithm:
 *  1. Decode VIN to get year and make
 *  2. Look up base MSRP for the vehicle segment
 *  3. Apply age-based depreciation (compounding 15%/yr)
 *  4. Apply mileage penalty for excess miles
 *  5. Apply condition multiplier
 */
export function appraiseVehicle(
  vin: string,
  mileage: number,
  condition: VehicleCondition,
): AppraisalResult {
  const decoded = decodeVIN(vin);
  const currentYear = new Date().getFullYear();
  const vehicleAge = decoded.year ? currentYear - decoded.year : 5; // default 5 if unknown

  // Determine segment from make (simplified mapping)
  const segment = inferSegment(decoded.make);
  const baseMSRP = SEGMENT_BASE_MSRP[segment] ?? SEGMENT_BASE_MSRP.default;

  // Age depreciation: compound 15% per year
  const ageFactor = Math.pow(1 - ANNUAL_DEPRECIATION_RATE, Math.max(0, vehicleAge));

  // Mileage depreciation: penalize excess miles over expected (12k/yr avg)
  const expectedMileage = vehicleAge * 12_000;
  const excessMiles = Math.max(0, mileage - expectedMileage);
  const mileagePenalty = excessMiles * EXCESS_MILEAGE_PENALTY_PER_MILE;
  const mileageFactor = Math.max(0.3, 1 - mileagePenalty / baseMSRP);

  // Condition multiplier
  const conditionFactor = CONDITION_MULTIPLIERS[condition];

  const estimatedValue = Math.round(
    baseMSRP * ageFactor * mileageFactor * conditionFactor,
  );

  return {
    vin,
    year: decoded.year,
    make: decoded.make,
    estimatedValue: Math.max(500, estimatedValue), // floor at $500
    depreciationFactors: {
      ageFactor: Math.round(ageFactor * 1000) / 1000,
      mileageFactor: Math.round(mileageFactor * 1000) / 1000,
      conditionFactor,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Equity Position                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Calculate equity position: positive = trade-in credit, negative = roll into new loan.
 */
export function calculateEquityPosition(
  vehicleValue: number,
  loanBalance: number,
): EquityPosition {
  const equity = vehicleValue - loanBalance;
  const isPositive = equity >= 0;

  let description: string;
  if (equity > 0) {
    description = `Positive equity of $${equity.toLocaleString()} — trade-in credit available`;
  } else if (equity === 0) {
    description = "Break-even — no equity or deficit";
  } else {
    description = `Negative equity of $${Math.abs(equity).toLocaleString()} — would roll into new loan`;
  }

  return { vehicleValue, loanBalance, equity, isPositive, description };
}

/* -------------------------------------------------------------------------- */
/* Replacement Vehicle Matching                                                */
/* -------------------------------------------------------------------------- */

/**
 * Calculate estimated monthly payment for a vehicle purchase.
 */
export function calculateMonthlyPayment(
  vehiclePrice: number,
  tradeInEquity: number,
  apr: number = DEFAULT_APR,
  termMonths: number = DEFAULT_LOAN_TERM_MONTHS,
  downPaymentPct: number = DEFAULT_DOWN_PAYMENT_PCT,
): number {
  const downPayment = vehiclePrice * downPaymentPct;
  // Subtract trade-in equity (if positive) or add negative equity to principal
  const principal = vehiclePrice - downPayment - tradeInEquity;

  if (principal <= 0) return 0;

  const monthlyRate = apr / 12;
  if (monthlyRate === 0) return Math.round(principal / termMonths);

  const payment =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  return Math.round(payment);
}

/**
 * Find replacement vehicles where monthly payment (after trade-in equity)
 * is similar or lower than current payment.
 *
 * In production this queries the dealer's live inventory. In shadow mode
 * it works against the provided inventory array.
 */
export function findReplacementVehicles(
  currentMonthlyPayment: number,
  tradeInEquity: number,
  inventory: Array<{
    id: string;
    year: number;
    make: string;
    model: string;
    price: number;
    segment?: string;
  }>,
): ReplacementVehicle[] {
  const replacements: ReplacementVehicle[] = [];

  for (const vehicle of inventory) {
    const estimatedPayment = calculateMonthlyPayment(vehicle.price, tradeInEquity);
    const paymentDifference = estimatedPayment - currentMonthlyPayment;

    // Only suggest vehicles with similar or lower payments
    if (paymentDifference <= MAX_PAYMENT_INCREASE) {
      replacements.push({
        id: vehicle.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        price: vehicle.price,
        estimatedMonthlyPayment: estimatedPayment,
        paymentDifference,
        segment: vehicle.segment ?? "default",
      });
    }
  }

  // Sort by payment difference ascending (biggest savings first)
  return replacements.sort((a, b) => a.paymentDifference - b.paymentDifference);
}

/* -------------------------------------------------------------------------- */
/* Campaign Generation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Generate an equity mining campaign: scan all customers with service history,
 * identify those with positive equity + aging vehicles (3+ years), and return
 * a ranked list of opportunities.
 *
 * In production, `customers` and `inventory` come from DB queries.
 * This function is pure logic — callers provide the data.
 */
export function generateEquityMiningCampaign(
  dealerId: string,
  customers: Array<{
    id: string;
    name: string;
    vin: string;
    mileage: number;
    condition: VehicleCondition;
    loanBalance: number;
    currentMonthlyPayment: number;
    lastServiceDate: string;
    vehicleModel: string;
  }>,
  inventory: Array<{
    id: string;
    year: number;
    make: string;
    model: string;
    price: number;
    segment?: string;
  }>,
): CampaignResult {
  trackEquityMining("equity.scan_started", dealerId, {
    customer_count: customers.length,
    inventory_count: inventory.length,
  });

  const currentYear = new Date().getFullYear();
  const opportunities: EquityOpportunity[] = [];

  for (const customer of customers) {
    const appraisal = appraiseVehicle(customer.vin, customer.mileage, customer.condition);

    // Skip vehicles younger than minimum age
    const vehicleAge = appraisal.year ? currentYear - appraisal.year : 0;
    if (vehicleAge < MIN_VEHICLE_AGE_YEARS) continue;

    const equityPosition = calculateEquityPosition(
      appraisal.estimatedValue,
      customer.loanBalance,
    );

    // Only include customers with positive equity
    if (!equityPosition.isPositive) continue;

    const replacements = findReplacementVehicles(
      customer.currentMonthlyPayment,
      equityPosition.equity,
      inventory,
    );

    // Score: higher equity + older vehicle + more replacements = better opportunity
    const equityScore = Math.min(40, (equityPosition.equity / 500) * 10);
    const ageScore = Math.min(30, (vehicleAge - MIN_VEHICLE_AGE_YEARS) * 5);
    const replacementScore = Math.min(30, replacements.length * 5);
    const score = Math.round(equityScore + ageScore + replacementScore);

    const opportunity: EquityOpportunity = {
      customerId: customer.id,
      customerName: customer.name,
      currentVehicle: {
        vin: customer.vin,
        year: appraisal.year ?? 0,
        make: appraisal.make ?? "Unknown",
        model: customer.vehicleModel,
        mileage: customer.mileage,
        lastServiceDate: customer.lastServiceDate,
      },
      equityPosition,
      vehicleAgeYears: vehicleAge,
      score,
      suggestedReplacements: replacements.slice(0, 5), // top 5
    };

    opportunities.push(opportunity);

    trackEquityMining("equity.opportunity_identified", dealerId, {
      customer_id: customer.id,
      equity: equityPosition.equity,
      score,
      replacements_found: replacements.length,
    });
  }

  // Sort by score descending
  opportunities.sort((a, b) => b.score - a.score);

  const avgEquity =
    opportunities.length > 0
      ? Math.round(
          opportunities.reduce((sum, o) => sum + o.equityPosition.equity, 0) /
            opportunities.length,
        )
      : 0;

  // Top segments from replacement suggestions
  const segmentCounts: Record<string, number> = {};
  for (const opp of opportunities) {
    for (const rep of opp.suggestedReplacements) {
      segmentCounts[rep.segment] = (segmentCounts[rep.segment] ?? 0) + 1;
    }
  }
  const topSegments = Object.entries(segmentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([seg]) => seg);

  const totalPotentialRevenue = opportunities.reduce(
    (sum, o) =>
      sum +
      (o.suggestedReplacements[0]?.price ?? 0) -
      o.equityPosition.vehicleValue,
    0,
  );

  const result: CampaignResult = {
    dealerId,
    scannedAt: new Date().toISOString(),
    totalCustomersScanned: customers.length,
    opportunitiesFound: opportunities.length,
    opportunities,
    stats: {
      avgEquity,
      topSegments,
      totalPotentialRevenue: Math.max(0, totalPotentialRevenue),
    },
  };

  trackEquityMining("equity.scan_completed", dealerId, {
    customers_scanned: customers.length,
    opportunities_found: opportunities.length,
    avg_equity: avgEquity,
  });

  return result;
}

/* -------------------------------------------------------------------------- */
/* Helpers (internal)                                                           */
/* -------------------------------------------------------------------------- */

/** Infer vehicle segment from make name (simplified). */
function inferSegment(make: string | null): string {
  if (!make) return "default";
  const m = make.toLowerCase();

  if (["bmw", "mercedes-benz", "audi", "lexus", "cadillac", "lincoln", "infiniti", "genesis", "porsche", "jaguar", "land rover", "volvo", "lucid"].includes(m)) {
    return "luxury";
  }
  if (["tesla", "rivian"].includes(m)) return "electric";
  if (["gmc", "ram"].includes(m)) return "truck";

  return "default";
}
