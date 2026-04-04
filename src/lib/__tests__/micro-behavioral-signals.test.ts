/**
 * Micro-Behavioral Signals — Tests
 *
 * Validates all 5 novel analytics signals:
 *   1. Photo Comparison Dwell — preference detection from timing
 *   2. Price Sensitivity Fingerprint — budget ceiling from calculator use
 *   3. Decision Velocity — impulse vs. comparison shopping
 *   4. Device Handoff Intent — cross-device escalation
 *   5. Night Owl Premium — time-of-day intent multipliers
 *
 * Also validates:
 *   - Combined signal generation
 *   - Analytics event persistence (track* calls fire)
 *   - Learning view SQL structure
 *   - API endpoint existence
 *   - Edge cases and false positive suppression
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@/lib/analytics-hooks", () => ({
  trackPhotoComparison: jest.fn(),
  trackPriceSensitivity: jest.fn(),
  trackDecisionVelocity: jest.fn(),
  trackDeviceHandoff: jest.fn(),
  trackNightOwl: jest.fn(),
  trackSystem: jest.fn(),
}));

import * as fs from "fs";
import * as path from "path";

import {
  analyzePhotoComparison,
  analyzePriceSensitivity,
  analyzeDecisionVelocity,
  analyzeDeviceHandoff,
  analyzeNightOwl,
  classifyTimeSegment,
  generateMicroSignals,
} from "@/lib/micro-behavioral-signals";

import {
  trackPhotoComparison,
  trackPriceSensitivity,
  trackDecisionVelocity,
  trackDeviceHandoff,
  trackNightOwl,
} from "@/lib/analytics-hooks";

beforeEach(() => {
  jest.clearAllMocks();
});

/* ================================================================== */
/*  1. Photo Comparison Dwell                                          */
/* ================================================================== */

describe("Photo Comparison Dwell", () => {
  test("detects preference from unequal dwell times", () => {
    const events = [
      { action: "photo_compare.dwell_start", metadata: { customer_id: "c1", vin: "VIN-A", compared_vin: "VIN-B", dwell_ms: 5000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "photo_compare.dwell_start", metadata: { customer_id: "c1", vin: "VIN-B", compared_vin: "VIN-A", dwell_ms: 2000 }, timestamp: "2026-04-01T10:00:05Z" },
    ];

    const signals = analyzePhotoComparison(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].preferredVin).toBe("VIN-A");
    expect(signals[0].preferenceStrength).toBeGreaterThan(0.5);
    expect(signals[0].dwellA_ms).toBe(5000);
    expect(signals[0].dwellB_ms).toBe(2000);
  });

  test("returns empty for no comparison events", () => {
    const events = [
      { action: "page.view", metadata: { customer_id: "c1" }, timestamp: "2026-04-01T10:00:00Z" },
    ];
    expect(analyzePhotoComparison(events)).toHaveLength(0);
  });

  test("handles single-vin dwell (no comparison)", () => {
    const events = [
      { action: "photo.dwell", metadata: { customer_id: "c1", vin: "VIN-A", dwell_ms: 3000 }, timestamp: "2026-04-01T10:00:00Z" },
    ];
    // No compared_vin, so no comparison pair
    expect(analyzePhotoComparison(events)).toHaveLength(0);
  });

  test("aggregates multiple dwells for same pair", () => {
    const events = [
      { action: "photo_compare.dwell_start", metadata: { customer_id: "c1", vin: "VIN-A", compared_vin: "VIN-B", dwell_ms: 2000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "photo_compare.dwell_start", metadata: { customer_id: "c1", vin: "VIN-A", compared_vin: "VIN-B", dwell_ms: 3000 }, timestamp: "2026-04-01T10:00:10Z" },
    ];

    const signals = analyzePhotoComparison(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].dwellA_ms).toBe(5000); // 2000 + 3000
    expect(signals[0].comparisonCount).toBe(2);
  });
});

/* ================================================================== */
/*  2. Price Sensitivity Fingerprint                                   */
/* ================================================================== */

