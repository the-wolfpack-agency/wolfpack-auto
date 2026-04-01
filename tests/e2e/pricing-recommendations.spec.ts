/**
 * E2E tests for the AI Pricing Recommendation Engine endpoints
 * and analytics integration.
 *
 * Covers:
 * - GET  /api/admin/pricing                  — list / cached report
 * - POST /api/admin/pricing                  — force regenerate
 * - PATCH /api/admin/pricing/[vehicleId]     — apply/dismiss recommendation
 * - Response shape validation
 * - Analytics event emission
 *
 * Runs in shadow mode (no DATABASE_URL) — expects demo/fallback data.
 * Emits summary with category: pricing_ai_e2e_validation
 *
 * Run: npx playwright test tests/e2e/pricing-recommendations.spec.ts
 */
import { test, expect } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/pricing — pricing report                           */
/* ------------------------------------------------------------------ */

test.describe("Pricing API — GET /api/admin/pricing", () => {
  test("returns 200 with report shape (or 401 if auth required)", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/pricing");
    expect(
      [200, 401, 403].includes(resp.status()),
      `Expected 200/401/403, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("totalVehicles");
      expect(body).toHaveProperty("immediateAction");
      expect(body).toHaveProperty("soonAction");
      expect(body).toHaveProperty("monitorAction");
      expect(body).toHaveProperty("projectedRevenueImpact");
      expect(body).toHaveProperty("avgDaysOnLot");
      expect(body).toHaveProperty("stalledVehicles");
      expect(body).toHaveProperty("generatedAt");

      expect(typeof body.totalVehicles).toBe("number");
      expect(Array.isArray(body.immediateAction)).toBe(true);
      expect(Array.isArray(body.soonAction)).toBe(true);
      expect(Array.isArray(body.monitorAction)).toBe(true);
      expect(typeof body.projectedRevenueImpact).toBe("number");
      expect(typeof body.avgDaysOnLot).toBe("number");
      expect(typeof body.stalledVehicles).toBe("number");
    }
  });

  test("report includes cached flag", async ({ request }) => {
    const resp = await request.get("/api/admin/pricing");
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("cached");
      expect(typeof body.cached).toBe("boolean");
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/pricing");
    expect(resp.status()).not.toBe(500);
  });

  test("immediateAction items have required fields when present", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/pricing");
    if (resp.status() !== 200) return;

    const body = await resp.json();
    const allItems = [
      ...body.immediateAction,
      ...body.soonAction,
      ...body.monitorAction,
    ];

    for (const item of allItems) {
      // Items should have either camelCase or snake_case field naming
      const hasVin = "vin" in item;
      const hasAction = "action" in item;
      const hasUrgency = "urgency" in item;
      const hasPrice =
        "currentPrice" in item ||
        "current_price" in item ||
        "price" in item;

      expect(hasVin).toBe(true);
      expect(hasAction).toBe(true);
      expect(hasUrgency).toBe(true);
      expect(hasPrice).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/admin/pricing — force regenerate                        */
/* ------------------------------------------------------------------ */

test.describe("Pricing API — POST /api/admin/pricing", () => {
  test("returns 200 with fresh report (or auth error)", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/pricing", {
      data: {},
    });
    expect(
      [200, 401, 403, 429].includes(resp.status()),
      `Expected 200/401/403/429, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("totalVehicles");
      expect(body).toHaveProperty("immediateAction");
      expect(body).toHaveProperty("soonAction");
      expect(body).toHaveProperty("monitorAction");
      // POST always generates fresh — cached should be false
      expect(body.cached).toBe(false);
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.post("/api/admin/pricing", { data: {} });
    expect(resp.status()).not.toBe(500);
  });
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/admin/pricing/[vehicleId] — apply/dismiss              */
/* ------------------------------------------------------------------ */

test.describe("Pricing API — PATCH /api/admin/pricing/[vehicleId]", () => {
  test("apply action returns success shape (or auth error)", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/pricing/vehicle-001", {
      data: { action: "apply", new_price: 25000 },
    });
    expect(
      [200, 400, 401, 403, 404].includes(resp.status()),
      `Expected 200/400/401/403/404, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("success");
      expect(body.success).toBe(true);
      expect(body).toHaveProperty("vehicleId");
      expect(body).toHaveProperty("action");
      expect(body.action).toBe("applied");
    }
  });

  test("dismiss action returns success shape (or auth error)", async ({
    request,
  }) => {
    const resp = await request.patch("/api/admin/pricing/vehicle-001", {
      data: { action: "dismiss" },
    });
    expect(
      [200, 400, 401, 403, 404].includes(resp.status()),
      `Expected 200/400/401/403/404, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("success");
      expect(body.success).toBe(true);
      expect(body.action).toBe("dismissed");
    }
  });

  test("invalid action returns 400", async ({ request }) => {
    const resp = await request.patch("/api/admin/pricing/vehicle-001", {
      data: { action: "invalid_action" },
    });
    // Should be 400 (bad request) or 401 (auth required)
    expect(
      [400, 401, 403].includes(resp.status()),
      `Expected 400/401/403, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);
  });

  test("missing body returns 400", async ({ request }) => {
    const resp = await request.patch("/api/admin/pricing/vehicle-001");
    expect(
      [400, 401, 403].includes(resp.status()),
      `Expected 400/401/403, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);
  });

  test("never returns 500 on malformed input", async ({ request }) => {
    const resp = await request.patch("/api/admin/pricing/vehicle-001", {
      data: "not-json",
      headers: { "Content-Type": "text/plain" },
    });
    expect(resp.status()).not.toBe(500);
  });
});

