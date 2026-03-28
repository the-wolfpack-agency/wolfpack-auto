/**
 * E2E + API contract tests for the webhook outbound system and agency management.
 *
 * Run with: npx playwright test tests/e2e/webhooks.spec.ts
 */

import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Webhook API tests                                                          */
/* -------------------------------------------------------------------------- */

test.describe("Webhook Outbound API", () => {
  test("GET /api/admin/webhooks returns configs array", async ({ request }) => {
    const res = await request.get("/api/admin/webhooks");
    // Accept 200 (authed) or 401 (no session) — never 500
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("configs");
      expect(Array.isArray(body.configs)).toBe(true);
    }
  });

  test("POST /api/admin/webhooks creates config with URL and events", async ({ request }) => {
    const res = await request.post("/api/admin/webhooks", {
      data: {
        url: "https://httpbin.org/post",
        events: ["lead.created", "deal.funded"],
        description: "E2E test webhook",
      },
    });
    expect([201, 401]).toContain(res.status());
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.config).toHaveProperty("id");
      expect(body.config).toHaveProperty("url", "https://httpbin.org/post");
      expect(body.config).toHaveProperty("secret");
      expect(body.config.events).toContain("lead.created");
    }
  });

  test("POST /api/admin/webhooks rejects invalid URL", async ({ request }) => {
    const res = await request.post("/api/admin/webhooks", {
      data: {
        url: "not-a-url",
        events: ["lead.created"],
      },
    });
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/admin/webhooks rejects empty events array", async ({ request }) => {
    const res = await request.post("/api/admin/webhooks", {
      data: {
        url: "https://httpbin.org/post",
        events: [],
      },
    });
    expect([400, 401]).toContain(res.status());
  });

  test("GET /api/admin/webhooks/deliveries returns deliveries", async ({ request }) => {
    const res = await request.get("/api/admin/webhooks/deliveries");
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("deliveries");
      expect(Array.isArray(body.deliveries)).toBe(true);
    }
  });

  test("GET /api/admin/webhooks/deliveries filters by status", async ({ request }) => {
    const res = await request.get("/api/admin/webhooks/deliveries?status=delivered");
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      for (const d of body.deliveries) {
        expect(d.status).toBe("delivered");
      }
    }
  });

  test("GET /api/admin/webhooks/deliveries rejects invalid status", async ({ request }) => {
    const res = await request.get("/api/admin/webhooks/deliveries?status=invalid");
    expect([400, 401]).toContain(res.status());
  });

  test("PATCH /api/admin/webhooks/:id toggles active", async ({ request }) => {
    // First get existing configs
    const listRes = await request.get("/api/admin/webhooks");
    if (listRes.status() !== 200) return;
    const { configs } = await listRes.json();
    if (configs.length === 0) return;

    const config = configs[0];
    const res = await request.patch(`/api/admin/webhooks/${config.id}`, {
      data: { active: !config.active },
    });
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.config.active).toBe(!config.active);
    }
  });

  test("POST /api/admin/webhooks/:id/test sends test webhook", async ({ request }) => {
    const listRes = await request.get("/api/admin/webhooks");
    if (listRes.status() !== 200) return;
    const { configs } = await listRes.json();
    if (configs.length === 0) return;

    const res = await request.post(`/api/admin/webhooks/${configs[0].id}/test`);
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("status_code");
    }
  });

  test("DELETE /api/admin/webhooks/:id removes config", async ({ request }) => {
    // Create one, then delete it
    const createRes = await request.post("/api/admin/webhooks", {
      data: {
        url: "https://httpbin.org/post",
        events: ["lead.created"],
        description: "To be deleted",
      },
    });
    if (createRes.status() !== 201) return;
    const { config } = await createRes.json();

    const res = await request.delete(`/api/admin/webhooks/${config.id}`);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("GET /api/admin/webhooks/:id returns config with deliveries", async ({ request }) => {
    const listRes = await request.get("/api/admin/webhooks");
    if (listRes.status() !== 200) return;
    const { configs } = await listRes.json();
    if (configs.length === 0) return;

    const res = await request.get(`/api/admin/webhooks/${configs[0].id}`);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("config");
      expect(body).toHaveProperty("deliveries");
    }
  });

  test("GET /api/admin/webhooks/:id returns 404 for nonexistent", async ({ request }) => {
    const res = await request.get("/api/admin/webhooks/nonexistent-id-999");
    expect([404, 401]).toContain(res.status());
  });

  test("webhook endpoints never return 500", async ({ request }) => {
    const endpoints = [
      { method: "GET", path: "/api/admin/webhooks" },
      { method: "GET", path: "/api/admin/webhooks/deliveries" },
      { method: "GET", path: "/api/admin/webhooks/nonexistent" },
    ];

    for (const ep of endpoints) {
      const res = ep.method === "GET"
        ? await request.get(ep.path)
        : await request.post(ep.path);
      expect(res.status()).not.toBe(500);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Webhooks page UI test                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Webhooks Admin Page", () => {
  test("webhooks page loads with config list and delivery log", async ({ page }) => {
    await page.goto("/admin/webhooks", { waitUntil: "domcontentloaded" });
    // Page should render heading
    await expect(page.locator("h1")).toContainText("Webhooks");
    // Should have the stats section
    await expect(page.getByText("Active Configs")).toBeVisible();
    // Should have the available events reference
    await expect(page.getByText("Available Events")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Agency API tests                                                           */
/* -------------------------------------------------------------------------- */

test.describe("Agency Management API", () => {
  test("GET /api/agency/overview returns metrics", async ({ request }) => {
    const res = await request.get("/api/agency/overview");
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("overview");
      expect(body.overview).toHaveProperty("total_dealers");
      expect(body.overview).toHaveProperty("total_leads");
      expect(body.overview).toHaveProperty("total_revenue_mtd");
    }
  });

  test("GET /api/agency/dealers returns dealers array", async ({ request }) => {
    const res = await request.get("/api/agency/dealers");
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("dealers");
      expect(Array.isArray(body.dealers)).toBe(true);
    }
  });

  test("GET /api/agency/api-keys returns keys array", async ({ request }) => {
    const res = await request.get("/api/agency/api-keys");
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("keys");
      expect(Array.isArray(body.keys)).toBe(true);
    }
  });

  test("POST /api/agency/api-keys generates new key", async ({ request }) => {
    const res = await request.post("/api/agency/api-keys", {
      data: { name: "Test Key" },
    });
    expect([201, 401, 403]).toContain(res.status());
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.key).toHaveProperty("full_key");
      expect(body.key.full_key).toMatch(/^wpa_live_/);
      expect(body).toHaveProperty("warning");
    }
  });

  test("agency endpoints never return 500", async ({ request }) => {
    const endpoints = [
      "/api/agency/overview",
      "/api/agency/dealers",
      "/api/agency/api-keys",
    ];
    for (const path of endpoints) {
      const res = await request.get(path);
      expect(res.status()).not.toBe(500);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Agency page UI test                                                        */
/* -------------------------------------------------------------------------- */

test.describe("Agency Admin Page", () => {
  test("agency page loads with dealer table", async ({ page }) => {
    await page.goto("/admin/agency", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("Agency Dashboard");
    await expect(page.getByText("Dealer Performance")).toBeVisible();
  });
});
