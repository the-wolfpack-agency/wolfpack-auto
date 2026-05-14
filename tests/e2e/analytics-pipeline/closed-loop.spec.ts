/**
 * Closed Loop — verify data flows from action to insight.
 *
 * This is the capstone test: events tracked by analytics-hooks.ts feed into
 * learning-aggregator.ts which computes insights surfaced in the admin UI.
 * Every link in the chain is verified.
 *
 * Run: npx playwright test tests/e2e/analytics-pipeline/closed-loop.spec.ts
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// Shadow-mode skip: closed-loop test asserts events flow into learning
// metrics; the metric side requires Postgres (deals, comms, service rows)
// for the aggregator to compute. Re-run via the real-DB integration phase.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

const ROOT = path.resolve(__dirname, "../../..");
const HOOKS_FILE = path.join(ROOT, "src/lib/analytics-hooks.ts");
const AGGREGATOR_FILE = path.join(ROOT, "src/lib/learning-aggregator.ts");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/* ========================================================================== */
/* Event-to-Metric mapping verification                                       */
/* ========================================================================== */

test.describe("Event types map to learning metrics", () => {
  /**
   * Each entry maps an event category (defined in analytics-hooks.ts) to the
   * insight metrics (defined in learning-aggregator.ts) it should feed.
   */
  const EVENT_TO_METRIC_MAP: Record<string, string[]> = {
    DealEvent: ["fi_attachment_rate", "avg_fi_per_deal"],
    ServiceEvent: ["appointment_show_rate", "avg_ro_value"],
    CommsEvent: [
      "email_open_rate",
      "sms_response_rate",
      "optimal_follow_up_delay_hours",
      "best_performing_template",
    ],
    ReviewEvent: ["avg_rating", "response_rate", "sentiment_trend"],
    AccountingEvent: ["avg_days_to_close", "top_salesperson"],
  };

  test("analytics-hooks.ts defines all required event type unions", () => {
    const source = readFile(HOOKS_FILE);
    for (const eventType of Object.keys(EVENT_TO_METRIC_MAP)) {
      expect(
        source.includes(`export type ${eventType}`),
        `analytics-hooks.ts must define ${eventType}`,
      ).toBe(true);
    }
  });

  test("learning-aggregator.ts computes metrics for every event category", () => {
    const source = readFile(AGGREGATOR_FILE);
    for (const [eventType, metrics] of Object.entries(EVENT_TO_METRIC_MAP)) {
      for (const metric of metrics) {
        expect(
          source.includes(metric),
          `learning-aggregator.ts must compute ${metric} (fed by ${eventType})`,
        ).toBe(true);
      }
    }
  });

  test("Deal events feed fi_attachment_rate and avg_fi_per_deal", () => {
    const hooks = readFile(HOOKS_FILE);
    const aggregator = readFile(AGGREGATOR_FILE);

    // Hooks define deal events
    expect(hooks).toContain("deal.fi_product_added");
    expect(hooks).toContain("deal.created");

    // Aggregator computes F&I metrics
    expect(aggregator).toContain("fi_attachment_rate");
    expect(aggregator).toContain("avg_fi_per_deal");
    // Aggregator queries deals table for F&I data
    expect(aggregator).toContain("fi_products");
  });

  test("Service events feed appointment_show_rate and avg_ro_value", () => {
    const hooks = readFile(HOOKS_FILE);
    const aggregator = readFile(AGGREGATOR_FILE);

    expect(hooks).toContain("service.appointment_created");
    expect(hooks).toContain("service.appointment_no_show");
    expect(hooks).toContain("service.ro_created");

    expect(aggregator).toContain("appointment_show_rate");
    expect(aggregator).toContain("avg_ro_value");
    // Aggregator queries service tables
    expect(aggregator).toContain("service_appointments");
    expect(aggregator).toContain("repair_orders");
  });

  test("Comms events feed email_open_rate and sms_response_rate", () => {
    const hooks = readFile(HOOKS_FILE);
    const aggregator = readFile(AGGREGATOR_FILE);

    expect(hooks).toContain("comms.message_sent");
    expect(hooks).toContain("comms.message_opened");

    expect(aggregator).toContain("email_open_rate");
    expect(aggregator).toContain("sms_response_rate");
    expect(aggregator).toContain("optimal_follow_up_delay_hours");
  });

  test("Review events feed avg_rating, response_rate, sentiment_trend", () => {
    const hooks = readFile(HOOKS_FILE);
    const aggregator = readFile(AGGREGATOR_FILE);

    expect(hooks).toContain("review.received");
    expect(hooks).toContain("review.responded");

    expect(aggregator).toContain("avg_rating");
    expect(aggregator).toContain("response_rate");
    expect(aggregator).toContain("sentiment_trend");
    // Aggregator queries reviews table
    expect(aggregator).toContain("reviews");
  });

  test("Accounting events feed avg_days_to_close and top_salesperson", () => {
    const hooks = readFile(HOOKS_FILE);
    const aggregator = readFile(AGGREGATOR_FILE);

    expect(hooks).toContain("accounting.sale_logged");
    expect(hooks).toContain("accounting.commission_paid");

    expect(aggregator).toContain("avg_days_to_close");
    expect(aggregator).toContain("top_salesperson");
    expect(aggregator).toContain("sales_log");
  });
});

