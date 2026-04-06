/**
 * Market Pricing Model Tests
 *
 * Tests cover:
 *   - Depreciation curve accuracy (year-by-year)
 *   - Mileage adjustment (low/avg/high miles)
 *   - Condition multipliers (excellent/good/fair/rough)
 *   - MSRP lookup (exact match, fuzzy, segment fallback)
 *   - Price range and confidence levels
 *   - Input validation (bad year, negative mileage)
 *   - Batch estimation
 *   - Real-world price sanity checks
 */

import {
  estimateMarketPrice,
  getDepreciationCurve,
  estimateBatch,
  hasExactMsrp,
  getSupportedVehicles,
  type VehicleCondition,
} from "@/lib/market-pricing";

// ---------------------------------------------------------------------------
// MSRP Lookup
// ---------------------------------------------------------------------------

describe("MSRP Lookup", () => {
  test("has 50+ supported vehicles", () => {
    const vehicles = getSupportedVehicles();
    expect(vehicles.length).toBeGreaterThanOrEqual(50);
  });

  test("recognizes popular models", () => {
    expect(hasExactMsrp("Toyota", "Camry")).toBeGreaterThan(0);
    expect(hasExactMsrp("Honda", "Accord")).toBeGreaterThan(0);
    expect(hasExactMsrp("Ford", "F-150")).toBeGreaterThan(0);
    expect(hasExactMsrp("Tesla", "Model 3")).toBeGreaterThan(0);
  });

  test("case-insensitive matching", () => {
    expect(hasExactMsrp("toyota", "camry")).toBeGreaterThan(0);
    expect(hasExactMsrp("HONDA", "ACCORD")).toBeGreaterThan(0);
  });

  test("returns null for unknown models", () => {
    expect(hasExactMsrp("Yugo", "GV")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Depreciation Curve
// ---------------------------------------------------------------------------

describe("Depreciation Curve", () => {
  test("returns points for each year", () => {
    const curve = getDepreciationCurve(35000, 2024);
    expect(curve.length).toBeGreaterThan(0);
    expect(curve[0].year).toBe(2024);
    expect(curve[0].value).toBe(35000);
  });

  test("year 1 drops ~20%", () => {
    const curve = getDepreciationCurve(40000, 2024);
    const year1 = curve.find((p) => p.year === 2023);
    expect(year1).toBeDefined();
    // Should be approximately 80% of MSRP
    expect(year1!.value).toBeGreaterThan(30000);
    expect(year1!.value).toBeLessThan(34000);
  });

  test("never drops below 10% floor", () => {
    const curve = getDepreciationCurve(50000, 2024);
    const oldest = curve[curve.length - 1];
    expect(oldest.value).toBeGreaterThanOrEqual(5000);
  });

  test("values monotonically decrease", () => {
    const curve = getDepreciationCurve(30000, 2024);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].value).toBeLessThanOrEqual(curve[i - 1].value);
    }
  });
});

// ---------------------------------------------------------------------------
// Core Pricing
// ---------------------------------------------------------------------------

describe("Price Estimation", () => {
  test("returns valid estimate for known vehicle", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 2022, 30000, "good");
    expect(est.estimatedPrice).toBeGreaterThan(15000);
    expect(est.estimatedPrice).toBeLessThan(35000);
    expect(est.confidence).toBe("high");
    expect(est.priceRange.low).toBeLessThan(est.estimatedPrice);
    expect(est.priceRange.high).toBeGreaterThan(est.estimatedPrice);
  });

  test("newer vehicles cost more", () => {
    const newer = estimateMarketPrice("Honda", "Accord", 2023, 15000, "good");
    const older = estimateMarketPrice("Honda", "Accord", 2018, 60000, "good");
    expect(newer.estimatedPrice).toBeGreaterThan(older.estimatedPrice);
  });

  test("lower mileage increases price", () => {
    const lowMiles = estimateMarketPrice("Ford", "F-150", 2021, 20000, "good");
    const highMiles = estimateMarketPrice("Ford", "F-150", 2021, 80000, "good");
    expect(lowMiles.estimatedPrice).toBeGreaterThan(highMiles.estimatedPrice);
  });

  test("excellent condition adds premium", () => {
    const excellent = estimateMarketPrice("Toyota", "RAV4", 2021, 40000, "excellent");
    const good = estimateMarketPrice("Toyota", "RAV4", 2021, 40000, "good");
    expect(excellent.estimatedPrice).toBeGreaterThan(good.estimatedPrice);
  });

  test("rough condition applies discount", () => {
    const good = estimateMarketPrice("Honda", "Civic", 2020, 50000, "good");
    const rough = estimateMarketPrice("Honda", "Civic", 2020, 50000, "rough");
    expect(rough.estimatedPrice).toBeLessThan(good.estimatedPrice * 0.75);
  });
});

// ---------------------------------------------------------------------------
// Condition Multipliers
// ---------------------------------------------------------------------------

