/**
 * Unit tests for fi-audit benchmarks dataset + lookups.
 */

import {
  FI_BENCHMARKS,
  FI_BENCHMARK_ENTRY_COUNT,
  FI_BENCHMARK_CITED_SOURCE_COUNT,
  getBenchmark,
  pickVolumeTier,
} from "@/lib/fi-audit/benchmarks";

describe("fi-audit benchmarks", () => {
  test("has at least 20 entries (5 metrics x 4 tiers)", () => {
    expect(FI_BENCHMARK_ENTRY_COUNT).toBeGreaterThanOrEqual(20);
  });

  test("every entry has a non-empty source", () => {
    for (const b of FI_BENCHMARKS) {
      expect(b.source.length).toBeGreaterThan(5);
    }
  });

  test("cites at least 2 distinct non-TODO sources", () => {
    expect(FI_BENCHMARK_CITED_SOURCE_COUNT).toBeGreaterThanOrEqual(2);
  });

  test("top_decile >= median for every entry", () => {
    for (const b of FI_BENCHMARKS) {
      expect(b.top_decile).toBeGreaterThanOrEqual(b.median);
    }
  });

  describe("pickVolumeTier", () => {
    test("60 deals -> 60-100 tier", () => {
      expect(pickVolumeTier(60)).toBe("60-100");
    });
    test("125 deals -> 100-150 tier", () => {
      expect(pickVolumeTier(125)).toBe("100-150");
    });
    test("175 deals -> 150-200 tier", () => {
      expect(pickVolumeTier(175)).toBe("150-200");
    });
    test("250 deals -> 200+ tier", () => {
      expect(pickVolumeTier(250)).toBe("200+");
    });
  });

  describe("getBenchmark", () => {
    test("returns avg gross median for 150-200 tier", () => {
      const b = getBenchmark("150-200", "avg_gross_per_deal");
      expect(b).not.toBeNull();
      expect(b?.median).toBeGreaterThan(1000);
    });
    test("returns gap attach for 200+ tier", () => {
      const b = getBenchmark("200+", "gap_attach_rate");
      expect(b).not.toBeNull();
      expect(b?.median).toBeGreaterThan(0);
      expect(b?.median).toBeLessThan(1);
    });
    test("returns null for unknown tier/metric combo cast", () => {
      // Type-system would block legit misuse; this asserts runtime safety.
      // @ts-expect-error — intentionally invalid metric
      expect(getBenchmark("150-200", "bogus")).toBeNull();
    });
  });
});
