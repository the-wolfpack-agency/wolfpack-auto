/**
 * accounting-export.spec.ts
 *
 * E2E tests for the Accounting Export module.
 * Covers: CSV export, QuickBooks IIF export, date range validation,
 *         chart of accounts, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/accounting-export.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: POST /api/admin/accounting/export — CSV format
// ---------------------------------------------------------------------------

test.describe("Accounting Export API — CSV", () => {
  test("POST with format=csv returns CSV content", async ({ request }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        format: "csv",
        start_date: "2026-03-01",
        end_date: "2026-03-28",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("content");
      expect(typeof body.content).toBe("string");
      expect(body.content.length).toBeGreaterThan(0);
      // CSV should contain comma-separated values
      expect(body.content).toContain(",");
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("CSV export includes header row", async ({ request }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        format: "csv",
        start_date: "2026-03-01",
        end_date: "2026-03-28",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      const firstLine = body.content.split("\n")[0];
      // Header should exist and have column names
      expect(firstLine.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/accounting/export — QuickBooks IIF format
// ---------------------------------------------------------------------------

test.describe("Accounting Export API — QuickBooks IIF", () => {
  test("POST with format=quickbooks returns IIF content", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        format: "quickbooks",
        start_date: "2026-03-01",
        end_date: "2026-03-28",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("content");
      expect(typeof body.content).toBe("string");
      expect(body.content.length).toBeGreaterThan(0);
      // IIF files use tab-separated values and start with !
      expect(body.content).toContain("\t");
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("IIF export has format identifier", async ({ request }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        format: "quickbooks",
        start_date: "2026-03-01",
        end_date: "2026-03-28",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("format", "quickbooks");
    }
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/accounting/export — validation
// ---------------------------------------------------------------------------

test.describe("Accounting Export API — validation", () => {
  test("missing date range returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        format: "csv",
        // deliberately missing start_date and end_date
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() !== 401 && resp.status() !== 403) {
      expect([400, 422]).toContain(resp.status());
      const body = await resp.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("missing format returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        start_date: "2026-03-01",
        end_date: "2026-03-28",
        // missing format
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });

  test("invalid format value returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/accounting/export", {
      data: {
        format: "invalid_format_xyz",
        start_date: "2026-03-01",
        end_date: "2026-03-28",
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/accounting/chart-of-accounts — account list
// ---------------------------------------------------------------------------

test.describe("Chart of Accounts API — GET /api/admin/accounting/chart-of-accounts", () => {
  test("returns accounts array with account_number, name, type", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/admin/accounting/chart-of-accounts",
    );
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("accounts");
      expect(Array.isArray(body.accounts)).toBe(true);

      if (body.accounts.length > 0) {
        const acct = body.accounts[0];
        expect(acct).toHaveProperty("account_number");
        expect(acct).toHaveProperty("name");
        expect(acct).toHaveProperty("type");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get(
      "/api/admin/accounting/chart-of-accounts",
    );
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Accounting Export pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/accounting/export", label: "Accounting Export" },
    { path: "/admin/accounting", label: "Accounting Dashboard" },
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