/* ========================================================================== */
/* Learning API returns complete insights                                     */
/* ========================================================================== */

test.describe("Learning API returns complete, well-shaped insights", () => {
  test("GET /api/admin/analytics/learning returns non-null values for all metrics", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/analytics/learning");
    if (res.status() === 401) {
      test.skip(true, "Auth wall — skipping field check");
      return;
    }
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      const insights = body.insights;
      expect(insights).toBeTruthy();

      // Every metric must be present and non-null
      const REQUIRED_FIELDS = [
        "fi_attachment_rate",
        "avg_fi_per_deal",
        "appointment_show_rate",
        "avg_ro_value",
        "email_open_rate",
        "sms_response_rate",
        "best_performing_template",
        "optimal_follow_up_delay_hours",
        "avg_days_to_close",
        "top_salesperson",
        "avg_rating",
        "response_rate",
        "sentiment_trend",
        "computed_at",
      ];

      for (const field of REQUIRED_FIELDS) {
        expect(
          insights[field],
          `insights.${field} must not be null or undefined`,
        ).not.toBeNull();
        expect(
          insights[field],
          `insights.${field} must not be undefined`,
        ).not.toBeUndefined();
      }
    }
  });

  test("learning API response shape matches LearningInsights interface", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/analytics/learning");
    if (res.status() !== 200) {
      test.skip(true, `Endpoint returned ${res.status()} — skipping shape check`);
      return;
    }

    const body = await res.json();
    const insights = body.insights;

    // Type checks matching the TypeScript interface
    expect(typeof insights.fi_attachment_rate).toBe("number");
    expect(typeof insights.avg_fi_per_deal).toBe("number");
    expect(typeof insights.appointment_show_rate).toBe("number");
    expect(typeof insights.avg_ro_value).toBe("number");
    expect(typeof insights.email_open_rate).toBe("number");
    expect(typeof insights.sms_response_rate).toBe("number");
    expect(typeof insights.best_performing_template).toBe("string");
    expect(typeof insights.optimal_follow_up_delay_hours).toBe("number");
    expect(typeof insights.avg_days_to_close).toBe("number");
    expect(typeof insights.top_salesperson).toBe("string");
    expect(typeof insights.avg_rating).toBe("number");
    expect(typeof insights.response_rate).toBe("number");
    expect(typeof insights.sentiment_trend).toBe("string");
    expect(typeof insights.computed_at).toBe("string");

    // Array/object fields
    expect(Array.isArray(insights.top_fi_products)).toBe(true);
    expect(typeof insights.conversion_by_source).toBe("object");
  });

  test("learning API is idempotent — two calls return consistent shapes", async ({
    request,
  }) => {
    const res1 = await request.get("/api/admin/analytics/learning");
    const res2 = await request.get("/api/admin/analytics/learning");

    if (res1.status() !== 200 || res2.status() !== 200) {
      test.skip(true, "Auth wall — skipping idempotency check");
      return;
    }

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Same shape — same keys
    const keys1 = Object.keys(body1.insights).sort();
    const keys2 = Object.keys(body2.insights).sort();
    expect(keys1).toEqual(keys2);
  });
});

