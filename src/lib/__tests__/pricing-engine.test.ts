/**
 * Unit tests for src/lib/pricing-engine.ts
 *
 * Tests the Dynamic Inventory Pricing Intelligence Engine:
 * - calcDaysOnLot / calcTurnScore helpers (via public API)
 * - reductionFactor logic (via generatePricingReport)
 * - calcMarketPosition median-based classification
 * - generatePricingReport full report structure
 * - Edge cases: empty inventory, zero prices, far-future dates
 *
 * All tests run in shadow mode (DATABASE_URL deleted) with a mocked
 * DB query function to inject controlled vehicle rows.
 *
 * Run with: npx jest src/lib/__tests__/pricing-engine.test.ts
 */

/* -------------------------------------------------------------------------- */
/* Mock setup — must come before imports                                      */
/* -------------------------------------------------------------------------- */

const mockQuery = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import {
  generatePricingReport,
  type VehiclePricingAnalysis,
  type PricingReport,
} from "../pricing-engine";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEALER_ID = "dealer-001";

/** Create a vehicle row with sensible defaults. */
function makeVehicle(overrides: Partial<{
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  condition: string;
  price: number | string;
  created_at: string;
}> = {}) {
  const daysAgo = 10;
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id: overrides.id ?? "v-001",
    vin: overrides.vin ?? "1HGBH41JXMN109186",
    year: overrides.year ?? 2023,
    make: overrides.make ?? "Toyota",
    model: overrides.model ?? "Camry",
    trim: overrides.trim ?? "SE",
    condition: overrides.condition ?? "used",
    price: overrides.price ?? 28000,
    created_at: overrides.created_at ?? created,
  };
}

/** Build a created_at date N days ago. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** Helper to get a single analysis from a report with one vehicle. */
async function singleVehicleReport(
  vehicleOverrides: Parameters<typeof makeVehicle>[0] = {},
): Promise<VehiclePricingAnalysis> {
  const vehicle = makeVehicle(vehicleOverrides);
  mockQuery.mockResolvedValueOnce({ rows: [vehicle] });
  const report = await generatePricingReport(DEALER_ID);
  expect(report.totalVehicles).toBe(1);
  const all = [
    ...report.immediateAction,
    ...report.soonAction,
    ...report.monitorAction,
  ];
  expect(all).toHaveLength(1);
  return all[0];
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                       */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DATABASE_URL;
});

/* -------------------------------------------------------------------------- */
/* generatePricingReport — empty / error states                                */
/* -------------------------------------------------------------------------- */

