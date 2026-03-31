/**
 * Engagement Alerts — E2E Tests
 *
 * Validates the real-time engagement alert system:
 *   - API returns 200 with correct structure
 *   - Alerts have required fields and valid types
 *   - Priority sorting (critical first)
 *   - PATCH dismiss returns 200
 *   - Admin page renders
 *   - Stats included in response
 *   - Dashboard widget data available
 */

import { test, expect } from "@playwright/test";

const VALID_ALERT_TYPES = [
  "hot_return",
  "price_serious",
  "comparison_ready",
  "repeat_viewer",
  "budget_revealed",
  "video_engaged",
  "about_to_leave",
  "competitor_risk",
];

const VALID_PRIORITIES = ["critical", "high", "medium"];

test.describe("Engagement Alerts API", () => {
  test("GET /api/admin/alerts returns 200 with alerts array", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/alerts");
    expect(resp.status()).toBe(200);

    const json = await resp.json();
    expect(json).toHaveProperty("alerts");
    expect(Array.isArray(json.alerts)).toBe(true);
    expect(json.alerts.length).toBeGreaterThan(0);
  });

  test("each alert has required fields", async ({ request }) => {
    const resp = await request.get("/api/admin/alerts");
    expect(resp.status()).toBe(200);

    const { alerts } = await resp.json();
    for (const alert of alerts) {
      expect(alert).toHaveProperty("id");
      expect(alert).toHaveProperty("type");
      expect(alert).toHaveProperty("priority");
      expect(alert).toHaveProperty("recommended_action");
      expect(alert).toHaveProperty("signals_triggered");
      expect(alert).toHaveProperty("created_at");
      expect(alert).toHaveProperty("expires_at");
      expect(typeof alert.id).toBe("string");
      expect(typeof alert.recommended_action).toBe("string");
      expect(Array.isArray(alert.signals_triggered)).toBe(true);
      expect(alert.signals_triggered.length).toBeGreaterThan(0);
    }
  });

  test("alert types are valid", async ({ request }) => {
    const resp = await request.get("/api/admin/alerts");
    const { alerts } = await resp.json();

    for (const alert of alerts) {
      expect(VALID_ALERT_TYPES).toContain(alert.type);
    }
  });

  test("alert priorities are valid", async ({ request }) => {
    const resp = await request.get("/api/admin/alerts");
    const { alerts } = await resp.json();

    for (const alert of alerts) {
      expect(VALID_PRIORITIES).toContain(alert.priority);
    }
  });

  test("alerts sorted by priority (critical first)", async ({ request }) => {
    const resp = await request.get("/api/admin/alerts");
    const { alerts } = await resp.json();

    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
    };

    for (let i = 1; i < alerts.length; i++) {
      const prev = priorityOrder[alerts[i - 1].priority] ?? 99;
      const curr = priorityOrder[alerts[i].priority] ?? 99;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  test("response includes stats object", async ({ request }) => {
    const resp = await request.get("/api/admin/alerts");
    expect(resp.status()).toBe(200);

    const json = await resp.json();
    expect(json).toHaveProperty("stats");
    expect(json.stats).toHaveProperty("alerts_today");
    expect(json.stats).toHaveProperty("actioned_pct");
    expect(json.stats).toHaveProperty("avg_response_time_minutes");
    expect(typeof json.stats.alerts_today).toBe("number");
    expect(typeof json.stats.actioned_pct).toBe("number");
  });

  test("PATCH dismiss returns 200", async ({ request }) => {
    // First get an alert ID
    const getResp = await request.get("/api/admin/alerts");
    const { alerts } = await getResp.json();
    expect(alerts.length).toBeGreaterThan(0);

    const alertId = alerts[0].id;
    const patchResp = await request.patch("/api/admin/alerts", {
      data: { alert_id: alertId, action: "dismiss" },
    });
    expect(patchResp.status()).toBe(200);

    const patchJson = await patchResp.json();
    expect(patchJson.success).toBe(true);
    expect(patchJson.alert_id).toBe(alertId);
    expect(patchJson.action).toBe("dismiss");
  });

  test("PATCH with contacted action returns 200", async ({ request }) => {
    const getResp = await request.get("/api/admin/alerts");
    const { alerts } = await getResp.json();
    expect(alerts.length).toBeGreaterThan(0);

    const alertId = alerts[0].id;
    const patchResp = await request.patch("/api/admin/alerts", {
      data: { alert_id: alertId, action: "contacted" },
    });
    expect(patchResp.status()).toBe(200);

    const patchJson = await patchResp.json();
    expect(patchJson.success).toBe(true);
    expect(patchJson.action).toBe("contacted");
  });

  test("PATCH with invalid action returns 400", async ({ request }) => {
    const patchResp = await request.patch("/api/admin/alerts", {
      data: { alert_id: "test-123", action: "invalid_action" },
    });
    expect(patchResp.status()).toBe(400);
  });

  test("PATCH without alert_id returns 400", async ({ request }) => {
    const patchResp = await request.patch("/api/admin/alerts", {
      data: { action: "dismiss" },
    });
    expect(patchResp.status()).toBe(400);
  });

  test("alerts have vehicle_interest or customer_name where available", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/alerts");
    const { alerts } = await resp.json();

    // At least some shadow alerts should have customer names and vehicle interest
    const withNames = alerts.filter(
      (a: { customer_name: string | null }) => a.customer_name !== null,
    );
    expect(withNames.length).toBeGreaterThan(0);

    const withVehicles = alerts.filter(
      (a: { vehicle_interest: string | null }) => a.vehicle_interest !== null,
    );
    expect(withVehicles.length).toBeGreaterThan(0);
  });
});

test.describe("Engagement Alerts Admin Page", () => {
  test("/admin/alerts page loads with heading", async ({ page }) => {
    await page.goto("/admin/alerts");
    const heading = page.getByRole("heading", { name: /engagement alerts/i });
    await expect(heading).toBeVisible();
  });
});