describe("Condition Multipliers", () => {
  const conditions: VehicleCondition[] = ["excellent", "good", "fair", "rough"];

  test("prices decrease with worse condition", () => {
    const prices = conditions.map(
      (c) => estimateMarketPrice("Toyota", "Camry", 2021, 40000, c).estimatedPrice,
    );
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThan(prices[i - 1]);
    }
  });

  test("rough is at least 25% less than good", () => {
    const good = estimateMarketPrice("Ford", "F-150", 2020, 50000, "good").estimatedPrice;
    const rough = estimateMarketPrice("Ford", "F-150", 2020, 50000, "rough").estimatedPrice;
    expect(rough).toBeLessThan(good * 0.75);
  });
});

// ---------------------------------------------------------------------------
// Confidence & Price Range
// ---------------------------------------------------------------------------

describe("Confidence Levels", () => {
  test("exact MSRP match gives high confidence", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 2022, 30000, "good");
    expect(est.confidence).toBe("high");
  });

  test("unknown model gives lower confidence", () => {
    const est = estimateMarketPrice("Mitsubishi", "Outlander", 2022, 30000, "good");
    expect(["medium", "low"]).toContain(est.confidence);
  });

  test("price range is tighter for high confidence", () => {
    const high = estimateMarketPrice("Toyota", "Camry", 2022, 30000, "good");
    const spread = (high.priceRange.high - high.priceRange.low) / high.estimatedPrice;
    expect(spread).toBeLessThan(0.3); // less than 30% spread
  });
});

// ---------------------------------------------------------------------------
// Input Validation
// ---------------------------------------------------------------------------

describe("Input Validation", () => {
  test("rejects year before 1900", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 1800, 50000, "good");
    expect(est.estimatedPrice).toBe(0);
    expect(est.factors).toEqual(expect.arrayContaining([expect.stringContaining("Invalid")]));
  });

  test("rejects future year beyond +2", () => {
    const futureYear = new Date().getFullYear() + 3;
    const est = estimateMarketPrice("Toyota", "Camry", futureYear, 0, "good");
    expect(est.estimatedPrice).toBe(0);
  });

  test("rejects negative mileage", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 2022, -1000, "good");
    expect(est.estimatedPrice).toBe(0);
    expect(est.factors).toEqual(expect.arrayContaining([expect.stringContaining("negative")]));
  });

  test("handles zero mileage (brand new)", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 2024, 0, "excellent");
    expect(est.estimatedPrice).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Batch Estimation
// ---------------------------------------------------------------------------

describe("Batch Estimation", () => {
  test("processes multiple vehicles", () => {
    const vehicles = [
      { make: "Toyota", model: "Camry", year: 2022, mileage: 30000, condition: "good" as VehicleCondition },
      { make: "Honda", model: "Accord", year: 2021, mileage: 45000, condition: "fair" as VehicleCondition },
      { make: "Ford", model: "F-150", year: 2020, mileage: 60000, condition: "good" as VehicleCondition },
    ];
    const results = estimateBatch(vehicles);
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.estimate.estimatedPrice).toBeGreaterThan(0);
    });
  });

  test("handles empty batch", () => {
    const results = estimateBatch([]);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Real-World Sanity Checks
// ---------------------------------------------------------------------------

describe("Real-World Sanity", () => {
  test("2022 Toyota Camry is reasonably priced", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 2022, 35000, "good");
    expect(est.estimatedPrice).toBeGreaterThan(10000);
    expect(est.estimatedPrice).toBeLessThan(35000);
  });

  test("2020 Ford F-150 is reasonably priced", () => {
    const est = estimateMarketPrice("Ford", "F-150", 2020, 45000, "good");
    expect(est.estimatedPrice).toBeGreaterThan(10000);
    expect(est.estimatedPrice).toBeLessThan(45000);
  });

  test("2023 Tesla Model 3 is reasonably priced", () => {
    const est = estimateMarketPrice("Tesla", "Model 3", 2023, 20000, "good");
    expect(est.estimatedPrice).toBeGreaterThan(15000);
    expect(est.estimatedPrice).toBeLessThan(50000);
  });

  test("2015 Honda Civic still has value", () => {
    const est = estimateMarketPrice("Honda", "Civic", 2015, 90000, "fair");
    expect(est.estimatedPrice).toBeGreaterThan(3000);
    expect(est.estimatedPrice).toBeLessThan(18000);
  });

  test("2010 vehicle still has value above floor", () => {
    const est = estimateMarketPrice("Toyota", "Corolla", 2010, 150000, "fair");
    expect(est.estimatedPrice).toBeGreaterThan(2000);
  });

  test("trucks hold value better than sedans", () => {
    const truck = estimateMarketPrice("Ford", "F-150", 2019, 60000, "good");
    const sedan = estimateMarketPrice("Nissan", "Altima", 2019, 60000, "good");
    expect(truck.estimatedPrice).toBeGreaterThan(sedan.estimatedPrice);
  });

  test("factors array explains the estimate", () => {
    const est = estimateMarketPrice("Toyota", "Camry", 2022, 30000, "good");
    expect(est.factors.length).toBeGreaterThan(0);
    expect(est.factors.some((f) => f.includes("MSRP") || f.includes("depreciation") || f.includes("Depreciation"))).toBe(true);
  });
});
