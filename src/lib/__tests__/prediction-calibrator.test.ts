/**
 * Unit tests for src/lib/prediction-calibrator.ts
 *
 * Tests accuracy/precision/recall/F1 calculation, weight adjustment logic,
 * signal identification (top predictive vs misleading), and shadow mode.
 *
 * The core `computeCalibration` function is private, so we test it
 * indirectly through `calibrate` (shadow mode) and by examining the
 * CalibrationResult structure.
 *
 * Run with: npx jest src/lib/__tests__/prediction-calibrator.test.ts
 */

import {
  calibrate,
  getWeightMultipliers,
  getCalibrationHistory,
  type CalibrationResult,
} from "../prediction-calibrator";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

/** Ensure shadow mode for all tests. */
beforeEach(() => {
  delete process.env.DATABASE_URL;
});

/* -------------------------------------------------------------------------- */
/* calibrate — shadow mode result structure                                    */
/* -------------------------------------------------------------------------- */

describe("calibrate — shadow mode", () => {
  it("returns a CalibrationResult with all required fields", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result).toHaveProperty("accuracy");
    expect(result).toHaveProperty("precision");
    expect(result).toHaveProperty("recall");
    expect(result).toHaveProperty("f1_score");
    expect(result).toHaveProperty("weight_adjustments");
    expect(result).toHaveProperty("sample_size");
    expect(result).toHaveProperty("period_days");
    expect(result).toHaveProperty("calibrated_at");
    expect(result).toHaveProperty("top_predictive_signals");
    expect(result).toHaveProperty("top_misleading_signals");
    expect(result).toHaveProperty("recommendations");
  });

  it("uses default period of 14 days", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.period_days).toBe(14);
  });

  it("respects custom period parameter", async () => {
    const result = await calibrate(DEMO_DEALER_ID, 30);
    expect(result.period_days).toBe(30);
  });
});

/* -------------------------------------------------------------------------- */
/* calibrate — metric value ranges                                             */
/* -------------------------------------------------------------------------- */

describe("calibrate — metric ranges", () => {
  it("accuracy is between 0 and 1", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeLessThanOrEqual(1);
  });

  it("precision is between 0 and 1", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.precision).toBeGreaterThanOrEqual(0);
    expect(result.precision).toBeLessThanOrEqual(1);
  });

  it("recall is between 0 and 1", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.recall).toBeGreaterThanOrEqual(0);
    expect(result.recall).toBeLessThanOrEqual(1);
  });

  it("F1 score is between 0 and 1", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.f1_score).toBeGreaterThanOrEqual(0);
    expect(result.f1_score).toBeLessThanOrEqual(1);
  });

  it("F1 is the harmonic mean of precision and recall", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    if (result.precision > 0 && result.recall > 0) {
      const expectedF1 =
        (2 * result.precision * result.recall) /
        (result.precision + result.recall);
      expect(result.f1_score).toBeCloseTo(expectedF1, 1);
    }
  });

  it("sample_size is a non-negative integer", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.sample_size).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.sample_size)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* calibrate — weight adjustments                                              */
/* -------------------------------------------------------------------------- */

describe("calibrate — weight adjustments", () => {
  it("weight_adjustments is an object with signal names as keys", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(typeof result.weight_adjustments).toBe("object");
    expect(Object.keys(result.weight_adjustments).length).toBeGreaterThan(0);
  });

  it("all weight multipliers are between 0.5 and 1.5", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    for (const [, value] of Object.entries(result.weight_adjustments)) {
      expect(value).toBeGreaterThanOrEqual(0.5);
      expect(value).toBeLessThanOrEqual(1.5);
    }
  });

  it("covers all known signal names", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    const expectedSignals = [
      "vdp_views",
      "calculator_used",
      "form_started",
      "return_visits",
      "time_on_site",
      "price_checks",
      "scroll_depth",
      "specific_search",
      "comparison_behavior",
      "cta_clicked",
      "session_momentum",
      "page_views",
      "inventory_browsing",
      "social_proof",
      "chat_interaction",
      "copy_paste",
      "rage_clicks",
      "dead_clicks",
      "exit_no_conversion",
      "very_short_session",
      "single_page_bounce",
    ];
    for (const signal of expectedSignals) {
      expect(result.weight_adjustments).toHaveProperty(signal);
    }
  });

  it("strong predictors get weight >= 1.0", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    // In shadow mode, vdp_views, calculator_used, return_visits are boosted to 1.1
    expect(result.weight_adjustments["vdp_views"]).toBeGreaterThanOrEqual(1.0);
    expect(result.weight_adjustments["calculator_used"]).toBeGreaterThanOrEqual(1.0);
  });

  it("weak predictors get weight <= 1.0", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    // In shadow mode, scroll_depth and page_views are reduced to 0.9
    expect(result.weight_adjustments["scroll_depth"]).toBeLessThanOrEqual(1.0);
    expect(result.weight_adjustments["page_views"]).toBeLessThanOrEqual(1.0);
  });
});

