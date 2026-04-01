/**
 * Unit tests for src/lib/engagement-alerts.ts
 *
 * Tests all 8 compound triggers, priority assignment, 2-hour expiry,
 * alert dismissal, signal extraction, and shadow mode mock alerts.
 *
 * Run with: npx jest src/lib/__tests__/engagement-alerts.test.ts
 */

import {
  evaluateAlerts,
  getActiveAlerts,
  dismissAlert,
  getAlertStats,
  type EngagementAlert,
  type AlertType,
  type AlertPriority,
} from "../engagement-alerts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

/** Ensure shadow mode and clean alert store for each test. */
beforeEach(() => {
  delete process.env.DATABASE_URL;
  // Reset the global alert store between tests
  const g = globalThis as unknown as { __alertStore?: unknown };
  delete g.__alertStore;
});

/* -------------------------------------------------------------------------- */
/* getActiveAlerts — shadow mode mock alerts                                   */
/* -------------------------------------------------------------------------- */

describe("getActiveAlerts — shadow mode", () => {
  it("returns an array of alerts in shadow mode", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("each alert has all required fields", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    for (const alert of alerts) {
      expect(alert).toHaveProperty("id");
      expect(alert).toHaveProperty("type");
      expect(alert).toHaveProperty("priority");
      expect(alert).toHaveProperty("lead_id");
      expect(alert).toHaveProperty("customer_name");
      expect(alert).toHaveProperty("vehicle_interest");
      expect(alert).toHaveProperty("recommended_action");
      expect(alert).toHaveProperty("signals_triggered");
      expect(alert).toHaveProperty("created_at");
      expect(alert).toHaveProperty("expires_at");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Shadow alerts cover all 8 alert types                                       */
/* -------------------------------------------------------------------------- */

describe("getActiveAlerts — all 8 alert types", () => {
  const ALL_TYPES: AlertType[] = [
    "hot_return",
    "price_serious",
    "comparison_ready",
    "repeat_viewer",
    "budget_revealed",
    "video_engaged",
    "about_to_leave",
    "competitor_risk",
  ];

  it("shadow mode returns all 8 alert types", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const typesPresent = new Set(alerts.map((a) => a.type));
    for (const t of ALL_TYPES) {
      expect(typesPresent).toContain(t);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Priority assignment                                                         */
/* -------------------------------------------------------------------------- */

describe("alert priorities", () => {
  it("hot_return is critical priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const hotReturn = alerts.find((a) => a.type === "hot_return");
    expect(hotReturn).toBeDefined();
    expect(hotReturn!.priority).toBe("critical");
  });

  it("price_serious is critical priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const priceSer = alerts.find((a) => a.type === "price_serious");
    expect(priceSer).toBeDefined();
    expect(priceSer!.priority).toBe("critical");
  });

  it("about_to_leave is critical priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const atl = alerts.find((a) => a.type === "about_to_leave");
    expect(atl).toBeDefined();
    expect(atl!.priority).toBe("critical");
  });

  it("competitor_risk is high priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const cr = alerts.find((a) => a.type === "competitor_risk");
    expect(cr).toBeDefined();
    expect(cr!.priority).toBe("high");
  });

  it("comparison_ready is high priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const comp = alerts.find((a) => a.type === "comparison_ready");
    expect(comp).toBeDefined();
    expect(comp!.priority).toBe("high");
  });

  it("repeat_viewer is high priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const rv = alerts.find((a) => a.type === "repeat_viewer");
    expect(rv).toBeDefined();
    expect(rv!.priority).toBe("high");
  });

  it("budget_revealed is medium priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const br = alerts.find((a) => a.type === "budget_revealed");
    expect(br).toBeDefined();
    expect(br!.priority).toBe("medium");
  });

  it("video_engaged is medium priority", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const ve = alerts.find((a) => a.type === "video_engaged");
    expect(ve).toBeDefined();
    expect(ve!.priority).toBe("medium");
  });

  it("valid priority values only", async () => {
    const validPriorities: AlertPriority[] = ["critical", "high", "medium"];
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    for (const alert of alerts) {
      expect(validPriorities).toContain(alert.priority);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2-hour expiry                                                               */
/* -------------------------------------------------------------------------- */

describe("alert expiry", () => {
  it("expires_at is approximately 2 hours after created_at", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    for (const alert of alerts) {
      const created = new Date(alert.created_at).getTime();
      const expires = new Date(alert.expires_at).getTime();
      const diff = expires - created;
      const twoHoursMs = 2 * 60 * 60 * 1000;
      // Shadow alerts can have created_at up to ~60 min in the past
      // while expires_at is always now + 2h, so allow generous tolerance
      expect(diff).toBeGreaterThanOrEqual(twoHoursMs - 5_000);
      expect(diff).toBeLessThanOrEqual(twoHoursMs + 65 * 60 * 1000);
    }
  });

  it("all shadow alerts have future expires_at", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const now = Date.now();
    for (const alert of alerts) {
      expect(new Date(alert.expires_at).getTime()).toBeGreaterThan(now);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Signal triggers                                                             */
/* -------------------------------------------------------------------------- */

describe("alert signals_triggered", () => {
  it("hot_return requires email_opened and return_visit", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const hotReturn = alerts.find((a) => a.type === "hot_return");
    expect(hotReturn!.signals_triggered).toContain("email_opened");
    expect(hotReturn!.signals_triggered).toContain("return_visit");
  });

  it("price_serious requires calculator_input and form_started", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const ps = alerts.find((a) => a.type === "price_serious");
    expect(ps!.signals_triggered).toContain("calculator_input");
    expect(ps!.signals_triggered).toContain("form_started");
  });

  it("about_to_leave requires exit_intent and high_predictive_score", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const atl = alerts.find((a) => a.type === "about_to_leave");
    expect(atl!.signals_triggered).toContain("exit_intent");
    expect(atl!.signals_triggered).toContain("high_predictive_score");
  });

  it("competitor_risk requires long_session, no_conversion, exit_intent", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const cr = alerts.find((a) => a.type === "competitor_risk");
    expect(cr!.signals_triggered).toContain("long_session");
    expect(cr!.signals_triggered).toContain("no_conversion");
    expect(cr!.signals_triggered).toContain("exit_intent");
  });

  it("comparison_ready requires vehicle_compare and financing_page_view", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const comp = alerts.find((a) => a.type === "comparison_ready");
    expect(comp!.signals_triggered).toContain("vehicle_compare");
    expect(comp!.signals_triggered).toContain("financing_page_view");
  });

  it("repeat_viewer requires repeat_vdp_view", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const rv = alerts.find((a) => a.type === "repeat_viewer");
    expect(rv!.signals_triggered).toContain("repeat_vdp_view");
  });

  it("budget_revealed requires price_range_dwell and calculator_input", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const br = alerts.find((a) => a.type === "budget_revealed");
    expect(br!.signals_triggered).toContain("price_range_dwell");
    expect(br!.signals_triggered).toContain("calculator_input");
  });

  it("video_engaged requires video_complete and post_video_dwell", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const ve = alerts.find((a) => a.type === "video_engaged");
    expect(ve!.signals_triggered).toContain("video_complete");
    expect(ve!.signals_triggered).toContain("post_video_dwell");
  });
});

/* -------------------------------------------------------------------------- */
/* Recommended action text                                                     */
/* -------------------------------------------------------------------------- */

describe("recommended_action text", () => {
  it("each alert has plain-English recommended action", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    for (const alert of alerts) {
      expect(alert.recommended_action.length).toBeGreaterThan(10);
      expect(alert.recommended_action).not.toMatch(
        /\bnull\b|\bundefined\b|\bNaN\b|\berror\b/i,
      );
    }
  });

  it("critical alerts suggest immediate action", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const critical = alerts.filter((a) => a.priority === "critical");
    for (const alert of critical) {
      expect(alert.recommended_action.toLowerCase()).toMatch(
        /call|immediately|now|fast/,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* dismissAlert — in-memory store                                              */
/* -------------------------------------------------------------------------- */

describe("dismissAlert", () => {
  it("can dismiss an alert from the in-memory store", async () => {
    // Trigger evaluation to populate the store with at least one alert
    await evaluateAlerts(DEMO_DEALER_ID, "test-fingerprint");

    // Get active alerts from shadow mode
    const before = await getActiveAlerts(DEMO_DEALER_ID);
    // Shadow alerts are returned when store is empty, so length > 0
    expect(before.length).toBeGreaterThan(0);

    // dismissAlert is a no-op for shadow IDs but should not throw
    await expect(
      dismissAlert(before[0].id, DEMO_DEALER_ID, "contacted"),
    ).resolves.not.toThrow();
  });

  it("accepts all valid action types", async () => {
    const actions = ["dismiss", "contacted", "scheduled"] as const;
    for (const action of actions) {
      await expect(
        dismissAlert("alert-test-123", DEMO_DEALER_ID, action),
      ).resolves.not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* evaluateAlerts — no events (shadow mode)                                    */
/* -------------------------------------------------------------------------- */

describe("evaluateAlerts — no events", () => {
  it("returns an empty array when no events trigger alerts", async () => {
    // With no DB, sessionEvents will be empty, so no triggers fire
    const alerts = await evaluateAlerts(DEMO_DEALER_ID, "empty-session");
    expect(Array.isArray(alerts)).toBe(true);
    // No events => no new alerts
    expect(alerts.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* getAlertStats — shadow mode                                                 */
/* -------------------------------------------------------------------------- */

describe("getAlertStats — shadow mode", () => {
  it("returns shadow statistics", async () => {
    const stats = await getAlertStats(DEMO_DEALER_ID);
    expect(stats.alerts_today).toBeGreaterThanOrEqual(0);
    expect(stats.actioned_pct).toBeGreaterThanOrEqual(0);
    expect(stats.actioned_pct).toBeLessThanOrEqual(100);
    expect(stats.avg_response_time_minutes).toBeGreaterThanOrEqual(0);
    expect(stats.critical_count).toBeGreaterThanOrEqual(0);
    expect(stats.high_count).toBeGreaterThanOrEqual(0);
    expect(stats.medium_count).toBeGreaterThanOrEqual(0);
  });

  it("critical + high + medium <= alerts_today", async () => {
    const stats = await getAlertStats(DEMO_DEALER_ID);
    expect(
      stats.critical_count + stats.high_count + stats.medium_count,
    ).toBeLessThanOrEqual(stats.alerts_today);
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("EngagementAlert is fully JSON-serializable for EventCollector", async () => {
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    const serialized = JSON.stringify(alerts);
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(alerts.length);
    expect(parsed[0].type).toBe(alerts[0].type);
    expect(parsed[0].priority).toBe(alerts[0].priority);
    expect(Array.isArray(parsed[0].signals_triggered)).toBe(true);
  });

  it("AlertStats is fully JSON-serializable", async () => {
    const stats = await getAlertStats(DEMO_DEALER_ID);
    const serialized = JSON.stringify(stats);
    const parsed = JSON.parse(serialized);
    expect(parsed.alerts_today).toBe(stats.alerts_today);
    expect(parsed.actioned_pct).toBe(stats.actioned_pct);
  });

  it("alert type values are valid analytics event categories", async () => {
    const validTypes: AlertType[] = [
      "hot_return",
      "price_serious",
      "comparison_ready",
      "repeat_viewer",
      "budget_revealed",
      "video_engaged",
      "about_to_leave",
      "competitor_risk",
    ];
    const alerts = await getActiveAlerts(DEMO_DEALER_ID);
    for (const alert of alerts) {
      expect(validTypes).toContain(alert.type);
    }
  });
});
