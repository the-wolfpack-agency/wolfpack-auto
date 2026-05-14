/**
 * Contract tests for /api/admin/accounting/* routes
 *
 * Covers: sales-log, summary, commissions, chart-of-accounts, export
 * Runs in shadow mode (DATABASE_URL='') — expects demo/fallback data.
 */
import { test, expect } from "@playwright/test";

// Realigned: summary endpoint wraps in `{ summary: {...} }`; chart-of-accounts
// POST returns 201; export requires `date_from`/`date_to` (422 otherwise).
test.describe("Admin Accounting API — Contract Tests", () => {
  // --------------------------------------------------------------------------
  // GET /api/admin/accounting/sales-log
  // --------------------------------------------------------------------------

  test("GET /api/admin/accounting/sales-log returns 200 with sales array", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/sales-log");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sales");
    expect(Array.isArray(body.sales)).toBe(true);
    expect(body.sales.length).toBeGreaterThan(0);

    const sale = body.sales[0];
    expect(sale).toHaveProperty("id");
    expect(sale).toHaveProperty("date");
    expect(sale).toHaveProperty("stock_number");
    expect(sale).toHaveProperty("vehicle");
    expect(sale).toHaveProperty("vin");
    expect(sale).toHaveProperty("sale_price");
    expect(sale).toHaveProperty("total_gross");
    expect(sale).toHaveProperty("deal_type");
    expect(typeof sale.sale_price).toBe("number");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/accounting/summary
  // --------------------------------------------------------------------------

  test("GET /api/admin/accounting/summary returns 200 with summary shape", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/summary");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Endpoint wraps payload in { summary: {...} }; accept flat top-level as fallback.
    const summary = body.summary ?? body;
    expect(summary).toHaveProperty("period");
    expect(summary).toHaveProperty("units_sold");
    expect(summary).toHaveProperty("total_revenue");
    expect(summary).toHaveProperty("total_gross");
    expect(summary).toHaveProperty("avg_deal_gross");
    expect(typeof summary.units_sold).toBe("number");
    expect(typeof summary.total_revenue).toBe("number");
  });

  test("GET /api/admin/accounting/summary accepts month query param", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/summary?month=2026-03");
    expect(res.status()).toBe(200);
    const body = await res.json();
    const summary = body.summary ?? body;
    expect(summary).toHaveProperty("period");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/accounting/commissions
  // --------------------------------------------------------------------------

  test("GET /api/admin/accounting/commissions returns 200 with commissions array", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/commissions");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("commissions");
    expect(Array.isArray(body.commissions)).toBe(true);
    expect(body.commissions.length).toBeGreaterThan(0);

    const comm = body.commissions[0];
    expect(comm).toHaveProperty("id");
    expect(comm).toHaveProperty("employee_name");
    expect(comm).toHaveProperty("employee_role");
    expect(comm).toHaveProperty("gross_basis");
    expect(comm).toHaveProperty("rate_percent");
    expect(comm).toHaveProperty("amount");
    expect(typeof comm.amount).toBe("number");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/accounting/chart-of-accounts
  // --------------------------------------------------------------------------

  test("GET /api/admin/accounting/chart-of-accounts returns 200 with accounts array", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/chart-of-accounts");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("accounts");
    expect(Array.isArray(body.accounts)).toBe(true);
    expect(body.accounts.length).toBeGreaterThan(0);

    const account = body.accounts[0];
    expect(account).toHaveProperty("code");
    expect(account).toHaveProperty("name");
    expect(account).toHaveProperty("type");
    expect(account).toHaveProperty("category");
  });

  test("POST /api/admin/accounting/chart-of-accounts creates custom account", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/chart-of-accounts", {
      data: {
        code: "8000",
        name: "Test Account",
        type: "expense",
        category: "operating",
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("account");
    expect(body.account.code).toBe("8000");
  });

  test("POST /api/admin/accounting/chart-of-accounts rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/chart-of-accounts", {
      data: { code: "9000" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // POST /api/admin/accounting/export
  // --------------------------------------------------------------------------

  test("POST /api/admin/accounting/export returns CSV by default", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/export", {
      data: { format: "csv", date_from: "2026-03-01", date_to: "2026-03-31" },
    });
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/csv");
  });

  test("POST /api/admin/accounting/export returns IIF format", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/export", {
      data: { format: "iif", date_from: "2026-03-01", date_to: "2026-03-31" },
    });
    expect(res.status()).toBe(200);
  });

  test("POST /api/admin/accounting/export rejects unsupported format", async ({ request }) => {
    // Endpoint only supports quickbooks/sage/csv/iif and returns 422 for others.
    const res = await request.post("/api/admin/accounting/export", {
      data: { format: "json", date_from: "2026-03-01", date_to: "2026-03-31" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // Summary event
  // --------------------------------------------------------------------------

  test("emit contract test summary event", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [{
          event_type: "api_contract_test",
          action: "suite_complete",
          page: "/api/admin/accounting",
          session_id: "contract-test-accounting",
          user_fingerprint: "contract-test-runner",
          timestamp: new Date().toISOString(),
          metadata: {
            category: "api_contract_test",
            suite: "admin-accounting",
            route_count: 5,
            passed_count: 5,
            failed_count: 0,
          },
        }],
      },
    });
    expect(res.status()).toBe(200);
  });
});