describe("generatePricingReport — empty and error states", () => {
  it("returns empty report when DB query returns no rows", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const report = await generatePricingReport(DEALER_ID);

    expect(report.totalVehicles).toBe(0);
    expect(report.immediateAction).toEqual([]);
    expect(report.soonAction).toEqual([]);
    expect(report.monitorAction).toEqual([]);
    expect(report.projectedRevenueImpact).toBe(0);
    expect(report.avgDaysOnLot).toBe(0);
    expect(report.stalledVehicles).toBe(0);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it("returns empty report on DB error (graceful degradation)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    const report = await generatePricingReport(DEALER_ID);

    expect(report.totalVehicles).toBe(0);
    expect(report.immediateAction).toEqual([]);
    expect(report.soonAction).toEqual([]);
    expect(report.monitorAction).toEqual([]);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it("passes dealer_id as query parameter", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await generatePricingReport("dealer-xyz");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["dealer-xyz"],
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Days on lot / Turn score                                                    */
/* -------------------------------------------------------------------------- */

describe("days on lot and turn score calculation", () => {
  it("fresh vehicle (5 days) has high turn score", async () => {
    const analysis = await singleVehicleReport({ created_at: daysAgo(5) });
    expect(analysis.daysOnLot).toBeGreaterThanOrEqual(4);
    expect(analysis.daysOnLot).toBeLessThanOrEqual(6);
    // turnScore = 100 - 5*1.5 = 92.5, clamped/rounded
    expect(analysis.turnScore).toBeGreaterThanOrEqual(90);
    expect(analysis.turnScore).toBeLessThanOrEqual(100);
  });

  it("aging vehicle (50 days) has low turn score", async () => {
    const analysis = await singleVehicleReport({ created_at: daysAgo(50) });
    expect(analysis.daysOnLot).toBeGreaterThanOrEqual(49);
    expect(analysis.daysOnLot).toBeLessThanOrEqual(51);
    // turnScore = 100 - 50*1.5 = 25
    expect(analysis.turnScore).toBeGreaterThanOrEqual(20);
    expect(analysis.turnScore).toBeLessThanOrEqual(30);
  });

  it("stalled vehicle (90 days) has turn score of 0", async () => {
    const analysis = await singleVehicleReport({ created_at: daysAgo(90) });
    expect(analysis.daysOnLot).toBeGreaterThanOrEqual(89);
    // turnScore = 100 - 90*1.5 = -35 → clamped to 0
    expect(analysis.turnScore).toBe(0);
  });

  it("vehicle created today has 0 days on lot", async () => {
    const analysis = await singleVehicleReport({ created_at: new Date().toISOString() });
    expect(analysis.daysOnLot).toBe(0);
    expect(analysis.turnScore).toBe(100);
  });

  it("turn score never exceeds 100", async () => {
    // Future date would give negative days, clamped to 0
    const futureDate = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const analysis = await singleVehicleReport({ created_at: futureDate });
    expect(analysis.turnScore).toBeLessThanOrEqual(100);
    expect(analysis.daysOnLot).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Reduction factor / Action / Urgency by age tier                             */
/* -------------------------------------------------------------------------- */

describe("pricing action by days on lot", () => {
  it("fresh used vehicle (5 days) → hold_price, urgency=none", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(5), condition: "used" });
    expect(a.action).toBe("hold_price");
    expect(a.urgency).toBe("none");
    expect(a.recommendedPrice).toBe(a.currentPrice); // no change
  });

  it("fresh NEW vehicle (5 days) → increase_price, urgency=none", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(5), condition: "new" });
    expect(a.action).toBe("increase_price");
    expect(a.urgency).toBe("none");
    expect(a.recommendedPrice).toBeGreaterThan(a.currentPrice);
  });

  it("normal window (25 days) → hold_price, urgency=monitor", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(25) });
    expect(a.action).toBe("hold_price");
    expect(a.urgency).toBe("monitor");
  });

  it("slightly aging (40 days) → reduce_price 2.5%, urgency=soon", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(40), price: 40000 });
    expect(a.action).toBe("reduce_price");
    expect(a.urgency).toBe("soon");
    // 40000 * 0.975 = 39000 (rounded to nearest 100)
    expect(a.recommendedPrice).toBeLessThan(a.currentPrice);
    const reductionPct = Math.abs(a.adjustmentPercent);
    expect(reductionPct).toBeGreaterThanOrEqual(2);
    expect(reductionPct).toBeLessThanOrEqual(3);
  });

  it("aging vehicle (55 days) → reduce_price 5%, urgency=soon", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(55), price: 30000 });
    expect(a.action).toBe("reduce_price");
    expect(a.urgency).toBe("soon");
    // 30000 * 0.95 = 28500
    expect(a.recommendedPrice).toBeLessThan(a.currentPrice);
    const reductionPct = Math.abs(a.adjustmentPercent);
    expect(reductionPct).toBeGreaterThanOrEqual(4);
    expect(reductionPct).toBeLessThanOrEqual(6);
  });

  it("stalled vehicle (75 days) → promote 10%, urgency=immediate", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(75), price: 25000 });
    expect(a.action).toBe("promote");
    expect(a.urgency).toBe("immediate");
    // 25000 * 0.90 = 22500
    expect(a.recommendedPrice).toBeLessThan(a.currentPrice);
    const reductionPct = Math.abs(a.adjustmentPercent);
    expect(reductionPct).toBeGreaterThanOrEqual(8);
    expect(reductionPct).toBeLessThanOrEqual(12);
  });
});

/* -------------------------------------------------------------------------- */
/* Recommended price never below $1                                            */
/* -------------------------------------------------------------------------- */

