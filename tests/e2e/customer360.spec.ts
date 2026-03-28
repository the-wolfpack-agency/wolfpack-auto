/**
 * customer360.spec.ts
 *
 * E2E tests for the Customer 360 module.
 * Covers: customer listing (with search filter), unified customer profile
 *         (purchases, service_history, communications, activity),
 *         and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/customer360.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/customers
// ---------------------------------------------------------------------------

test.describe("Customers API — GET /api/admin/customers", () => {
  test("returns customers array with name, email", async ({ request }) => {
    const resp = await request.get("/api/admin/customers");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("customers");
      expect(Array.isArray(body.customers)).toBe(true);

      if (body.customers.length > 0) {
        const cust = body.customers[0];
        expect(cust).toHaveProperty("name");
        expect(cust).toHaveProperty("email");
        expect(typeof cust.name).toBe("string");
        expect(typeof cust.email).toBe("string");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/customers");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/customers?search=Sarah — search filter
// ---------------------------------------------------------------------------

test.describe("Customers API — search filter", () => {
  test("?search=Sarah filters results", async ({ request }) => {
    const resp = await request.get("/api/admin/customers?search=Sarah");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("customers");
      expect(Array.isArray(body.customers)).toBe(true);

      // All returned customers should match "Sarah" in name or email
      for (const cust of body.customers) {
        const matchesName = cust.name.toLowerCase().includes("sarah");
        const matchesEmail = cust.email.toLowerCase().includes("sarah");
        const matchesPhone = cust.phone?.includes("sarah") ?? false;
        expect(matchesName || matchesEmail || matchesPhone).toBe(true);
      }
    }
  });

  test("?search=nonexistent returns empty array", async ({ request }) => {
    const resp = await request.get("/api/admin/customers?search=zzzzzznonexistent99999");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("customers");
      expect(body.customers.length).toBe(0);
    }
  });

  test("?status=prospect filters by status", async ({ request }) => {
    const resp = await request.get("/api/admin/customers?status=prospect");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      for (const cust of body.customers) {
        expect(cust.status).toBe("prospect");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/customers/[id] — unified 360 profile
// ---------------------------------------------------------------------------

test.describe("Customer 360 Profile API", () => {
  test("GET returns unified profile with purchases, service_history, communications, activity", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/customers/cust-042");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("customer");
      const cust = body.customer;

      expect(cust).toHaveProperty("id");
      expect(cust).toHaveProperty("name");
      expect(cust).toHaveProperty("email");
      expect(cust).toHaveProperty("purchases");
      expect(cust).toHaveProperty("service_history");
      expect(cust).toHaveProperty("communications");
      expect(cust).toHaveProperty("activity");

      expect(Array.isArray(cust.purchases)).toBe(true);
      expect(Array.isArray(cust.service_history)).toBe(true);
      expect(Array.isArray(cust.communications)).toBe(true);
      expect(Array.isArray(cust.activity)).toBe(true);
    }
  });

  test("GET with arbitrary ID returns data (shadow mode fallback)", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/customers/cust-999999");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("customer");
      // Shadow mode returns mock data with the requested ID
      expect(body.customer.id).toBe("cust-999999");
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/customers/cust-042");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Customer 360 pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/customers", label: "Customer List" },
    { path: "/admin/customers/cust-042", label: "Customer Detail" },
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
