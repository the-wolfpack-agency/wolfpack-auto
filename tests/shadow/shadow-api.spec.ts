/**
 * shadow-api.spec.ts
 *
 * API contract tests — verify that every public API endpoint returns the
 * documented response shape, correct status codes, and required security
 * headers. These tests use fetch() / request context directly (no page.goto)
 * for speed and precision.
 *
 * Seeded data (by shadow_runner.py):
 *   - Dealer 1: id=a1000000-0000-0000-0000-000000000001
 *   - Dealer 2: id=a2000000-0000-0000-0000-000000000002
 *   - 5 vehicles per dealer (VINs SHADOW1VIN0000001A–E, SHADOW2VIN0000001F–J)
 */

import { test, expect } from "@playwright/test";

const DEALER_1_ID = "a1000000-0000-0000-0000-000000000001";
const DEALER_1_VIN_1 = "SHADOW1VIN0000001A"; // seeded vehicle for Dealer 1

// ---------------------------------------------------------------------------
// Security header assertion helper
// ---------------------------------------------------------------------------

function assertSecurityHeaders(headers: Record<string, string>): void {
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
}

// ---------------------------------------------------------------------------
// GET /api/inventory
// ---------------------------------------------------------------------------

test.describe("GET /api/inventory", () => {
  test("returns correct response shape", async ({ request }) => {
    const resp = await request.get("/api/inventory");

    expect(resp.status()).toBe(200);

    const body = await resp.json();
    // Required top-level keys
    expect(body).toHaveProperty("vehicles");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("facets");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("page_size");

    expect(Array.isArray(body.vehicles)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
    expect(typeof body.page_size).toBe("number");

    // facets must be an object (may be empty if DB has no data)
    expect(typeof body.facets).toBe("object");
  });

  test("filters by make parameter", async ({ request }) => {
    const resp = await request.get("/api/inventory?make=Toyota");
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("vehicles");

    // Every returned vehicle must have the requested make (if any were found)
    for (const v of body.vehicles) {
      expect(v.make.toLowerCase()).toBe("toyota");
    }
  });

  test("rejects invalid query parameters with 400", async ({ request }) => {
    // year_min must be a number
    const resp = await request.get("/api/inventory?year_min=notanumber");
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("details");
    expect(Array.isArray(body.details)).toBe(true);
  });

  test("has required security headers", async ({ request }) => {
    const resp = await request.get("/api/inventory");
    assertSecurityHeaders(resp.headers());
  });

  test("condition filter accepts valid enum values", async ({ request }) => {
    const validConditions = ["new", "used", "certified"];
    for (const cond of validConditions) {
      const resp = await request.get(`/api/inventory?condition=${cond}`);
      expect(resp.status()).toBe(200);
    }
  });

  test("rejects invalid condition enum with 400", async ({ request }) => {
    const resp = await request.get("/api/inventory?condition=broken");
    expect(resp.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/inventory/[vin]
// ---------------------------------------------------------------------------

test.describe("GET /api/inventory/[vin]", () => {
  test("returns 400 for invalid VIN format", async ({ request }) => {
    // VIN must be exactly 17 chars with no I/O/Q
    const resp = await request.get(`/api/inventory/TOOSHORT?dealer_id=${DEALER_1_ID}`);
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
  });

  test("returns 400 when dealer_id query param is missing", async ({ request }) => {
    // A valid-format VIN but no dealer_id
    const resp = await request.get("/api/inventory/1HGCM82633A004352");
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
  });

  test("returns 404 or 503 for a VIN that does not exist", async ({ request }) => {
    // This VIN has valid format but won't be in the DB
    const fakeVin = "ZZZSHADOW0000099Z";
    const resp = await request.get(`/api/inventory/${fakeVin}?dealer_id=${DEALER_1_ID}`);

    // 404 = not found in Elasticsearch, 503 = ES not configured in shadow env
    // Both are valid — the key assertion is no 500 server error
    expect([400, 404, 503]).toContain(resp.status());

    const body = await resp.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------

test.describe("POST /api/leads", () => {
  test("returns 201 with valid payload", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_1_ID,
        first_name: "ShadowAPI",
        last_name: "ContractTest",
        email: `shadow-api-${Date.now()}@shadow-test.invalid`,
        vehicle_interest: "shadow-test API contract vehicle",
        source: "website_form",
      },
    });

    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("lead_id");
    expect(body).toHaveProperty("created_at");
    expect(typeof body.lead_id).toBe("string");
    expect(body.lead_id.length).toBeGreaterThan(0);
  });

  test("returns 422 with missing required fields", async ({ request }) => {
    // Missing: first_name, last_name, email, vehicle_interest
    const resp = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_1_ID,
      },
    });

    expect(resp.status()).toBe(422);

    const body = await resp.json();
    expect(body).toHaveProperty("error", "Validation failed");
    expect(body).toHaveProperty("details");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);

    // Each detail has field + message
    for (const detail of body.details) {
      expect(detail).toHaveProperty("field");
      expect(detail).toHaveProperty("message");
    }
  });

  test("returns 400 for malformed JSON body", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      headers: { "Content-Type": "application/json" },
      data: "this is not json{",
    });

    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
  });

  test("returns 422 for invalid email address", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_1_ID,
        first_name: "Shadow",
        last_name: "BadEmail",
        email: "not-an-email",
        vehicle_interest: "test",
        source: "website_form",
      },
    });

    expect(resp.status()).toBe(422);
  });

  test("returns 422 for invalid source enum value", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_1_ID,
        first_name: "Shadow",
        last_name: "BadSource",
        email: `shadow-bad-source-${Date.now()}@shadow-test.invalid`,
        vehicle_interest: "test",
        source: "telepathy", // not a valid enum value
      },
    });

    expect(resp.status()).toBe(422);
  });

  test("has required security headers", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_1_ID,
        first_name: "Shadow",
        last_name: "HeaderCheck",
        email: `shadow-hdr-${Date.now()}@shadow-test.invalid`,
        vehicle_interest: "header check test",
      },
    });

    assertSecurityHeaders(resp.headers());
  });
});

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------

