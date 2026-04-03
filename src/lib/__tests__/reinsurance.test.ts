/**
 * Unit Tests — Reinsurance Module
 *
 * Validates premium calculation, retained reserves, ROI, risk assessment,
 * performance reporting, analytics event types, API route structure, and
 * sidebar/page existence.
 */

import {
  calculateCededPremium,
  calculateRetainedReserve,
  calculateProgramROI,
  generatePerformanceReport,
  assessRiskExposure,
  type ReinsuranceProgram,
  type ReinsurancePolicy,
  type ClaimRecord,
} from "@/lib/reinsurance";

/* -------------------------------------------------------------------------- */
/* Test data                                                                  */
/* -------------------------------------------------------------------------- */

const baseProgram: ReinsuranceProgram = {
  id: "reinsprog-test-001",
  dealer_id: "dealer-001",
  name: "Test CFC Program",
  type: "CFC",
  status: "active",
  inception_date: "2024-01-01",
  cession_rate: 0.75,
  admin_fee_rate: 0.03,
  total_premiums: 500000,
  total_claims: 150000,
  total_admin_costs: 15000,
  retained_reserves: 335000,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

const samplePolicies: ReinsurancePolicy[] = [
  {
    id: "pol-001",
    program_id: "reinsprog-test-001",
    deal_id: "deal-001",
    product_category: "VSC",
    retail_price: 2500,
    dealer_cost: 800,
    ceded_premium: 1275,
    effective_date: "2025-06-01",
    expiration_date: "2028-06-01",
    status: "active",
  },
  {
    id: "pol-002",
    program_id: "reinsprog-test-001",
    deal_id: "deal-002",
    product_category: "GAP",
    retail_price: 900,
    dealer_cost: 200,
    ceded_premium: 525,
    effective_date: "2025-07-01",
    expiration_date: "2028-07-01",
    status: "active",
  },
  {
    id: "pol-003",
    program_id: "reinsprog-test-001",
    deal_id: "deal-003",
    product_category: "maintenance",
    retail_price: 1200,
    dealer_cost: 400,
    ceded_premium: 600,
    effective_date: "2025-08-01",
    expiration_date: "2027-08-01",
    status: "active",
  },
  {
    id: "pol-004",
    program_id: "reinsprog-test-001",
    deal_id: "deal-004",
    product_category: "tire_wheel",
    retail_price: 800,
    dealer_cost: 250,
    ceded_premium: 412.5,
    effective_date: "2025-09-01",
    expiration_date: "2028-09-01",
    status: "active",
  },
];

const sampleClaims: ClaimRecord[] = [
  {
    id: "claim-001",
    policy_id: "pol-001",
    program_id: "reinsprog-test-001",
    product_category: "VSC",
    claim_amount: 800,
    claim_date: "2025-12-01",
    status: "paid",
    paid_amount: 750,
    paid_date: "2025-12-15",
  },
  {
    id: "claim-002",
    policy_id: "pol-002",
    program_id: "reinsprog-test-001",
    product_category: "GAP",
    claim_amount: 5000,
    claim_date: "2025-11-01",
    status: "paid",
    paid_amount: 5000,
    paid_date: "2025-11-20",
  },
];

/* -------------------------------------------------------------------------- */
/* Premium Calculation                                                        */
/* -------------------------------------------------------------------------- */

describe("Reinsurance Module", () => {
  describe("calculateCededPremium", () => {
    test("calculates ceded premium at 75% cession rate", () => {
      const result = calculateCededPremium(2500, 800, 0.75);
      expect(result).toBe(1275);
    });

    test("calculates ceded premium at 50% cession rate", () => {
      const result = calculateCededPremium(2000, 600, 0.5);
      expect(result).toBe(700);
    });

    test("calculates ceded premium at 100% cession rate", () => {
      const result = calculateCededPremium(1500, 500, 1.0);
      expect(result).toBe(1000);
    });

    test("returns 0 when retail equals cost", () => {
      const result = calculateCededPremium(800, 800, 0.75);
      expect(result).toBe(0);
    });

    test("throws on negative prices", () => {
      expect(() => calculateCededPremium(-100, 50, 0.5)).toThrow("Prices must be non-negative");
    });

    test("throws on cession rate out of range", () => {
      expect(() => calculateCededPremium(100, 50, 1.5)).toThrow("Cession rate must be between 0 and 1");
      expect(() => calculateCededPremium(100, 50, -0.1)).toThrow("Cession rate must be between 0 and 1");
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Retained Reserve Calculation                                               */
  /* -------------------------------------------------------------------------- */

  describe("calculateRetainedReserve", () => {
    test("retains full premium when loss ratio is 0", () => {
      const result = calculateRetainedReserve(1000, 0);
      expect(result).toBe(1000);
    });

    test("retains nothing when loss ratio is 1.0", () => {
      const result = calculateRetainedReserve(1000, 1.0);
      expect(result).toBe(0);
    });

    test("retains 70% when loss ratio is 0.3", () => {
      const result = calculateRetainedReserve(1000, 0.3);
      expect(result).toBe(700);
    });

    test("returns negative when loss ratio exceeds 1.0 (program losing money)", () => {
      const result = calculateRetainedReserve(1000, 1.5);
      expect(result).toBe(-500);
    });

    test("handles varying loss ratios", () => {
      expect(calculateRetainedReserve(5000, 0.2)).toBe(4000);
      expect(calculateRetainedReserve(5000, 0.5)).toBe(2500);
      expect(calculateRetainedReserve(5000, 0.8)).toBe(1000);
    });

    test("throws on negative ceded premium", () => {
      expect(() => calculateRetainedReserve(-100, 0.5)).toThrow("Ceded premium must be non-negative");
    });

    test("throws on negative loss ratio", () => {
      expect(() => calculateRetainedReserve(100, -0.1)).toThrow("Loss ratio must be non-negative");
    });
  });

  /* -------------------------------------------------------------------------- */
  /* ROI Calculation                                                            */
  /* -------------------------------------------------------------------------- */

  describe("calculateProgramROI", () => {
    test("calculates positive ROI for profitable program", () => {
      const result = calculateProgramROI(baseProgram);
      // (500000 - 150000 - 15000) / 500000 * 100 = 67%
      expect(result).toBe(67);
    });

    test("calculates negative ROI for unprofitable program", () => {
      const unprofitable: ReinsuranceProgram = {
        ...baseProgram,
        total_premiums: 100000,
        total_claims: 120000,
        total_admin_costs: 5000,
      };
      const result = calculateProgramROI(unprofitable);
      expect(result).toBeLessThan(0);
      // (100000 - 120000 - 5000) / 100000 * 100 = -25%
      expect(result).toBe(-25);
    });

    test("returns 0 when total premiums are 0", () => {
      const zeroPremiums: ReinsuranceProgram = {
        ...baseProgram,
        total_premiums: 0,
        total_claims: 0,
        total_admin_costs: 0,
      };
      expect(calculateProgramROI(zeroPremiums)).toBe(0);
    });

    test("handles break-even program", () => {
      const breakEven: ReinsuranceProgram = {
        ...baseProgram,
        total_premiums: 100000,
        total_claims: 90000,
        total_admin_costs: 10000,
      };
      expect(calculateProgramROI(breakEven)).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Risk Assessment                                                            */
  /* -------------------------------------------------------------------------- */

  describe("assessRiskExposure", () => {
    test("returns valid risk assessment for healthy program", () => {
      // With 4 policies and 2 claims, frequency = 50 per 100 — high
      // Use the base program which has a 30% loss ratio from totals
      const result = assessRiskExposure(baseProgram, samplePolicies, sampleClaims);
      expect(["low", "medium", "high"]).toContain(result.overall_risk);
      expect(result.claim_frequency).toBeGreaterThan(0);
      expect(result.claim_severity).toBeGreaterThan(0);
      expect(result.exposure_amount).toBeGreaterThan(0);
    });

    test("returns high risk for high loss ratio program", () => {
      const highLoss: ReinsuranceProgram = {
        ...baseProgram,
        total_premiums: 100000,
        total_claims: 90000, // 90% loss ratio
        retained_reserves: 5000, // very low reserves
      };
      // Create many claims to push frequency up
      const manyClaims: ClaimRecord[] = Array.from({ length: 25 }, (_, i) => ({
        id: `claim-${i}`,
        policy_id: "pol-001",
        program_id: "reinsprog-test-001",
        product_category: "VSC" as const,
        claim_amount: 2000,
        claim_date: "2025-10-01",
        status: "paid" as const,
        paid_amount: 2000,
        paid_date: "2025-10-15",
      }));
      const result = assessRiskExposure(highLoss, samplePolicies, manyClaims);
      expect(result.overall_risk).toBe("high");
    });

    test("returns medium risk for moderate loss program", () => {
      const medLoss: ReinsuranceProgram = {
        ...baseProgram,
        total_premiums: 100000,
        total_claims: 55000, // 55% loss ratio — triggers medium but not high
        retained_reserves: 300000, // well-reserved so reserve_adequacy is fine
      };
      // Use 100 policies so frequency stays moderate (3 claims / 100 = 3 per 100)
      const manyPolicies: ReinsurancePolicy[] = Array.from({ length: 100 }, (_, i) => ({
        id: `pol-med-${i}`,
        program_id: "reinsprog-test-001",
        deal_id: `deal-${i}`,
        product_category: "VSC" as const,
        retail_price: 2000,
        dealer_cost: 700,
        ceded_premium: 975,
        effective_date: "2025-06-01",
        expiration_date: "2028-06-01",
        status: "active" as const,
      }));
      const modClaims: ClaimRecord[] = Array.from({ length: 3 }, (_, i) => ({
        id: `claim-med-${i}`,
        policy_id: "pol-med-0",
        program_id: "reinsprog-test-001",
        product_category: "VSC" as const,
        claim_amount: 800,
        claim_date: "2025-10-01",
        status: "paid" as const,
        paid_amount: 800,
        paid_date: "2025-10-15",
      }));
      const result = assessRiskExposure(medLoss, manyPolicies, modClaims);
      expect(result.overall_risk).toBe("medium");
    });

    test("handles empty policies and claims", () => {
      const result = assessRiskExposure(baseProgram, [], []);
      expect(result.claim_frequency).toBe(0);
      expect(result.claim_severity).toBe(0);
      expect(result.exposure_amount).toBe(0);
    });

    test("returns valid frequency and severity trends", () => {
      const result = assessRiskExposure(baseProgram, samplePolicies, sampleClaims);
      expect(["increasing", "stable", "decreasing"]).toContain(result.frequency_trend);
      expect(["increasing", "stable", "decreasing"]).toContain(result.severity_trend);
    });

    test("calculates reserve adequacy", () => {
      const result = assessRiskExposure(baseProgram, samplePolicies, sampleClaims);
      expect(result.reserve_adequacy).toBeGreaterThan(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Performance Report                                                         */
  /* -------------------------------------------------------------------------- */

  describe("generatePerformanceReport", () => {
    const dateRange = { start: "2025-01-01", end: "2026-12-31" };

    test("generates report with correct structure", () => {
      const report = generatePerformanceReport(
        "dealer-001",
        dateRange,
        baseProgram,
        samplePolicies,
        sampleClaims,
      );
      expect(report.dealer_id).toBe("dealer-001");
      expect(report.program_id).toBe(baseProgram.id);
      expect(report.period_start).toBe(dateRange.start);
      expect(report.period_end).toBe(dateRange.end);
      expect(report.total_premiums_earned).toBeGreaterThan(0);
      expect(report.total_claims_paid).toBeGreaterThan(0);
      expect(report.loss_ratio).toBeGreaterThanOrEqual(0);
      expect(report.retained_reserves).toBeDefined();
      expect(report.admin_costs).toBeGreaterThanOrEqual(0);
      expect(report.net_profit).toBeDefined();
      expect(report.roi_pct).toBeDefined();
    });

    test("includes product breakdown", () => {
      const report = generatePerformanceReport(
        "dealer-001",
        dateRange,
        baseProgram,
        samplePolicies,
        sampleClaims,
      );
      expect(report.product_breakdown.length).toBeGreaterThan(0);
      for (const pb of report.product_breakdown) {
        expect(pb.category).toBeDefined();
        expect(typeof pb.premiums_earned).toBe("number");
        expect(typeof pb.claims_paid).toBe("number");
        expect(typeof pb.loss_ratio).toBe("number");
        expect(typeof pb.policies_sold).toBe("number");
        expect(typeof pb.claims_filed).toBe("number");
      }
    });

    test("includes risk assessment", () => {
      const report = generatePerformanceReport(
        "dealer-001",
        dateRange,
        baseProgram,
        samplePolicies,
        sampleClaims,
      );
      expect(report.risk_assessment).toBeDefined();
      expect(["low", "medium", "high"]).toContain(report.risk_assessment.overall_risk);
      expect(report.risk_assessment.claim_frequency).toBeDefined();
      expect(report.risk_assessment.claim_severity).toBeDefined();
    });

    test("filters by date range", () => {
      const narrowRange = { start: "2025-06-01", end: "2025-06-30" };
      const report = generatePerformanceReport(
        "dealer-001",
        narrowRange,
        baseProgram,
        samplePolicies,
        sampleClaims,
      );
      // Only one policy falls in June 2025
      expect(report.total_premiums_earned).toBeLessThan(
        samplePolicies.reduce((s, p) => s + p.ceded_premium, 0),
      );
    });

    test("handles empty data gracefully", () => {
      const report = generatePerformanceReport(
        "dealer-001",
        dateRange,
        baseProgram,
        [],
        [],
      );
      expect(report.total_premiums_earned).toBe(0);
      expect(report.total_claims_paid).toBe(0);
      expect(report.loss_ratio).toBe(0);
      expect(report.product_breakdown.length).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Analytics event types                                                      */
  /* -------------------------------------------------------------------------- */

  describe("Analytics event types", () => {
    test("ReinsuranceEvent type includes all expected events", async () => {
      const { trackReinsurance } = await import("@/lib/analytics-hooks");
      expect(typeof trackReinsurance).toBe("function");

      // Should not throw for any valid event type
      const events = [
        "reinsurance.program_created",
        "reinsurance.program_updated",
        "reinsurance.premium_calculated",
        "reinsurance.claim_filed",
        "reinsurance.claim_paid",
        "reinsurance.report_generated",
        "reinsurance.risk_assessed",
      ] as const;

      for (const event of events) {
        expect(() =>
          trackReinsurance(event, "dealer-test", { test: true }),
        ).not.toThrow();
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* API route and page existence                                               */
  /* -------------------------------------------------------------------------- */

  describe("File structure", () => {
    test("API route module exists", async () => {
      // Verify the route file can be imported (module exists)
      const fs = await import("fs");
      const path = await import("path");
      const routePath = path.resolve(
        __dirname,
        "../../app/api/admin/reinsurance/route.ts",
      );
      expect(fs.existsSync(routePath)).toBe(true);
    });

    test("API route contains DATABASE_URL shadow mode guard", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const routePath = path.resolve(
        __dirname,
        "../../app/api/admin/reinsurance/route.ts",
      );
      const content = fs.readFileSync(routePath, "utf-8");
      expect(content).toContain("DATABASE_URL");
      expect(content).toContain("requireAuth");
      expect(content).toContain("isAuthenticated");
    });

    test("Admin page exists", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const pagePath = path.resolve(
        __dirname,
        "../../app/admin/reinsurance/page.tsx",
      );
      expect(fs.existsSync(pagePath)).toBe(true);
    });

    test("Admin page uses light theme", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const pagePath = path.resolve(
        __dirname,
        "../../app/admin/reinsurance/page.tsx",
      );
      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain("bg-white");
      expect(content).toContain("text-gray-900");
      expect(content).toContain("border-gray-200");
    });

    test("AdminSidebar contains Reinsurance link", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const sidebarPath = path.resolve(
        __dirname,
        "../../components/AdminSidebar.tsx",
      );
      const content = fs.readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("/admin/reinsurance");
      expect(content).toContain("Reinsurance");
    });
  });
});
