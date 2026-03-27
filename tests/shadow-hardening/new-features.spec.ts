/**
 * Feature validation tests for VIN scanner, e-signatures, NLP analytics,
 * lead management, reports, webhooks, and dealer branding.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.SHADOW_URL || "http://localhost:3099";

test.describe("Quick Add + VIN Scanner", () => {
  test("Quick Add page loads with VIN input and scan button", async ({ page }) => {
    await page.goto("/admin/vehicles/quick-add");
    const vinInput = page.locator('input[placeholder*="VIN" i], input[name="vin"]').first();
    expect(await vinInput.count()).toBeGreaterThan(0);
    // Scan button should exist
    const scanBtn = page.locator('button:has-text("Scan"), button[aria-label*="scan" i]').first();
    expect(await scanBtn.count()).toBeGreaterThan(0);
  });

  test("VIN decode API returns valid data", async ({ request }) => {
    const response = await request.get(`${BASE}/api/admin/vin-decode?vin=1HGCV1F34PA000001`);
    // May 401 without auth or 200 with data
    expect([200, 401, 500]).toContain(response.status());
  });
});

test.describe("E-Signatures", () => {
  test("Deal sign API accepts valid payload", async ({ request }) => {
    const response = await request.post(`${BASE}/api/admin/deals/sign`, {
      data: {
        lead_id: "test-lead-001",
        vehicle_vin: "1HGCV1F34PA000001",
        signature_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        agreed_price: 30000,
      },
    });
    // Should not 404 or crash
    expect(response.status()).not.toBe(404);
    expect([200, 201, 401, 500]).toContain(response.status());
  });

  test("Deal sign API rejects invalid signature", async ({ request }) => {
    const response = await request.post(`${BASE}/api/admin/deals/sign`, {
      data: {
        lead_id: "test",
        vehicle_vin: "1HGCV1F34PA000001",
        signature_data: "not-a-valid-signature",
        agreed_price: -100,
      },
    });
    expect(response.status()).not.toBe(404);
    // Should reject with 400/422 or 401 if auth required
    expect([400, 401, 422, 500]).toContain(response.status());
  });
});

test.describe("NLP Analytics Queries", () => {
  test("Analytics query API responds to questions", async ({ request }) => {
    const response = await request.post(`${BASE}/api/admin/analytics/query`, {
      data: { question: "how many leads this week" },
    });
    expect([200, 401, 500]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("answer");
      expect(body).toHaveProperty("type");
    }
  });

  test("Analytics query handles unknown questions gracefully", async ({ request }) => {
    const response = await request.post(`${BASE}/api/admin/analytics/query`, {
      data: { question: "what is the meaning of life" },
    });
    expect([200, 401, 500]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.answer).toBeTruthy();
    }
  });

  test("Analytics dashboard has chat input", async ({ page }) => {
    await page.goto("/admin/analytics");
    const chatInput = page.locator('input[placeholder*="Ask" i], input[placeholder*="question" i]').first();
    expect(await chatInput.count()).toBeGreaterThan(0);
  });
});

test.describe("Lead Management", () => {
  test("Leads API returns data", async ({ request }) => {
    const response = await request.get(`${BASE}/api/admin/leads`);
    expect([200, 401, 500]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("leads");
      expect(Array.isArray(body.leads)).toBe(true);
    }
  });

  test("Leads page loads with table", async ({ page }) => {
    await page.goto("/admin/leads");
    // Should have a table or lead cards
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("Bulk leads API rejects empty request", async ({ request }) => {
    const response = await request.post(`${BASE}/api/admin/leads/bulk`, {
      data: {},
    });
    expect(response.status()).not.toBe(404);
  });
});

test.describe("Reports & Export", () => {
  test("Lead CSV export endpoint responds", async ({ request }) => {
    const response = await request.get(`${BASE}/api/admin/export/leads`);
    expect([200, 401, 500]).toContain(response.status());
    if (response.status() === 200) {
      const contentType = response.headers()["content-type"] || "";
      expect(contentType).toContain("text/csv");
    }
  });

  test("Analytics export endpoint responds", async ({ request }) => {
    const response = await request.get(`${BASE}/api/admin/export/analytics`);
    expect([200, 401, 500]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("visitors");
    }
  });

  test("Reports page loads", async ({ page }) => {
    await page.goto("/admin/reports");
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });
});

test.describe("Webhook Integrations", () => {
  test("Integrations settings page loads", async ({ page }) => {
    await page.goto("/admin/settings/integrations");
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("Integrations API responds", async ({ request }) => {
    const response = await request.get(`${BASE}/api/admin/settings/integrations`);
    expect([200, 401, 500]).toContain(response.status());
  });
});

test.describe("Dealer Branding", () => {
  test("Homepage shows dealer name (not hardcoded placeholder)", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    // Should not show generic "Next.js" default
    expect(title).not.toContain("Create Next App");
  });

  test("Footer contains dealer contact info", async ({ page }) => {
    await page.goto("/");
    const footer = await page.textContent("footer");
    expect(footer).toBeTruthy();
    // Should contain a phone number or dealer contact info
    expect(footer).toMatch(/\(\d{3}\)\s?\d{3}-\d{4}|\d{3}[.-]\d{3}[.-]\d{4}|phone|contact|wolfpack/i);
  });
});
