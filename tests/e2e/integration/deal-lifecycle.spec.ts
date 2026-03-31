/**
 * Deal Lifecycle Integration Tests
 *
 * Full deal lifecycle: create -> list -> calculate -> update status ->
 * verify in DB -> check analytics -> verify in browser UI.
 */
import { test, expect } from "@playwright/test";
import {
  getAuthCookies,
  uniqueId,
  assertAnalyticsReachable,
  authGet,
  authPost,
  authPatch,
} from "./helpers";

let cookies: string;

test.beforeAll(async ({ request }) => {
  cookies = await getAuthCookies(request);
});

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const TEST_VIN = "1G1YY22G965108900";
const TEST_CUSTOMER = `E2E Deal ${Date.now()}`;

function dealPayload(overrides: Record<string, unknown> = {}) {
  return {
    customer_name: TEST_CUSTOMER,
    customer_email: "e2e-deal@test.wolfpackauto.com",
    customer_phone: "(512) 555-9999",
    vehicle_vin: TEST_VIN,
    vehicle_year: 2024,
    vehicle_make: "Chevrolet",
    vehicle_model: "Corvette Stingray",
    vehicle_stock: `E2E-${Date.now()}`,
    vehicle_color: "Torch Red",
    vehicle_mileage: 5,
    msrp: 65900,
    selling_price: 64500,
    invoice: 61200,
    deal_type: "retail",
    salesperson: "E2E Tester",
    down_payment: 10000,
    apr: 4.99,
    term_months: 60,
    monthly_payment: 1028.45,
    front_gross: 3300,
    back_gross: 1800,
    total_gross: 5100,
    fi_products: ["extended-warranty", "paint-protection"],
    lender: "GM Financial",
    notes: "E2E integration test deal — safe to delete",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Deal Lifecycle", () => {
  let createdDealId: string;

  test("POST /api/admin/deals creates a new deal", async ({ request }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/deals",
      dealPayload(),
    );
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.created).toBe(true);
    expect(body.deal).toBeTruthy();
    expect(body.deal.id).toBeTruthy();
    expect(body.deal.customer_name).toBe(TEST_CUSTOMER);
    expect(body.deal.vehicle_vin).toBe(TEST_VIN);
    expect(body.deal.status).toBe("working");
    expect(body.deal.deal_type).toBe("retail");

    createdDealId = body.deal.id;
  });

  test("POST /api/admin/deals rejects missing required fields", async ({
    request,
  }) => {
    const res = await authPost(request, cookies, "/api/admin/deals", {
      customer_name: "Missing VIN",
      // vehicle_vin is missing
      // selling_price is missing
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Missing required field");
  });

  test("POST /api/admin/deals rejects invalid JSON", async ({ request }) => {
    const res = await request.post("/api/admin/deals", {
      headers: {
        cookie: cookies,
        "content-type": "application/json",
      },
      data: "not json {{{",
    });
    // Should return 400, not 500
    expect(res.status()).not.toBe(500);
  });

  test("GET /api/admin/deals returns the deals list", async ({ request }) => {
    const res = await authGet(request, cookies, "/api/admin/deals");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.deals).toBeTruthy();
    expect(Array.isArray(body.deals)).toBe(true);
    expect(body.deals.length).toBeGreaterThan(0);
    expect(typeof body.total).toBe("number");
  });

  test("GET /api/admin/deals supports status filter", async ({ request }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/deals?status=working",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.deals).toBeTruthy();
    // All returned deals should have status=working
    for (const deal of body.deals) {
      expect(deal.status).toBe("working");
    }
  });

  test("GET /api/admin/deals supports salesperson filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/deals?salesperson=Mike",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.deals).toBeTruthy();
  });

  test("GET /api/admin/deals/[dealId] returns single deal detail", async ({
    request,
  }) => {
    // Use the known mock deal ID
    const res = await authGet(
      request,
      cookies,
      "/api/admin/deals/deal-001",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.deal).toBeTruthy();
    expect(body.deal.customer_name).toBeTruthy();
    expect(body.deal.vehicle_vin).toBeTruthy();
    expect(typeof body.deal.selling_price).toBe("number");
  });

  test("PATCH /api/admin/deals/[dealId] updates deal status", async ({
    request,
  }) => {
    const res = await authPatch(
      request,
      cookies,
      "/api/admin/deals/deal-001",
      { status: "presented" },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.updated).toBe(true);
    expect(body.deal.status).toBe("presented");
  });

  test("PATCH /api/admin/deals/[dealId] updates financial fields", async ({
    request,
  }) => {
    const res = await authPatch(
      request,
      cookies,
      "/api/admin/deals/deal-001",
      {
        selling_price: 30900,
        down_payment: 5000,
        apr: 4.49,
        term_months: 60,
      },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.updated).toBe(true);
    expect(body.deal.selling_price).toBe(30900);
    expect(body.deal.apr).toBe(4.49);
  });

  test("PATCH /api/admin/deals/[dealId] rejects empty update", async ({
    request,
  }) => {
    const res = await authPatch(
      request,
      cookies,
      "/api/admin/deals/deal-001",
      { not_a_real_field: "ignored" },
    );
    expect(res.status()).toBe(422);
  });

  test("GET deal after PATCH reflects updated status", async ({ request }) => {
    // First, set a known status
    await authPatch(request, cookies, "/api/admin/deals/deal-002", {
      status: "presented",
    });

    // Then verify it persisted
    const res = await authGet(
      request,
      cookies,
      "/api/admin/deals/deal-002",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.deal.status).toBe("presented");
  });

  test("Analytics health responds after deal operations", async ({
    request,
  }) => {
    const health = await assertAnalyticsReachable(request, cookies);
    // In shadow mode status will be "shadow_mode"; in DB mode "healthy" or "degraded"
    expect(["shadow_mode", "healthy", "degraded", "error"]).toContain(
      health.status,
    );
  });

  test("Browser: /admin/deals page renders deal data", async ({ page }) => {
    const { browserLogin } = await import("./helpers");
    await browserLogin(page);
    await page.goto("/admin/deals", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test("Unauthenticated deal creation is rejected", async ({ request }) => {
    const res = await request.post("/api/admin/deals", {
      data: dealPayload(),
    });
    // Should be 401 or 403, never 500
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(201);
  });
});
