/**
 * Unit tests for src/lib/predictive-lead-scorer.ts
 *
 * Tests scoring algorithm, signal weights, temporal decay, buy window
 * calculation, confidence levels, and edge cases.
 *
 * Run with: npx jest src/lib/__tests__/predictive-lead-scorer.test.ts
 */

import {
  aggregateSignals,
  computeScore,
  type SignalVector,
  type PredictiveScore,
} from "../predictive-lead-scorer";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Build a minimal signal vector with all fields zeroed/false. */
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

/** Build a high-intent "hot" signal vector. */
function hotVector(): SignalVector {
  const now = new Date();
  return {
    ...emptyVector(),
    vdp_views: 6,
    calculator_used: true,
    form_started: true,
    return_visits: 4,
    time_on_site_seconds: 600,
    price_checks: 5,
    max_scroll_depth: 90,
    specific_search: true,
    comparison_behavior: true,
    cta_clicked: true,
    session_momentum: 0.9,
    page_views: 15,
    inventory_scroll_depth: 80,
    social_proof_dwell: true,
    chat_interaction: true,
    copy_paste: true,
    latest_event_at: now,
    earliest_event_at: new Date(now.getTime() - 600_000),
    events_by_day: new Map([[now.toISOString().slice(0, 10), 20]]),
  };
}

/** Build a negative-only signal vector. */
function negativeVector(): SignalVector {
  const now = new Date();
  return {
    ...emptyVector(),
    rage_clicks: 10,
    dead_clicks: 10,
    exit_intent_no_conversion: true,
    very_short_session: true,
    single_page_bounce: true,
    latest_event_at: now,
    earliest_event_at: now,
    events_by_day: new Map(),
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "page_view",
    action: "",
    page: "/",
    session_id: "sess-1",
    user_fingerprint: "fp-1",
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* computeScore — score range & structure                                      */
/* -------------------------------------------------------------------------- */

describe("computeScore", () => {
  it("returns a well-formed PredictiveScore object", () => {
    const result = computeScore(emptyVector());
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("probability");
    expect(result).toHaveProperty("buy_window");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("top_signals");
    expect(result).toHaveProperty("recommended_action");
    expect(result).toHaveProperty("temperature");
  });

  it("score is always between 0 and 100", () => {
    const empty = computeScore(emptyVector());
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);

    const hot = computeScore(hotVector());
    expect(hot.score).toBeGreaterThanOrEqual(0);
    expect(hot.score).toBeLessThanOrEqual(100);

    const neg = computeScore(negativeVector());
    expect(neg.score).toBeGreaterThanOrEqual(0);
    expect(neg.score).toBeLessThanOrEqual(100);
  });

  it("probability matches score / 100", () => {
    const result = computeScore(hotVector());
    expect(result.probability).toBe(Math.round((result.score / 100) * 100) / 100);
  });
});

/* -------------------------------------------------------------------------- */
/* computeScore — no signals (cold lead)                                      */
/* -------------------------------------------------------------------------- */

describe("computeScore — no signals", () => {
  it("produces a low score for an empty vector", () => {
    const result = computeScore(emptyVector());
    expect(result.score).toBeLessThan(30);
    expect(result.temperature).toBe("cold");
    expect(result.confidence).toBe("low");
    expect(result.buy_window).toBe("30d+");
  });

  it("sets top_signals to fallback message when no data", () => {
    const result = computeScore(emptyVector());
    expect(result.top_signals).toContain("Limited behavioral data available");
  });
});

/* -------------------------------------------------------------------------- */
/* computeScore — all signals maxed (hot lead)                                */
/* -------------------------------------------------------------------------- */

describe("computeScore — all signals maxed", () => {
  it("produces a high score for a fully engaged visitor", () => {
    const result = computeScore(hotVector());
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.temperature).toMatch(/^(hot|warm)$/);
  });

  it("has high confidence with 6+ signals present", () => {
    const result = computeScore(hotVector());
    expect(result.confidence).toBe("high");
  });

  it("recommends immediate action for high scores", () => {
    const result = computeScore(hotVector());
    if (result.score >= 80) {
      expect(result.recommended_action).toBe("Call immediately");
    } else if (result.score >= 65) {
      expect(result.recommended_action).toBe("Send financing offer");
    }
  });

  it("returns multiple top_signals for a rich vector", () => {
    const result = computeScore(hotVector());
    expect(result.top_signals.length).toBeGreaterThan(1);
    expect(result.top_signals.length).toBeLessThanOrEqual(5);
  });
});