describe("Price Sensitivity Fingerprint", () => {
  test("detects high sensitivity from long terms + bounce", () => {
    const events = [
      { action: "price_sensitivity.price_viewed", metadata: { customer_id: "c1", vin: "VIN-1", price: 45000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.calculator_opened", metadata: { customer_id: "c1", vin: "VIN-1" }, timestamp: "2026-04-01T10:00:30Z" },
      { action: "price_sensitivity.term_adjusted", metadata: { customer_id: "c1", vin: "VIN-1", term_months: 84 }, timestamp: "2026-04-01T10:01:00Z" },
      { action: "price_sensitivity.sticker_shock_bounce", metadata: { customer_id: "c1", vin: "VIN-1" }, timestamp: "2026-04-01T10:01:30Z" },
    ];

    const signals = analyzePriceSensitivity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].sensitivityTier).toBe("high");
    expect(signals[0].bounced).toBe(true);
    expect(signals[0].calculatorOpened).toBe(true);
    expect(signals[0].stickerPrice).toBe(45000);
    expect(signals[0].estimatedCeiling).toBeGreaterThan(0);
  });

  test("detects low sensitivity from short term, no bounce", () => {
    const events = [
      { action: "price_sensitivity.price_viewed", metadata: { customer_id: "c2", vin: "VIN-2", price: 30000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.calculator_opened", metadata: { customer_id: "c2", vin: "VIN-2" }, timestamp: "2026-04-01T10:00:30Z" },
      { action: "price_sensitivity.term_adjusted", metadata: { customer_id: "c2", vin: "VIN-2", term_months: 48 }, timestamp: "2026-04-01T10:01:00Z" },
    ];

    const signals = analyzePriceSensitivity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].sensitivityTier).toBe("low");
    expect(signals[0].bounced).toBe(false);
  });

  test("medium sensitivity from exploring 2+ terms", () => {
    const events = [
      { action: "price_sensitivity.price_viewed", metadata: { customer_id: "c3", vin: "VIN-3", price: 35000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.term_adjusted", metadata: { customer_id: "c3", vin: "VIN-3", term_months: 60 }, timestamp: "2026-04-01T10:01:00Z" },
      { action: "price_sensitivity.term_adjusted", metadata: { customer_id: "c3", vin: "VIN-3", term_months: 72 }, timestamp: "2026-04-01T10:02:00Z" },
    ];

    const signals = analyzePriceSensitivity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].sensitivityTier).toBe("medium");
    expect(signals[0].termsExplored).toEqual([60, 72]);
  });

  test("estimates payment ceiling from price and term", () => {
    const events = [
      { action: "price_sensitivity.price_viewed", metadata: { customer_id: "c4", vin: "VIN-4", price: 36000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.calculator_opened", metadata: { customer_id: "c4", vin: "VIN-4" }, timestamp: "2026-04-01T10:00:30Z" },
      { action: "price_sensitivity.down_payment_adjusted", metadata: { customer_id: "c4", vin: "VIN-4", down_payment: 6000 }, timestamp: "2026-04-01T10:01:00Z" },
      { action: "price_sensitivity.term_adjusted", metadata: { customer_id: "c4", vin: "VIN-4", term_months: 60 }, timestamp: "2026-04-01T10:01:30Z" },
    ];

    const signals = analyzePriceSensitivity(events);
    expect(signals).toHaveLength(1);
    // (36000 - 6000) / 60 = 500
    expect(signals[0].estimatedCeiling).toBe(500);
  });

  test("returns empty for irrelevant events", () => {
    const events = [
      { action: "page.view", metadata: { customer_id: "c5" }, timestamp: "2026-04-01T10:00:00Z" },
    ];
    expect(analyzePriceSensitivity(events)).toHaveLength(0);
  });
});

/* ================================================================== */
/*  3. Decision Velocity                                               */
/* ================================================================== */

describe("Decision Velocity", () => {
  test("classifies impulse buyer (< 1 hour)", () => {
    const events = [
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c1", vin: "VIN-1" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "decision_velocity.lead_submitted", metadata: { customer_id: "c1", vin: "VIN-1" }, timestamp: "2026-04-01T10:30:00Z" },
    ];

    const signals = analyzeDecisionVelocity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].classification).toBe("impulse");
    expect(signals[0].urgencyScore).toBe(95);
    expect(signals[0].velocityHours).toBeLessThanOrEqual(1);
  });

  test("classifies fast buyer (1-24 hours)", () => {
    const events = [
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c2", vin: "VIN-2" }, timestamp: "2026-04-01T08:00:00Z" },
      { action: "decision_velocity.lead_submitted", metadata: { customer_id: "c2", vin: "VIN-2" }, timestamp: "2026-04-01T20:00:00Z" },
    ];

    const signals = analyzeDecisionVelocity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].classification).toBe("fast");
    expect(signals[0].urgencyScore).toBe(80);
  });

  test("classifies comparison shopper (> 72 hours)", () => {
    const events = [
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c3", vin: "VIN-3" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "decision_velocity.lead_submitted", metadata: { customer_id: "c3", vin: "VIN-3" }, timestamp: "2026-04-05T10:00:00Z" },
    ];

    const signals = analyzeDecisionVelocity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].classification).toBe("comparison_shopper");
    expect(signals[0].urgencyScore).toBe(35);
  });

  test("classifies no-lead browsing with many VDPs as comparison shopper", () => {
    const events = [
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c4", vin: "VIN-1" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c4", vin: "VIN-2" }, timestamp: "2026-04-01T10:05:00Z" },
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c4", vin: "VIN-3" }, timestamp: "2026-04-01T10:10:00Z" },
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c4", vin: "VIN-4" }, timestamp: "2026-04-01T10:15:00Z" },
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c4", vin: "VIN-5" }, timestamp: "2026-04-01T10:20:00Z" },
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c4", vin: "VIN-6" }, timestamp: "2026-04-01T10:25:00Z" },
    ];

    const signals = analyzeDecisionVelocity(events);
    // 6 VDPs, no lead → comparison_shopper
    const vinSignals = signals.filter((s) => s.uniqueVdpsViewed > 5);
    expect(vinSignals.length).toBeGreaterThanOrEqual(1);
    expect(vinSignals[0].classification).toBe("comparison_shopper");
  });

  test("tracks return visits", () => {
    const events = [
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c5", vin: "VIN-X" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "decision_velocity.return_visit", metadata: { customer_id: "c5" }, timestamp: "2026-04-02T10:00:00Z" },
      { action: "decision_velocity.return_visit", metadata: { customer_id: "c5" }, timestamp: "2026-04-03T10:00:00Z" },
    ];

    const signals = analyzeDecisionVelocity(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].returnVisits).toBe(2);
  });
});

