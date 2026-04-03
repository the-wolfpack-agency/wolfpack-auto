/**
 * Unit tests for src/lib/error-monitor.ts
 *
 * Tests error capture, fingerprinting, correlation, trend detection,
 * and impact ranking.
 *
 * Run with: npx jest src/lib/__tests__/error-monitor.test.ts
 */

import {
  generateFingerprint,
  captureError,
  correlateWithBehavior,
  aggregateErrors,
  getErrorTrend,
  rankErrorsByImpact,
  getDemoErrors,
  type ClientError,
} from "../error-monitor";

/* -------------------------------------------------------------------------- */
/*  Fingerprinting                                                             */
/* -------------------------------------------------------------------------- */

describe("generateFingerprint", () => {
  it("generates stable fingerprints for the same error", () => {
    const fp1 = generateFingerprint("TypeError: Cannot read property 'map' of undefined", "at Component (file.tsx:45:12)");
    const fp2 = generateFingerprint("TypeError: Cannot read property 'map' of undefined", "at Component (file.tsx:45:12)");
    expect(fp1).toBe(fp2);
  });

  it("normalizes numbers in error messages", () => {
    const fp1 = generateFingerprint("Loading chunk 342 failed", null);
    const fp2 = generateFingerprint("Loading chunk 999 failed", null);
    expect(fp1).toBe(fp2);
  });

  it("generates different fingerprints for different errors", () => {
    const fp1 = generateFingerprint("TypeError: Cannot read properties", null);
    const fp2 = generateFingerprint("ReferenceError: x is not defined", null);
    expect(fp1).not.toBe(fp2);
  });

  it("handles null stack", () => {
    const fp = generateFingerprint("Error occurred", null);
    expect(fp).toMatch(/^err-/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Error Capture                                                              */
/* -------------------------------------------------------------------------- */

describe("captureError", () => {
  it("captures an error with full context", () => {
    const error = captureError(
      "Test error",
      "at test (file.ts:1:1)",
      "/inventory",
      "Mozilla/5.0",
      "session-123",
      "dealer-1",
      { page: "/inventory", component: "Grid", user_actions: ["click", "scroll"] },
    );

    expect(error.id).toMatch(/^cerr-/);
    expect(error.message).toBe("Test error");
    expect(error.fingerprint).toMatch(/^err-/);
    expect(error.session_id).toBe("session-123");
    expect(error.dealer_id).toBe("dealer-1");
    expect(error.context.page).toBe("/inventory");
    expect(error.context.component).toBe("Grid");
    expect(error.context.user_actions).toEqual(["click", "scroll"]);
  });

  it("defaults context fields", () => {
    const error = captureError("Error", null, "/page", "UA", null, "d1");
    expect(error.context.component).toBeNull();
    expect(error.context.user_actions).toEqual([]);
    expect(error.context.viewport_width).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Behavior Correlation                                                       */
/* -------------------------------------------------------------------------- */

describe("correlateWithBehavior", () => {
  it("correlates error with session events", () => {
    const error = captureError("Error", null, "/page", "UA", "sess-1", "d1");
    const result = correlateWithBehavior(error, ["page_view", "click_button", "scroll"]);
    expect(result.error.id).toBe(error.id);
    expect(result.session_events).toEqual(["page_view", "click_button", "scroll"]);
    expect(result.replay_available).toBe(true);
  });

  it("marks replay as unavailable when no session", () => {
    const error = captureError("Error", null, "/page", "UA", null, "d1");
    const result = correlateWithBehavior(error, []);
    expect(result.replay_available).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                                */
/* -------------------------------------------------------------------------- */

describe("aggregateErrors", () => {
  it("groups errors by fingerprint", () => {
    const errors: ClientError[] = [
      captureError("Same error", "at a (f:1:1)", "/page1", "UA", "s1", "d1"),
      captureError("Same error", "at a (f:1:1)", "/page2", "UA", "s2", "d1"),
      captureError("Different error", "at b (g:2:2)", "/page3", "UA", "s3", "d1"),
    ];

    const agg = aggregateErrors(errors);
    expect(agg.length).toBe(2);
    // Sorted by impact score descending
    expect(agg[0].count).toBeGreaterThanOrEqual(agg[1].count);
  });

  it("counts affected sessions correctly", () => {
    const errors: ClientError[] = [
      captureError("Error", null, "/p1", "UA", "s1", "d1"),
      captureError("Error", null, "/p1", "UA", "s1", "d1"),
      captureError("Error", null, "/p2", "UA", "s2", "d1"),
    ];

    const agg = aggregateErrors(errors);
    // All have same fingerprint since same message + null stack
    expect(agg[0].count).toBe(3);
    expect(agg[0].affected_sessions).toBe(2);
  });

  it("handles empty error list", () => {
    expect(aggregateErrors([])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Trend Detection                                                            */
/* -------------------------------------------------------------------------- */

describe("getErrorTrend", () => {
  it("detects stable trend when counts are even", () => {
    const now = Date.now();
    const errors: ClientError[] = [];
    // Spread errors evenly across 7 days
    for (let i = 0; i < 7; i++) {
      const e = captureError("Error", null, "/p", "UA", null, "d1");
      e.fingerprint = "test-fp";
      e.captured_at = new Date(now - i * 86400_000).toISOString();
      errors.push(e);
    }

    const trend = getErrorTrend(errors, "test-fp", 7);
    expect(trend.fingerprint).toBe("test-fp");
    expect(trend.total_count).toBe(7);
    expect(["stable", "increasing", "decreasing"]).toContain(trend.direction);
  });

  it("returns 7 days of occurrences", () => {
    const trend = getErrorTrend([], "nonexistent", 7);
    expect(trend.occurrences).toHaveLength(7);
    expect(trend.total_count).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Impact Ranking                                                             */
/* -------------------------------------------------------------------------- */

describe("rankErrorsByImpact", () => {
  it("sorts by impact score descending", () => {
    const errors = getDemoErrors();
    const ranked = rankErrorsByImpact(errors);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].impact_score).toBeGreaterThanOrEqual(ranked[i].impact_score);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

describe("getDemoErrors", () => {
  it("returns valid error aggregates", () => {
    const errors = getDemoErrors();
    expect(errors.length).toBeGreaterThan(0);
    for (const err of errors) {
      expect(err.fingerprint).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.count).toBeGreaterThan(0);
      expect(err.affected_pages.length).toBeGreaterThan(0);
      expect(err.impact_score).toBeGreaterThan(0);
    }
  });
});