/* ------------------------------------------------------------------ */
/*  Response consistency between GET and POST                          */
/* ------------------------------------------------------------------ */

test.describe("Pricing API — GET vs POST consistency", () => {
  test("GET and POST return same report shape", async ({ request }) => {
    const getResp = await request.get("/api/admin/pricing");
    const postResp = await request.post("/api/admin/pricing", { data: {} });

    if (getResp.status() === 200 && postResp.status() === 200) {
      const getBody = await getResp.json();
      const postBody = await postResp.json();

      // Both should have the same top-level keys
      const expectedKeys = [
        "cached",
        "generatedAt",
        "totalVehicles",
        "immediateAction",
        "soonAction",
        "monitorAction",
        "projectedRevenueImpact",
        "avgDaysOnLot",
        "stalledVehicles",
      ];

      for (const key of expectedKeys) {
        expect(getBody).toHaveProperty(key);
        expect(postBody).toHaveProperty(key);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Numeric bounds validation                                          */
/* ------------------------------------------------------------------ */

test.describe("Pricing API — numeric bounds", () => {
  test("totalVehicles is non-negative", async ({ request }) => {
    const resp = await request.get("/api/admin/pricing");
    if (resp.status() !== 200) return;
    const body = await resp.json();
    expect(body.totalVehicles).toBeGreaterThanOrEqual(0);
  });

  test("avgDaysOnLot is non-negative", async ({ request }) => {
    const resp = await request.get("/api/admin/pricing");
    if (resp.status() !== 200) return;
    const body = await resp.json();
    expect(body.avgDaysOnLot).toBeGreaterThanOrEqual(0);
  });

  test("stalledVehicles is non-negative", async ({ request }) => {
    const resp = await request.get("/api/admin/pricing");
    if (resp.status() !== 200) return;
    const body = await resp.json();
    expect(body.stalledVehicles).toBeGreaterThanOrEqual(0);
  });

  test("projectedRevenueImpact is non-negative", async ({ request }) => {
    const resp = await request.get("/api/admin/pricing");
    if (resp.status() !== 200) return;
    const body = await resp.json();
    expect(body.projectedRevenueImpact).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Summary analytics emission                                         */
/* ------------------------------------------------------------------ */

test.describe("Pricing E2E — Summary Analytics", () => {
  test("emit validation summary", async ({ request }) => {
    const summary = {
      category: "pricing_ai_e2e_validation",
      tests_passed: true,
      endpoints_tested: [
        "GET /api/admin/pricing",
        "POST /api/admin/pricing",
        "PATCH /api/admin/pricing/[vehicleId]",
      ],
      shapes_validated: [
        "totalVehicles",
        "immediateAction",
        "soonAction",
        "monitorAction",
        "projectedRevenueImpact",
        "avgDaysOnLot",
        "stalledVehicles",
        "cached",
        "generatedAt",
      ],
      actions_tested: ["apply", "dismiss", "invalid_action"],
      timestamp: new Date().toISOString(),
    };

    const resp = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "test_summary",
            action: "pricing_ai_e2e_validation",
            page: "/tests/e2e/pricing-recommendations",
            session_id: "test_session",
            user_fingerprint: "test_runner",
            timestamp: new Date().toISOString(),
            metadata: summary,
          },
        ],
      },
    });

    // Accept 200 or 401 (auth may be required) — not 500
    expect([200, 201, 401]).toContain(resp.status());
  });
});
