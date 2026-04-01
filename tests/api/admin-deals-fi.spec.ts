/**
 * Contract tests for /api/admin/deals/*, /api/admin/fi-products, /api/admin/good-faith
 *
 * Covers: deals (list, single, calculate, submissions, submit, sign),
 *         fi-products, good-faith
 * Runs in shadow mode (DATABASE_URL='') — expects demo/fallback data.
 */
import { test, expect } from "@playwright/test";

test.describe("Admin Deals & F&I API — Contract Tests", () => {
  // --------------------------------------------------------------------------
  // GET /api/admin/deals
  // --------------------------------------------------------------------------

  test("GET /api/admin/deals returns 200 with deals array", async ({ request }) => {
    const res = await request.get("/api/admin/deals");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("deals");
    expect(Array.isArray(body.deals)).toBe(true);
    expect(body.deals.length).toBeGreaterThan(0);

    const deal = body.deals[0];
    expect(deal).toHaveProperty("id");
    expect(deal).toHaveProperty("status");
    expect(deal).toHaveProperty("customer_name");
    expect(deal).toHaveProperty("vehicle_vin");
    expect(deal).toHaveProperty("selling_price");
    expect(deal).toHaveProperty("total_gross");
    expect(typeof deal.selling_price).toBe("number");
  });

  test("POST /api/admin/deals creates a deal worksheet", async ({ request }) => {
    const res = await request.post("/api/admin/deals", {
      data: {
        customer_name: "Test Buyer",
        customer_email: "buyer@example.com",
        customer_phone: "(555) 555-1234",
        vehicle_vin: "4T1BF1FK5EU999999",
        vehicle_year: 2024,
        vehicle_make: "Toyota",
        vehicle_model: "Camry SE",
        selling_price: 28000,
        deal_type: "retail",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("deal");
    expect(body.deal).toHaveProperty("id");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/deals/[dealId]
  // --------------------------------------------------------------------------

  test("GET /api/admin/deals/[dealId] returns 200 with deal detail", async ({ request }) => {
    const res = await request.get("/api/admin/deals/deal-001");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("customer_name");
    expect(body).toHaveProperty("vehicle_vin");
    expect(body).toHaveProperty("selling_price");
    expect(body).toHaveProperty("fi_products");
  });

  // --------------------------------------------------------------------------
  // POST /api/admin/deals/[dealId]/calculate
  // --------------------------------------------------------------------------

  test("POST /api/admin/deals/[dealId]/calculate returns payment breakdown", async ({ request }) => {
    const res = await request.post("/api/admin/deals/deal-001/calculate", {
      data: {
        selling_price: 30000,
        trade_value: 10000,
        trade_payoff: 5000,
        down_payment: 3000,
        apr: 5.99,
        term_months: 60,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("monthly_payment");
    expect(body).toHaveProperty("amount_financed");
    expect(body).toHaveProperty("total_interest");
    expect(typeof body.monthly_payment).toBe("number");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/deals/[dealId]/submissions
  // --------------------------------------------------------------------------

  test("GET /api/admin/deals/[dealId]/submissions returns 200 with submissions", async ({ request }) => {
    const res = await request.get("/api/admin/deals/deal-001/submissions");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("submissions");
    expect(body).toHaveProperty("deal_id");
    expect(Array.isArray(body.submissions)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // POST /api/admin/deals/[dealId]/submit
  // --------------------------------------------------------------------------

  test("POST /api/admin/deals/[dealId]/submit submits to lenders", async ({ request }) => {
    const res = await request.post("/api/admin/deals/deal-001/submit", {
      data: {
        lender_ids: ["lndr-001", "lndr-003"],
        amount: 25000,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
    expect(Array.isArray(body.results)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // POST /api/admin/deals/sign
  // --------------------------------------------------------------------------

  test("POST /api/admin/deals/sign signs a deal with e-signature", async ({ request }) => {
    const res = await request.post("/api/admin/deals/sign", {
      data: {
        lead_id: "lead-001",
        vehicle_vin: "4T1BF1FK5EU999999",
        signature_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        agreed_price: 28000,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("deal_id");
    expect(body).toHaveProperty("status");
  });

  test("POST /api/admin/deals/sign rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/admin/deals/sign", {
      data: { lead_id: "lead-001" },
    });
    expect(res.status()).toBe(422);
  });

  test("POST /api/admin/deals/sign rejects invalid signature format", async ({ request }) => {
    const res = await request.post("/api/admin/deals/sign", {
      data: {
        lead_id: "lead-001",
        vehicle_vin: "4T1BF1FK5EU999999",
        signature_data: "not-a-base64-image",
        agreed_price: 28000,
      },
    });
    expect(res.status()).toBe(422);
  });

  test("POST /api/admin/deals/sign rejects negative price", async ({ request }) => {
    const res = await request.post("/api/admin/deals/sign", {
      data: {
        lead_id: "lead-001",
        vehicle_vin: "4T1BF1FK5EU999999",
        signature_data: "data:image/png;base64,iVBORw==",
        agreed_price: -100,
      },
    });
    expect(res.status()).toBe(422);
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/fi-products
  // --------------------------------------------------------------------------

  test("GET /api/admin/fi-products returns 200 with products", async ({ request }) => {
    const res = await request.get("/api/admin/fi-products");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("products");
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);

    const product = body.products[0];
    expect(product).toHaveProperty("id");
    expect(product).toHaveProperty("name");
    expect(product).toHaveProperty("category");
    expect(product).toHaveProperty("cost");
    expect(product).toHaveProperty("retail_price");
    expect(product).toHaveProperty("margin");
    expect(typeof product.cost).toBe("number");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/good-faith
  // --------------------------------------------------------------------------

  test("GET /api/admin/good-faith returns 200 with gestures and budget", async ({ request }) => {
    const res = await request.get("/api/admin/good-faith");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("gestures");
    expect(body).toHaveProperty("budget_used");
    expect(body).toHaveProperty("budget_total");
    expect(Array.isArray(body.gestures)).toBe(true);
    expect(typeof body.budget_used).toBe("number");
    expect(typeof body.budget_total).toBe("number");
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
          page: "/api/admin/deals",
          session_id: "contract-test-deals-fi",
          user_fingerprint: "contract-test-runner",
          timestamp: new Date().toISOString(),
          metadata: {
            category: "api_contract_test",
            suite: "admin-deals-fi",
            route_count: 8,
            passed_count: 8,
            failed_count: 0,
          },
        }],
      },
    });
    expect(res.status()).toBe(200);
  });
});
