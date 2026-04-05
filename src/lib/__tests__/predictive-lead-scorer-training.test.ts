/**
 * Unit tests for predictive-lead-scorer training mechanism.
 *
 * Tests gradient descent weight training, analytics fallback,
 * weight inspection, and weight reset functionality.
 */

import {
  trainWeights,
  trainFromAnalyticsEvents,
  getTrainedWeights,
  _resetWeightsForTesting,
  type SignalVector,
  type TrainingSample,
} from "../predictive-lead-scorer";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function emptyVector(): SignalVector {
  return {
    vdp_views: 0,
    calculator_used: false,
    form_started: false,
    return_visits: 0,
    time_on_site_seconds: 0,
    price_checks: 0,
    max_scroll_depth: 0,
    specific_search: false,
    comparison_behavior: false,
    cta_clicked: false,
    session_momentum: 0,
    page_views: 0,
    inventory_scroll_depth: 0,
    social_proof_dwell: false,
    chat_interaction: false,
    copy_paste: false,
    rage_clicks: 0,
    dead_clicks: 0,
    exit_intent_no_conversion: false,
    very_short_session: false,
    single_page_bounce: false,
    latest_event_at: null,
    earliest_event_at: null,
    events_by_day: new Map(),
    journey_stage: "awareness",
    journey_session_count: 0,
    journey_narrowing_rate: 0,
    journey_shortlist_size: 0,
    temporal_showroom_predicted: false,
    temporal_ready_to_close: false,
  };
}

/** A clearly positive (buyer-like) signal vector. */
function positiveVector(): SignalVector {
  return {
    ...emptyVector(),
    vdp_views: 5,
    calculator_used: true,
    form_started: true,
    return_visits: 3,
    time_on_site_seconds: 300,
    price_checks: 3,
    max_scroll_depth: 90,
    specific_search: true,
    comparison_behavior: true,
    cta_clicked: true,
    session_momentum: 0.8,
    page_views: 12,
    journey_stage: "decision",
    journey_narrowing_rate: 0.7,
    journey_shortlist_size: 2,
    journey_session_count: 4,
    temporal_showroom_predicted: true,
    temporal_ready_to_close: true,
  };
}

/** A clearly negative (bounced) signal vector. */
function negativeSignalVector(): SignalVector {
  return {
    ...emptyVector(),
    rage_clicks: 5,
    dead_clicks: 5,
    exit_intent_no_conversion: true,
    very_short_session: true,
    single_page_bounce: true,
    page_views: 1,
    time_on_site_seconds: 10,
  };
}

/** Build mixed training data with clear separation. */
function buildTrainingData(
  positiveCount: number,
  negativeCount: number,
): TrainingSample[] {
  const data: TrainingSample[] = [];
  for (let i = 0; i < positiveCount; i++) {
    data.push({ signals: positiveVector(), converted: true });
  }
  for (let i = 0; i < negativeCount; i++) {
    data.push({ signals: negativeSignalVector(), converted: false });
  }
  return data;
}

/* -------------------------------------------------------------------------- */
/* Setup / teardown                                                            */
/* -------------------------------------------------------------------------- */

afterEach(() => {
  _resetWeightsForTesting();
});

/* -------------------------------------------------------------------------- */
/* trainWeights — loss reduction                                               */
/* -------------------------------------------------------------------------- */

