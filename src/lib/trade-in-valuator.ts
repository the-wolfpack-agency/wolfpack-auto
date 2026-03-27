/**
 * Trade-In Valuation Engine
 *
 * Pure TypeScript, zero external API calls.
 * Deterministic, explainable algorithm — every step emits a ValuationFactor
 * so the consumer can show the customer exactly why the estimate is what it is.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TradeInInput {
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage: number;
  condition: "excellent" | "good" | "fair" | "poor";
  accidentHistory: "none" | "minor" | "major";
  titleStatus: "clean" | "rebuilt" | "salvage";
  previousOwners: number;
}

export interface ValuationFactor {
  label: string;
  impact: number;       // dollar amount, positive or negative
  description: string;
}

export interface TradeInValuation {
  estimatedLow: number;
  estimatedHigh: number;
  estimatedMid: number;
  confidence: "high" | "medium" | "low";
  factors: ValuationFactor[];
  expiresAt: Date;      // offer valid for 7 days
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Make tier base values                                             */
/* -------------------------------------------------------------------------- */

const MAKE_TIERS: Record<string, number> = {
  // Tier 1 — luxury ($35k avg MSRP)
  "bmw": 35_000,
  "mercedes-benz": 35_000,
  "audi": 35_000,
  "lexus": 35_000,
  "porsche": 35_000,
  "cadillac": 35_000,
  "lincoln": 35_000,
  "genesis": 35_000,

  // Tier 2 — near-luxury ($28k avg)
  "acura": 28_000,
  "infiniti": 28_000,
  "volvo": 28_000,
  "land rover": 28_000,
  "buick": 28_000,

  // Tier 3 — mainstream ($22k avg)
  "toyota": 22_000,
  "honda": 22_000,
  "mazda": 22_000,
  "subaru": 22_000,
  "hyundai": 22_000,
  "kia": 22_000,

  // Tier 4 — domestic / truck ($25k avg)
  "ford": 25_000,
  "chevrolet": 25_000,
  "gmc": 25_000,
  "ram": 25_000,
  "jeep": 25_000,
  "dodge": 25_000,

  // Tier 5 — economy ($18k avg)
  "nissan": 18_000,
  "mitsubishi": 18_000,
  "volkswagen": 18_000,
  "fiat": 18_000,

  // Tier 6 — EV premium ($45k avg)
  "tesla": 45_000,
  "rivian": 45_000,
  "lucid": 45_000,
  "polestar": 45_000,
};

const DEFAULT_BASE = 20_000;

// Makes that count as "popular" for confidence scoring (Tier 1-4)
const POPULAR_MAKES = new Set([
  "bmw", "mercedes-benz", "audi", "lexus", "porsche", "cadillac", "lincoln",
  "genesis", "acura", "infiniti", "volvo", "land rover", "buick",
  "toyota", "honda", "mazda", "subaru", "hyundai", "kia",
  "ford", "chevrolet", "gmc", "ram", "jeep", "dodge",
]);

function getBaseValue(make: string): number {
  return MAKE_TIERS[make.toLowerCase()] ?? DEFAULT_BASE;
}

/* -------------------------------------------------------------------------- */
/* Step 2 — Age depreciation                                                  */
/* -------------------------------------------------------------------------- */

const DEPRECIATION_RATES: Record<number, number> = {
  0: 0.95,
  1: 0.82,
  2: 0.74,
  3: 0.67,
  4: 0.60,
  5: 0.54,
  6: 0.49,
  7: 0.44,
  8: 0.40,
  9: 0.36,
  10: 0.32,
};

function getDepreciationRate(age: number): number {
  if (age <= 10) return DEPRECIATION_RATES[age] ?? 0.95;
  if (age <= 15) return Math.max(0.12, 0.28 - (age - 11) * 0.02);
  return 0.10;
}

/* -------------------------------------------------------------------------- */
/* Main valuation function                                                    */
/* -------------------------------------------------------------------------- */

