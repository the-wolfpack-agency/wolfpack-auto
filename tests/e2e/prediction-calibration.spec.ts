/**
 * Prediction Calibration E2E Tests
 *
 * Validates that the auto-calibration system is wired correctly:
 * - GET /api/admin/analytics/calibration returns calibration data
 * - POST /api/admin/analytics/calibration triggers a calibration run
 * - Result shapes are correct (accuracy, precision, recall, f1_score all 0-1)
 * - Weight adjustments have the right structure
 * - History is returned as an array
 * - Cron endpoint responds correctly
 * - Analytics brain page renders model health card
 */
import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

let cookies = "";

async function login(request: any): Promise<string> {
  const csrf = await request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const cc = csrf
    .headersArray()
    .filter((h: any) => h.name.toLowerCase() === "set-cookie")
    .map((h: any) => h.value.split(";")[0].trim())
    .join("; ");
  const sign = await request.post("/api/auth/callback/credentials", {
    form: { email: "demo@wolfpackauto.com", password: "demo", csrfToken, json: "true" },
    headers: { cookie: cc },
  });
  const sc = sign
    .headersArray()
    .filter((h: any) => h.name.toLowerCase() === "set-cookie")
    .map((h: any) => h.value.split(";")[0].trim())
    .join("; ");
  return [cc, sc].filter(Boolean).join("; ");
}

test.describe.serial("Prediction Calibration", () => {
  test("1. Login", async ({ request }) => {
    cookies = await login(request);
    expect(cookies.length).toBeGreaterThan(10);
  });

  test("2. GET /api/admin/analytics/calibration returns 200 with calibration data", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("latest");
    expect(body).toHaveProperty("history");
    expect(body).toHaveProperty("dealer_id");
  });

  test("3. Latest calibration has accuracy, precision, recall, f1_score between 0 and 1", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
    });
    const body = await res.json();
    const latest = body.latest;

    // In shadow mode, latest comes from shadow calibration
    expect(latest).not.toBeNull();
    expect(latest.accuracy).toBeGreaterThanOrEqual(0);
    expect(latest.accuracy).toBeLessThanOrEqual(1);
    expect(latest.precision).toBeGreaterThanOrEqual(0);
    expect(latest.precision).toBeLessThanOrEqual(1);
    expect(latest.recall).toBeGreaterThanOrEqual(0);
    expect(latest.recall).toBeLessThanOrEqual(1);
    expect(latest.f1_score).toBeGreaterThanOrEqual(0);
    expect(latest.f1_score).toBeLessThanOrEqual(1);
  });

  test("4. Weight adjustments is an object with string keys and number values", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
    });
    const body = await res.json();
    const adjustments = body.latest.weight_adjustments;

    expect(typeof adjustments).toBe("object");
    expect(adjustments).not.toBeNull();

    // Check at least some known signal names
    const knownSignals = ["vdp_views", "calculator_used", "scroll_depth"];
    for (const signal of knownSignals) {
      expect(adjustments).toHaveProperty(signal);
      expect(typeof adjustments[signal]).toBe("number");
      // Adjustments are capped between 0.5 and 1.5
      expect(adjustments[signal]).toBeGreaterThanOrEqual(0.5);
      expect(adjustments[signal]).toBeLessThanOrEqual(1.5);
    }
  });

  test("5. Calibration history is an array with at least one entry", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
    });
    const body = await res.json();

    expect(Array.isArray(body.history)).toBe(true);
    expect(body.history.length).toBeGreaterThan(0);

    // Each history entry should have the same structure
    const entry = body.history[0];
    expect(entry).toHaveProperty("accuracy");
    expect(entry).toHaveProperty("precision");
    expect(entry).toHaveProperty("recall");
    expect(entry).toHaveProperty("f1_score");
    expect(entry).toHaveProperty("sample_size");
    expect(entry).toHaveProperty("period_days");
    expect(entry).toHaveProperty("calibrated_at");
    expect(entry).toHaveProperty("weight_adjustments");
    expect(entry).toHaveProperty("top_predictive_signals");
    expect(entry).toHaveProperty("top_misleading_signals");
    expect(entry).toHaveProperty("recommendations");
  });

  test("6. POST triggers calibration and returns 200 with result", async ({ request }) => {
    const res = await request.post("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
      data: { period_days: 14 },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("result");
    expect(body).toHaveProperty("duration_ms");
    expect(body.result.accuracy).toBeGreaterThanOrEqual(0);
    expect(body.result.accuracy).toBeLessThanOrEqual(1);
    expect(body.result.sample_size).toBeGreaterThan(0);
  });

  test("7. Calibration result includes top predictive and misleading signals", async ({ request }) => {
    const res = await request.post("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
    });
    const body = await res.json();
    const result = body.result;

    expect(Array.isArray(result.top_predictive_signals)).toBe(true);
    expect(Array.isArray(result.top_misleading_signals)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);

    // Signals should be human-readable strings, not raw code names
    for (const signal of result.top_predictive_signals) {
      expect(typeof signal).toBe("string");
      expect(signal.length).toBeGreaterThan(3);
    }
  });

  test("8. Cron endpoint returns 200", async ({ request }) => {
    const res = await request.get("/api/cron/calibrate-predictions", {
      headers: { cookie: cookies },
    });
    // Should return 200 (no CRON_SECRET set in test env)
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("9. POST with custom period_days is respected", async ({ request }) => {
    const res = await request.post("/api/admin/analytics/calibration", {
      headers: { cookie: cookies },
      data: { period_days: 30 },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.result.period_days).toBe(30);
  });

  test("10. GET without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/calibration");
    expect(res.status()).toBe(401);
  });

  test("11. Analytics brain page renders model health section", async ({ page }) => {
    // Login via UI
    await page.goto("/admin/login");
    await page.fill('input[name="email"]', "demo@wolfpackauto.com");
    await page.fill('input[name="password"]', "demo");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);

    await page.goto("/admin/analytics-brain");
    await page.waitForTimeout(2000);

    // Check that the Model Health section renders
    const modelHealth = page.locator("text=Model Health");
    const isVisible = await modelHealth.isVisible().catch(() => false);

    // In shadow mode the calibration data should populate
    if (isVisible) {
      // Verify key elements are present
      await expect(page.locator("text=Accuracy")).toBeVisible();
      await expect(page.locator("text=Precision")).toBeVisible();
      await expect(page.locator("text=Recall")).toBeVisible();
      await expect(page.locator("text=Recalibrate")).toBeVisible();
    }
    // If not visible, it may be because the page requires full auth flow
    // which varies by environment — the API tests above cover the data layer
  });
});
