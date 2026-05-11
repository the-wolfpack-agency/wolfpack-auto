/**
 * Unit tests for signal-generator.
 *
 * Covers EVERY recommendation enum branch:
 *   - HOLD (default + low-data)
 *   - REPRICE_DOWN (overpriced AND aged)
 *   - REPRICE_DOWN (slow vs velocity median)
 *   - REPRICE_UP (underpriced AND fresh)
 *   - MOVE_TO_LOT_FRONT (fresh + priced right)
 *   - MOVE_TO_BACK_LOT (very aged + underpriced)
 *
 * Plus confidence bounds + rationale plain-language assertions.
 */

import {
  generateSignal,
  medianComparablePriceCents,
} from "@/lib/market-intel/signal-generator";
import type {
  ComparableListing,
  MarketValue,
  TargetVehicle,
} from "@/lib/market-intel/types";

const dealerId = "00000000-0000-0000-0000-000000000001";

function mkTarget(overrides: Partial<TargetVehicle> = {}): TargetVehicle {
  return {
    vehicleId: "veh-1",
    dealerId,
    vin: "1HGCM82633A123456",
    year: 2022,
    make: "Honda",
    model: "Accord",
    miles: 30_000,
    ourPriceCents: 2_500_000,
    daysOnLot: 10,
    ...overrides,
  };
}

function mkSnapshot(cents: number): MarketValue {
  return {
    source: "mock",
    marketValueCents: cents,
    conditionGrade: "good",
    isMock: true,
    providerLabel: "Mock",
    capturedAt: new Date().toISOString(),
  };
}

function mkComps(prices: number[]): ComparableListing[] {
  return prices.map((p, i) => ({
    compSource: "mock",
    compVinOrId: `mock-${i}`,
    compPriceCents: p,
    isMock: true,
    capturedAt: new Date().toISOString(),
  }));
}

describe("medianComparablePriceCents", () => {
  test("returns null for empty list", () => {
    expect(medianComparablePriceCents([])).toBeNull();
  });
  test("odd-length median", () => {
    const m = medianComparablePriceCents(mkComps([100, 200, 300]));
    expect(m).toBe(200);
  });
  test("even-length median averages the middle two", () => {
    const m = medianComparablePriceCents(mkComps([100, 200, 300, 400]));
    expect(m).toBe(250);
  });
});

describe("generateSignal — recommendation branches", () => {
  test("HOLD when price and pace are in line", () => {
    const sig = generateSignal({
      target: mkTarget({ ourPriceCents: 2_500_000, daysOnLot: 20 }),
      snapshot: mkSnapshot(2_500_000),
      comparables: mkComps([2_450_000, 2_500_000, 2_550_000, 2_600_000]),
    });
    expect(sig.recommendation).toBe("HOLD");
    expect(sig.rationale.toLowerCase()).toContain("in line");
  });

  test("MOVE_TO_LOT_FRONT when fresh + priced right", () => {
    const sig = generateSignal({
      target: mkTarget({ ourPriceCents: 2_500_000, daysOnLot: 3 }),
      snapshot: mkSnapshot(2_510_000),
      comparables: mkComps([2_450_000, 2_490_000, 2_510_000, 2_530_000]),
    });
    expect(sig.recommendation).toBe("MOVE_TO_LOT_FRONT");
  });

  test("REPRICE_DOWN when overpriced AND days_on_lot > 30", () => {
    const sig = generateSignal({
      target: mkTarget({ ourPriceCents: 3_000_000, daysOnLot: 45 }),
      snapshot: mkSnapshot(2_500_000), // +20% above market
      comparables: mkComps([2_400_000, 2_500_000, 2_600_000]),
    });
    expect(sig.recommendation).toBe("REPRICE_DOWN");
    expect(sig.rationale.toLowerCase()).toContain("market");
  });

  test("REPRICE_DOWN when slow vs velocity median (1.5x)", () => {
    const sig = generateSignal({
      target: mkTarget({ ourPriceCents: 2_500_000, daysOnLot: 60 }),
      snapshot: mkSnapshot(2_500_000),
      comparables: mkComps([2_400_000, 2_500_000, 2_600_000]), // median=35 -> 35*1.5=52.5
    });
    expect(sig.recommendation).toBe("REPRICE_DOWN");
  });

  test("REPRICE_UP when underpriced AND fresh (< 14 days)", () => {
    const sig = generateSignal({
      target: mkTarget({ ourPriceCents: 2_200_000, daysOnLot: 7 }),
      snapshot: mkSnapshot(2_500_000), // -12% below market
      comparables: mkComps([2_400_000, 2_500_000, 2_600_000]),
    });
    expect(sig.recommendation).toBe("REPRICE_UP");
  });

  test("MOVE_TO_BACK_LOT when very aged + underpriced", () => {
    const sig = generateSignal({
      target: mkTarget({ ourPriceCents: 2_300_000, daysOnLot: 120 }),
      snapshot: mkSnapshot(2_500_000),
      comparables: mkComps([2_400_000, 2_500_000, 2_600_000]),
    });
    expect(sig.recommendation).toBe("MOVE_TO_BACK_LOT");
  });

  test("HOLD when no comparables and no snapshot (low data)", () => {
    const sig = generateSignal({
      target: mkTarget({ daysOnLot: 5 }),
      snapshot: null,
      comparables: [],
    });
    expect(sig.recommendation).toBe("HOLD");
    expect(sig.rationale.toLowerCase()).toContain("limited");
  });
});

describe("generateSignal — confidence", () => {
  test("confidence clamped to [0, 1]", () => {
    const sig = generateSignal({
      target: mkTarget(),
      snapshot: mkSnapshot(2_500_000),
      comparables: mkComps(Array(10).fill(2_500_000)),
    });
    expect(sig.confidence).toBeGreaterThanOrEqual(0);
    expect(sig.confidence).toBeLessThanOrEqual(1);
  });

  test("confidence is lowest with no snapshot + no comps", () => {
    const low = generateSignal({
      target: mkTarget(),
      snapshot: null,
      comparables: [],
    });
    const high = generateSignal({
      target: mkTarget(),
      snapshot: mkSnapshot(2_500_000),
      comparables: mkComps([2_400_000, 2_450_000, 2_500_000, 2_550_000, 2_600_000]),
    });
    expect(low.confidence).toBeLessThan(high.confidence);
  });
});

describe("generateSignal — rationale copy", () => {
  test("contains no em dashes", () => {
    const sig = generateSignal({
      target: mkTarget({ daysOnLot: 45, ourPriceCents: 3_000_000 }),
      snapshot: mkSnapshot(2_500_000),
      comparables: mkComps([2_400_000, 2_500_000, 2_600_000]),
    });
    expect(sig.rationale).not.toMatch(/—/); // em dash
    expect(sig.rationale).not.toContain("—");
  });
});
