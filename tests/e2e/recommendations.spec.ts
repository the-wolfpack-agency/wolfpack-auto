/**
 * Lookalike Recommendation Engine — E2E Tests
 *
 * Validates the public inventory recommendations endpoint returns correct
 * response shapes with real structure validation.
 *
 * Endpoint tested:
 *   GET /api/inventory/recommendations?vin=X — Related vehicles (co-viewed)
 *   GET /api/inventory/recommendations?session=X — Personalized recommendations
 */

import { test, expect } from "@playwright/test";

test.describe("Inventory Recommendations API", () => {
  test("GET /api/inventory/recommendations?vin=X returns 200 with recommendations", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/inventory/recommendations?vin=1HGBH41JXMN109186",
    );
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `/api/inventory/recommendations?vin=X returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    const body = await resp.json();

    // Top-level structure
    expect(body).toHaveProperty("type");
    expect(body.type).toBe("related_vehicles");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(body.recommendations.length);
  });

  test("GET /api/inventory/recommendations?vin=X — each recommendation has required fields", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/inventory/recommendations?vin=1HGBH41JXMN109186",
    );
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.recommendations.length).toBeGreaterThan(0);

    for (const rec of body.recommendations) {
      expect(rec).toHaveProperty("vin");
      expect(rec).toHaveProperty("year");
      expect(rec).toHaveProperty("make");
      expect(rec).toHaveProperty("model");
      expect(rec).toHaveProperty("price");
      expect(rec).toHaveProperty("score");
      expect(rec).toHaveProperty("reason");

      // Type validations
      expect(typeof rec.vin).toBe("string");
      expect(rec.vin.length).toBeGreaterThan(0);
      expect(typeof rec.year).toBe("number");
      expect(rec.year).toBeGreaterThanOrEqual(1990);
      expect(rec.year).toBeLessThanOrEqual(2030);
      expect(typeof rec.make).toBe("string");
      expect(rec.make.length).toBeGreaterThan(0);
      expect(typeof rec.model).toBe("string");
      expect(rec.model.length).toBeGreaterThan(0);
      expect(typeof rec.price).toBe("number");
      expect(rec.price).toBeGreaterThan(0);
      expect(typeof rec.score).toBe("number");
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(1);
      expect(typeof rec.reason).toBe("string");
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });

  test("GET /api/inventory/recommendations?session=X returns personalized recommendations", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/inventory/recommendations?session=test-fingerprint-abc123",
    );
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `/api/inventory/recommendations?session=X returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    const body = await resp.json();

    expect(body).toHaveProperty("type");
    expect(body.type).toBe("user_recommendations");
    expect(body).toHaveProperty("recommendations");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(body.count).toBe(body.recommendations.length);

    // Each recommendation should have the same shape
    for (const rec of body.recommendations) {
      expect(rec).toHaveProperty("vin");
      expect(rec).toHaveProperty("year");
      expect(rec).toHaveProperty("make");
      expect(rec).toHaveProperty("model");
      expect(rec).toHaveProperty("price");
      expect(rec).toHaveProperty("score");
      expect(rec).toHaveProperty("reason");
    }
  });

  test("GET /api/inventory/recommendations without params returns 400", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory/recommendations");
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("vin");
  });

  test("GET /api/inventory/recommendations?vin=X&limit=3 respects limit parameter", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/inventory/recommendations?vin=1HGBH41JXMN109186&limit=3",
    );
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.recommendations.length).toBeLessThanOrEqual(3);
    expect(body.count).toBeLessThanOrEqual(3);
  });

  test("GET /api/inventory/recommendations?vin=X&limit=1 returns at most 1 result", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/inventory/recommendations?vin=1HGBH41JXMN109186&limit=1",
    );
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.recommendations.length).toBeLessThanOrEqual(1);
    expect(body.count).toBeLessThanOrEqual(1);
  });

  test("GET /api/inventory/recommendations?vin=X — recommended VINs do not include the query VIN", async ({
    request,
  }) => {
    const queryVin = "1HGBH41JXMN109186";
    const resp = await request.get(
      `/api/inventory/recommendations?vin=${queryVin}`,
    );
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    for (const rec of body.recommendations) {
      expect(
        rec.vin,
        `Recommendation should not include the queried VIN ${queryVin}`,
      ).not.toBe(queryVin);
    }
  });
});