/* -------------------------------------------------------------------------- */
/* computeScore — negative signals only                                       */
/* -------------------------------------------------------------------------- */

describe("computeScore — negative signals", () => {
  it("penalizes frustrated/bounced visitors", () => {
    const neg = computeScore(negativeVector());
    const empty = computeScore(emptyVector());
    // Negative vector should score lower than (or equal to) empty
    expect(neg.score).toBeLessThanOrEqual(empty.score);
  });

  it("labels pure negative visitors as cold", () => {
    const result = computeScore(negativeVector());
    expect(result.temperature).toBe("cold");
  });
});

/* -------------------------------------------------------------------------- */
/* computeScore — buy window thresholds                                       */
/* -------------------------------------------------------------------------- */

describe("computeScore — buy window mapping", () => {
  it("maps score >= 80 to 24h buy window", () => {
    const v = hotVector();
    const result = computeScore(v);
    if (result.score >= 80) {
      expect(result.buy_window).toBe("24h");
    }
  });

  it("maps low scores to 30d+ buy window", () => {
    const result = computeScore(emptyVector());
    expect(result.buy_window).toBe("30d+");
  });
});

/* -------------------------------------------------------------------------- */
/* computeScore — confidence levels                                           */
/* -------------------------------------------------------------------------- */

describe("computeScore — confidence levels", () => {
  it("returns low confidence with 0-2 signals", () => {
    const v = emptyVector();
    v.page_views = 5; // only 1 signal
    const result = computeScore(v);
    expect(result.confidence).toBe("low");
  });

  it("returns medium confidence with 3-5 signals", () => {
    const v = emptyVector();
    v.vdp_views = 3;
    v.page_views = 5;
    v.time_on_site_seconds = 120;
    v.latest_event_at = new Date();
    v.earliest_event_at = new Date(Date.now() - 120_000);
    const result = computeScore(v);
    expect(result.confidence).toBe("medium");
  });
});

/* -------------------------------------------------------------------------- */
/* computeScore — temporal decay                                              */
/* -------------------------------------------------------------------------- */

describe("computeScore — temporal decay", () => {
  it("scores higher for recent events than stale events", () => {
    const recent = hotVector();
    recent.latest_event_at = new Date();

    const stale = hotVector();
    stale.latest_event_at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    const recentScore = computeScore(recent);
    const staleScore = computeScore(stale);

    expect(recentScore.score).toBeGreaterThan(staleScore.score);
  });

  it("does not apply decay to negative signals", () => {
    // Negative signals should always penalize regardless of age
    const neg = negativeVector();
    neg.latest_event_at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = computeScore(neg);
    expect(result.score).toBeLessThan(30);
  });
});

/* -------------------------------------------------------------------------- */
/* aggregateSignals — empty events                                            */
/* -------------------------------------------------------------------------- */

