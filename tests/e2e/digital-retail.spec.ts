/**
 * digital-retail.spec.ts
 *
 * E2E tests for the Digital Retailing module.
 * Covers: public payment calculator (retail/lease/validation),
 *         credit application CRUD, and admin page rendering.
 *
 * Note: The calculator endpoint is PUBLIC (no auth required).
 * The credit-app GET requires auth; POST is public.
 *
 * Run: npx playwright test tests/e2e/digital-retail.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: POST /api/admin/digital-retail/calculator — retail params
// ---------------------------------------------------------------------------

test.describe("Digital Retail Calculator — retail", () => {
  test("retail params return correct shape", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 35000,
        down_payment: 5000,
        apr: 5.9,
        term_months: 60,
        deal_type: "retail",
      },
    });
    expect(resp.status()).not.toBe(500);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("monthly_payment");
    expect(body).toHaveProperty("amount_financed");
    expect(body).toHaveProperty("total_interest");
    expect(body).toHaveProperty("total_cost");
    expect(body.deal_type).toBe("retail");
    expect(body.monthly_payment).toBeGreaterThan(0);
    expect(body.amount_financed).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/digital-retail/calculator — lease params
// ---------------------------------------------------------------------------

test.describe("Digital Retail Calculator — lease", () => {
  test("lease params return residual_value", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 45000,
        down_payment: 3000,
        apr: 4.5,
        term_months: 36,
        deal_type: "lease",
        residual_pct: 58,
      },
    });
    expect(resp.status()).not.toBe(500);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("monthly_payment");
    expect(body).toHaveProperty("residual_value");
    expect(body).toHaveProperty("due_at_signing");
    expect(body.deal_type).toBe("lease");
    expect(body.residual_value).toBeGreaterThan(0);
    expect(body.monthly_payment).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/digital-retail/calculator — missing price
// ---------------------------------------------------------------------------

test.describe("Digital Retail Calculator — validation", () => {
  test("missing vehicle_price returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        down_payment: 5000,
        apr: 5.9,
        term_months: 60,
      },
    });
    expect(resp.status()).not.toBe(500);
    expect(resp.status()).toBe(400);
  });

  test("zero vehicle_price returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/calculator", {
      data: { vehicle_price: 0 },
    });
    expect(resp.status()).not.toBe(500);
    expect(resp.status()).toBe(400);
  });

  test("never returns 500 on bad input", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/calculator", {
      data: { vehicle_price: -1000 },
    });
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/digital-retail/credit-app
// ---------------------------------------------------------------------------

test.describe("Credit Application API — GET", () => {
  test("GET returns applications array (or 401)", async ({ request }) => {
    const resp = await request.get("/api/admin/digital-retail/credit-app");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("applications");
      expect(Array.isArray(body.applications)).toBe(true);

      if (body.applications.length > 0) {
        const app = body.applications[0];
        expect(app).toHaveProperty("first_name");
        expect(app).toHaveProperty("last_name");
        expect(app).toHaveProperty("email");
        expect(app).toHaveProperty("status");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/digital-retail/credit-app");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/digital-retail/credit-app
// ---------------------------------------------------------------------------

test.describe("Credit Application API — POST", () => {
  test("POST with valid body returns 201", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        first_name: "E2E",
        last_name: "TestUser",
        email: `e2e-${Date.now()}@example.test`,
        phone: "(555) 000-1234",
        annual_income: 65000,
        employment_status: "employed",
        employer: "Test Corp",
        vehicle_interest: "2024 Test Vehicle",
      },
    });
    expect(resp.status()).not.toBe(500);
    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("status", "submitted");
  });

  test("POST with missing required fields returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/credit-app", {
      data: { first_name: "Incomplete" },
    });
    expect(resp.status()).not.toBe(500);
    expect(resp.status()).toBe(400);
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.post("/api/admin/digital-retail/credit-app", {
      data: {},
    });
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin page: load without crashing
// ---------------------------------------------------------------------------

test.describe("Digital Retail page loads without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Digital Retail page loads", async ({ page }) => {
    await page.goto("/admin/digital-retail", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
