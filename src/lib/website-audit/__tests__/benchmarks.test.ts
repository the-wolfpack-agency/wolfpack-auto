/**
 * Unit tests for website-audit benchmarks dataset + lookups.
 */

import {
  WEBSITE_BENCHMARKS,
  WEBSITE_BENCHMARK_ENTRY_COUNT,
  WEBSITE_BENCHMARK_CITED_SOURCE_COUNT,
  getWebsiteBenchmark,
} from "@/lib/website-audit/benchmarks";

describe("website-audit benchmarks", () => {
  test("has at least 10 entries", () => {
    expect(WEBSITE_BENCHMARK_ENTRY_COUNT).toBeGreaterThanOrEqual(10);
  });

  test("every entry has a non-empty source", () => {
    for (const b of WEBSITE_BENCHMARKS) {
      expect(b.source.length).toBeGreaterThan(5);
    }
  });

  test("cites at least 3 distinct non-TODO sources", () => {
    expect(WEBSITE_BENCHMARK_CITED_SOURCE_COUNT).toBeGreaterThanOrEqual(3);
  });

  test("every entry has a unit string", () => {
    for (const b of WEBSITE_BENCHMARKS) {
      expect(typeof b.unit).toBe("string");
      expect(b.unit.length).toBeGreaterThan(0);
    }
  });

  test("getWebsiteBenchmark returns a known metric", () => {
    const b = getWebsiteBenchmark("lcp_seconds");
    expect(b).not.toBeNull();
    expect(b?.median).toBeGreaterThan(0);
    expect(b?.top_decile).toBeLessThanOrEqual(b!.median);
  });

  test("getWebsiteBenchmark returns null for unknown metric", () => {
    // @ts-expect-error — intentionally invalid metric
    expect(getWebsiteBenchmark("not_a_real_metric")).toBeNull();
  });
});