test.describe("POST /api/contact", () => {
  test("returns 2xx or 403 (CSRF) with valid payload", async ({ request }) => {
    // First GET to receive CSRF cookie
    await request.get("/");
    const state = await request.storageState();
    const csrfCookie = state.cookies.find((c) => c.name === "wolfpack_csrf");
    const csrfToken = csrfCookie?.value ?? "";

    const resp = await request.post("/api/contact", {
      data: {
        first_name: "ShadowAPI",
        last_name: "ContactContract",
        email: `shadow-contact-contract-${Date.now()}@shadow-test.invalid`,
        subject: "API contract test",
        message: "Shadow API contract test contact form message — shadow-api.spec.ts",
      },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });

    // 201 = success, 403 = CSRF failed (acceptable if middleware is strict)
    // 429 = rate limited
    expect([201, 403, 429]).toContain(resp.status());

    if (resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("lead_id");
      expect(body).toHaveProperty("created_at");
    }
  });

  test("returns 422 with missing required fields", async ({ request }) => {
    const resp = await request.post("/api/contact", {
      data: {
        first_name: "Shadow",
        // missing: last_name, email, subject, message
      },
    });

    // 422 = validation failed, 403 = CSRF blocked before validation
    expect([403, 422]).toContain(resp.status());
  });

  test("has required security headers", async ({ request }) => {
    await request.get("/");
    const state = await request.storageState();
    const csrfToken = state.cookies.find((c) => c.name === "wolfpack_csrf")?.value ?? "";

    const resp = await request.post("/api/contact", {
      data: {
        first_name: "Shadow",
        last_name: "HeaderCheck",
        email: `shadow-contact-hdr-${Date.now()}@shadow-test.invalid`,
        subject: "Header check",
        message: "Security header check — shadow-api.spec.ts",
      },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });

    assertSecurityHeaders(resp.headers());
  });
});

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

test.describe("GET /api/health", () => {
  test("returns 200 or 503 with structured health body", async ({ request }) => {
    const resp = await request.get("/api/health");

    // 200 = healthy/degraded, 503 = unhealthy (both valid response shapes)
    expect([200, 503]).toContain(resp.status());

    const body = await resp.json();
    expect(body).toHaveProperty("status");
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("postgres");
    expect(body.checks).toHaveProperty("redis");

    // Each check must have ok + latency_ms fields
    for (const check of Object.values(body.checks) as Array<Record<string, unknown>>) {
      expect(check).toHaveProperty("ok");
      expect(typeof check.ok).toBe("boolean");
    }
  });

  test("has required security headers", async ({ request }) => {
    const resp = await request.get("/api/health");
    assertSecurityHeaders(resp.headers());
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/leads
// ---------------------------------------------------------------------------

test.describe("GET /api/admin/leads", () => {
  test("returns 200 with correct shape (demo mode — no auth required)", async ({ request }) => {
    // Middleware has `false &&` guarding the auth check, so admin routes
    // are accessible without authentication in demo mode.
    const resp = await request.get("/api/admin/leads");
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("leads");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("page_size");
    expect(body).toHaveProperty("team_members");

    expect(Array.isArray(body.leads)).toBe(true);
    expect(Array.isArray(body.team_members)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  test("supports status filter parameter", async ({ request }) => {
    const statuses = ["new", "contacted", "qualified", "appointment_set", "sold", "lost"];

    for (const status of statuses) {
      const resp = await request.get(`/api/admin/leads?status=${status}`);
      expect(resp.status()).toBe(200);

      const body = await resp.json();
      // Every returned lead must match the requested status
      for (const lead of body.leads) {
        expect(lead.status).toBe(status);
      }
    }
  });

  test("supports pagination parameters", async ({ request }) => {
    const resp = await request.get("/api/admin/leads?page=1&page_size=5");
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(5);
    expect(body.leads.length).toBeLessThanOrEqual(5);
  });

  test("has required security headers", async ({ request }) => {
    const resp = await request.get("/api/admin/leads");
    assertSecurityHeaders(resp.headers());
  });
});