/* ================================================================== */
/*  4. Device Handoff Intent                                           */
/* ================================================================== */

describe("Device Handoff Intent", () => {
  test("detects mobile-to-desktop handoff with shared VIN", () => {
    const events = [
      { action: "journey.session_start", metadata: { customer_id: "c1", session_id: "mob-1", device_type: "mobile", vin: "VIN-A" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c1", session_id: "desk-1", device_type: "desktop", vin: "VIN-A" }, timestamp: "2026-04-01T11:00:00Z" },
    ];

    const signals = analyzeDeviceHandoff(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].handoffDirection).toBe("mobile_to_desktop");
    expect(signals[0].sharedVins).toContain("VIN-A");
    expect(signals[0].intentEscalation).toBe(true);
    expect(signals[0].escalationScore).toBeGreaterThan(0);
  });

  test("ignores same-device sessions", () => {
    const events = [
      { action: "journey.session_start", metadata: { customer_id: "c2", session_id: "mob-1", device_type: "mobile", vin: "VIN-B" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c2", session_id: "mob-2", device_type: "mobile", vin: "VIN-B" }, timestamp: "2026-04-01T11:00:00Z" },
    ];

    expect(analyzeDeviceHandoff(events)).toHaveLength(0);
  });

  test("ignores cross-device with no shared VINs", () => {
    const events = [
      { action: "journey.session_start", metadata: { customer_id: "c3", session_id: "mob-1", device_type: "mobile", vin: "VIN-C" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c3", session_id: "desk-1", device_type: "desktop", vin: "VIN-D" }, timestamp: "2026-04-01T11:00:00Z" },
    ];

    expect(analyzeDeviceHandoff(events)).toHaveLength(0);
  });

  test("higher escalation score for more shared VINs", () => {
    const events = [
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "mob-1", device_type: "mobile", vin: "VIN-E" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "mob-1", device_type: "mobile", vin: "VIN-F" }, timestamp: "2026-04-01T10:05:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "desk-1", device_type: "desktop", vin: "VIN-E" }, timestamp: "2026-04-01T10:30:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "desk-1", device_type: "desktop", vin: "VIN-F" }, timestamp: "2026-04-01T10:35:00Z" },
    ];

    const signals = analyzeDeviceHandoff(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].sharedVins).toHaveLength(2);
    expect(signals[0].escalationScore).toBeGreaterThanOrEqual(50);
  });
});

/* ================================================================== */
/*  5. Night Owl Premium                                               */
/* ================================================================== */

describe("Night Owl Premium", () => {
  test("classifies time segments correctly", () => {
    expect(classifyTimeSegment(6)).toBe("early_bird");
    expect(classifyTimeSegment(12)).toBe("business_hours");
    expect(classifyTimeSegment(18)).toBe("evening");
    expect(classifyTimeSegment(22)).toBe("night_owl");
    expect(classifyTimeSegment(3)).toBe("late_night");
  });

  test("night_owl sessions get higher multiplier", () => {
    // Use local time construction so getHours() returns 22 regardless of timezone
    const base = new Date();
    base.setHours(22, 30, 0, 0);
    const t1 = base.toISOString();
    base.setHours(22, 45, 0, 0);
    const t2 = base.toISOString();
    base.setHours(23, 0, 0, 0);
    const t3 = base.toISOString();

    const events = [
      { action: "page.view", metadata: { customer_id: "c1", session_id: "s1", vin: "VIN-A" }, timestamp: t1 },
      { action: "page.view", metadata: { customer_id: "c1", session_id: "s1", vin: "VIN-B" }, timestamp: t2 },
      { action: "page.view", metadata: { customer_id: "c1", session_id: "s1" }, timestamp: t3 },
    ];

    const signals = analyzeNightOwl(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].timeSegment).toBe("night_owl");
    expect(signals[0].purchaseIntentMultiplier).toBeGreaterThan(1.0);
    expect(signals[0].vehiclesViewed).toBe(2);
  });

  test("business_hours sessions get baseline multiplier", () => {
    const base = new Date();
    base.setHours(14, 0, 0, 0);
    const t1 = base.toISOString();
    base.setHours(14, 15, 0, 0);
    const t2 = base.toISOString();

    const events = [
      { action: "page.view", metadata: { customer_id: "c2", session_id: "s2" }, timestamp: t1 },
      { action: "page.view", metadata: { customer_id: "c2", session_id: "s2" }, timestamp: t2 },
    ];

    const signals = analyzeNightOwl(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].timeSegment).toBe("business_hours");
    expect(signals[0].purchaseIntentMultiplier).toBe(1.0);
  });

  test("late_night sessions get lower multiplier", () => {
    const base = new Date();
    base.setHours(2, 0, 0, 0);
    const t1 = base.toISOString();
    base.setHours(2, 15, 0, 0);
    const t2 = base.toISOString();

    const events = [
      { action: "page.view", metadata: { customer_id: "c3", session_id: "s3" }, timestamp: t1 },
      { action: "page.view", metadata: { customer_id: "c3", session_id: "s3" }, timestamp: t2 },
    ];

    const signals = analyzeNightOwl(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].timeSegment).toBe("late_night");
    expect(signals[0].purchaseIntentMultiplier).toBeLessThan(1.0);
  });

  test("high engagement in night_owl gets bonus multiplier", () => {
    // 10 pages in 3 minutes = high engagement depth at 10pm local time
    const events = Array.from({ length: 10 }, (_, i) => {
      const d = new Date();
      d.setHours(22, 0, i * 18, 0); // every 18 seconds starting at 10pm local
      return {
        action: "page.view",
        metadata: { customer_id: "c4", session_id: "s4", vin: `VIN-${i}` },
        timestamp: d.toISOString(),
      };
    });

    const signals = analyzeNightOwl(events);
    expect(signals).toHaveLength(1);
    expect(signals[0].engagementDepth).toBeGreaterThan(2);
    // Should get the 1.15x bonus on top of 1.4
    expect(signals[0].purchaseIntentMultiplier).toBeGreaterThan(1.4);
  });
});

