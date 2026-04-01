/**
 * Background Generator — Unit Tests
 *
 * Validates preset definitions, CSS generation, recommendation logic,
 * batch planning, performance tracking, and insights aggregation.
 */

/* Jest globals (describe, it, expect, beforeEach) are available automatically */
import {
  getAvailableBackgrounds,
  getPresetById,
  generateBackgroundCSS,
  getRecommendedBackground,
  getBatchBackgroundPlan,
  trackBackgroundPerformance,
  getBackgroundInsights,
  getPerformanceRecords,
  clearPerformanceRecords,
  type BackgroundPreset,
  type BackgroundPresetId,
} from "../background-generator";

/* ------------------------------------------------------------------ */
/*  Preset definitions                                                 */
/* ------------------------------------------------------------------ */

describe("Background Presets", () => {
  it("returns all 8 presets", () => {
    const presets = getAvailableBackgrounds();
    expect(presets).toHaveLength(8);
  });

  it("every preset has required fields", () => {
    const presets = getAvailableBackgrounds();
    for (const p of presets) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.thumbnailCSS).toBeTruthy();
      expect(p.category).toBeTruthy();
    }
  });

  it("every preset thumbnailCSS contains a valid CSS background declaration", () => {
    const presets = getAvailableBackgrounds();
    for (const p of presets) {
      expect(p.thumbnailCSS).toMatch(/background:\s*.+;/);
    }
  });

  it("preset IDs are unique", () => {
    const presets = getAvailableBackgrounds();
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("categories are valid", () => {
    const validCategories = new Set(["studio", "outdoor", "branded", "seasonal"]);
    const presets = getAvailableBackgrounds();
    for (const p of presets) {
      expect(validCategories.has(p.category)).toBe(true);
    }
  });

  it("getPresetById returns correct preset", () => {
    const preset = getPresetById("showroom_dark");
    expect(preset).toBeDefined();
    expect(preset!.name).toBe("Dark Showroom");
  });

  it("getPresetById returns undefined for unknown ID", () => {
    expect(getPresetById("nonexistent")).toBeUndefined();
  });

  it("returns a copy, not the original array", () => {
    const a = getAvailableBackgrounds();
    const b = getAvailableBackgrounds();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* ------------------------------------------------------------------ */
/*  CSS generation                                                     */
/* ------------------------------------------------------------------ */

describe("generateBackgroundCSS", () => {
  it("generates valid CSS for every preset ID", () => {
    const ids: BackgroundPresetId[] = [
      "showroom_white", "showroom_dark", "outdoor_scenic",
      "dealer_branded", "urban_night", "minimalist",
      "seasonal_winter", "seasonal_summer",
    ];
    for (const id of ids) {
      const css = generateBackgroundCSS(id);
      expect(css).toContain("background:");
      expect(css.length).toBeGreaterThan(10);
    }
  });

  it("dealer_branded uses provided dealer colors", () => {
    const css = generateBackgroundCSS("dealer_branded", undefined, {
      primary: "#ff0000",
      secondary: "#00ff00",
    });
    expect(css).toContain("#ff0000");
    expect(css).toContain("#00ff00");
  });

  it("dealer_branded falls back to default colors when no dealer colors provided", () => {
    const css = generateBackgroundCSS("dealer_branded");
    expect(css).toContain("#2563eb");
  });

  it("minimalist uses vehicle color when provided", () => {
    const css = generateBackgroundCSS("minimalist", "#336699");
    expect(css).toContain("#336699");
  });

  it("unknown preset falls back to white showroom", () => {
    const css = generateBackgroundCSS("totally_unknown");
    expect(css).toContain("background:");
    expect(css).toContain("#ffffff");
  });
});

/* ------------------------------------------------------------------ */
/*  Recommendation engine                                              */
/* ------------------------------------------------------------------ */

describe("getRecommendedBackground", () => {
  it("recommends dark showroom for luxury makes", () => {
    const rec = getRecommendedBackground({ make: "BMW", price: 55000 });
    expect(rec.preset).toBe("showroom_dark");
    expect(rec.reason).toBeTruthy();
  });

  it("recommends dark showroom for high-price vehicles", () => {
    const rec = getRecommendedBackground({ make: "Chevrolet", price: 75000 });
    expect(rec.preset).toBe("showroom_dark");
  });

  it("recommends outdoor scenic for trucks", () => {
    const rec = getRecommendedBackground({ body_type: "truck", price: 45000 });
    expect(rec.preset).toBe("outdoor_scenic");
  });

  it("recommends outdoor scenic for SUVs", () => {
    const rec = getRecommendedBackground({ body_type: "SUV", price: 35000 });
    expect(rec.preset).toBe("outdoor_scenic");
  });

  it("recommends white showroom for budget used vehicles", () => {
    const rec = getRecommendedBackground({ condition: "used", price: 15000 });
    expect(rec.preset).toBe("showroom_white");
  });

  it("recommends minimalist for new vehicles", () => {
    const rec = getRecommendedBackground({ condition: "new", price: 30000 });
    expect(rec.preset).toBe("minimalist");
  });

  it("falls back to white showroom when no strong signal", () => {
    const rec = getRecommendedBackground({ condition: "used", price: 25000 });
    expect(rec.preset).toBe("showroom_white");
  });

  it("handles empty input gracefully", () => {
    const rec = getRecommendedBackground({});
    expect(rec.preset).toBeTruthy();
    expect(rec.reason).toBeTruthy();
  });

  it("luxury make takes priority over body type", () => {
    // A luxury SUV should get dark showroom, not outdoor
    const rec = getRecommendedBackground({
      make: "Porsche",
      body_type: "SUV",
      price: 90000,
    });
    expect(rec.preset).toBe("showroom_dark");
  });
});

/* ------------------------------------------------------------------ */
/*  Batch planning                                                     */
/* ------------------------------------------------------------------ */

describe("getBatchBackgroundPlan", () => {
  it("returns one plan entry per vehicle", () => {
    const vehicles = [
      { vin: "VIN001", price: 80000, body_type: "sedan" },
      { vin: "VIN002", price: 35000, body_type: "truck" },
      { vin: "VIN003", price: 15000, condition: "used" },
    ];
    const plan = getBatchBackgroundPlan(vehicles);
    expect(plan).toHaveLength(3);
    expect(plan[0].vin).toBe("VIN001");
    expect(plan[1].vin).toBe("VIN002");
    expect(plan[2].vin).toBe("VIN003");
  });

  it("each entry has vin, recommended_preset, and reason", () => {
    const plan = getBatchBackgroundPlan([{ vin: "VIN001" }]);
    expect(plan[0]).toHaveProperty("vin");
    expect(plan[0]).toHaveProperty("recommended_preset");
    expect(plan[0]).toHaveProperty("reason");
  });

  it("applies correct logic per vehicle", () => {
    const plan = getBatchBackgroundPlan([
      { vin: "LUXURY", price: 90000 },
      { vin: "TRUCK", body_type: "truck", price: 45000 },
    ]);
    expect(plan[0].recommended_preset).toBe("showroom_dark");
    expect(plan[1].recommended_preset).toBe("outdoor_scenic");
  });

  it("handles empty array", () => {
    const plan = getBatchBackgroundPlan([]);
    expect(plan).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Performance tracking                                               */
/* ------------------------------------------------------------------ */

describe("Performance Tracking", () => {
  beforeEach(() => {
    clearPerformanceRecords();
  });

  it("stores performance records", () => {
    trackBackgroundPerformance("VIN001", "showroom_dark", {
      views: 100,
      avg_dwell_ms: 3000,
      clicks: 10,
      leads_generated: 2,
    });
    const records = getPerformanceRecords();
    expect(records).toHaveLength(1);
    expect(records[0].vin).toBe("VIN001");
    expect(records[0].preset).toBe("showroom_dark");
    expect(records[0].engagement.views).toBe(100);
  });

  it("tracks multiple records for different presets", () => {
    trackBackgroundPerformance("VIN001", "showroom_dark", {
      views: 100, avg_dwell_ms: 3000, clicks: 10, leads_generated: 2,
    });
    trackBackgroundPerformance("VIN002", "outdoor_scenic", {
      views: 80, avg_dwell_ms: 2000, clicks: 5, leads_generated: 1,
    });
    expect(getPerformanceRecords()).toHaveLength(2);
  });

  it("clearPerformanceRecords empties the store", () => {
    trackBackgroundPerformance("VIN001", "showroom_dark", {
      views: 50, avg_dwell_ms: 1000, clicks: 5, leads_generated: 0,
    });
    clearPerformanceRecords();
    expect(getPerformanceRecords()).toHaveLength(0);
  });

  it("returns a copy of records, not the original", () => {
    trackBackgroundPerformance("VIN001", "showroom_white", {
      views: 10, avg_dwell_ms: 500, clicks: 1, leads_generated: 0,
    });
    const a = getPerformanceRecords();
    const b = getPerformanceRecords();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* ------------------------------------------------------------------ */
/*  Insights aggregation                                               */
/* ------------------------------------------------------------------ */

describe("getBackgroundInsights", () => {
  beforeEach(() => {
    clearPerformanceRecords();
  });

  it("returns empty array when no data exists", () => {
    expect(getBackgroundInsights()).toEqual([]);
  });

  it("aggregates by preset", () => {
    trackBackgroundPerformance("VIN001", "showroom_dark", {
      views: 100, avg_dwell_ms: 3000, clicks: 10, leads_generated: 2,
    });
    trackBackgroundPerformance("VIN002", "showroom_dark", {
      views: 50, avg_dwell_ms: 2000, clicks: 5, leads_generated: 1,
    });
    trackBackgroundPerformance("VIN003", "outdoor_scenic", {
      views: 80, avg_dwell_ms: 2500, clicks: 8, leads_generated: 0,
    });

    const insights = getBackgroundInsights();
    expect(insights).toHaveLength(2);

    const darkInsight = insights.find((i) => i.preset === "showroom_dark");
    expect(darkInsight).toBeDefined();
    expect(darkInsight!.total_views).toBe(150);
    expect(darkInsight!.total_clicks).toBe(15);
    expect(darkInsight!.total_leads).toBe(3);
    expect(darkInsight!.sample_size).toBe(2);
  });

  it("sorts by engagement score descending", () => {
    trackBackgroundPerformance("VIN001", "showroom_white", {
      views: 10, avg_dwell_ms: 500, clicks: 1, leads_generated: 0,
    });
    trackBackgroundPerformance("VIN002", "showroom_dark", {
      views: 200, avg_dwell_ms: 5000, clicks: 30, leads_generated: 5,
    });

    const insights = getBackgroundInsights();
    expect(insights[0].preset).toBe("showroom_dark");
    expect(insights[0].engagement_score).toBeGreaterThan(insights[1].engagement_score);
  });

  it("calculates weighted average dwell correctly", () => {
    // 100 views * 3000ms + 50 views * 1000ms = 350000ms total
    // Average = 350000 / 150 = 2333ms
    trackBackgroundPerformance("VIN001", "minimalist", {
      views: 100, avg_dwell_ms: 3000, clicks: 0, leads_generated: 0,
    });
    trackBackgroundPerformance("VIN002", "minimalist", {
      views: 50, avg_dwell_ms: 1000, clicks: 0, leads_generated: 0,
    });

    const insights = getBackgroundInsights();
    const min = insights.find((i) => i.preset === "minimalist");
    expect(min).toBeDefined();
    expect(min!.avg_dwell_ms).toBe(2333);
  });
});
