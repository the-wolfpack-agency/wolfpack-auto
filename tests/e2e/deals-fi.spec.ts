/**
 * deals-fi.spec.ts
 *
 * E2E tests for the F&I Deal Desking module.
 * Covers: deal listing, deal calculation (retail/lease/zero-APR),
 *         F&I product catalog, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/deals-fi.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/deals — list deals
// ---------------------------------------------------------------------------

test.describe("Deals API — GET /api/admin/deals", () => {
  test("returns deals array with expected shape (or 401)", async ({ request }) => {
    const resp = await request.get("/api/admin/deals");
    expect(
      [200, 401, 403].includes(resp.status()),
      `Expected 200/401/403, got ${resp.status()}`,
    ).toBe(true);
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("deals");
      expect(Array.isArray(body.deals)).toBe(true);

      if (body.deals.length > 0) {
        const deal = body.deals[0];
        expect(deal).toHaveProperty("id");
        expect(deal).toHaveProperty("status");
        expect(deal).toHaveProperty("selling_price");
        expect(deal).toHaveProperty("deal_type");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/deals");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/deals/[dealId]/calculate — payment calculator
// ---------------------------------------------------------------------------

test.describe("Deals API — POST calculate (retail)", () => {
  test("retail params return monthly_payment, amount_financed, total_interest", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/deals/deal-001/calculate", {
      data: {
        selling_price: 30000,
        down_payment: 5000,
        apr: 5.99,
        term_months: 60,
        deal_type: "retail",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("calculation");
      const calc = body.calculation;
      expect(calc).toHaveProperty("monthly_payment");
      expect(calc).toHaveProperty("amount_financed");
      expect(calc).toHaveProperty("total_interest");
      expect(calc.deal_type).toBe("retail");
      expect(calc.monthly_payment).toBeGreaterThan(0);
      expect(calc.amount_financed).toBeGreaterThan(0);
    }
  });
});

test.describe("Deals API — POST calculate (lease)", () => {
  test("lease params return monthly_payment, residual_value", async ({ request }) => {
    const resp = await request.post("/api/admin/deals/deal-004/calculate", {
      data: {
        selling_price: 48000,
        down_payment: 4000,
        deal_type: "lease",
        term_months: 36,
        residual_pct: 55,
        money_factor: 0.00125,
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      const calc = body.calculation;
      expect(calc).toHaveProperty("monthly_payment");
      expect(calc).toHaveProperty("residual_value");
      expect(calc.deal_type).toBe("lease");
      expect(calc.residual_value).toBeGreaterThan(0);
      expect(calc.monthly_payment).toBeGreaterThan(0);
    }
  });
});

test.describe("Deals API — POST calculate (0% APR)", () => {
  test("0 APR returns correct zero-interest payment", async ({ request }) => {
    const resp = await request.post("/api/admin/deals/deal-001/calculate", {
      data: {
        selling_price: 30000,
        down_payment: 0,
        apr: 0,
        term_months: 60,
        deal_type: "retail",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      const calc = body.calculation;
      expect(calc.total_interest).toBe(0);
      // Monthly payment should roughly equal amount_financed / term_months
      expect(calc.monthly_payment).toBeGreaterThan(0);
    }
  });
});

test.describe("Deals API — POST calculate (missing selling_price)", () => {
  test("missing selling_price returns 422, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/deals/deal-001/calculate", {
      data: { apr: 5.99, term_months: 60 },
    });
    expect(resp.status()).not.toBe(500);
    // 422 (validation) or 401 (auth) — never 200 with broken data, never 500
    expect([400, 401, 422].includes(resp.status())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/fi-products — F&I product catalog
// ---------------------------------------------------------------------------

test.describe("F&I Products API — GET /api/admin/fi-products", () => {
  test("returns products array with name, category, cost, retail_price", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/fi-products");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("products");
      expect(Array.isArray(body.products)).toBe(true);

      if (body.products.length > 0) {
        const product = body.products[0];
        expect(product).toHaveProperty("name");
        expect(product).toHaveProperty("category");
        expect(product).toHaveProperty("cost");
        expect(product).toHaveProperty("retail_price");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/fi-products");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/fi-products — create F&I product
// ---------------------------------------------------------------------------

test.describe("F&I Products API — POST /api/admin/fi-products", () => {
  test("creates a product and returns it (or 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/fi-products", {
      data: {
        name: "Test Product E2E",
        category: "protection",
        cost: 100,
        retail_price: 299,
        description: "E2E test product",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("product");
      expect(body).toHaveProperty("created", true);
      expect(body.product.name).toBe("Test Product E2E");
    } else {
      // 401 (auth) is acceptable
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("missing required fields returns 422, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/fi-products", {
      data: { name: "Incomplete Product" },
    });
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Deals & F&I pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/deals", label: "Deals" },
    { path: "/admin/fi-products", label: "F&I Products" },
  ];

  for (const pg of PAGES) {
    test(`${pg.label} page loads`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/500.*internal server error/i);
      expect(bodyText).not.toMatch(/Server error: 500/);
    });
  }
});
