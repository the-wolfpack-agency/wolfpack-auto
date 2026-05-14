/**
 * A/B Testing Engine — E2E Tests
 *
 * Validates the A/B testing endpoints return correct response shapes
 * with real structure validation.
 *
 * Endpoints tested:
 *   GET  /api/admin/analytics/ab-tests — List all A/B tests with results
 *   POST /api/admin/analytics/ab-tests — Create a new A/B test
 */

import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

test.describe("A/B Testing API", () => {
  test("GET /api/admin/analytics/ab-tests returns 200 with tests array", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/analytics/ab-tests");
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `/api/admin/analytics/ab-tests returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    const body = await resp.json();

    // Top-level structure
    expect(body).toHaveProperty("tests");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.tests)).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(body.tests.length);
  });

  test("GET /api/admin/analytics/ab-tests — each test has name, variants, and conversion rates", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/analytics/ab-tests");
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.tests.length).toBeGreaterThan(0);

    const VALID_STATUSES = ["active", "paused", "completed"];

    for (const t of body.tests) {
      // Required fields per ABTestResult type
      expect(t).toHaveProperty("name");
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);

      expect(t).toHaveProperty("variants");
      expect(Array.isArray(t.variants)).toBe(true);
      expect(t.variants.length).toBeGreaterThanOrEqual(2);

      expect(t).toHaveProperty("status");
      expect(VALID_STATUSES).toContain(t.status);

      expect(t).toHaveProperty("created_at");
      expect(new Date(t.created_at).getTime()).toBeGreaterThan(0);

      // winner is nullable
      expect(t).toHaveProperty("winner");

      expect(t).toHaveProperty("confidence");
      expect(typeof t.confidence).toBe("number");
      expect(t.confidence).toBeGreaterThanOrEqual(0);
      expect(t.confidence).toBeLessThanOrEqual(1);

      // Validate each variant
      for (const v of t.variants) {
        expect(v).toHaveProperty("variant");
        expect(typeof v.variant).toBe("string");

        expect(v).toHaveProperty("assignments");
        expect(typeof v.assignments).toBe("number");
        expect(v.assignments).toBeGreaterThanOrEqual(0);

        expect(v).toHaveProperty("conversions");
        expect(typeof v.conversions).toBe("number");
        expect(v.conversions).toBeGreaterThanOrEqual(0);

        expect(v).toHaveProperty("conversion_rate");
        expect(typeof v.conversion_rate).toBe("number");
        expect(v.conversion_rate).toBeGreaterThanOrEqual(0);
        expect(v.conversion_rate).toBeLessThanOrEqual(1);
      }
    }
  });

  test("POST /api/admin/analytics/ab-tests creates a test and returns 201", async ({
    request,
  }) => {
    const testName = `e2e_test_${Date.now()}`;
    const resp = await request.post("/api/admin/analytics/ab-tests", {
      data: {
        name: testName,
        variants: ["control", "variant_a"],
        target_metric: "cta_click",
      },
    });
    const status = resp.status();

    if (status !== 201) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `POST /api/admin/analytics/ab-tests returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(201);
    }

    const body = await resp.json();

    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("test");
    expect(body.test).toHaveProperty("name");
    expect(body.test.name).toBe(testName);
    expect(body.test).toHaveProperty("variants");
    expect(body.test.variants).toEqual(["control", "variant_a"]);
    expect(body.test).toHaveProperty("target_metric");
    expect(body.test.target_metric).toBe("cta_click");
    expect(body.test).toHaveProperty("status");
    expect(body.test.status).toBe("active");
    expect(body.test).toHaveProperty("created_at");
  });

  test("POST /api/admin/analytics/ab-tests with missing name returns 400", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/analytics/ab-tests", {
      data: {
        variants: ["a", "b"],
        target_metric: "click",
      },
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body.error.toLowerCase()).toContain("name");
  });

  test("POST /api/admin/analytics/ab-tests with missing variants returns 400", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/analytics/ab-tests", {
      data: {
        name: "test_no_variants",
        target_metric: "click",
      },
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body.error.toLowerCase()).toContain("variants");
  });

  test("POST /api/admin/analytics/ab-tests with only 1 variant returns 400", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/analytics/ab-tests", {
      data: {
        name: "test_one_variant",
        variants: ["only_one"],
        target_metric: "click",
      },
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body.error.toLowerCase()).toContain("variants");
  });

  test("POST /api/admin/analytics/ab-tests with missing target_metric returns 400", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/analytics/ab-tests", {
      data: {
        name: "test_no_metric",
        variants: ["a", "b"],
      },
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body.error.toLowerCase()).toContain("target_metric");
  });

  test("POST /api/admin/analytics/ab-tests with 3+ variants succeeds", async ({
    request,
  }) => {
    const testName = `e2e_multivariant_${Date.now()}`;
    const resp = await request.post("/api/admin/analytics/ab-tests", {
      data: {
        name: testName,
        variants: ["control", "variant_a", "variant_b"],
        target_metric: "vehicle_view",
      },
    });

    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.test.variants).toEqual(["control", "variant_a", "variant_b"]);
  });
});
