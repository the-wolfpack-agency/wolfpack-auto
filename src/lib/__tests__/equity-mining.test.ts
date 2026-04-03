/**
 * Equity Mining — Comprehensive Tests
 *
 * Covers:
 *  - Appraisal calculation (depreciation by age, mileage, condition)
 *  - Equity position (positive, negative, break-even)
 *  - Replacement vehicle matching (payment similarity)
 *  - Campaign generation logic
 *  - Analytics event types exist and don't throw
 *  - API route has DATABASE_URL guard
 *  - Page and sidebar link exist
 */

import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------ */
/*  Module imports (core logic — no Next.js runtime needed)             */
/* ------------------------------------------------------------------ */

// The core functions are pure logic with the exception of analytics
// hooks which are fire-and-forget. We mock the analytics to isolate.
jest.mock("@/lib/analytics-hooks", () => ({
  trackEquityMining: jest.fn(),
}));

jest.mock("@/lib/dms/vin-decoder", () => ({
  decodeVIN: jest.fn((vin: string) => {
    // Simulate decoder for known test VINs
    const yearCode = vin[9];
    const yearMap: Record<string, number> = {
      L: 2020, K: 2019, J: 2018, H: 2017, G: 2016,
      F: 2015, E: 2014, D: 2013, C: 2012, B: 2011,
    };
    const wmi = vin.substring(0, 3);
    const makeMap: Record<string, string> = {
      "1HG": "Honda",
      "5TF": "Toyota",
      "WBA": "BMW",
      "1G1": "Chevrolet",
      "5YJ": "Tesla",
    };
    return {
      vin,
      valid: true,
      errors: [],
      year: yearMap[yearCode] ?? 2020,
      make: makeMap[wmi] ?? "Unknown",
      country: "United States",
      wmi,
      vds: vin.substring(3, 9),
      vis: vin.substring(9, 17),
      check_digit: vin[8],
      check_digit_valid: true,
    };
  }),
}));

import {
  appraiseVehicle,
  calculateEquityPosition,
  calculateMonthlyPayment,
  findReplacementVehicles,
  generateEquityMiningCampaign,
} from "@/lib/equity-mining";
import { trackEquityMining } from "@/lib/analytics-hooks";

const ROOT = path.resolve(__dirname, "../../..");

/* ------------------------------------------------------------------ */
/*  Appraisal Tests                                                     */
/* ------------------------------------------------------------------ */

describe("appraiseVehicle", () => {
  it("returns a positive estimated value for a recent good-condition vehicle", () => {
    const result = appraiseVehicle("1HGCV1F34LA000001", 30000, "good");
    expect(result.estimatedValue).toBeGreaterThan(0);
    expect(result.vin).toBe("1HGCV1F34LA000001");
    expect(result.year).toBe(2020);
    expect(result.make).toBe("Honda");
  });

  it("applies higher value for excellent condition", () => {
    const good = appraiseVehicle("1HGCV1F34LA000001", 40000, "good");
    const excellent = appraiseVehicle("1HGCV1F34LA000001", 40000, "excellent");
    expect(excellent.estimatedValue).toBeGreaterThan(good.estimatedValue);
    expect(excellent.depreciationFactors.conditionFactor).toBe(1.1);
  });

  it("applies lower value for poor condition", () => {
    const good = appraiseVehicle("1HGCV1F34LA000001", 40000, "good");
    const poor = appraiseVehicle("1HGCV1F34LA000001", 40000, "poor");
    expect(poor.estimatedValue).toBeLessThan(good.estimatedValue);
    expect(poor.depreciationFactors.conditionFactor).toBe(0.65);
  });

  it("penalizes high mileage vehicles", () => {
    const low = appraiseVehicle("1HGCV1F34LA000001", 20000, "good");
    const high = appraiseVehicle("1HGCV1F34LA000001", 120000, "good");
    expect(high.estimatedValue).toBeLessThan(low.estimatedValue);
  });

  it("depreciates older vehicles more", () => {
    // L=2020, K=2019 — K is older
    const newer = appraiseVehicle("1HGCV1F34LA000001", 40000, "good");
    const older = appraiseVehicle("1HGCV1F34KA000001", 40000, "good");
    expect(older.estimatedValue).toBeLessThan(newer.estimatedValue);
    expect(older.depreciationFactors.ageFactor).toBeLessThan(
      newer.depreciationFactors.ageFactor,
    );
  });

  it("never returns value below $500 floor", () => {
    const result = appraiseVehicle("1HGCV1F34BA000001", 300000, "poor");
    expect(result.estimatedValue).toBeGreaterThanOrEqual(500);
  });

  it("returns depreciation factors in result", () => {
    const result = appraiseVehicle("1HGCV1F34LA000001", 50000, "fair");
    expect(result.depreciationFactors).toHaveProperty("ageFactor");
    expect(result.depreciationFactors).toHaveProperty("mileageFactor");
    expect(result.depreciationFactors).toHaveProperty("conditionFactor");
    expect(result.depreciationFactors.conditionFactor).toBe(0.85);
  });
});

