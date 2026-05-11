/**
 * Unit tests for comparable-finder.
 *
 * Mock data only. Verifies determinism, mock labeling, sort order, radius
 * cap, and the `realComparableSource` stub returns null until a feed is
 * wired up.
 */

jest.mock("@/lib/cache", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

import {
  DEFAULT_RADIUS_MILES,
  findComparables,
  realComparableSource,
} from "@/lib/market-intel/comparable-finder";
import type { TargetVehicle } from "@/lib/market-intel/types";

const target: TargetVehicle = {
  vehicleId: "veh-1",
  dealerId: "00000000-0000-0000-0000-000000000001",
  vin: "1HGCM82633A123456",
  year: 2022,
  make: "Honda",
  model: "Accord",
  miles: 30_000,
  ourPriceCents: 2_500_000, // $25,000
  daysOnLot: 14,
};

describe("findComparables (mock)", () => {
  test("returns the requested number of comparables (default 8)", async () => {
    const comps = await findComparables(target);
    expect(comps.length).toBeLessThanOrEqual(8);
    expect(comps.length).toBeGreaterThan(0);
  });

  test("every mock comp is flagged isMock=true and source 'mock'", async () => {
    const comps = await findComparables(target, { limit: 5 });
    expect(comps.length).toBe(5);
    for (const c of comps) {
      expect(c.isMock).toBe(true);
      expect(c.compSource).toBe("mock");
    }
  });

  test("comps sort ascending by price (lowest first)", async () => {
    const comps = await findComparables(target, { limit: 6 });
    for (let i = 1; i < comps.length; i++) {
      expect(comps[i].compPriceCents).toBeGreaterThanOrEqual(
        comps[i - 1].compPriceCents,
      );
    }
  });

  test("respects custom radius (no comp farther than radius)", async () => {
    const comps = await findComparables(target, { radiusMiles: 25, limit: 4 });
    for (const c of comps) {
      expect(c.compDistanceMiles).toBeLessThanOrEqual(25);
    }
  });

  test("deterministic for identical inputs (same vehicleId+vin)", async () => {
    const a = await findComparables(target, { limit: 6 });
    const b = await findComparables(target, { limit: 6 });
    expect(a.map((c) => c.compPriceCents)).toEqual(
      b.map((c) => c.compPriceCents),
    );
  });

  test("default radius constant exposed for callers", () => {
    expect(DEFAULT_RADIUS_MILES).toBeGreaterThan(0);
  });
});

describe("realComparableSource (stub)", () => {
  test("returns null until a partner feed is wired up", async () => {
    const v = await realComparableSource(target);
    expect(v).toBeNull();
  });
});
