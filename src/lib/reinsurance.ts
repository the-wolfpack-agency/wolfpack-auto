/**
 * Reinsurance Module — Core logic for F&I reinsurance program administration.
 *
 * Manages dealer participation in reinsurance programs where dealers share
 * in the underwriting profit of F&I products they sell. Supports CFC
 * (Controlled Foreign Corporation), DOWC (Dealer-Owned Warranty Company),
 * and trust-based structures.
 *
 * Every calculation feeds into the analytics/learning system so the platform
 * can track reinsurance profitability over time.
 */

import { trackReinsurance } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ProgramType = "CFC" | "DOWC" | "trust";
export type ProgramStatus = "active" | "inactive" | "pending" | "terminated";
export type ProductCategory = "VSC" | "GAP" | "maintenance" | "tire_wheel" | "paint_fabric" | "key_replacement" | "theft" | "other";
export type RiskLevel = "low" | "medium" | "high";

export interface ReinsuranceProgram {
  id: string;
  dealer_id: string;
  name: string;
  type: ProgramType;
  status: ProgramStatus;
  inception_date: string;
  cession_rate: number;        // 0.0–1.0: percentage of premium ceded to reinsurance entity
  admin_fee_rate: number;      // annual admin fee as % of reserves
  total_premiums: number;
  total_claims: number;
  total_admin_costs: number;
  retained_reserves: number;
  created_at: string;
  updated_at: string;
}

export interface ReinsurancePolicy {
  id: string;
  program_id: string;
  deal_id: string;
  product_category: ProductCategory;
  retail_price: number;
  dealer_cost: number;
  ceded_premium: number;
  effective_date: string;
  expiration_date: string;
  status: "active" | "expired" | "cancelled" | "claimed";
}

export interface ClaimRecord {
  id: string;
  policy_id: string;
  program_id: string;
  product_category: ProductCategory;
  claim_amount: number;
  claim_date: string;
  status: "pending" | "approved" | "denied" | "paid";
  paid_amount: number;
  paid_date: string | null;
}

export interface ProgramPerformance {
  program_id: string;
  dealer_id: string;
  period_start: string;
  period_end: string;
  total_premiums_earned: number;
  total_claims_paid: number;
  loss_ratio: number;
  retained_reserves: number;
  admin_costs: number;
  net_profit: number;
  roi_pct: number;
  product_breakdown: ProductBreakdown[];
  risk_assessment: RiskAssessment;
}

export interface ProductBreakdown {
  category: ProductCategory;
  premiums_earned: number;
  claims_paid: number;
  loss_ratio: number;
  policies_sold: number;
  claims_filed: number;
}

export interface RiskAssessment {
  overall_risk: RiskLevel;
  claim_frequency: number;      // claims per 100 policies
  claim_severity: number;       // average claim amount
  frequency_trend: "increasing" | "stable" | "decreasing";
  severity_trend: "increasing" | "stable" | "decreasing";
  exposure_amount: number;      // total outstanding policy liability
  reserve_adequacy: number;     // reserves / exposure (>1.0 = adequately reserved)
}

/* -------------------------------------------------------------------------- */
/* Core calculations                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Calculate the premium amount flowing to the reinsurance company.
 *
 * cededPremium = (retailPrice - dealerCost) * cessionRate
 *
 * The cession rate determines what percentage of the net premium (profit
 * margin on the F&I product) gets ceded into the reinsurance entity.
 */
export function calculateCededPremium(
  retailPrice: number,
  dealerCost: number,
  cessionRate: number,
): number {
  if (retailPrice < 0 || dealerCost < 0) {
    throw new Error("Prices must be non-negative");
  }
  if (cessionRate < 0 || cessionRate > 1) {
    throw new Error("Cession rate must be between 0 and 1");
  }
  const netPremium = retailPrice - dealerCost;
  return Math.round(netPremium * cessionRate * 100) / 100;
}

/**
 * Calculate the dealer's retained reserve based on loss experience.
 *
 * retainedReserve = cededPremium * (1 - lossRatio)
 *
 * A lower loss ratio means more profit retained. Loss ratios above 1.0
 * indicate the program is paying out more in claims than it earns.
 */
export function calculateRetainedReserve(
  cededPremium: number,
  lossRatio: number,
): number {
  if (cededPremium < 0) {
    throw new Error("Ceded premium must be non-negative");
  }
  if (lossRatio < 0) {
    throw new Error("Loss ratio must be non-negative");
  }
  const retained = cededPremium * (1 - lossRatio);
  return Math.round(retained * 100) / 100;
}

/**
 * Calculate ROI for a reinsurance program.
 *
 * ROI = (totalPremiums - totalClaims - adminCosts) / totalPremiums * 100
 *
 * Returns the ROI as a percentage. Negative ROI means the program is
 * losing money (claims + admin exceed premiums).
 */
export function calculateProgramROI(program: ReinsuranceProgram): number {
  if (program.total_premiums === 0) return 0;
  const netProfit = program.total_premiums - program.total_claims - program.total_admin_costs;
  return Math.round((netProfit / program.total_premiums) * 10000) / 100;
}

/**
 * Generate a comprehensive P&L performance report for a dealer's
 * reinsurance program over a given date range.
 */