describe("aggregateSignals", () => {
  it("returns a zeroed vector for empty event list", () => {
    const v = aggregateSignals([]);
    expect(v.vdp_views).toBe(0);
    expect(v.calculator_used).toBe(false);
    expect(v.form_started).toBe(false);
    expect(v.return_visits).toBe(0);
    expect(v.page_views).toBe(0);
    expect(v.latest_event_at).toBeNull();
    expect(v.earliest_event_at).toBeNull();
  });

  it("counts page_view events", () => {
    const events = [
      makeEvent({ event_type: "page_view", page: "/" }),
      makeEvent({ event_type: "page_view", page: "/about" }),
      makeEvent({ event_type: "page_view", page: "/contact" }),
    ];
    const v = aggregateSignals(events);
    expect(v.page_views).toBe(3);
  });

  it("detects VDP views from inventory page URLs", () => {
    const events = [
      makeEvent({ event_type: "page_view", page: "/inventory/vin-123" }),
      makeEvent({ event_type: "page_view", page: "/inventory/vin-456" }),
    ];
    const v = aggregateSignals(events);
    expect(v.vdp_views).toBe(2);
  });

  it("detects VDP views from vehicle_view action", () => {
    const events = [
      makeEvent({ action: "vehicle_view", metadata: { vin: "VIN1" } }),
    ];
    const v = aggregateSignals(events);
    expect(v.vdp_views).toBe(1);
  });

  it("detects calculator usage", () => {
    const events = [
      makeEvent({ action: "retail.calculator_used", event_type: "retail" }),
    ];
    const v = aggregateSignals(events);
    expect(v.calculator_used).toBe(true);
  });

  it("detects form interactions", () => {
    const events = [
      makeEvent({ action: "form_start", event_type: "form_interaction" }),
    ];
    const v = aggregateSignals(events);
    expect(v.form_started).toBe(true);
  });

  it("counts return visits from distinct sessions", () => {
    const events = [
      makeEvent({ session_id: "s1" }),
      makeEvent({ session_id: "s2" }),
      makeEvent({ session_id: "s3" }),
    ];
    const v = aggregateSignals(events);
    expect(v.return_visits).toBe(2); // sessions - 1
  });

  it("detects specific search with make/model", () => {
    const events = [
      makeEvent({
        event_type: "search",
        action: "search",
        metadata: { query: "2024 Toyota Camry" },
      }),
    ];
    const v = aggregateSignals(events);
    expect(v.specific_search).toBe(true);
  });

  it("does not flag generic search as specific", () => {
    const events = [
      makeEvent({
        event_type: "search",
        action: "search",
        metadata: { query: "cheap cars" },
      }),
    ];
    const v = aggregateSignals(events);
    expect(v.specific_search).toBe(false);
  });

  it("detects comparison behavior from 3+ vehicles viewed", () => {
    const events = [
      makeEvent({ action: "vehicle_view", metadata: { vin: "V1" } }),
      makeEvent({ action: "vehicle_view", metadata: { vin: "V2" } }),
      makeEvent({ action: "vehicle_view", metadata: { vin: "V3" } }),
    ];
    const v = aggregateSignals(events);
    expect(v.comparison_behavior).toBe(true);
  });

  it("detects CTA clicks", () => {
    const events = [makeEvent({ action: "cta_click_financing" })];
    const v = aggregateSignals(events);
    expect(v.cta_clicked).toBe(true);
  });

  it("detects chat interaction", () => {
    const events = [makeEvent({ event_type: "chat_message" })];
    const v = aggregateSignals(events);
    expect(v.chat_interaction).toBe(true);
  });

  it("detects copy/paste behavior", () => {
    const events = [makeEvent({ action: "copy_vin" })];
    const v = aggregateSignals(events);
    expect(v.copy_paste).toBe(true);
  });

  it("detects rage clicks", () => {
    const events = [
      makeEvent({ action: "rage_click" }),
      makeEvent({ action: "rage_click" }),
    ];
    const v = aggregateSignals(events);
    expect(v.rage_clicks).toBe(2);
  });

  it("detects dead clicks", () => {
    const events = [makeEvent({ action: "dead_click" })];
    const v = aggregateSignals(events);
    expect(v.dead_clicks).toBe(1);
  });

  it("flags very_short_session when total time < 30s", () => {
    const now = new Date();
    const events = [
      makeEvent({ timestamp: now.toISOString() }),
      makeEvent({ timestamp: new Date(now.getTime() + 10_000).toISOString() }),
    ];
    const v = aggregateSignals(events);
    expect(v.very_short_session).toBe(true);
  });

  it("flags single_page_bounce for 1 page + no conversion", () => {
    const events = [
      makeEvent({ event_type: "page_view", page: "/inventory" }),
    ];
    const v = aggregateSignals(events);
    expect(v.single_page_bounce).toBe(true);
  });

  it("does not flag single_page_bounce when conversion occurred", () => {
    const events = [
      makeEvent({ event_type: "page_view", page: "/inventory" }),
      makeEvent({ action: "form_submit" }),
    ];
    const v = aggregateSignals(events);
    expect(v.single_page_bounce).toBe(false);
  });

  it("tracks temporal metadata (earliest/latest/events_by_day)", () => {
    const d1 = "2026-03-28T10:00:00Z";
    const d2 = "2026-03-29T14:00:00Z";
    const events = [
      makeEvent({ timestamp: d1 }),
      makeEvent({ timestamp: d2 }),
    ];
    const v = aggregateSignals(events);
    expect(v.earliest_event_at).toEqual(new Date(d1));
    expect(v.latest_event_at).toEqual(new Date(d2));
    expect(v.events_by_day.get("2026-03-28")).toBe(1);
    expect(v.events_by_day.get("2026-03-29")).toBe(1);
  });

  it("computes time_on_site from event span when no dwell metadata", () => {
    const now = new Date();
    const events = [
      makeEvent({ timestamp: now.toISOString() }),
      makeEvent({ timestamp: new Date(now.getTime() + 180_000).toISOString() }),
    ];
    const v = aggregateSignals(events);
    expect(v.time_on_site_seconds).toBe(180);
  });

  it("uses duration_ms metadata for time_on_site when available", () => {
    const events = [
      makeEvent({ metadata: { duration_ms: 60000 } }),
      makeEvent({ metadata: { duration_ms: 30000 } }),
    ];
    const v = aggregateSignals(events);
    expect(v.time_on_site_seconds).toBe(90);
  });

  it("tracks scroll depth and keeps max value", () => {
    const events = [
      makeEvent({ event_type: "scroll", metadata: { depth: 30 } }),
      makeEvent({ event_type: "scroll", metadata: { depth: 85 } }),
      makeEvent({ event_type: "scroll", metadata: { depth: 50 } }),
    ];
    const v = aggregateSignals(events);
    expect(v.max_scroll_depth).toBe(85);
  });

  it("tracks price checks per vehicle", () => {
    const events = [
      makeEvent({ action: "price_check", metadata: { vin: "V1" } }),
      makeEvent({ action: "price_check", metadata: { vin: "V1" } }),
      makeEvent({ action: "price_check", metadata: { vin: "V1" } }),
      makeEvent({ action: "price_check", metadata: { vin: "V2" } }),
    ];
    const v = aggregateSignals(events);
    expect(v.price_checks).toBe(3); // max per vehicle
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility — PredictiveScore structure                         */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("PredictiveScore fields are compatible with EventCollector metadata", () => {
    const result = computeScore(hotVector());

    // These fields should be serializable as analytics event metadata
    const payload = {
      score: result.score,
      probability: result.probability,
      buy_window: result.buy_window,
      confidence: result.confidence,
      temperature: result.temperature,
      top_signals: result.top_signals,
      recommended_action: result.recommended_action,
    };

    // All values must be JSON-serializable (no undefined, no functions, no Maps)
    const serialized = JSON.stringify(payload);
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(parsed.score).toBe(result.score);
    expect(parsed.temperature).toBe(result.temperature);
    expect(Array.isArray(parsed.top_signals)).toBe(true);
  });

  it("temperature is always one of the valid enum values", () => {
    const validTemps = ["hot", "warm", "cool", "cold"];
    const vectors = [emptyVector(), hotVector(), negativeVector()];
    for (const v of vectors) {
      const result = computeScore(v);
      expect(validTemps).toContain(result.temperature);
    }
  });

  it("buy_window is always one of the valid enum values", () => {
    const validWindows = ["24h", "3d", "7d", "14d", "30d+"];
    const vectors = [emptyVector(), hotVector(), negativeVector()];
    for (const v of vectors) {
      const result = computeScore(v);
      expect(validWindows).toContain(result.buy_window);
    }
  });

  it("confidence is always one of the valid enum values", () => {
    const validConf = ["high", "medium", "low"];
    const vectors = [emptyVector(), hotVector(), negativeVector()];
    for (const v of vectors) {
      const result = computeScore(v);
      expect(validConf).toContain(result.confidence);
    }
  });
});
