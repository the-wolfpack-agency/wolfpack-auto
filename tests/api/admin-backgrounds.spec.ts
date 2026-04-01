/**
 * VDP Backgrounds — API Contract Tests
 *
 * Validates the request/response contracts for all background endpoints.
 * Tests shape, types, status codes, and edge cases.
 *
 * Emit analytics with category: backgrounds_api_validation
 */

import { test, expect } from "@playwright/test";

const BASE = "/api/admin/vehicles/backgrounds";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/vehicles/backgrounds                                */
/* ------------------------------------------------------------------ */

test.describe("Backgrounds API — List Presets", () => {
  test("returns 200 with presets array and count", async ({ request }) => {
    const res = await request.get(BASE);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("presets");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.count).toBe(body.presets.length);
  });

  test("each preset has id, name, description, thumbnailCSS, category", async ({
    request,
  }) => {
    const res = await request.get(BASE);
    const { presets } = await res.json();

    for (const p of presets) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.description).toBe("string");
      expect(typeof p.thumbnailCSS).toBe("string");
      expect(typeof p.category).toBe("string");
      expect(p.thumbnailCSS).toMatch(/background:/);
    }
  });

  test("preset categories are one of studio, outdoor, branded, seasonal", async ({
    request,
  }) => {
    const res = await request.get(BASE);
    const { presets } = await res.json();
    const validCategories = new Set(["studio", "outdoor", "branded", "seasonal"]);
    for (const p of presets) {
      expect(validCategories.has(p.category)).toBe(true);
    }
  });

  test("returns exactly 8 presets", async ({ request }) => {
    const res = await request.get(BASE);
    const { count } = await res.json();
    expect(count).toBe(8);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/admin/vehicles/backgrounds                               */
/* ------------------------------------------------------------------ */

test.describe("Backgrounds API — Apply Preset", () => {
  test("applies preset and returns vin, preset, css, applied_at", async ({
    request,
  }) => {
    const res = await request.post(BASE, {
      data: { vin: "CONTRACT_VIN_01", preset: "showroom_white" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.vin).toBe("CONTRACT_VIN_01");
    expect(body.preset).toBe("showroom_white");
    expect(body.preset_name).toBe("White Showroom");
    expect(typeof body.css).toBe("string");
    expect(body.css).toContain("background:");
    expect(typeof body.applied_at).toBe("string");
  });

  test("returns 400 for missing vin", async ({ request }) => {
    const res = await request.post(BASE, {
      data: { preset: "showroom_white" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("vin");
  });

  test("returns 400 for missing preset", async ({ request }) => {
    const res = await request.post(BASE, {
      data: { vin: "CONTRACT_VIN_01" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("preset");
  });

  test("returns 400 for unknown preset ID", async ({ request }) => {
    const res = await request.post(BASE, {
      data: { vin: "CONTRACT_VIN_01", preset: "does_not_exist" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unknown preset");
  });

  test("dealer_branded includes custom colors in CSS", async ({ request }) => {
    const res = await request.post(BASE, {
      data: {
        vin: "CONTRACT_VIN_02",
        preset: "dealer_branded",
        dealer_colors: { primary: "#abc123", secondary: "#def456" },
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.css).toContain("#abc123");
    expect(body.css).toContain("#def456");
  });

  test("minimalist includes vehicle_color in CSS", async ({ request }) => {
    const res = await request.post(BASE, {
      data: {
        vin: "CONTRACT_VIN_03",
        preset: "minimalist",
        vehicle_color: "#990011",
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.css).toContain("#990011");
  });

  test("applying to same VIN twice overwrites", async ({ request }) => {
    await request.post(BASE, {
      data: { vin: "CONTRACT_VIN_04", preset: "showroom_white" },
    });
    const res = await request.post(BASE, {
      data: { vin: "CONTRACT_VIN_04", preset: "showroom_dark" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.preset).toBe("showroom_dark");
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/admin/vehicles/backgrounds/recommend                      */
/* ------------------------------------------------------------------ */

test.describe("Backgrounds API — Recommend", () => {
  test("returns recommendation for a VIN", async ({ request }) => {
    const res = await request.get(`${BASE}/recommend?vin=REC_VIN_01`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.vin).toBe("REC_VIN_01");
    expect(typeof body.preset).toBe("string");
    expect(typeof body.reason).toBe("string");
    expect(body.reason.length).toBeGreaterThan(5);
  });

  test("returns 400 when vin query param is missing", async ({ request }) => {
    const res = await request.get(`${BASE}/recommend`);
    expect(res.status()).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/admin/vehicles/backgrounds/recommend                     */
/* ------------------------------------------------------------------ */

test.describe("Backgrounds API — Batch Recommend", () => {
  test("returns recommendations for multiple VINs", async ({ request }) => {
    const res = await request.post(`${BASE}/recommend`, {
      data: { vins: ["BATCH_01", "BATCH_02", "BATCH_03"] },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.recommendations).toHaveLength(3);
    expect(body.count).toBe(3);

    for (const rec of body.recommendations) {
      expect(typeof rec.vin).toBe("string");
      expect(typeof rec.recommended_preset).toBe("string");
      expect(typeof rec.reason).toBe("string");
    }
  });

  test("returns 400 for empty vins array", async ({ request }) => {
    const res = await request.post(`${BASE}/recommend`, {
      data: { vins: [] },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 for missing vins field", async ({ request }) => {
    const res = await request.post(`${BASE}/recommend`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 for too many VINs (>200)", async ({ request }) => {
    const vins = Array.from({ length: 201 }, (_, i) => `VIN_${i}`);
    const res = await request.post(`${BASE}/recommend`, {
      data: { vins },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("200");
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/admin/vehicles/backgrounds/insights                       */
/* ------------------------------------------------------------------ */

test.describe("Backgrounds API — Insights", () => {
  test("returns 200 with insights array", async ({ request }) => {
    const res = await request.get(`${BASE}/insights`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("insights");
    expect(Array.isArray(body.insights)).toBe(true);
    expect(typeof body.count).toBe("number");
  });

  test("insights entries have correct shape when data exists", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/insights`);
    const body = await res.json();

    // If there are insights, validate the shape
    if (body.insights.length > 0) {
      const insight = body.insights[0];
      expect(typeof insight.preset).toBe("string");
      expect(typeof insight.total_views).toBe("number");
      expect(typeof insight.avg_dwell_ms).toBe("number");
      expect(typeof insight.total_clicks).toBe("number");
      expect(typeof insight.total_leads).toBe("number");
      expect(typeof insight.engagement_score).toBe("number");
      expect(typeof insight.sample_size).toBe("number");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Emit analytics summary                                             */
/* ------------------------------------------------------------------ */

test("emit backgrounds_api_validation summary", async ({ request }) => {
  const res = await request.post("/api/analytics/events", {
    data: {
      events: [
        {
          event_type: "backgrounds_api_validation",
          action: "suite_completed",
          page: "/api/admin/vehicles/backgrounds",
          session_id: `bg_api_validation_${Date.now()}`,
          user_fingerprint: "api_test_runner",
          timestamp: new Date().toISOString(),
          metadata: {
            tests_run: 20,
            category: "backgrounds_api_validation",
          },
        },
      ],
    },
  });
  expect(res.status()).toBe(200);
});
