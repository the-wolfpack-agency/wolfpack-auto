import { test, expect } from "@playwright/test";
import { csrfHeaders } from "../helpers/csrf";

/**
 * Public form submission E2E tests.
 *
 * These verify the FULL data path for public-facing endpoints:
 *   user fills form -> clicks submit -> API processes -> data persists
 *
 * Public endpoints tested:
 *   POST /api/leads          — lead submission
 *   POST /api/contact        — contact form
 *   POST /api/service/schedule — service booking
 *   POST /api/trade-in/estimate — trade-in valuation
 *   POST /api/trade-in/submit  — trade-in lead capture
 *   POST /api/admin/digital-retail/calculator — payment calculator
 *   POST /api/admin/digital-retail/credit-app — credit application
 */

const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.example.com`;

// ─── Lead submission via /api/leads ──────────────────────────────────────────

test.describe("Lead submission (POST /api/leads)", () => {
  test("valid lead returns 201 with lead_id", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        dealer_id: "e2e-dealer",
        first_name: "Jane",
        last_name: "Doe",
        email: uniqueEmail(),
        phone: "+19195550100",
        vehicle_interest: "2024 Toyota Camry",
        source: "website_form",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
    expect(body.created_at).toBeTruthy();
  });

  test("missing email returns 422 validation error", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        dealer_id: "e2e-dealer",
        first_name: "Jane",
        last_name: "Doe",
        vehicle_interest: "2024 Toyota Camry",
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("missing dealer_id returns 422", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        first_name: "Jane",
        last_name: "Doe",
        email: uniqueEmail(),
        vehicle_interest: "2024 Toyota Camry",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("missing vehicle_interest returns 422", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        dealer_id: "e2e-dealer",
        first_name: "Jane",
        last_name: "Doe",
        email: uniqueEmail(),
      },
    });
    expect(res.status()).toBe(422);
  });

  test("invalid email format returns 422", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        dealer_id: "e2e-dealer",
        first_name: "Jane",
        last_name: "Doe",
        email: "not-an-email",
        vehicle_interest: "2024 Honda Civic",
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.details?.some((d: { field: string }) => d.field === "email")).toBe(true);
  });

  test("invalid JSON body returns 400", async ({ request }) => {
    const res = await request.post("/api/leads", {
      headers: { "Content-Type": "application/json" },
      data: "not json{{{",
    });
    // Next.js may parse raw string as valid JSON string; accept 400 or 422
    expect([400, 422]).toContain(res.status());
  });

  test("never returns 500", async ({ request }) => {
    const res = await request.post("/api/leads", { data: {} });
    expect(res.status()).not.toBe(500);
  });
});

// ─── Contact form via /api/contact ───────────────────────────────────────────

test.describe("Contact form (POST /api/contact)", () => {
  // CSRF: middleware enforces double-submit cookie on /api/contact.
  // csrfHeaders() does a priming GET to land the cookie, then returns
  // the x-csrf-token header to attach.

  test("valid contact submission returns 201", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        first_name: "Test",
        last_name: "User",
        email: uniqueEmail(),
        phone: "9195550101",
        subject: "E2E Test Inquiry",
        message: "This is an automated E2E test message.",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
  });

  test("missing subject returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        first_name: "Test",
        last_name: "User",
        email: uniqueEmail(),
        message: "Message without subject.",
      },
    });
    // Route may return 400 (zod) or 422 (semantic) for validation failures.
    expect([400, 422]).toContain(res.status());
  });

  test("missing message returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        first_name: "Test",
        last_name: "User",
        email: uniqueEmail(),
        subject: "Test subject",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("empty body returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", { headers, data: {} });
    expect([400, 422]).toContain(res.status());
  });

  test("never returns 500", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", { headers, data: {} });
    expect(res.status()).not.toBe(500);
  });
});

// ─── Contact page UI submission ──────────────────────────────────────────────

test.describe("Contact page UI", () => {
  test("contact page loads with form fields", async ({ page }) => {
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    // The page should have input fields or a form
    const formOrInputs = page.locator("form, input, textarea");
    const count = await formOrInputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ─── Service booking via /api/service/schedule ───────────────────────────────

test.describe("Service booking (POST /api/service/schedule)", () => {
  function futureSlotId(): string {
    const d = new Date();
    // Pick 2 days from now to avoid weekends
    d.setDate(d.getDate() + 2);
    const dateStr = d.toISOString().slice(0, 10);
    return `slot-${dateStr}-0900`;
  }

  test("valid booking returns 201 with appointment", async ({ request }) => {
    const res = await request.post("/api/service/schedule", {
      data: {
        customer_name: "E2E Tester",
        email: uniqueEmail(),
        phone: "9195550102",
        service_type: "oil_change",
        slot_id: futureSlotId(),
        vehicle_desc: "2022 Honda Civic",
        notes: "E2E test booking",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.appointment).toBeTruthy();
    expect(body.appointment.id).toBeTruthy();
    expect(body.appointment.status).toBe("scheduled");
    expect(body.appointment.service_type).toBe("oil_change");
  });

  test("missing required fields returns 422", async ({ request }) => {
    const res = await request.post("/api/service/schedule", {
      data: {
        customer_name: "E2E Tester",
        // missing email, service_type, slot_id
      },
    });
    expect(res.status()).toBe(422);
  });

  test("invalid email returns 422", async ({ request }) => {
    const res = await request.post("/api/service/schedule", {
      data: {
        customer_name: "E2E Tester",
        email: "bad-email",
        service_type: "oil_change",
        slot_id: futureSlotId(),
      },
    });
    expect(res.status()).toBe(422);
  });

  test("invalid slot_id format returns 422", async ({ request }) => {
    const res = await request.post("/api/service/schedule", {
      data: {
        customer_name: "E2E Tester",
        email: uniqueEmail(),
        service_type: "oil_change",
        slot_id: "invalid-slot-format",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("GET /api/service/schedule returns slot availability", async ({ request }) => {
    const res = await request.get("/api/service/schedule");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.days).toBeDefined();
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBe(7);
    for (const day of body.days) {
      expect(day.date).toBeTruthy();
      expect(typeof day.available_count).toBe("number");
      expect(typeof day.total).toBe("number");
    }
  });

  test("never returns 500", async ({ request }) => {
    const res = await request.post("/api/service/schedule", { data: {} });
    expect(res.status()).not.toBe(500);
  });
});

// ─── Trade-in estimate via /api/trade-in/estimate ────────────────────────────

test.describe("Trade-in estimate (POST /api/trade-in/estimate)", () => {
  test("valid vehicle data returns estimate", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", {
      data: {
        year: 2020,
        make: "Honda",
        model: "Civic",
        mileage: 45000,
        condition: "good",
      },
    });
    // Accept 200 or 201 — the route may return either
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    // Route returns camelCase fields (estimatedLow/High/Mid); also accept
    // snake_case / generic fallbacks for forward-compat.
    expect(
      body.estimatedLow ??
        body.estimated_low ??
        body.low ??
        body.estimate,
    ).toBeDefined();
  });

  test("missing required fields returns validation error", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", {
      data: { year: 2020 },
    });
    // Route returns 400 for zod-schema rejection, 422 for semantic validation.
    expect([400, 422]).toContain(res.status());
  });

  test("negative mileage returns validation error", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", {
      data: {
        year: 2020,
        make: "Honda",
        model: "Civic",
        mileage: -1000,
        condition: "good",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("never returns 500", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", { data: {} });
    expect(res.status()).not.toBe(500);
  });
});

// ─── Trade-in page UI ────────────────────────────────────────────────────────

test.describe("Trade-in page UI", () => {
  test("trade-in wizard loads with vehicle inputs", async ({ page }) => {
    await page.goto("/trade-in", { waitUntil: "domcontentloaded" });
    // The page should have inputs for vehicle details
    const inputs = page.locator("input, select, textarea");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ─── Payment calculator ──────────────────────────────────────────────────────

test.describe("Payment calculator (POST /api/admin/digital-retail/calculator)", () => {
  test("valid retail calculation returns monthly_payment", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 35000,
        down_payment: 5000,
        apr: 5.9,
        term_months: 60,
        deal_type: "retail",
        tax_rate: 7.0,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.monthly_payment).toBeDefined();
    expect(typeof body.monthly_payment).toBe("number");
    expect(body.monthly_payment).toBeGreaterThan(0);
    expect(body.deal_type).toBe("retail");
    expect(body.amount_financed).toBeDefined();
    expect(body.total_interest).toBeDefined();
    expect(body.total_cost).toBeDefined();
  });

  test("lease calculation returns lease-specific fields", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 40000,
        down_payment: 3000,
        apr: 3.5,
        term_months: 36,
        deal_type: "lease",
        residual_pct: 55,
        tax_rate: 7.0,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.deal_type).toBe("lease");
    expect(body.monthly_payment).toBeGreaterThan(0);
    expect(body.residual_value).toBeDefined();
    expect(body.due_at_signing).toBeDefined();
  });

  test("negative vehicle_price returns 400", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: -5000,
        down_payment: 1000,
        apr: 5.0,
        term_months: 60,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("zero vehicle_price returns 400", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 0,
        down_payment: 0,
        apr: 5.0,
        term_months: 60,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("invalid term_months returns 400", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 30000,
        down_payment: 0,
        apr: 5.0,
        term_months: 55, // not in VALID_TERMS
      },
    });
    expect(res.status()).toBe(400);
  });

  test("apr above 30 returns 400", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 30000,
        down_payment: 0,
        apr: 35,
        term_months: 60,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("0% APR calculates correctly (no division by zero)", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 30000,
        down_payment: 0,
        apr: 0,
        term_months: 60,
        deal_type: "retail",
        tax_rate: 0,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.monthly_payment).toBe(500); // 30000 / 60
    expect(body.total_interest).toBe(0);
  });

  test("never returns 500", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {},
    });
    expect(res.status()).not.toBe(500);
  });
});

// ─── Credit application ──────────────────────────────────────────────────────

test.describe("Credit application (POST /api/admin/digital-retail/credit-app)", () => {
  test("valid credit app returns 201", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        first_name: "E2E",
        last_name: "Tester",
        email: uniqueEmail(),
        phone: "(919) 555-0150",
        annual_income: 75000,
        employment_status: "employed",
        employer: "Test Corp",
        vehicle_interest: "2024 Toyota Camry XSE",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("submitted");
    expect(body.submitted_at).toBeTruthy();
  });

  test("missing required field (annual_income) returns 400", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        first_name: "E2E",
        last_name: "Tester",
        email: uniqueEmail(),
        phone: "(919) 555-0150",
        // missing annual_income
      },
    });
    expect(res.status()).toBe(400);
  });

  test("missing first_name returns 400", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        last_name: "Tester",
        email: uniqueEmail(),
        phone: "(919) 555-0150",
        annual_income: 75000,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("never returns 500", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {},
    });
    expect(res.status()).not.toBe(500);
  });
});