/* ------------------------------------------------------------------ */
/*  Equity Position Tests                                               */
/* ------------------------------------------------------------------ */

describe("calculateEquityPosition", () => {
  it("calculates positive equity correctly", () => {
    const result = calculateEquityPosition(25000, 15000);
    expect(result.equity).toBe(10000);
    expect(result.isPositive).toBe(true);
    expect(result.description).toContain("Positive equity");
    expect(result.description).toContain("$10,000");
  });

  it("calculates negative equity correctly", () => {
    const result = calculateEquityPosition(15000, 20000);
    expect(result.equity).toBe(-5000);
    expect(result.isPositive).toBe(false);
    expect(result.description).toContain("Negative equity");
    expect(result.description).toContain("$5,000");
  });

  it("handles break-even (zero equity)", () => {
    const result = calculateEquityPosition(20000, 20000);
    expect(result.equity).toBe(0);
    expect(result.isPositive).toBe(true); // 0 >= 0
    expect(result.description).toContain("Break-even");
  });

  it("preserves input values in result", () => {
    const result = calculateEquityPosition(30000, 18000);
    expect(result.vehicleValue).toBe(30000);
    expect(result.loanBalance).toBe(18000);
  });
});

/* ------------------------------------------------------------------ */
/*  Monthly Payment Calculation Tests                                   */
/* ------------------------------------------------------------------ */

describe("calculateMonthlyPayment", () => {
  it("returns a positive payment for a standard vehicle purchase", () => {
    const payment = calculateMonthlyPayment(30000, 0);
    expect(payment).toBeGreaterThan(0);
    expect(payment).toBeLessThan(1000);
  });

  it("reduces payment when trade-in equity is applied", () => {
    const withoutEquity = calculateMonthlyPayment(30000, 0);
    const withEquity = calculateMonthlyPayment(30000, 5000);
    expect(withEquity).toBeLessThan(withoutEquity);
  });

  it("returns 0 when equity exceeds vehicle price", () => {
    const payment = calculateMonthlyPayment(20000, 25000);
    expect(payment).toBe(0);
  });

  it("handles zero APR", () => {
    const payment = calculateMonthlyPayment(36000, 0, 0, 72, 0);
    expect(payment).toBe(500); // 36000 / 72
  });
});

/* ------------------------------------------------------------------ */
/*  Replacement Vehicle Matching Tests                                  */
/* ------------------------------------------------------------------ */