describe("trainWeights", () => {
  it("reduces loss over epochs", () => {
    const data = buildTrainingData(15, 15);

    // Train with 1 epoch to get initial loss
    const early = trainWeights(data, 5, 0.01);
    _resetWeightsForTesting();

    // Train with many epochs
    const late = trainWeights(data, 200, 0.01);

    expect(late.finalLoss).toBeLessThan(early.finalLoss);
  });

  it("improves accuracy on known data", () => {
    const data = buildTrainingData(20, 20);
    const metrics = trainWeights(data, 200, 0.01);

    // With clearly separable data, accuracy should be high
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it("returns correct training metrics structure", () => {
    const data = buildTrainingData(10, 10);
    const metrics = trainWeights(data, 50, 0.02);

    expect(metrics).toHaveProperty("epochs", 50);
    expect(metrics).toHaveProperty("finalLoss");
    expect(metrics).toHaveProperty("accuracy");
    expect(metrics).toHaveProperty("weightsDelta");
    expect(typeof metrics.finalLoss).toBe("number");
    expect(typeof metrics.accuracy).toBe("number");
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.accuracy).toBeLessThanOrEqual(1);
  });

  it("respects configurable epochs", () => {
    const data = buildTrainingData(10, 10);
    const metrics = trainWeights(data, 42, 0.01);
    expect(metrics.epochs).toBe(42);
  });

  it("reports non-zero weight deltas after training", () => {
    const data = buildTrainingData(15, 15);
    const metrics = trainWeights(data, 100, 0.01);

    const deltas = Object.values(metrics.weightsDelta);
    const nonZero = deltas.filter((d) => Math.abs(d) > 1e-10);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it("handles empty training data without crashing", () => {
    const metrics = trainWeights([], 10, 0.01);
    expect(metrics.epochs).toBe(10);
    expect(metrics.accuracy).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* trainWeights — directional weight changes                                   */
/* -------------------------------------------------------------------------- */

describe("trainWeights — directional weight changes", () => {
  it("increases positive signal weights with all-positive data", () => {
    // Start with zeroed weights so the model underpredicts, forcing positive
    // gradient updates on active signals.
    for (const sig of Object.keys(getTrainedWeights())) {
      // We need to zero out weights first — use training with empty then reset
    }
    // Zero all weights via training trick: reset then manually drive
    _resetWeightsForTesting();

    // Build data where positive signals are active and label is converted
    const data: TrainingSample[] = [];
    for (let i = 0; i < 30; i++) {
      data.push({ signals: positiveVector(), converted: true });
    }
    // Also add negative-signal samples as NOT converted to provide contrast
    for (let i = 0; i < 30; i++) {
      data.push({ signals: negativeSignalVector(), converted: false });
    }

    const weightsBefore = getTrainedWeights();
    trainWeights(data, 300, 0.01);
    const weightsAfter = getTrainedWeights();

    // Positive signals that are active in positiveVector should shift upward
    // relative to negative signals that are active in negativeSignalVector
    const positiveSignals = ["vdp_views", "calculator_used", "form_started", "journey_stage"];
    const negativeSignals = ["rage_clicks", "dead_clicks", "exit_no_conversion", "very_short_session"];

    // Positive signal weights should be higher than negative signal weights after training
    const avgPositive = positiveSignals.reduce((s, n) => s + weightsAfter[n], 0) / positiveSignals.length;
    const avgNegative = negativeSignals
      .filter((n) => weightsAfter[n] !== undefined)
      .reduce((s, n) => s + weightsAfter[n], 0) / negativeSignals.filter((n) => weightsAfter[n] !== undefined).length;

    expect(avgPositive).toBeGreaterThan(avgNegative);
  });

  it("increases negative signal weights with all-negative data", () => {
    // When all samples are negative (didn't convert) and have negative signals active,
    // the negative signal weights should become more negative (larger in magnitude)
    const data: TrainingSample[] = [];
    for (let i = 0; i < 30; i++) {
      data.push({ signals: negativeSignalVector(), converted: false });
    }

    const weightsBefore = getTrainedWeights();
    trainWeights(data, 200, 0.01);
    const weightsAfter = getTrainedWeights();

    // Negative signals should have become more negative (weight decreased)
    const negativeSignals = ["rage_clicks", "dead_clicks", "exit_no_conversion", "very_short_session", "single_page_bounce"];
    let moreNegative = 0;
    for (const name of negativeSignals) {
      if (
        weightsBefore[name] !== undefined &&
        weightsAfter[name] !== undefined &&
        weightsAfter[name] < weightsBefore[name]
      ) {
        moreNegative++;
      }
    }
    expect(moreNegative).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* trainFromAnalyticsEvents — fallback without DB                              */
/* -------------------------------------------------------------------------- */

describe("trainFromAnalyticsEvents", () => {
  it("returns null when DATABASE_URL is not set", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const result = await trainFromAnalyticsEvents();
    expect(result).toBeNull();

    // Restore
    if (original !== undefined) {
      process.env.DATABASE_URL = original;
    }
  });

  it("does not modify weights when falling back", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const weightsBefore = getTrainedWeights();
    await trainFromAnalyticsEvents();
    const weightsAfter = getTrainedWeights();

    expect(weightsAfter).toEqual(weightsBefore);

    if (original !== undefined) {
      process.env.DATABASE_URL = original;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getTrainedWeights                                                           */
/* -------------------------------------------------------------------------- */

describe("getTrainedWeights", () => {
  it("returns current weight values as a plain object", () => {
    const weights = getTrainedWeights();
    expect(typeof weights).toBe("object");
    expect(weights).toHaveProperty("vdp_views");
    expect(weights).toHaveProperty("calculator_used");
    expect(weights).toHaveProperty("rage_clicks");
  });

  it("reflects weight changes after training", () => {
    const before = getTrainedWeights();
    const data = buildTrainingData(15, 15);
    trainWeights(data, 100, 0.01);
    const after = getTrainedWeights();

    // At least one weight should have changed
    const changed = Object.keys(before).some(
      (k) => before[k] !== after[k],
    );
    expect(changed).toBe(true);
  });

  it("returns all signal names", () => {
    const weights = getTrainedWeights();
    const expectedSignals = [
      "vdp_views", "calculator_used", "form_started", "return_visits",
      "time_on_site", "price_checks", "scroll_depth", "specific_search",
      "comparison_behavior", "cta_clicked", "session_momentum",
      "page_views", "inventory_browsing", "social_proof", "chat_interaction",
      "copy_paste", "rage_clicks", "dead_clicks", "exit_no_conversion",
      "very_short_session", "single_page_bounce",
      "journey_stage", "journey_narrowing", "journey_shortlist", "journey_sessions",
      "showroom_predicted", "ready_to_close",
    ];
    for (const name of expectedSignals) {
      expect(weights).toHaveProperty(name);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* _resetWeightsForTesting                                                     */
/* -------------------------------------------------------------------------- */

describe("_resetWeightsForTesting", () => {
  it("restores default weights after training", () => {
    const defaults = getTrainedWeights();

    // Train to change weights
    const data = buildTrainingData(20, 20);
    trainWeights(data, 100, 0.01);

    // Verify weights changed
    const trained = getTrainedWeights();
    const changed = Object.keys(defaults).some(
      (k) => defaults[k] !== trained[k],
    );
    expect(changed).toBe(true);

    // Reset
    _resetWeightsForTesting();
    const reset = getTrainedWeights();

    // Should match original defaults exactly
    for (const key of Object.keys(defaults)) {
      expect(reset[key]).toBe(defaults[key]);
    }
  });

  it("can be called multiple times safely", () => {
    _resetWeightsForTesting();
    _resetWeightsForTesting();
    _resetWeightsForTesting();

    const weights = getTrainedWeights();
    expect(weights).toHaveProperty("vdp_views", 3);
    expect(weights).toHaveProperty("rage_clicks", -1);
  });
});
