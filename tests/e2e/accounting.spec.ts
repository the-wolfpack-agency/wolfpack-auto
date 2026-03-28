/**
 * accounting.spec.ts
 *
 * E2E tests for the Deal Accounting module.
 * Covers: sales log, accounting summary (MTD), commissions,
 *         and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/accounting.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/accounting/sales-log
// ---------------------------------------------------------------------------

test.describe("Accounting Sales Log API", () => {
  test("GET returns sales array with vin, front_gross, back_gross", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/accounting/sales-log");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("sales");
      expect(Array.isArray(body.sales)).toBe(true);

      if (body.sales.length > 0) {
        const sale = body.sales[0];
        expect(sale).toHaveProperty("vin");
        expect(sale).toHaveProperty("front_gross");
        expect(sale).toHaveProperty("back_gross");
        expect(typeof sale.front_gross).toBe("number");
        expect(typeof sale.back_gross).toBe("number");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/accounting/sales-log");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/accounting/summary
// ---------------------------------------------------------------------------

test.describe("Accounting Summary API", () => {
  test("GET returns MTD data: units_sold, total_front_gross, total_back_gross, avg_deal_gross", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/accounting/summary");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("summary");
      const s = body.summary;
      expect(s).toHaveProperty("units_sold");
      expect(s).toHaveProperty("total_front_gross");
      expect(s).toHaveProperty("total_back_gross");
      expect(s).toHaveProperty("avg_deal_gross");
      expect(s).toHaveProperty("period");
      expect(typeof s.units_sold).toBe("number");
      expect(typeof s.avg_deal_gross).toBe("number");
    }
  });

  test("summary with month param does not 500", async ({ request }) => {
    const resp = await request.get("/api/admin/accounting/summary?month=2026-02");
    expect(resp.status()).not.toBe(500);
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/accounting/summary");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/accounting/commissions
// ---------------------------------------------------------------------------

test.describe("Accounting Commissions API", () => {
  test("GET returns commissions array", async ({ request }) => {
    const resp = await request.get("/api/admin/accounting/commissions");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("commissions");
      expect(Array.isArray(body.commissions)).toBe(true);

      if (body.commissions.length > 0) {
        const c = body.commissions[0];
        expect(c).toHaveProperty("employee_name");
        expect(c).toHaveProperty("amount");
        expect(c).toHaveProperty("paid");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/accounting/commissions");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Accounting pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/accounting", label: "Accounting Dashboard" },
    { path: "/admin/accounting/commissions", label: "Commissions" },
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