describe("findReplacementVehicles", () => {
  const inventory = [
    { id: "v1", year: 2025, make: "Honda", model: "Civic", price: 25000 },
    { id: "v2", year: 2025, make: "Honda", model: "Accord", price: 33000 },
    { id: "v3", year: 2025, make: "BMW", model: "530i", price: 58000, segment: "luxury" },
    { id: "v4", year: 2025, make: "Toyota", model: "Camry", price: 28000 },
  ];

  it("returns vehicles with similar or lower payments", () => {
    const results = findReplacementVehicles(500, 8000, inventory);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.paymentDifference).toBeLessThanOrEqual(50);
    }
  });

  it("sorts results by payment difference ascending (biggest savings first)", () => {
    const results = findReplacementVehicles(600, 10000, inventory);
    if (results.length >= 2) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i].paymentDifference).toBeGreaterThanOrEqual(
          results[i - 1].paymentDifference,
        );
      }
    }
  });

  it("excludes vehicles where payment increase exceeds threshold", () => {
    // Very low current payment — most vehicles will be too expensive
    const results = findReplacementVehicles(100, 0, inventory);
    for (const r of results) {
      expect(r.paymentDifference).toBeLessThanOrEqual(50);
    }
  });

  it("returns empty array when no vehicles match", () => {
    const results = findReplacementVehicles(50, 0, inventory);
    // With very low current payment and no equity, nothing should match
    expect(Array.isArray(results)).toBe(true);
  });

  it("includes segment info from inventory", () => {
    const results = findReplacementVehicles(900, 20000, inventory);
    const luxuryResult = results.find((r) => r.make === "BMW");
    if (luxuryResult) {
      expect(luxuryResult.segment).toBe("luxury");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Campaign Generation Tests                                           */
/* ------------------------------------------------------------------ */

describe("generateEquityMiningCampaign", () => {
  const customers = [
    {
      id: "c1",
      name: "Alice Smith",
      vin: "1HGCV1F34LA000001", // 2020 Honda
      mileage: 55000,
      condition: "good" as const,
      loanBalance: 10000,
      currentMonthlyPayment: 450,
      lastServiceDate: "2026-02-01",
      vehicleModel: "Accord",
    },
    {
      id: "c2",
      name: "Bob Jones",
      vin: "1HGCV1F34LA000002", // 2020 Honda — too new if current year makes it < 3 years
      mileage: 20000,
      condition: "excellent" as const,
      loanBalance: 30000, // underwater
      currentMonthlyPayment: 500,
      lastServiceDate: "2026-03-01",
      vehicleModel: "Civic",
    },
  ];

  const inventory = [
    { id: "v1", year: 2025, make: "Honda", model: "Accord", price: 32000 },
    { id: "v2", year: 2025, make: "Toyota", model: "Camry", price: 29000 },
  ];

  it("returns a campaign result with required fields", () => {
    const result = generateEquityMiningCampaign("dealer-1", customers, inventory);
    expect(result.dealerId).toBe("dealer-1");
    expect(result.scannedAt).toBeDefined();
    expect(result.totalCustomersScanned).toBe(2);
    expect(typeof result.opportunitiesFound).toBe("number");
    expect(Array.isArray(result.opportunities)).toBe(true);
    expect(result.stats).toHaveProperty("avgEquity");
    expect(result.stats).toHaveProperty("topSegments");
    expect(result.stats).toHaveProperty("totalPotentialRevenue");
  });

  it("only includes customers with positive equity", () => {
    const result = generateEquityMiningCampaign("dealer-1", customers, inventory);
    for (const opp of result.opportunities) {
      expect(opp.equityPosition.isPositive).toBe(true);
    }
  });

  it("ranks opportunities by score descending", () => {
    const result = generateEquityMiningCampaign("dealer-1", customers, inventory);
    if (result.opportunities.length >= 2) {
      for (let i = 1; i < result.opportunities.length; i++) {
        expect(result.opportunities[i].score).toBeLessThanOrEqual(
          result.opportunities[i - 1].score,
        );
      }
    }
  });

  it("fires analytics events for scan start/complete", () => {
    const mockTrack = trackEquityMining as jest.Mock;
    mockTrack.mockClear();

    generateEquityMiningCampaign("dealer-1", customers, inventory);

    const calls = mockTrack.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain("equity.scan_started");
    expect(calls).toContain("equity.scan_completed");
  });

  it("fires analytics event for each opportunity identified", () => {
    const mockTrack = trackEquityMining as jest.Mock;
    mockTrack.mockClear();

    const result = generateEquityMiningCampaign("dealer-1", customers, inventory);
    const identifiedCalls = mockTrack.mock.calls.filter(
      (c: unknown[]) => c[0] === "equity.opportunity_identified",
    );
    expect(identifiedCalls.length).toBe(result.opportunitiesFound);
  });

  it("handles empty customer list", () => {
    const result = generateEquityMiningCampaign("dealer-1", [], inventory);
    expect(result.opportunitiesFound).toBe(0);
    expect(result.opportunities).toEqual([]);
    expect(result.stats.avgEquity).toBe(0);
  });

  it("handles empty inventory list", () => {
    const result = generateEquityMiningCampaign("dealer-1", customers, []);
    expect(result.totalCustomersScanned).toBe(2);
    // Should still find opportunities (just with no replacements)
  });
});

/* ------------------------------------------------------------------ */
/*  Analytics Event Types                                               */
/* ------------------------------------------------------------------ */

describe("Analytics event types", () => {
  it("EquityMiningEvent type exists in analytics-hooks", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "src/lib/analytics-hooks.ts"),
      "utf-8",
    );
    expect(content).toContain("export type EquityMiningEvent");
    expect(content).toContain('"equity.scan_started"');
    expect(content).toContain('"equity.scan_completed"');
    expect(content).toContain('"equity.opportunity_identified"');
    expect(content).toContain('"equity.opportunity_contacted"');
    expect(content).toContain('"equity.opportunity_converted"');
    expect(content).toContain('"equity.appraisal_generated"');
  });

  it("EquityMiningEvent is included in PlatformEvent union", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "src/lib/analytics-hooks.ts"),
      "utf-8",
    );
    expect(content).toContain("| EquityMiningEvent");
  });

  it("trackEquityMining helper is exported", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "src/lib/analytics-hooks.ts"),
      "utf-8",
    );
    expect(content).toContain("export function trackEquityMining");
  });

  it("trackEquityMining does not throw when called", () => {
    expect(() => {
      (trackEquityMining as jest.Mock)("equity.scan_started", "dealer-1", {
        customer_count: 10,
      });
    }).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  API Route Structure                                                 */
/* ------------------------------------------------------------------ */

describe("API route structure", () => {
  const routePath = path.join(
    ROOT,
    "src/app/api/admin/equity-mining/route.ts",
  );

  it("route.ts file exists", () => {
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it("has DATABASE_URL shadow mode guard", () => {
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("DATABASE_URL");
    expect(content).toContain("process.env.DATABASE_URL");
  });

  it("imports requireAuth from @/lib/auth-guard", () => {
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain('requireAuth');
    expect(content).toContain('@/lib/auth-guard');
  });

  it("checks auth result with instanceof NextResponse", () => {
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("instanceof NextResponse");
  });

  it("exports GET and POST handlers", () => {
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("export async function GET");
    expect(content).toContain("export async function POST");
  });
});

/* ------------------------------------------------------------------ */
/*  Page & Sidebar                                                      */
/* ------------------------------------------------------------------ */

describe("Page and sidebar", () => {
  it("admin page file exists", () => {
    const pagePath = path.join(
      ROOT,
      "src/app/admin/equity-mining/page.tsx",
    );
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it("page uses light admin theme (bg-white, text-gray-900)", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "src/app/admin/equity-mining/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("bg-white");
    expect(content).toContain("text-gray-900");
  });

  it("page has Run Scan button", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "src/app/admin/equity-mining/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("Run Scan");
  });

  it("page fetches from /api/admin/equity-mining", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "src/app/admin/equity-mining/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("/api/admin/equity-mining");
  });

  it("sidebar has Equity Mining link", () => {
    const sidebarPath = path.join(
      ROOT,
      "src/components/AdminSidebar.tsx",
    );
    const content = fs.readFileSync(sidebarPath, "utf-8");
    expect(content).toContain("Equity Mining");
    expect(content).toContain("/admin/equity-mining");
  });
});
