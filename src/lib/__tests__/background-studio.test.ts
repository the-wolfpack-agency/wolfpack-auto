/**
 * Unit Tests — Background Generator
 *
 * Covers: presets, CSS generation, recommendations, batch planning,
 * engagement scoring, validation, performance tracking.
 */

import {
  getAvailableBackgrounds,
  getPresetById,
  isValidPresetId,
  getPresetsByCategory,
  generateBackgroundCSS,
  getRecommendedBackground,
  getBatchBackgroundPlan,
  calculateEngagementScore,
  calculateCTR,
  calculateLeadRate,
  trackBackgroundPerformance,
  getPerformanceRecords,
  clearPerformanceRecords,
  getBackgroundInsights,
  validateCustomBackgroundInput,
  isValidCategory,
  isValidPosition,
  isValidFit,
  DEFAULT_COMPOSITE_OPTIONS,
  type BackgroundPresetId,
} from "@/lib/background-generator";

/* ------------------------------------------------------------------ */
/*  Presets                                                            */
/* ------------------------------------------------------------------ */

describe("Background Presets", () => {
  test("returns all 8 presets", () => {
    const presets = getAvailableBackgrounds();
    expect(presets).toHaveLength(8);
  });

  test("each preset has required fields", () => {
    for (const p of getAvailableBackgrounds()) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.thumbnailCSS).toContain("background:");
      expect(p.category).toBeTruthy();
    }
  });

  test("getPresetById returns correct preset", () => {
    const preset = getPresetById("showroom_dark");
    expect(preset).toBeDefined();
    expect(preset!.name).toBe("Dark Showroom");
  });

  test("getPresetById returns undefined for invalid ID", () => {
    expect(getPresetById("nonexistent")).toBeUndefined();
  });

  test("isValidPresetId validates correctly", () => {
    expect(isValidPresetId("showroom_white")).toBe(true);
    expect(isValidPresetId("showroom_dark")).toBe(true);
    expect(isValidPresetId("invalid")).toBe(false);
    expect(isValidPresetId("")).toBe(false);
  });

  test("getPresetsByCategory filters correctly", () => {
    const studio = getPresetsByCategory("studio");
    expect(studio.length).toBeGreaterThanOrEqual(2);
    for (const p of studio) {
      expect(p.category).toBe("studio");
    }

    const seasonal = getPresetsByCategory("seasonal");
    expect(seasonal).toHaveLength(2);
  });

  test("presets return copies (immutable)", () => {
    const a = getAvailableBackgrounds();
    const b = getAvailableBackgrounds();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* ------------------------------------------------------------------ */
/*  CSS generation                                                     */
/* ------------------------------------------------------------------ */

describe("CSS Generation", () => {
  test("generates CSS for all presets", () => {
    const ids: BackgroundPresetId[] = [
      "showroom_white", "showroom_dark", "outdoor_scenic", "dealer_branded",
      "urban_night", "minimalist", "seasonal_winter", "seasonal_summer",
    ];
    for (const id of ids) {
      const css = generateBackgroundCSS(id);
      expect(css).toContain("background:");
    }
  });

  test("dealer_branded uses custom colors", () => {
    const css = generateBackgroundCSS("dealer_branded", undefined, {
      primary: "#ff0000",
      secondary: "#00ff00",
    });
    expect(css).toContain("#ff0000");
    expect(css).toContain("#00ff00");
  });

  test("dealer_branded uses defaults when no colors provided", () => {
    const css = generateBackgroundCSS("dealer_branded");
    expect(css).toContain("#2563eb");
  });

  test("minimalist uses vehicle color when provided", () => {
    const css = generateBackgroundCSS("minimalist", "#ff5500");
    expect(css).toContain("#ff5500");
  });

  test("unknown preset falls back to white showroom", () => {
    const css = generateBackgroundCSS("nonexistent");
    expect(css).toContain("#ffffff");
  });
});

/* ------------------------------------------------------------------ */
/*  Recommendations                                                    */
/* ------------------------------------------------------------------ */

describe("Recommendations", () => {
  test("luxury make gets showroom_dark", () => {
    const rec = getRecommendedBackground({ make: "BMW" });
    expect(rec.preset).toBe("showroom_dark");
    expect(rec.confidence).toBeGreaterThanOrEqual(0.9);
    expect(rec.alternative_preset).toBeTruthy();
  });

  test("high price gets showroom_dark", () => {
    const rec = getRecommendedBackground({ price: 75000 });
    expect(rec.preset).toBe("showroom_dark");
  });

  test("truck gets outdoor_scenic", () => {
    const rec = getRecommendedBackground({ body_type: "truck" });
    expect(rec.preset).toBe("outdoor_scenic");
    expect(rec.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("SUV gets outdoor_scenic", () => {
    const rec = getRecommendedBackground({ body_type: "SUV" });
    expect(rec.preset).toBe("outdoor_scenic");
  });

  test("sports car gets urban_night", () => {
    const rec = getRecommendedBackground({ body_type: "coupe" });
    expect(rec.preset).toBe("urban_night");
  });

  test("cheap used gets showroom_white", () => {
    const rec = getRecommendedBackground({ condition: "used", price: 15000 });
    expect(rec.preset).toBe("showroom_white");
  });

  test("new vehicle gets minimalist", () => {
    const rec = getRecommendedBackground({ condition: "new" });
    expect(rec.preset).toBe("minimalist");
  });

  test("empty data gets fallback", () => {
    const rec = getRecommendedBackground({});
    expect(rec.preset).toBeTruthy();
    expect(rec.confidence).toBeGreaterThan(0);
  });

  test("luxury overrides body type", () => {
    // BMW SUV should get showroom_dark (luxury) not outdoor_scenic (SUV)
    const rec = getRecommendedBackground({ make: "BMW", body_type: "SUV" });
    expect(rec.preset).toBe("showroom_dark");
  });

  test("recommendation includes alternative", () => {
    const rec = getRecommendedBackground({ make: "Ferrari" });
    expect(rec.alternative_preset).not.toBe(rec.preset);
    expect(rec.alternative_preset).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Batch planning                                                     */
/* ------------------------------------------------------------------ */

describe("Batch Planning", () => {
  test("generates plan for multiple vehicles", () => {
    const plan = getBatchBackgroundPlan([
      { vin: "V1", make: "BMW", price: 65000 },
      { vin: "V2", body_type: "truck" },
      { vin: "V3", condition: "new" },
    ]);
    expect(plan).toHaveLength(3);
    expect(plan[0].vin).toBe("V1");
    expect(plan[0].recommended_preset).toBe("showroom_dark");
    expect(plan[1].recommended_preset).toBe("outdoor_scenic");
    expect(plan[2].recommended_preset).toBe("minimalist");
  });

  test("each plan item has confidence", () => {
    const plan = getBatchBackgroundPlan([{ vin: "V1" }]);
    expect(plan[0].confidence).toBeGreaterThan(0);
    expect(plan[0].confidence).toBeLessThanOrEqual(1);
  });

  test("handles empty array", () => {
    expect(getBatchBackgroundPlan([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Engagement scoring                                                 */
/* ------------------------------------------------------------------ */

describe("Engagement Scoring", () => {
  test("calculates engagement score", () => {
    const score = calculateEngagementScore({
      views: 100,
      avg_dwell_ms: 5000,
      clicks: 10,
      leads_generated: 2,
    });
    // 100*1 + 5000*0.01 + 10*5 + 2*50 = 100 + 50 + 50 + 100 = 300
    expect(score).toBe(300);
  });

  test("handles zero values", () => {
    expect(calculateEngagementScore({ views: 0, avg_dwell_ms: 0, clicks: 0, leads_generated: 0 })).toBe(0);
  });

  test("CTR calculation", () => {
    expect(calculateCTR(100, 5)).toBe(0.05);
    expect(calculateCTR(0, 0)).toBe(0);
  });

  test("lead rate calculation", () => {
    expect(calculateLeadRate(100, 2)).toBe(0.02);
    expect(calculateLeadRate(0, 0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Performance tracking (in-memory)                                   */
/* ------------------------------------------------------------------ */

describe("Performance Tracking", () => {
  beforeEach(() => clearPerformanceRecords());

  test("tracks and retrieves records", () => {
    trackBackgroundPerformance("V1", "showroom_white", {
      views: 50, avg_dwell_ms: 3000, clicks: 5, leads_generated: 1,
    });
    const records = getPerformanceRecords();
    expect(records).toHaveLength(1);
    expect(records[0].vin).toBe("V1");
    expect(records[0].preset).toBe("showroom_white");
    expect(records[0].recorded_at).toBeTruthy();
  });

  test("clearPerformanceRecords empties the store", () => {
    trackBackgroundPerformance("V1", "showroom_dark", {
      views: 10, avg_dwell_ms: 1000, clicks: 1, leads_generated: 0,
    });
    clearPerformanceRecords();
    expect(getPerformanceRecords()).toHaveLength(0);
  });

  test("returns copies (not mutable reference)", () => {
    trackBackgroundPerformance("V1", "minimalist", {
      views: 10, avg_dwell_ms: 1000, clicks: 1, leads_generated: 0,
    });
    const a = getPerformanceRecords();
    const b = getPerformanceRecords();
    expect(a).not.toBe(b);
  });
});

/* ------------------------------------------------------------------ */
/*  Insights                                                           */
/* ------------------------------------------------------------------ */

describe("Background Insights", () => {
  beforeEach(() => clearPerformanceRecords());

  test("returns empty array when no data", () => {
    expect(getBackgroundInsights()).toEqual([]);
  });

  test("aggregates by preset", () => {
    trackBackgroundPerformance("V1", "showroom_white", {
      views: 50, avg_dwell_ms: 3000, clicks: 5, leads_generated: 1,
    });
    trackBackgroundPerformance("V2", "showroom_white", {
      views: 30, avg_dwell_ms: 2000, clicks: 3, leads_generated: 0,
    });
    trackBackgroundPerformance("V3", "showroom_dark", {
      views: 100, avg_dwell_ms: 5000, clicks: 20, leads_generated: 5,
    });

    const insights = getBackgroundInsights();
    expect(insights).toHaveLength(2);

    // Dark showroom should score higher (more views, clicks, leads)
    expect(insights[0].preset_id).toBe("showroom_dark");
    expect(insights[0].total_views).toBe(100);
    expect(insights[0].total_clicks).toBe(20);
    expect(insights[0].total_leads).toBe(5);
    expect(insights[0].engagement_score).toBeGreaterThan(0);
    expect(insights[0].ctr).toBeGreaterThan(0);
    expect(insights[0].name).toBe("Dark Showroom");
  });

  test("insights sorted by engagement score descending", () => {
    trackBackgroundPerformance("V1", "minimalist", {
      views: 10, avg_dwell_ms: 1000, clicks: 1, leads_generated: 0,
    });
    trackBackgroundPerformance("V2", "showroom_dark", {
      views: 200, avg_dwell_ms: 8000, clicks: 50, leads_generated: 10,
    });

    const insights = getBackgroundInsights();
    expect(insights[0].engagement_score).toBeGreaterThanOrEqual(insights[1].engagement_score);
  });
});

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

describe("Validation", () => {
  test("validates valid input", () => {
    const result = validateCustomBackgroundInput({
      name: "My Background",
      category: "studio",
      position: "center",
      fit: "cover",
      overlay_opacity: 0.5,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects empty name", () => {
    const result = validateCustomBackgroundInput({ name: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Name is required");
  });

  test("rejects long name", () => {
    const result = validateCustomBackgroundInput({ name: "x".repeat(101) });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid category", () => {
    const result = validateCustomBackgroundInput({ name: "Test", category: "invalid" });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid position", () => {
    const result = validateCustomBackgroundInput({ name: "Test", position: "invalid" });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid fit", () => {
    const result = validateCustomBackgroundInput({ name: "Test", fit: "invalid" });
    expect(result.valid).toBe(false);
  });

  test("rejects out-of-range opacity", () => {
    expect(validateCustomBackgroundInput({ name: "Test", overlay_opacity: -0.1 }).valid).toBe(false);
    expect(validateCustomBackgroundInput({ name: "Test", overlay_opacity: 1.5 }).valid).toBe(false);
  });

  test("isValidCategory checks all categories", () => {
    expect(isValidCategory("studio")).toBe(true);
    expect(isValidCategory("outdoor")).toBe(true);
    expect(isValidCategory("branded")).toBe(true);
    expect(isValidCategory("seasonal")).toBe(true);
    expect(isValidCategory("lifestyle")).toBe(true);
    expect(isValidCategory("custom")).toBe(true);
    expect(isValidCategory("invalid")).toBe(false);
  });

  test("isValidPosition checks all positions", () => {
    expect(isValidPosition("center")).toBe(true);
    expect(isValidPosition("top left")).toBe(true);
    expect(isValidPosition("nowhere")).toBe(false);
  });

  test("isValidFit checks all fits", () => {
    expect(isValidFit("cover")).toBe(true);
    expect(isValidFit("contain")).toBe(true);
    expect(isValidFit("fill")).toBe(true);
    expect(isValidFit("stretch")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Default options                                                    */
/* ------------------------------------------------------------------ */

describe("Default Composite Options", () => {
  test("has sensible defaults", () => {
    expect(DEFAULT_COMPOSITE_OPTIONS.add_shadow).toBe(true);
    expect(DEFAULT_COMPOSITE_OPTIONS.add_reflection).toBe(true);
    expect(DEFAULT_COMPOSITE_OPTIONS.output_width).toBe(1920);
    expect(DEFAULT_COMPOSITE_OPTIONS.output_height).toBe(1080);
    expect(DEFAULT_COMPOSITE_OPTIONS.output_format).toBe("webp");
    expect(DEFAULT_COMPOSITE_OPTIONS.vehicle_scale).toBeGreaterThan(0);
    expect(DEFAULT_COMPOSITE_OPTIONS.vehicle_scale).toBeLessThanOrEqual(1);
  });
});