export function calculateTradeInValue(input: TradeInInput): TradeInValuation {
  const currentYear = new Date().getFullYear();
  const factors: ValuationFactor[] = [];

  /* --- Step 1: Base value ------------------------------------------------- */
  const baseValue = getBaseValue(input.make);
  factors.push({
    label: "Base Market Value",
    impact: baseValue,
    description: `Starting value for a ${input.make} based on market segment average MSRP.`,
  });

  /* --- Step 2: Age depreciation ------------------------------------------ */
  const age = currentYear - input.year;
  const depRate = getDepreciationRate(age);
  const afterDepreciation = baseValue * depRate;
  const depreciationImpact = afterDepreciation - baseValue;
  factors.push({
    label: "Age Depreciation",
    impact: Math.round(depreciationImpact),
    description:
      age === 0
        ? "Vehicle is nearly new — minimal depreciation applied."
        : `${age}-year depreciation at ${Math.round(depRate * 100)}% of base value.`,
  });

  /* --- Step 3: Mileage adjustment ---------------------------------------- */
  const expectedMiles = age * 12_000;
  const milesOver = input.mileage - expectedMiles;
  const milesUnder = expectedMiles - input.mileage;
  let mileageAdjustment = 0;

  if (milesOver > 0) {
    mileageAdjustment = -Math.min(milesOver * 0.06, baseValue * 0.25);
    factors.push({
      label: "High Mileage Deduction",
      impact: Math.round(mileageAdjustment),
      description: `${milesOver.toLocaleString()} miles above expected average (${expectedMiles.toLocaleString()} mi for age).`,
    });
  } else if (milesUnder > 0) {
    mileageAdjustment = Math.min(milesUnder * 0.04, baseValue * 0.12);
    factors.push({
      label: "Low Mileage Bonus",
      impact: Math.round(mileageAdjustment),
      description: `${milesUnder.toLocaleString()} miles below expected average — increases value.`,
    });
  } else {
    factors.push({
      label: "Mileage",
      impact: 0,
      description: "Mileage is right at the expected average for vehicle age.",
    });
  }

  const afterMileage = afterDepreciation + mileageAdjustment;

  /* --- Step 4: Condition multiplier --------------------------------------- */
  const conditionMultipliers: Record<TradeInInput["condition"], number> = {
    excellent: 1.00,
    good: 0.87,
    fair: 0.71,
    poor: 0.54,
  };
  const conditionMultiplier = conditionMultipliers[input.condition];
  const afterCondition = afterMileage * conditionMultiplier;
  const conditionImpact = afterCondition - afterMileage;
  if (conditionImpact !== 0) {
    factors.push({
      label: "Condition",
      impact: Math.round(conditionImpact),
      description: `Condition rated "${input.condition}" — ${Math.round(conditionMultiplier * 100)}% value multiplier applied.`,
    });
  } else {
    factors.push({
      label: "Condition",
      impact: 0,
      description: 'Condition rated "excellent" — no deduction applied.',
    });
  }

  /* --- Step 5: Accident & title deductions -------------------------------- */
  let accidentDeduction = 0;
  if (input.accidentHistory === "minor") {
    accidentDeduction = -(baseValue * 0.09);
    factors.push({
      label: "Accident History — Minor",
      impact: Math.round(accidentDeduction),
      description: "Minor accident on record reduces trade-in value by 9%.",
    });
  } else if (input.accidentHistory === "major") {
    accidentDeduction = -(baseValue * 0.22);
    factors.push({
      label: "Accident History — Major",
      impact: Math.round(accidentDeduction),
      description: "Major accident on record reduces trade-in value by 22%.",
    });
  } else {
    factors.push({
      label: "Accident History",
      impact: 0,
      description: "No accident history — no deduction.",
    });
  }

  let titleDeduction = 0;
  if (input.titleStatus === "rebuilt") {
    titleDeduction = -(baseValue * 0.35);
    factors.push({
      label: "Title — Rebuilt",
      impact: Math.round(titleDeduction),
      description: "Rebuilt title reduces trade-in value by 35%.",
    });
  } else if (input.titleStatus === "salvage") {
    titleDeduction = -(baseValue * 0.55);
    factors.push({
      label: "Title — Salvage",
      impact: Math.round(titleDeduction),
      description: "Salvage title reduces trade-in value by 55%.",
    });
  } else {
    factors.push({
      label: "Title Status",
      impact: 0,
      description: "Clean title — no deduction.",
    });
  }

  /* --- Step 6: Ownership adjustment --------------------------------------- */
  let ownershipAdjustment = 0;
  if (input.previousOwners === 1) {
    ownershipAdjustment = baseValue * 0.03;
    factors.push({
      label: "Single Owner Bonus",
      impact: Math.round(ownershipAdjustment),
      description: "Only one previous owner adds a 3% premium.",
    });
  } else if (input.previousOwners >= 3) {
    ownershipAdjustment = -(baseValue * 0.04);
    factors.push({
      label: "Multiple Owners Deduction",
      impact: Math.round(ownershipAdjustment),
      description: `${input.previousOwners} previous owners — 4% deduction applied.`,
    });
  } else {
    factors.push({
      label: "Ownership History",
      impact: 0,
      description: "2 previous owners — no adjustment.",
    });
  }

  /* --- Step 7: Final range calculation ------------------------------------ */
  const rawFinalValue =
    afterCondition + accidentDeduction + titleDeduction + ownershipAdjustment;

  const estimatedMid = Math.max(500, Math.round(rawFinalValue / 100) * 100);
  const estimatedLow = Math.round((estimatedMid * 0.92) / 100) * 100;
  const estimatedHigh = Math.round((estimatedMid * 1.08) / 100) * 100;

  /* --- Confidence --------------------------------------------------------- */
  const makeKey = input.make.toLowerCase();
  const isPopular = POPULAR_MAKES.has(makeKey);
  const hasSalvage = input.titleStatus === "salvage";
  const isPoorCondition = input.condition === "poor";
  const isOld = age > 12;
  const isVeryOld = age > 8;

  let confidence: "high" | "medium" | "low";
  if (isOld || hasSalvage || isPoorCondition) {
    confidence = "low";
  } else if (isPopular && !isVeryOld && (input.condition === "excellent" || input.condition === "good")) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  /* --- Expiry ------------------------------------------------------------- */
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  return {
    estimatedLow,
    estimatedHigh,
    estimatedMid,
    confidence,
    factors,
    expiresAt,
  };
}
