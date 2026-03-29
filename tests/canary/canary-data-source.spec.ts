/**
 * Canary: Data Source Verification
 *
 * Hits real API endpoints and verifies responses come from the database,
 * NOT from Shadow Mode fallback data. Shadow Mode responses are detectable
 * by specific patterns: "Shadow mode" messages, hardcoded IDs, and static
 * placeholder data.
 */

import { test, expect } from "@playwright/test";

/** Known Shadow Mode marker patterns */
const SHADOW_MARKERS = [
  "shadow mode",
  "Shadow mode",
  "no database configured",
  "shadow-vehicle",
  "SHADOW00000000000",
  "placeholder",
];

function assertNotShadow(body: Record<string, unknown>, endpoint: string): void {
  const bodyStr = JSON.stringify(body);
  for (const marker of SHADOW_MARKERS) {
    if (bodyStr.includes(marker)) {
      throw new Error(
        `[${endpoint}] Shadow Mode detected — response contains "${marker}". ` +
          "The deployment is NOT connected to a real database.",
      );
    }
  }
}

test.describe("Data Source — Real Database Verification", () => {
  test("GET /api/health returns real database probe", async ({ request }) => {
    const res = await request.get("/api/health");
    // Accept 200 (healthy) or 200 (degraded) — just not shadow fallback
    expect(res.status()).toBeLessThan(500);

    const body = await res.json();
    // The shallow health endpoint should show Postgres connected
    if (body.checks?.postgres) {
      expect(body.checks.postgres.ok).toBe(true);
    }
  });

  test("GET /api/admin/stats returns real counts", async ({ request }) => {
    const res = await request.get("/api/admin/stats");
    if (res.status() === 401) {
      test.skip(true, "Auth required — skipping in authenticated mode");
      return;
    }
    const body = await res.json();
    assertNotShadow(body, "/api/admin/stats");
  });

  test("GET /api/inventory returns real vehicles or empty array", async ({ request }) => {
    const res = await request.get("/api/inventory");
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Real response: { vehicles: [...] } or array — no shadow markers
    assertNotShadow(body, "/api/inventory");

    // If vehicles exist, verify they have real database fields
    const vehicles = Array.isArray(body) ? body : body.vehicles ?? [];
    if (vehicles.length > 0) {
      const v = vehicles[0];
      // Real vehicles have database-generated fields
      expect(v.vin || v.VIN).toBeTruthy();
      // VIN should NOT be a shadow placeholder
      const vin = (v.vin || v.VIN || "").toString();
      expect(vin).not.toContain("SHADOW");
    }
  });

  test("GET /api/admin/leads returns real data or empty", async ({ request }) => {
    const res = await request.get("/api/admin/leads");
    if (res.status() === 401) {
      test.skip(true, "Auth required — skipping");
      return;
    }
    const body = await res.json();
    assertNotShadow(body, "/api/admin/leads");
  });

  test("GET /api/admin/system/health confirms database connected", async ({ request }) => {
    const res = await request.get("/api/admin/system/health");
    if (res.status() === 401) {
      test.skip(true, "Auth required — skipping");
      return;
    }
    const body = await res.json();

    // The system health endpoint explicitly reports database status
    expect(body.database?.connected).toBe(true);
    expect(body.database?.circuitBreakerState).toBe("CLOSED");
  });

  test("multiple endpoints return consistent data source", async ({ request }) => {
    // Hit deep health to confirm DB is connected, then verify
    // other endpoints also serve from DB (not a split-brain scenario)
    const healthRes = await request.get("/api/health/deep");
    const health = await healthRes.json();

    if (health.status === "shadow") {
      test.fail(true, "Deployment is in shadow mode — all data source tests invalid");
      return;
    }

    // If deep health says DB is connected, inventory should also be real
    const invRes = await request.get("/api/inventory");
    const invBody = await invRes.json();
    assertNotShadow(invBody, "/api/inventory (cross-check)");
  });
});