describe("recommended price bounds", () => {
  it("recommended price is always >= 1 (never zero or negative)", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(100), price: 100 });
    expect(a.recommendedPrice).toBeGreaterThanOrEqual(1);
  });

  it("recommended price is rounded to nearest $100", async () => {
    const a = await singleVehicleReport({ price: 27350 });
    expect(a.recommendedPrice % 100).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Market position classification                                              */
/* -------------------------------------------------------------------------- */

describe("market position (calcMarketPosition)", () => {
  it("vehicle priced at median → at_market", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", make: "Honda", year: 2022, price: 20000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", make: "Honda", year: 2022, price: 22000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v3", make: "Honda", year: 2022, price: 21000, created_at: daysAgo(10) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    // Median = 21000. 20000 is within 10% band (18900-23100)
    const v1 = all.find((a) => a.vehicleId === "v1");
    expect(v1?.marketPosition).toBe("at_market");
  });

  it("vehicle priced >10% above median → above_market", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", make: "Ford", year: 2023, price: 35000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", make: "Ford", year: 2023, price: 20000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v3", make: "Ford", year: 2023, price: 21000, created_at: daysAgo(10) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    // Median = 21000. 35000 > 23100 → above_market
    const v1 = all.find((a) => a.vehicleId === "v1");
    expect(v1?.marketPosition).toBe("above_market");
  });

  it("vehicle priced >10% below median → below_market", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", make: "Chevy", year: 2022, price: 15000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", make: "Chevy", year: 2022, price: 25000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v3", make: "Chevy", year: 2022, price: 24000, created_at: daysAgo(10) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    // Median = 24000. 15000 < 21600 → below_market
    const v1 = all.find((a) => a.vehicleId === "v1");
    expect(v1?.marketPosition).toBe("below_market");
  });

  it("single vehicle with no peers → at_market (default)", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", make: "Tesla", year: 2024, price: 60000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", make: "Toyota", year: 2023, price: 30000, created_at: daysAgo(10) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    // Tesla 2024 has no other peers → at_market
    const tesla = all.find((a) => a.make === "Tesla");
    expect(tesla?.marketPosition).toBe("at_market");
  });

  it("even number of peers uses correct median", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", make: "BMW", year: 2023, price: 40000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", make: "BMW", year: 2023, price: 42000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v3", make: "BMW", year: 2023, price: 44000, created_at: daysAgo(10) }),
      makeVehicle({ id: "v4", make: "BMW", year: 2023, price: 46000, created_at: daysAgo(10) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    // Median = (42000 + 44000) / 2 = 43000. All within 10% band → at_market
    for (const a of all) {
      expect(a.marketPosition).toBe("at_market");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Market position context in action reason                                    */
/* -------------------------------------------------------------------------- */

describe("market position enriches action reason", () => {
  it("above_market + hold_price vehicle gets market position note", async () => {
    // Vehicle is fresh (hold_price) but priced way above peers
    const vehicles = [
      makeVehicle({ id: "v1", make: "Kia", year: 2023, price: 50000, created_at: daysAgo(5) }),
      makeVehicle({ id: "v2", make: "Kia", year: 2023, price: 20000, created_at: daysAgo(5) }),
      makeVehicle({ id: "v3", make: "Kia", year: 2023, price: 22000, created_at: daysAgo(5) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    const v1 = all.find((a) => a.vehicleId === "v1");
    expect(v1?.actionReason).toContain("above");
  });

  it("below_market + hold_price vehicle gets increase suggestion", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", make: "Nissan", year: 2022, price: 10000, created_at: daysAgo(5) }),
      makeVehicle({ id: "v2", make: "Nissan", year: 2022, price: 30000, created_at: daysAgo(5) }),
      makeVehicle({ id: "v3", make: "Nissan", year: 2022, price: 28000, created_at: daysAgo(5) }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    const all = [...report.immediateAction, ...report.soonAction, ...report.monitorAction];
    const v1 = all.find((a) => a.vehicleId === "v1");
    expect(v1?.actionReason).toContain("below");
  });
});

/* -------------------------------------------------------------------------- */
/* Report partitioning                                                         */
/* -------------------------------------------------------------------------- */

describe("report partitions vehicles by urgency", () => {
  it("correctly sorts vehicles into immediate/soon/monitor buckets", async () => {
    const vehicles = [
      makeVehicle({ id: "v-fresh", created_at: daysAgo(5), price: 20000 }),
      makeVehicle({ id: "v-normal", created_at: daysAgo(25), price: 20000, make: "Honda" }),
      makeVehicle({ id: "v-aging", created_at: daysAgo(40), price: 20000, make: "Ford" }),
      makeVehicle({ id: "v-stalled", created_at: daysAgo(70), price: 20000, make: "Chevy" }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);

    expect(report.totalVehicles).toBe(4);

    // Stalled (>60 days) → immediate
    expect(report.immediateAction.length).toBeGreaterThanOrEqual(1);
    expect(report.immediateAction.some((a) => a.vehicleId === "v-stalled")).toBe(true);

    // Aging (31-60 days) → soon
    expect(report.soonAction.length).toBeGreaterThanOrEqual(1);
    expect(report.soonAction.some((a) => a.vehicleId === "v-aging")).toBe(true);

    // Fresh and normal → monitor/none
    expect(report.monitorAction.length).toBeGreaterThanOrEqual(1);
    expect(report.monitorAction.some((a) => a.vehicleId === "v-fresh")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Aggregate metrics                                                           */
/* -------------------------------------------------------------------------- */

describe("report aggregate metrics", () => {
  it("avgDaysOnLot is the mean of all vehicles", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", created_at: daysAgo(30), make: "Honda" }),
      makeVehicle({ id: "v3", created_at: daysAgo(50), make: "Ford" }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);

    // Average ~ (10+30+50)/3 = 30 (allow +-1 for timing)
    expect(report.avgDaysOnLot).toBeGreaterThanOrEqual(28);
    expect(report.avgDaysOnLot).toBeLessThanOrEqual(32);
  });

  it("stalledVehicles counts only > 60 days", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", created_at: daysAgo(65), make: "Honda" }),
      makeVehicle({ id: "v3", created_at: daysAgo(90), make: "Ford" }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);
    expect(report.stalledVehicles).toBe(2);
  });

  it("projectedRevenueImpact sums only reductions (not increases)", async () => {
    // One new vehicle (increase) + one stalled (reduction)
    const vehicles = [
      makeVehicle({ id: "v-new", condition: "new", created_at: daysAgo(5), price: 40000 }),
      makeVehicle({ id: "v-stalled", created_at: daysAgo(80), price: 30000, make: "Honda" }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);

    // The new vehicle gets an increase (positive adjustment) → NOT counted
    // The stalled vehicle gets a 10% reduction of ~$3000 → counted
    expect(report.projectedRevenueImpact).toBeGreaterThan(0);
    // Should roughly be $3000 (30000 * 0.10)
    expect(report.projectedRevenueImpact).toBeGreaterThanOrEqual(2500);
    expect(report.projectedRevenueImpact).toBeLessThanOrEqual(3500);
  });
});

/* -------------------------------------------------------------------------- */
/* VehiclePricingAnalysis shape                                                */
/* -------------------------------------------------------------------------- */

describe("VehiclePricingAnalysis output shape", () => {
  it("contains all required fields", async () => {
    const a = await singleVehicleReport();
    expect(a).toHaveProperty("vehicleId");
    expect(a).toHaveProperty("vin");
    expect(a).toHaveProperty("year");
    expect(a).toHaveProperty("make");
    expect(a).toHaveProperty("model");
    expect(a).toHaveProperty("trim");
    expect(a).toHaveProperty("condition");
    expect(a).toHaveProperty("currentPrice");
    expect(a).toHaveProperty("recommendedPrice");
    expect(a).toHaveProperty("priceAdjustment");
    expect(a).toHaveProperty("adjustmentPercent");
    expect(a).toHaveProperty("marketPosition");
    expect(a).toHaveProperty("daysOnLot");
    expect(a).toHaveProperty("turnScore");
    expect(a).toHaveProperty("action");
    expect(a).toHaveProperty("actionReason");
    expect(a).toHaveProperty("urgency");
  });

  it("adjustmentPercent matches price delta", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(50), price: 20000 });
    const expectedDelta = a.recommendedPrice - a.currentPrice;
    expect(a.priceAdjustment).toBe(expectedDelta);
    // adjustmentPercent = (delta / currentPrice) * 100, rounded to 1 decimal
    const expectedPct = Math.round((expectedDelta / a.currentPrice) * 1000) / 10;
    expect(a.adjustmentPercent).toBeCloseTo(expectedPct, 0);
  });

  it("action is one of the valid enum values", async () => {
    const a = await singleVehicleReport();
    expect(["reduce_price", "hold_price", "increase_price", "promote"]).toContain(a.action);
  });

  it("urgency is one of the valid enum values", async () => {
    const a = await singleVehicleReport();
    expect(["immediate", "soon", "monitor", "none"]).toContain(a.urgency);
  });

  it("marketPosition is one of the valid enum values", async () => {
    const a = await singleVehicleReport();
    expect(["below_market", "at_market", "above_market"]).toContain(a.marketPosition);
  });
});

/* -------------------------------------------------------------------------- */
/* Price as string handling                                                     */
/* -------------------------------------------------------------------------- */

describe("price type coercion", () => {
  it("handles price as string (DB returns text)", async () => {
    const a = await singleVehicleReport({ price: "25000" as any });
    expect(a.currentPrice).toBe(25000);
    expect(typeof a.currentPrice).toBe("number");
  });

  it("handles price of 0 gracefully", async () => {
    const a = await singleVehicleReport({ price: 0 });
    expect(a.currentPrice).toBe(0);
    expect(a.adjustmentPercent).toBe(0); // division by zero guarded
  });
});

/* -------------------------------------------------------------------------- */
/* Large inventory                                                             */
/* -------------------------------------------------------------------------- */

describe("large inventory handling", () => {
  it("processes 100 vehicles without error", async () => {
    const vehicles = Array.from({ length: 100 }, (_, i) =>
      makeVehicle({
        id: `v-${i}`,
        vin: `VIN${String(i).padStart(13, "0")}`,
        make: i % 3 === 0 ? "Toyota" : i % 3 === 1 ? "Honda" : "Ford",
        year: 2020 + (i % 5),
        price: 15000 + i * 200,
        created_at: daysAgo(i),
      }),
    );
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);

    expect(report.totalVehicles).toBe(100);
    const total =
      report.immediateAction.length +
      report.soonAction.length +
      report.monitorAction.length;
    expect(total).toBe(100);
  });
});

/* -------------------------------------------------------------------------- */
/* PricingReport shape                                                         */
/* -------------------------------------------------------------------------- */

describe("PricingReport output shape", () => {
  it("report is JSON-serializable", async () => {
    const vehicles = [
      makeVehicle({ id: "v1", created_at: daysAgo(10) }),
      makeVehicle({ id: "v2", created_at: daysAgo(50), make: "Honda" }),
    ];
    mockQuery.mockResolvedValueOnce({ rows: vehicles });
    const report = await generatePricingReport(DEALER_ID);

    const serialized = JSON.stringify(report);
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveProperty("generatedAt");
    expect(parsed).toHaveProperty("totalVehicles");
    expect(parsed).toHaveProperty("immediateAction");
    expect(parsed).toHaveProperty("soonAction");
    expect(parsed).toHaveProperty("monitorAction");
    expect(parsed).toHaveProperty("projectedRevenueImpact");
    expect(parsed).toHaveProperty("avgDaysOnLot");
    expect(parsed).toHaveProperty("stalledVehicles");
  });

  it("generatedAt is a valid date", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const report = await generatePricingReport(DEALER_ID);
    expect(report.generatedAt).toBeInstanceOf(Date);
    expect(isNaN(report.generatedAt.getTime())).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Boundary conditions for reduction factor transitions                        */
/* -------------------------------------------------------------------------- */

describe("reduction factor boundary transitions", () => {
  it("15 days → hold (used) / increase (new)", async () => {
    const used = await singleVehicleReport({ created_at: daysAgo(15), condition: "used" });
    expect(used.action).toBe("hold_price");

    const newCar = await singleVehicleReport({ created_at: daysAgo(15), condition: "new" });
    expect(newCar.action).toBe("increase_price");
  });

  it("16 days → hold_price for both conditions", async () => {
    const used = await singleVehicleReport({ created_at: daysAgo(16), condition: "used" });
    expect(used.action).toBe("hold_price");
  });

  it("30 days → hold_price", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(30) });
    expect(a.action).toBe("hold_price");
    expect(a.urgency).toBe("monitor");
  });

  it("31 days → reduce_price", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(31) });
    expect(a.action).toBe("reduce_price");
    expect(a.urgency).toBe("soon");
  });

  it("45 days → reduce_price (2.5%)", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(45) });
    expect(a.action).toBe("reduce_price");
  });

  it("46 days → reduce_price (5%)", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(46) });
    expect(a.action).toBe("reduce_price");
  });

  it("60 days → reduce_price (5%)", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(60) });
    expect(a.action).toBe("reduce_price");
    expect(a.urgency).toBe("soon");
  });

  it("61 days → promote (10%)", async () => {
    const a = await singleVehicleReport({ created_at: daysAgo(61) });
    expect(a.action).toBe("promote");
    expect(a.urgency).toBe("immediate");
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple calls / isolation                                                  */
/* -------------------------------------------------------------------------- */

describe("call isolation", () => {
  it("sequential calls produce independent results", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeVehicle({ id: "v1", created_at: daysAgo(5), price: 20000 })],
    });
    const report1 = await generatePricingReport(DEALER_ID);

    mockQuery.mockResolvedValueOnce({
      rows: [makeVehicle({ id: "v2", created_at: daysAgo(80), price: 30000, make: "Honda" })],
    });
    const report2 = await generatePricingReport(DEALER_ID);

    expect(report1.totalVehicles).toBe(1);
    expect(report2.totalVehicles).toBe(1);
    // First is monitor/none, second is immediate
    expect(report1.immediateAction).toHaveLength(0);
    expect(report2.immediateAction).toHaveLength(1);
  });
});
