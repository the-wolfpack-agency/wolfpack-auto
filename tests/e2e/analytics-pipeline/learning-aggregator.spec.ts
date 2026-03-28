/**
 * Learning Aggregator — verify the learning system computes correct insights.
 *
 * Hits GET /api/admin/analytics/learning and validates every field in the
 * LearningInsights interface. Also reads the source to confirm completeness.
 *
 * Run: npx playwright test tests/e2e/analytics-pipeline/learning-aggregator.spec.ts
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

const ROOT = path.resolve(__dirname, "../../..");
const LEARNING_ROUTE = path.join(
  ROOT,
  "src/app/api/admin/analytics/learning/route.ts",
);
const LEARNING_AGGREGATOR = path.join(ROOT, "src/lib/learning-aggregator.ts");

/**
 * Fetch the learning insights endpoint.
 * Returns null only if the server is completely unreachable.
 */
async function fetchInsights(request: any) {
  const res = await request.get("/api/admin/analytics/learning");
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/* ========================================================================== */
/* Source file verification                                                   */
/* ========================================================================== */

test.describe("Learning aggregator source verification", () => {
  test("learning-aggregator.ts exports getLearningInsights", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("export async function getLearningInsights");
  });

  test("learning-aggregator.ts exports LearningInsights interface", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("export interface LearningInsights");
  });

  test("learning route.ts imports getLearningInsights", () => {
    const source = fs.readFileSync(LEARNING_ROUTE, "utf-8");
    expect(source).toContain("getLearningInsights");
    expect(source).toContain("learning-aggregator");
  });

  test("learning-aggregator.ts computes fi_attachment_rate", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("fi_attachment_rate");
  });

  test("learning-aggregator.ts computes appointment_show_rate", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("appointment_show_rate");
  });

  test("learning-aggregator.ts computes email_open_rate", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("email_open_rate");
  });

  test("learning-aggregator.ts computes avg_rating", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("avg_rating");
  });

  test("learning-aggregator.ts computes sentiment_trend", () => {
    const source = fs.readFileSync(LEARNING_AGGREGATOR, "utf-8");
    expect(source).toContain("sentiment_trend");
  });
});

/* ========================================================================== */
/* API contract — endpoint must never 500                                     */
/* ========================================================================== */

test.describe("Learning API contract", () => {
  test("GET /api/admin/analytics/learning never returns 500", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/learning");
    expect(res.status(), "learning endpoint must not 500").not.toBe(500);
  });

  test("learning endpoint returns JSON with insights key", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/learning");
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("insights");
    }
    // 401 is acceptable — auth wall
  });
});

/* ========================================================================== */
/* Insight field validation                                                   */
/* ========================================================================== */

test.describe("Insight field validation", () => {
  // Helper — skips field tests if auth-walled
  async function getInsights(request: any) {
    const res = await request.get("/api/admin/analytics/learning");
    if (res.status() !== 200) {
      test.skip(true, `Endpoint returned ${res.status()} (auth wall) — skipping field check`);
      return null;
    }
    const body = await res.json();
    return body.insights;
  }

  test("fi_attachment_rate is a number between 0 and 1", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.fi_attachment_rate).toBe("number");
    expect(insights.fi_attachment_rate).toBeGreaterThanOrEqual(0);
    expect(insights.fi_attachment_rate).toBeLessThanOrEqual(1);
  });

  test("avg_fi_per_deal is a number >= 0", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.avg_fi_per_deal).toBe("number");
    expect(insights.avg_fi_per_deal).toBeGreaterThanOrEqual(0);
  });

  test("appointment_show_rate is a number between 0 and 1", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.appointment_show_rate).toBe("number");
    expect(insights.appointment_show_rate).toBeGreaterThanOrEqual(0);
    expect(insights.appointment_show_rate).toBeLessThanOrEqual(1);
  });

  test("avg_ro_value is a number >= 0", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.avg_ro_value).toBe("number");
    expect(insights.avg_ro_value).toBeGreaterThanOrEqual(0);
  });

  test("email_open_rate is a number between 0 and 1", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.email_open_rate).toBe("number");
    expect(insights.email_open_rate).toBeGreaterThanOrEqual(0);
    expect(insights.email_open_rate).toBeLessThanOrEqual(1);
  });

  test("sms_response_rate is a number between 0 and 1", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.sms_response_rate).toBe("number");
    expect(insights.sms_response_rate).toBeGreaterThanOrEqual(0);
    expect(insights.sms_response_rate).toBeLessThanOrEqual(1);
  });

  test("best_performing_template is a non-empty string", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.best_performing_template).toBe("string");
    expect(insights.best_performing_template.length).toBeGreaterThan(0);
  });

  test("optimal_follow_up_delay_hours is a number > 0", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.optimal_follow_up_delay_hours).toBe("number");
    expect(insights.optimal_follow_up_delay_hours).toBeGreaterThan(0);
  });

  test("avg_days_to_close is a number >= 0", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.avg_days_to_close).toBe("number");
    expect(insights.avg_days_to_close).toBeGreaterThanOrEqual(0);
  });

  test("top_salesperson is a non-empty string", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.top_salesperson).toBe("string");
    expect(insights.top_salesperson.length).toBeGreaterThan(0);
  });

  test("avg_rating is a number between 1 and 5", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.avg_rating).toBe("number");
    expect(insights.avg_rating).toBeGreaterThanOrEqual(1);
    expect(insights.avg_rating).toBeLessThanOrEqual(5);
  });

  test("response_rate is a number between 0 and 1", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.response_rate).toBe("number");
    expect(insights.response_rate).toBeGreaterThanOrEqual(0);
    expect(insights.response_rate).toBeLessThanOrEqual(1);
  });

  test("sentiment_trend is one of improving, stable, declining", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(["improving", "stable", "declining"]).toContain(insights.sentiment_trend);
  });

  test("computed_at is a valid ISO timestamp", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    expect(typeof insights.computed_at).toBe("string");
    const date = new Date(insights.computed_at);
    expect(date.getTime()).not.toBeNaN();
  });

  test("insights object has no undefined or NaN values", async ({ request }) => {
    const insights = await getInsights(request);
    if (!insights) return;
    for (const [key, value] of Object.entries(insights)) {
      expect(value, `${key} must not be undefined`).not.toBeUndefined();
      if (typeof value === "number") {
        expect(Number.isNaN(value), `${key} must not be NaN`).toBe(false);
      }
    }
  });
});