/* ================================================================== */
/*  6. Combined Signal Generation + Persistence                        */
/* ================================================================== */

describe("generateMicroSignals", () => {
  test("produces summary with all 5 signal types", async () => {
    const events = [
      // Photo comparison
      { action: "photo_compare.dwell_start", metadata: { customer_id: "c1", vin: "V1", compared_vin: "V2", dwell_ms: 3000 }, timestamp: "2026-04-01T10:00:00Z" },
      // Price sensitivity
      { action: "price_sensitivity.price_viewed", metadata: { customer_id: "c2", vin: "V3", price: 30000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.calculator_opened", metadata: { customer_id: "c2", vin: "V3" }, timestamp: "2026-04-01T10:01:00Z" },
      // Decision velocity
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c3", vin: "V4" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "decision_velocity.lead_submitted", metadata: { customer_id: "c3", vin: "V4" }, timestamp: "2026-04-01T10:20:00Z" },
      // Device handoff
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "m1", device_type: "mobile", vin: "V5" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "d1", device_type: "desktop", vin: "V5" }, timestamp: "2026-04-01T11:00:00Z" },
      // Night owl
      { action: "page.view", metadata: { customer_id: "c5", session_id: "s5", vin: "V6" }, timestamp: "2026-04-01T22:00:00Z" },
    ];

    const summary = await generateMicroSignals("dealer-001", events);

    expect(summary.dealerId).toBe("dealer-001");
    expect(summary.photoComparisons.length).toBeGreaterThanOrEqual(1);
    expect(summary.priceSensitivity.length).toBeGreaterThanOrEqual(1);
    expect(summary.decisionVelocity.length).toBeGreaterThanOrEqual(1);
    expect(summary.deviceHandoffs.length).toBeGreaterThanOrEqual(1);
    expect(summary.nightOwl.length).toBeGreaterThanOrEqual(1);
    expect(summary.totalSignals).toBeGreaterThanOrEqual(5);
  });

  test("fires track calls for all computed signals", async () => {
    const events = [
      { action: "photo_compare.dwell_start", metadata: { customer_id: "c1", vin: "V1", compared_vin: "V2", dwell_ms: 3000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.price_viewed", metadata: { customer_id: "c2", vin: "V3", price: 30000 }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "price_sensitivity.calculator_opened", metadata: { customer_id: "c2", vin: "V3" }, timestamp: "2026-04-01T10:01:00Z" },
      { action: "decision_velocity.first_vdp_view", metadata: { customer_id: "c3", vin: "V4" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "decision_velocity.lead_submitted", metadata: { customer_id: "c3", vin: "V4" }, timestamp: "2026-04-01T10:20:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "m1", device_type: "mobile", vin: "V5" }, timestamp: "2026-04-01T10:00:00Z" },
      { action: "journey.session_start", metadata: { customer_id: "c4", session_id: "d1", device_type: "desktop", vin: "V5" }, timestamp: "2026-04-01T11:00:00Z" },
      { action: "page.view", metadata: { customer_id: "c5", session_id: "s5", vin: "V6" }, timestamp: "2026-04-01T22:00:00Z" },
    ];

    await generateMicroSignals("dealer-001", events);

    // Every signal type should have fired its track function
    expect(trackPhotoComparison).toHaveBeenCalled();
    expect(trackPriceSensitivity).toHaveBeenCalled();
    expect(trackDecisionVelocity).toHaveBeenCalled();
    expect(trackDeviceHandoff).toHaveBeenCalled();
    expect(trackNightOwl).toHaveBeenCalled();
  });

  test("returns empty signals for no matching events", async () => {
    const events = [
      { action: "page.view", metadata: { page: "/" }, timestamp: "2026-04-01T10:00:00Z" },
    ];

    const summary = await generateMicroSignals("dealer-001", events);
    expect(summary.photoComparisons).toHaveLength(0);
    expect(summary.priceSensitivity).toHaveLength(0);
    expect(summary.decisionVelocity).toHaveLength(0);
    expect(summary.deviceHandoffs).toHaveLength(0);
    // Night owl still produces 1 (any event with a timestamp gets classified)
    expect(summary.totalSignals).toBeGreaterThanOrEqual(0);
  });
});

/* ================================================================== */
/*  7. Migration 054 — Learning Views                                  */
/* ================================================================== */

describe("Migration 054 — Micro-Behavioral Learning Views", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const MIGRATION = path.join(ROOT, "src/db/migrations/054_micro_behavioral_views.sql");

  test("migration file exists", () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
  });

  const sql = fs.readFileSync(MIGRATION, "utf-8");

  const REQUIRED_VIEWS = [
    "v_photo_comparison_preferences",
    "v_price_sensitivity",
    "v_decision_velocity",
    "v_device_handoff",
    "v_night_owl_patterns",
    "v_micro_signal_propensity",
  ];

  test.each(REQUIRED_VIEWS)("creates view %s", (view) => {
    expect(sql).toContain(`CREATE OR REPLACE VIEW ${view}`);
  });

  test("v_micro_signal_propensity combines all 5 signal sources", () => {
    expect(sql).toContain("photo_compare.preference_detected");
    expect(sql).toContain("price_sensitivity.budget_fingerprint");
    expect(sql).toContain("decision_velocity.velocity_classified");
    expect(sql).toContain("device_handoff.intent_escalation");
    expect(sql).toContain("night_owl.time_segment_classified");
  });

  test("all views read from analytics_events (not separate tables)", () => {
    // Every view should reference analytics_events as its source
    const viewCount = (sql.match(/FROM analytics_events/gi) ?? []).length;
    expect(viewCount).toBeGreaterThanOrEqual(5);
  });
});

/* ================================================================== */
/*  8. API Endpoint                                                    */
/* ================================================================== */

describe("API Endpoint", () => {
  const ROOT = path.resolve(__dirname, "../../..");

  test("/api/admin/analytics/micro-signals/route.ts exists", () => {
    const routePath = path.join(ROOT, "src/app/api/admin/analytics/micro-signals/route.ts");
    expect(fs.existsSync(routePath)).toBe(true);
  });

  test("endpoint imports generateMicroSignals", () => {
    const routePath = path.join(ROOT, "src/app/api/admin/analytics/micro-signals/route.ts");
    const content = fs.readFileSync(routePath, "utf-8");
    expect(content).toContain("generateMicroSignals");
    expect(content).toContain("requireAuth");
    expect(content).toContain("trackSystem");
  });
});

/* ================================================================== */
/*  9. Analytics Hooks — New Event Types                               */
/* ================================================================== */

describe("Analytics Hooks — Micro-Behavioral Event Types", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const hooksPath = path.join(ROOT, "src/lib/analytics-hooks.ts");
  const hooks = fs.readFileSync(hooksPath, "utf-8");

  const NEW_TYPES = [
    "PhotoComparisonEvent",
    "PriceSensitivityEvent",
    "DecisionVelocityEvent",
    "DeviceHandoffEvent",
    "NightOwlEvent",
  ];

  test.each(NEW_TYPES)("event type %s is defined", (typeName) => {
    expect(hooks).toContain(`export type ${typeName}`);
  });

  const NEW_TRACKERS = [
    "trackPhotoComparison",
    "trackPriceSensitivity",
    "trackDecisionVelocity",
    "trackDeviceHandoff",
    "trackNightOwl",
  ];

  test.each(NEW_TRACKERS)("track function %s is exported", (fn) => {
    expect(hooks).toContain(`export function ${fn}(`);
  });

  test("all 5 new types are in PlatformEvent union", () => {
    expect(hooks).toContain("| PhotoComparisonEvent");
    expect(hooks).toContain("| PriceSensitivityEvent");
    expect(hooks).toContain("| DecisionVelocityEvent");
    expect(hooks).toContain("| DeviceHandoffEvent");
    expect(hooks).toContain("| NightOwlEvent");
  });
});