export function generatePerformanceReport(
  dealerId: string,
  dateRange: { start: string; end: string },
  program: ReinsuranceProgram,
  policies: ReinsurancePolicy[],
  claims: ClaimRecord[],
): ProgramPerformance {
  // Filter to date range
  const rangeStart = new Date(dateRange.start);
  const rangeEnd = new Date(dateRange.end);

  const filteredPolicies = policies.filter((p) => {
    const d = new Date(p.effective_date);
    return d >= rangeStart && d <= rangeEnd;
  });

  const filteredClaims = claims.filter((c) => {
    const d = new Date(c.claim_date);
    return d >= rangeStart && d <= rangeEnd && c.status === "paid";
  });

  const totalPremiums = filteredPolicies.reduce((sum, p) => sum + p.ceded_premium, 0);
  const totalClaims = filteredClaims.reduce((sum, c) => sum + c.paid_amount, 0);
  const lossRatio = totalPremiums > 0 ? totalClaims / totalPremiums : 0;
  const adminCosts = totalPremiums * program.admin_fee_rate;
  const netProfit = totalPremiums - totalClaims - adminCosts;
  const roiPct = totalPremiums > 0 ? (netProfit / totalPremiums) * 100 : 0;

  // Product breakdown
  const categories: ProductCategory[] = ["VSC", "GAP", "maintenance", "tire_wheel", "paint_fabric", "key_replacement", "theft", "other"];
  const productBreakdown: ProductBreakdown[] = categories
    .map((cat) => {
      const catPolicies = filteredPolicies.filter((p) => p.product_category === cat);
      const catClaims = filteredClaims.filter((c) => c.product_category === cat);
      const catPremiums = catPolicies.reduce((s, p) => s + p.ceded_premium, 0);
      const catClaimsPaid = catClaims.reduce((s, c) => s + c.paid_amount, 0);
      return {
        category: cat,
        premiums_earned: Math.round(catPremiums * 100) / 100,
        claims_paid: Math.round(catClaimsPaid * 100) / 100,
        loss_ratio: catPremiums > 0 ? Math.round((catClaimsPaid / catPremiums) * 10000) / 10000 : 0,
        policies_sold: catPolicies.length,
        claims_filed: catClaims.length,
      };
    })
    .filter((b) => b.policies_sold > 0 || b.claims_filed > 0);

  const risk = assessRiskExposure(program, filteredPolicies, filteredClaims);

  // Track analytics
  trackReinsurance("reinsurance.report_generated", dealerId, {
    program_id: program.id,
    period_start: dateRange.start,
    period_end: dateRange.end,
    total_premiums: Math.round(totalPremiums * 100) / 100,
    total_claims: Math.round(totalClaims * 100) / 100,
    loss_ratio: Math.round(lossRatio * 10000) / 10000,
    roi_pct: Math.round(roiPct * 100) / 100,
  });

  return {
    program_id: program.id,
    dealer_id: dealerId,
    period_start: dateRange.start,
    period_end: dateRange.end,
    total_premiums_earned: Math.round(totalPremiums * 100) / 100,
    total_claims_paid: Math.round(totalClaims * 100) / 100,
    loss_ratio: Math.round(lossRatio * 10000) / 10000,
    retained_reserves: Math.round(calculateRetainedReserve(totalPremiums, lossRatio) * 100) / 100,
    admin_costs: Math.round(adminCosts * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
    roi_pct: Math.round(roiPct * 100) / 100,
    product_breakdown: productBreakdown,
    risk_assessment: risk,
  };
}

/**
 * Assess the risk exposure of a reinsurance program by evaluating
 * claim frequency, severity, and trends.
 */
export function assessRiskExposure(
  program: ReinsuranceProgram,
  policies: ReinsurancePolicy[],
  claims: ClaimRecord[],
): RiskAssessment {
  const totalPolicies = policies.length;
  const paidClaims = claims.filter((c) => c.status === "paid");
  const totalClaims = paidClaims.length;

  // Frequency: claims per 100 policies
  const claimFrequency = totalPolicies > 0
    ? Math.round((totalClaims / totalPolicies) * 10000) / 100
    : 0;

  // Severity: average claim amount
  const claimSeverity = totalClaims > 0
    ? Math.round((paidClaims.reduce((s, c) => s + c.paid_amount, 0) / totalClaims) * 100) / 100
    : 0;

  // Exposure: total outstanding liability (active policy ceded premiums)
  const activePolicies = policies.filter((p) => p.status === "active");
  const exposureAmount = activePolicies.reduce((s, p) => s + p.ceded_premium, 0);

  // Reserve adequacy
  const reserveAdequacy = exposureAmount > 0
    ? Math.round((program.retained_reserves / exposureAmount) * 100) / 100
    : 1.0;

  // Determine trends (simplified: based on current ratios)
  const lossRatio = program.total_premiums > 0
    ? program.total_claims / program.total_premiums
    : 0;

  const frequencyTrend: "increasing" | "stable" | "decreasing" =
    claimFrequency > 15 ? "increasing" : claimFrequency < 5 ? "decreasing" : "stable";

  const severityTrend: "increasing" | "stable" | "decreasing" =
    claimSeverity > 1500 ? "increasing" : claimSeverity < 500 ? "decreasing" : "stable";

  // Overall risk level
  let overallRisk: RiskLevel = "low";
  if (lossRatio > 0.8 || claimFrequency > 20 || reserveAdequacy < 0.5) {
    overallRisk = "high";
  } else if (lossRatio > 0.5 || claimFrequency > 10 || reserveAdequacy < 1.0) {
    overallRisk = "medium";
  }

  // Track analytics
  trackReinsurance("reinsurance.risk_assessed", program.dealer_id, {
    program_id: program.id,
    overall_risk: overallRisk,
    claim_frequency: claimFrequency,
    claim_severity: claimSeverity,
    reserve_adequacy: reserveAdequacy,
  });

  return {
    overall_risk: overallRisk,
    claim_frequency: claimFrequency,
    claim_severity: claimSeverity,
    frequency_trend: frequencyTrend,
    severity_trend: severityTrend,
    exposure_amount: Math.round(exposureAmount * 100) / 100,
    reserve_adequacy: reserveAdequacy,
  };
}