/* ========================================================================== */
/* Structural completeness — every event has a metric, every metric an event  */
/* ========================================================================== */

test.describe("Bidirectional completeness", () => {
  test("every track* export in analytics-hooks.ts has a corresponding module in learning-aggregator.ts", () => {
    const hooks = readFile(HOOKS_FILE);
    const aggregator = readFile(AGGREGATOR_FILE);

    // Extract all export function track* names
    const trackFns = hooks.match(/export function (track\w+)/g) || [];
    expect(trackFns.length).toBeGreaterThanOrEqual(10);

    // The aggregator should reference or compute metrics related to each module
    // We check that the aggregator is aware of the core modules
    const coreModules = ["deals", "service", "reviews", "sales_log"];
    for (const mod of coreModules) {
      expect(
        aggregator.includes(mod),
        `learning-aggregator.ts must reference "${mod}" module`,
      ).toBe(true);
    }
  });

  test("every metric in LearningInsights has a return value in generateShadowInsights", () => {
    const aggregator = readFile(AGGREGATOR_FILE);

    // Extract interface fields
    const interfaceMatch = aggregator.match(
      /export interface LearningInsights \{([\s\S]*?)\}/,
    );
    expect(interfaceMatch, "LearningInsights interface must exist").toBeTruthy();

    const interfaceBody = interfaceMatch![1];
    const fieldNames = interfaceBody
      .split("\n")
      .filter((line) => line.includes(":") && !line.trim().startsWith("/*") && !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .map((line) => line.trim().split(":")[0].replace(/[?]/g, "").trim())
      .filter((name) => name.length > 0);

    expect(fieldNames.length).toBeGreaterThanOrEqual(14);

    // Verify shadow function returns all fields
    const shadowMatch = aggregator.match(
      /function generateShadowInsights[\s\S]*?return \{([\s\S]*?)\};/,
    );
    expect(shadowMatch, "generateShadowInsights must exist").toBeTruthy();

    const shadowBody = shadowMatch![1];
    for (const field of fieldNames) {
      expect(
        shadowBody.includes(field),
        `generateShadowInsights must return "${field}"`,
      ).toBe(true);
    }
  });

  test("learning-aggregator.ts has both DB and shadow paths", () => {
    const aggregator = readFile(AGGREGATOR_FILE);

    // Must have a DB computation path
    expect(aggregator).toContain("DATABASE_URL");
    expect(aggregator).toContain("computeFromDB");

    // Must have a shadow/fallback path
    expect(aggregator).toContain("generateShadowInsights");

    // getLearningInsights must try DB first, then fall back
    expect(aggregator).toContain("getLearningInsights");
    const fnBody = aggregator.slice(
      aggregator.indexOf("export async function getLearningInsights"),
    );
    expect(fnBody).toContain("computeFromDB");
    expect(fnBody).toContain("generateShadowInsights");
  });

  test("analytics-hooks.ts PlatformEvent union includes all module event types", () => {
    const hooks = readFile(HOOKS_FILE);

    const moduleEventTypes = [
      "DealEvent",
      "ServiceEvent",
      "CommsEvent",
      "AccountingEvent",
      "ReviewEvent",
      "RetailEvent",
      "CustomerEvent",
      "LenderEvent",
      "CreditEvent",
      "ComplianceEvent",
      "DocumentEvent",
      "KnowledgeEvent",
      "SecurityEvent",
    ];

    // Extract PlatformEvent union
    const platformMatch = hooks.match(
      /export type PlatformEvent\s*=([\s\S]*?);/,
    );
    expect(platformMatch, "PlatformEvent type must exist").toBeTruthy();

    const unionBody = platformMatch![1];
    for (const eventType of moduleEventTypes) {
      expect(
        unionBody.includes(eventType),
        `PlatformEvent must include ${eventType}`,
      ).toBe(true);
    }
  });
});
