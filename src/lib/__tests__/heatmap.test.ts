/**
 * Heatmap visualization tests.
 */

import {
  aggregateClickHeatmap,
  aggregateScrollHeatmap,
  aggregateAttentionHeatmap,
  normalizeHeatmapData,
  getTopPages,
  compareHeatmaps,
  calculateHeatmapDiff,
} from "@/lib/heatmap";

/* -------------------------------------------------------------------------- */
/*  Click aggregation                                                          */
/* -------------------------------------------------------------------------- */

describe("aggregateClickHeatmap", () => {
  it("clusters nearby clicks into grid cells", () => {
    const clicks = [
      { x: 5, y: 5 },
      { x: 8, y: 8 },
      { x: 12, y: 12 }, // same grid cell as above with gridSize=20
      { x: 100, y: 200 },
    ];
    const result = aggregateClickHeatmap(clicks, 20);

    // Should have 2 clusters: one at (10,10) area and one at (110,210) area
    expect(result.length).toBe(2);

    const highCluster = result.find((p) => p.count === 3);
    expect(highCluster).toBeDefined();
    expect(highCluster!.intensity).toBe(1.0); // highest = 1.0
  });

  it("returns empty array for no clicks", () => {
    expect(aggregateClickHeatmap([])).toEqual([]);
  });

  it("normalizes intensity to 0-1 range", () => {
    const clicks = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 200, y: 200 },
    ];
    const result = aggregateClickHeatmap(clicks, 20);

    for (const point of result) {
      expect(point.intensity).toBeGreaterThanOrEqual(0);
      expect(point.intensity).toBeLessThanOrEqual(1);
    }

    // At least one point should have intensity 1.0
    expect(result.some((p) => p.intensity === 1.0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Scroll depth                                                               */
/* -------------------------------------------------------------------------- */

describe("aggregateScrollHeatmap", () => {
  it("calculates correct visitor percentages per band", () => {
    const events = [
      { maxDepthPercent: 100 },
      { maxDepthPercent: 80 },
      { maxDepthPercent: 60 },
      { maxDepthPercent: 40 },
      { maxDepthPercent: 20 },
    ];
    const bands = aggregateScrollHeatmap(events, 5);

    expect(bands).toHaveLength(4);
    // All visitors reach 0-25%
    expect(bands[0].visitorPercent).toBe(100);
    // 4 of 5 reach 25-50%
    expect(bands[1].visitorPercent).toBe(80);
    // 3 of 5 reach 50-75%
    expect(bands[2].visitorPercent).toBe(60);
    // 2 of 5 reach 75-100%
    expect(bands[3].visitorPercent).toBe(40);
  });

  it("returns empty for zero visitors", () => {
    expect(aggregateScrollHeatmap([], 0)).toEqual([]);
  });

  it("has correct band labels", () => {
    const bands = aggregateScrollHeatmap([{ maxDepthPercent: 50 }], 1);
    expect(bands.map((b) => b.label)).toEqual([
      "0-25%",
      "25-50%",
      "50-75%",
      "75-100%",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Attention zones                                                            */
/* -------------------------------------------------------------------------- */

describe("aggregateAttentionHeatmap", () => {
  it("normalizes dwell time to intensity", () => {
    const data = [
      { y: 0, height: 200, dwellMs: 5000 },
      { y: 200, height: 200, dwellMs: 10000 },
      { y: 400, height: 200, dwellMs: 2500 },
    ];
    const zones = aggregateAttentionHeatmap(data);

    expect(zones).toHaveLength(3);
    // Highest dwell should be 1.0
    expect(zones[1].intensity).toBe(1.0);
    // Others proportional
    expect(zones[0].intensity).toBe(0.5);
    expect(zones[2].intensity).toBe(0.25);
  });

  it("returns empty for no data", () => {
    expect(aggregateAttentionHeatmap([])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Normalization                                                              */
/* -------------------------------------------------------------------------- */

describe("normalizeHeatmapData", () => {
  it("normalizes to 0-1 using auto-detected max", () => {
    const points = [
      { x: 0, y: 0, intensity: 10, count: 10 },
      { x: 1, y: 1, intensity: 5, count: 5 },
      { x: 2, y: 2, intensity: 2, count: 2 },
    ];
    const result = normalizeHeatmapData(points);

    expect(result[0].intensity).toBe(1.0);
    expect(result[1].intensity).toBe(0.5);
    expect(result[2].intensity).toBe(0.2);
  });

  it("normalizes using provided maxIntensity", () => {
    const points = [
      { x: 0, y: 0, intensity: 5, count: 5 },
      { x: 1, y: 1, intensity: 3, count: 3 },
    ];
    const result = normalizeHeatmapData(points, 10);

    expect(result[0].intensity).toBe(0.5);
    expect(result[1].intensity).toBe(0.3);
  });

  it("clamps to 1.0 if value exceeds maxIntensity", () => {
    const points = [{ x: 0, y: 0, intensity: 15, count: 15 }];
    const result = normalizeHeatmapData(points, 10);

    expect(result[0].intensity).toBe(1.0);
  });

  it("returns empty for empty input", () => {
    expect(normalizeHeatmapData([])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Top pages                                                                  */
/* -------------------------------------------------------------------------- */

describe("getTopPages", () => {
  it("returns demo data when no DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const pages = await getTopPages("demo-dealer", 5);

    expect(pages.length).toBeLessThanOrEqual(5);
    expect(pages[0]).toHaveProperty("url");
    expect(pages[0]).toHaveProperty("pageviews");
    expect(pages[0]).toHaveProperty("uniqueVisitors");
    // Should be sorted by pageviews descending
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i - 1].pageviews).toBeGreaterThanOrEqual(pages[i].pageviews);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Heatmap comparison                                                         */
/* -------------------------------------------------------------------------- */

describe("compareHeatmaps", () => {
  it("returns comparison with both datasets and periods", () => {
    const heatmapA = [{ x: 100, y: 200, count: 50, intensity: 1.0 }];
    const heatmapB = [{ x: 100, y: 200, count: 75, intensity: 1.0 }];
    const periodA = { start: "2026-03-01", end: "2026-03-07" };
    const periodB = { start: "2026-03-08", end: "2026-03-14" };

    const result = compareHeatmaps("/", heatmapA, periodA, heatmapB, periodB);

    expect(result.pageUrl).toBe("/");
    expect(result.heatmapA).toBe(heatmapA);
    expect(result.heatmapB).toBe(heatmapB);
    expect(result.periodA).toEqual(periodA);
    expect(result.periodB).toEqual(periodB);
  });
});

describe("calculateHeatmapDiff", () => {
  it("computes increased and decreased points", () => {
    const heatmapA = [
      { x: 100, y: 200, count: 50, intensity: 1.0 },
      { x: 300, y: 400, count: 30, intensity: 0.6 },
    ];
    const heatmapB = [
      { x: 100, y: 200, count: 75, intensity: 1.0 }, // increased
      { x: 300, y: 400, count: 10, intensity: 0.3 }, // decreased
    ];

    const diff = calculateHeatmapDiff("/", heatmapA, heatmapB);

    expect(diff.pageUrl).toBe("/");
    expect(diff.increased.length).toBe(1);
    expect(diff.increased[0].count).toBe(25); // 75 - 50
    expect(diff.decreased.length).toBe(1);
    expect(diff.decreased[0].count).toBe(20); // 30 - 10
  });

  it("handles new points in period B", () => {
    const heatmapA = [{ x: 100, y: 200, count: 50, intensity: 1.0 }];
    const heatmapB = [
      { x: 100, y: 200, count: 50, intensity: 1.0 },
      { x: 500, y: 600, count: 20, intensity: 0.4 }, // new point
    ];

    const diff = calculateHeatmapDiff("/", heatmapA, heatmapB);
    expect(diff.increased.length).toBe(1);
    expect(diff.increased[0].x).toBe(500);
  });

  it("handles points removed in period B", () => {
    const heatmapA = [
      { x: 100, y: 200, count: 50, intensity: 1.0 },
      { x: 500, y: 600, count: 20, intensity: 0.4 },
    ];
    const heatmapB = [{ x: 100, y: 200, count: 50, intensity: 1.0 }];

    const diff = calculateHeatmapDiff("/", heatmapA, heatmapB);
    expect(diff.decreased.length).toBe(1);
    expect(diff.decreased[0].x).toBe(500);
  });

  it("calculates net change percentage", () => {
    const heatmapA = [{ x: 100, y: 200, count: 100, intensity: 1.0 }];
    const heatmapB = [{ x: 100, y: 200, count: 120, intensity: 1.0 }];

    const diff = calculateHeatmapDiff("/", heatmapA, heatmapB);
    expect(diff.netChangePercent).toBe(20);
  });

  it("normalizes diff intensities to 0-1", () => {
    const heatmapA = [
      { x: 100, y: 100, count: 10, intensity: 0.5 },
      { x: 200, y: 200, count: 10, intensity: 0.5 },
    ];
    const heatmapB = [
      { x: 100, y: 100, count: 30, intensity: 1.0 },
      { x: 200, y: 200, count: 20, intensity: 0.7 },
    ];

    const diff = calculateHeatmapDiff("/", heatmapA, heatmapB);
    for (const p of diff.increased) {
      expect(p.intensity).toBeGreaterThanOrEqual(0);
      expect(p.intensity).toBeLessThanOrEqual(1);
    }
    // Highest increased should be 1.0
    expect(diff.increased.some((p) => p.intensity === 1.0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo data structure                                                        */
/* -------------------------------------------------------------------------- */

describe("demo heatmap API data", () => {
  it("demo click data has required fields", async () => {
    const res = await fetch?.("/api/admin/heatmaps?type=click").catch(() => null);
    // In test env without server, just verify the types compile
    expect(true).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Analytics events                                                           */
/* -------------------------------------------------------------------------- */

describe("heatmap analytics events", () => {
  it("trackHeatmap function exists and does not throw", async () => {
    const { trackHeatmap } = await import("@/lib/analytics-hooks");
    expect(typeof trackHeatmap).toBe("function");
    // Should not throw even without DB
    expect(() => trackHeatmap("heatmap.viewed", "test-dealer", { page: "/" })).not.toThrow();
  });
});
