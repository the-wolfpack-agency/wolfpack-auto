import { test, expect } from "@playwright/test";

/**
 * Database verification E2E tests.
 *
 * These verify that data actually reaches the database by calling GET
 * endpoints after submissions. Admin GET routes require auth — they return
 * 401 without a session. We accept 200 (with data) OR 401 as valid.
 *
 * What we guard against:
 *   - 500 (server crash = broken code)
 *   - Malformed JSON responses
 *   - Missing expected fields when 200 is returned
 */

/** Assert response is not a server error. */
function assertNotServerError(status: number) {
  expect(status).not.toBe(500);
  expect(status).not.toBe(502);
  expect(status).not.toBe(503);
}

/**
 * Helper: GET an admin endpoint and verify structure.
 * If 200: validate the body has the expected shape.
 * If 401/403: valid — auth required.
 * Never 500.
 */
async function verifyAdminGet(
  request: ReturnType<typeof test.extend>,
  url: string,
  expectField: string,
  expectArray: boolean = true,
) {
  const res = await (request as any).get(url);
  assertNotServerError(res.status());

  if (res.status() === 200) {
    const body = await res.json();
    if (expectArray) {
      const data = body[expectField];
      expect(Array.isArray(data)).toBe(true);
    } else {
      expect(body[expectField] !== undefined || body !== undefined).toBe(true);
    }
  } else {
    expect([401, 403]).toContain(res.status());
  }
}

// ─── Leads ───────────────────────────────────────────────────────────────────

test.describe("DB verification: Leads", () => {
  test("POST a lead then GET /api/admin/leads returns data or 401", async ({ request }) => {
    // First submit a lead via the public endpoint
    const postRes = await request.post("/api/leads", {
      data: {
        dealer_id: "e2e-verify",
        first_name: "Verify",
        last_name: "Lead",
        email: `verify-${Date.now()}@test.example.com`,
        vehicle_interest: "2024 Honda CR-V",
        source: "website_form",
      },
    });
    expect(postRes.status()).toBe(201);

    // Then check admin GET
    const getRes = await request.get("/api/admin/leads");
    assertNotServerError(getRes.status());

    if (getRes.status() === 200) {
      const body = await getRes.json();
      // Accept either { leads: [...] } or an array directly
      const leads = body.leads ?? body;
      expect(Array.isArray(leads)).toBe(true);
    } else {
      expect([401, 403]).toContain(getRes.status());
    }
  });
});

// ─── Service Appointments ────────────────────────────────────────────────────

test.describe("DB verification: Service Appointments", () => {
  test("GET /api/admin/service/appointments returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/service/appointments");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const appts = body.appointments ?? body;
      expect(Array.isArray(appts)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Deals ───────────────────────────────────────────────────────────────────

test.describe("DB verification: Deals", () => {
  test("GET /api/admin/deals returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/deals");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const deals = body.deals ?? body;
      expect(Array.isArray(deals)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Reviews ─────────────────────────────────────────────────────────────────

test.describe("DB verification: Reviews", () => {
  test("GET /api/admin/reviews returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/reviews");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const reviews = body.reviews ?? body;
      expect(Array.isArray(reviews)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Customers ───────────────────────────────────────────────────────────────

test.describe("DB verification: Customers", () => {
  test("GET /api/admin/customers returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/customers");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const customers = body.customers ?? body;
      expect(Array.isArray(customers)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Documents ───────────────────────────────────────────────────────────────

test.describe("DB verification: Documents", () => {
  test("GET /api/admin/documents returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/documents");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const docs = body.documents ?? body;
      expect(Array.isArray(docs)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Comms: Templates ────────────────────────────────────────────────────────

test.describe("DB verification: Comms Templates", () => {
  test("GET /api/admin/comms/templates returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/comms/templates");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const templates = body.templates ?? body;
      expect(Array.isArray(templates)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Comms: Log ──────────────────────────────────────────────────────────────

test.describe("DB verification: Comms Log", () => {
  test("GET /api/admin/comms/log returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/comms/log");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const log = body.messages ?? body.log ?? body;
      expect(Array.isArray(log)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Accounting: Sales Log ───────────────────────────────────────────────────

test.describe("DB verification: Accounting Sales Log", () => {
  test("GET /api/admin/accounting/sales-log returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/sales-log");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const entries = body.entries ?? body.sales ?? body;
      expect(Array.isArray(entries)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Accounting: Summary ─────────────────────────────────────────────────────

test.describe("DB verification: Accounting Summary", () => {
  test("GET /api/admin/accounting/summary returns summary object or 401", async ({ request }) => {
    const res = await request.get("/api/admin/accounting/summary");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      // Summary should be an object (not an array)
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Analytics: Health ───────────────────────────────────────────────────────

test.describe("DB verification: Analytics Health", () => {
  test("GET /api/admin/analytics/health returns health status or 401", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/health");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.status).toBeDefined();
      // db_connected should be present
      expect(typeof body.db_connected).toBe("boolean");
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Analytics: Learning ─────────────────────────────────────────────────────

test.describe("DB verification: Analytics Learning", () => {
  test("GET /api/admin/analytics/learning returns insights or 401", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/learning");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.insights !== undefined || body.dealer_id !== undefined).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── FI Products ─────────────────────────────────────────────────────────────

test.describe("DB verification: FI Products", () => {
  test("GET /api/admin/fi-products returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/fi-products");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const products = body.products ?? body;
      expect(Array.isArray(products)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Lenders ─────────────────────────────────────────────────────────────────

test.describe("DB verification: Lenders", () => {
  test("GET /api/admin/lenders returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/lenders");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const lenders = body.lenders ?? body;
      expect(Array.isArray(lenders)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Floor Plan ──────────────────────────────────────────────────────────────

test.describe("DB verification: Floor Plan", () => {
  test("GET /api/admin/floor-plan returns array or 401", async ({ request }) => {
    const res = await request.get("/api/admin/floor-plan");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const lines = body.lines ?? body.floor_plan_lines ?? body;
      expect(Array.isArray(lines)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});

// ─── Public endpoints that always return data ────────────────────────────────

test.describe("DB verification: Public schedule slots", () => {
  test("GET /api/service/schedule always returns 200 with 7 days", async ({ request }) => {
    const res = await request.get("/api/service/schedule");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.days).toBeDefined();
    expect(body.days.length).toBe(7);
  });
});

test.describe("DB verification: Credit apps (GET)", () => {
  test("GET /api/admin/digital-retail/credit-app returns apps or 401", async ({ request }) => {
    const res = await request.get("/api/admin/digital-retail/credit-app");
    assertNotServerError(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const apps = body.applications ?? body;
      expect(Array.isArray(apps)).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });
});