/* -------------------------------------------------------------------------- */
/* calibrate — top predictive and misleading signals                           */
/* -------------------------------------------------------------------------- */

describe("calibrate — signal identification", () => {
  it("top_predictive_signals is a non-empty array of friendly names", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(Array.isArray(result.top_predictive_signals)).toBe(true);
    expect(result.top_predictive_signals.length).toBeGreaterThan(0);
    // Friendly names should be human-readable, not snake_case
    for (const name of result.top_predictive_signals) {
      expect(name).not.toMatch(/^[a-z_]+$/); // Should have spaces/caps
    }
  });

  it("top_misleading_signals is a non-empty array", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(Array.isArray(result.top_misleading_signals)).toBe(true);
    expect(result.top_misleading_signals.length).toBeGreaterThan(0);
  });

  it("predictive and misleading lists do not overlap", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    const predictiveSet = new Set(result.top_predictive_signals);
    for (const misleading of result.top_misleading_signals) {
      expect(predictiveSet.has(misleading)).toBe(false);
    }
  });

  it("at most 5 signals in each list", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(result.top_predictive_signals.length).toBeLessThanOrEqual(5);
    expect(result.top_misleading_signals.length).toBeLessThanOrEqual(5);
  });
});

/* -------------------------------------------------------------------------- */
/* calibrate — recommendations                                                */
/* -------------------------------------------------------------------------- */

describe("calibrate — recommendations", () => {
  it("returns plain-English recommendations", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(typeof rec).toBe("string");
      expect(rec.length).toBeGreaterThan(10);
    }
  });

  it("recommendations do not contain technical jargon", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    for (const rec of result.recommendations) {
      expect(rec).not.toMatch(/null|undefined|NaN|error|exception/i);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* calibrate — calibrated_at timestamp                                         */
/* -------------------------------------------------------------------------- */

describe("calibrate — timestamp", () => {
  it("calibrated_at is a valid ISO timestamp", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    const date = new Date(result.calibrated_at);
    expect(date.getTime()).not.toBeNaN();
    // Should be recent (within the last minute)
    expect(Date.now() - date.getTime()).toBeLessThan(60_000);
  });
});

/* -------------------------------------------------------------------------- */
/* getWeightMultipliers — shadow mode                                          */
/* -------------------------------------------------------------------------- */

describe("getWeightMultipliers — shadow mode", () => {
  it("returns default multipliers of 1.0 for all signals", async () => {
    const multipliers = await getWeightMultipliers(DEMO_DEALER_ID);
    expect(typeof multipliers).toBe("object");
    for (const [, value] of Object.entries(multipliers)) {
      expect(value).toBe(1.0);
    }
  });

  it("covers all signal names", async () => {
    const multipliers = await getWeightMultipliers(DEMO_DEALER_ID);
    expect(Object.keys(multipliers).length).toBe(21);
  });
});

/* -------------------------------------------------------------------------- */
/* getCalibrationHistory — shadow mode                                         */
/* -------------------------------------------------------------------------- */

describe("getCalibrationHistory — shadow mode", () => {
  it("returns an array of past calibrations", async () => {
    const history = await getCalibrationHistory(DEMO_DEALER_ID);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it("each history entry is a valid CalibrationResult", async () => {
    const history = await getCalibrationHistory(DEMO_DEALER_ID);
    for (const entry of history) {
      expect(entry.accuracy).toBeGreaterThanOrEqual(0);
      expect(entry.accuracy).toBeLessThanOrEqual(1);
      expect(typeof entry.weight_adjustments).toBe("object");
      expect(Array.isArray(entry.recommendations)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("CalibrationResult is fully JSON-serializable for EventCollector", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    const serialized = JSON.stringify(result);
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(parsed.accuracy).toBe(result.accuracy);
    expect(parsed.precision).toBe(result.precision);
    expect(parsed.recall).toBe(result.recall);
    expect(parsed.f1_score).toBe(result.f1_score);
    expect(parsed.sample_size).toBe(result.sample_size);
    expect(Array.isArray(parsed.top_predictive_signals)).toBe(true);
    expect(Array.isArray(parsed.top_misleading_signals)).toBe(true);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
  });

  it("weight_adjustments values are all primitive numbers", async () => {
    const result = await calibrate(DEMO_DEALER_ID);
    for (const [key, value] of Object.entries(result.weight_adjustments)) {
      expect(typeof key).toBe("string");
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
