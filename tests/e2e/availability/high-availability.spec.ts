/**
 * High-Availability E2E Tests
 *
 * Validates the HA infrastructure: circuit breaker, safe-fetch, health
 * endpoint, system dashboard, and graceful degradation.
 *
 * Run with: npx playwright test tests/e2e/availability/high-availability.spec.ts
 */

import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Health endpoint tests                                                       */
/* -------------------------------------------------------------------------- */

test.describe("GET /api/admin/system/health", () => {
  test("returns a health status object", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    // Accept 200 (healthy/degraded) or 503 (critical — DB may not be running)
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(["healthy", "degraded", "critical"]).toContain(body.status);
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("responseTimeMs");
  });

  test("reports database connection status", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    const body = await res.json();

    expect(body).toHaveProperty("database");
    expect(body.database).toHaveProperty("connected");
    expect(typeof body.database.connected).toBe("boolean");
    expect(body.database).toHaveProperty("queryLatencyMs");
  });

  test("reports circuit_breaker_state", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    const body = await res.json();

    expect(body.database).toHaveProperty("circuitBreakerState");
    expect(["CLOSED", "OPEN", "HALF_OPEN"]).toContain(
      body.database.circuitBreakerState,
    );
  });

  test("reports external services status", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    const body = await res.json();

    expect(body).toHaveProperty("externalServices");
    expect(Array.isArray(body.externalServices)).toBe(true);
    expect(body.externalServices.length).toBeGreaterThan(0);

    for (const svc of body.externalServices) {
      expect(svc).toHaveProperty("name");
      expect(svc).toHaveProperty("configured");
      expect(svc).toHaveProperty("status");
    }
  });

  test("reports analytics pipeline status", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    const body = await res.json();

    expect(body).toHaveProperty("analytics");
    expect(body.analytics).toHaveProperty("eventsFlowing");
    expect(body.analytics).toHaveProperty("eventsLastHour");
    expect(body.analytics).toHaveProperty("learningActive");
  });

  test("reports deployment info", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    const body = await res.json();

    expect(body).toHaveProperty("deployment");
    expect(body.deployment).toHaveProperty("commitHash");
    expect(body.deployment).toHaveProperty("environment");
  });

  test("reports uptime", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    const body = await res.json();

    expect(body).toHaveProperty("uptime");
    expect(body.uptime).toHaveProperty("seconds");
    expect(body.uptime).toHaveProperty("formatted");
    expect(typeof body.uptime.seconds).toBe("number");
  });

  test("never returns 500 (graceful error handling)", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    // 200 for healthy/degraded, 503 for critical — never 500
    expect(res.status()).not.toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/* System dashboard page tests                                                 */
/* -------------------------------------------------------------------------- */

test.describe("System Health Dashboard", () => {
  test("system page loads with status cards", async ({ page }) => {
    await page.goto("/admin/system");
    // Page title
    await expect(page.locator("h1")).toContainText("System Health");
    // Status cards should be present
    const cards = page.locator("[data-testid^='status-card-']");
    await expect(cards.first()).toBeVisible();
  });

  test("system page shows circuit breaker state", async ({ page }) => {
    await page.goto("/admin/system");
    const cb = page.locator("[data-testid='circuit-breaker-state']");
    await expect(cb).toBeVisible();
    const text = await cb.textContent();
    expect(["CLOSED", "OPEN", "HALF_OPEN"]).toContain(text?.trim());
  });
});

/* -------------------------------------------------------------------------- */
/* Graceful degradation tests                                                  */
/* -------------------------------------------------------------------------- */

test.describe("Graceful degradation", () => {
  test("middleware sets X-Request-Timeout header", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-request-timeout"]).toBe("30000");
  });
});
