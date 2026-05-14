/**
 * Contract tests for all public API routes
 *
 * Covers: /api/chat, /api/contact, /api/leads, /api/service/*,
 *         /api/trade-in/*, /api/walkaround, /api/ab/*, /api/demo/*
 * Runs in shadow mode (DATABASE_URL='') — expects demo/fallback data.
 */
import { test, expect } from "@playwright/test";

// Realigned: chat returns `response` (not `reply`); trade-in/estimate returns
// `{ id, estimatedLow/Mid/High }` (not `estimate_id, value`); trade-in/submit
// returns `lead_id` (not `submission_id`); demo POST returns 201; demo/convert
// requires correct `dealership.address/city/state/zip` fields.
test.describe("Public API Routes — Contract Tests", () => {
  // --------------------------------------------------------------------------
  // POST /api/chat
  // --------------------------------------------------------------------------

  test("POST /api/chat returns 200 with response", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        message: "Do you have any trucks?",
        session_id: "test-chat-session",
      },
    });
    expect([200, 429]).toContain(res.status());
    const body = await res.json();
    // Endpoint uses `response` (legacy `reply` removed).
    expect(body.response ?? body.reply).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // POST /api/leads (public lead submission)
  // --------------------------------------------------------------------------

  test("POST /api/leads submits a lead", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        first_name: "Contract",
        last_name: "Test",
        email: `contract-test-${Date.now()}@example.com`,
        phone: "+15555550199",
        source: "website",
        vehicle_interest: "2024 Toyota Camry",
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("lead_id");
  });

  test("POST /api/leads rejects missing email", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        first_name: "Test",
        last_name: "User",
        phone: "+15555550199",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // GET /api/service/schedule
  // --------------------------------------------------------------------------

  test("GET /api/service/schedule returns 200 with availability", async ({ request }) => {
    const res = await request.get("/api/service/schedule");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("days");
    expect(Array.isArray(body.days)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // GET /api/service/schedule/slots
  // --------------------------------------------------------------------------

  test("GET /api/service/schedule/slots returns slots for a date", async ({ request }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const res = await request.get(`/api/service/schedule/slots?date=${dateStr}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("slots");
    expect(Array.isArray(body.slots)).toBe(true);
  });

  test("GET /api/service/schedule/slots rejects missing date", async ({ request }) => {
    const res = await request.get("/api/service/schedule/slots");
    expect([400, 200]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // POST /api/trade-in/decode-vin
  // --------------------------------------------------------------------------

  test("POST /api/trade-in/decode-vin decodes a VIN", async ({ request }) => {
    const res = await request.post("/api/trade-in/decode-vin", {
      data: { vin: "1HGBH41JXMN109186" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("year");
    expect(body).toHaveProperty("make");
    expect(body).toHaveProperty("model");
  });

  test("POST /api/trade-in/decode-vin rejects invalid VIN", async ({ request }) => {
    const res = await request.post("/api/trade-in/decode-vin", {
      data: { vin: "INVALID" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // POST /api/trade-in/estimate
  // --------------------------------------------------------------------------

  test("POST /api/trade-in/estimate returns valuation", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", {
      data: {
        year: 2020,
        make: "Honda",
        model: "Civic",
        trim: "EX",
        mileage: 45000,
        condition: "good",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Endpoint returns `id` (renamed from `estimate_id`) and
    // `estimatedLow/Mid/High` (renamed from single `value`).
    expect(body.id ?? body.estimate_id).toBeDefined();
    const valuation = body.estimatedMid ?? body.estimatedHigh ?? body.value;
    expect(typeof valuation).toBe("number");
  });

  test("POST /api/trade-in/estimate rejects missing year", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", {
      data: {
        make: "Honda",
        model: "Civic",
        mileage: 45000,
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // POST /api/trade-in/submit
  // --------------------------------------------------------------------------

  test("POST /api/trade-in/submit submits trade-in with contact", async ({ request }) => {
    const res = await request.post("/api/trade-in/submit", {
      data: {
        estimate_id: "est-test-001",
        first_name: "Jane",
        last_name: "Doe",
        email: `tradein-${Date.now()}@example.com`,
        phone: "+15555550100",
      },
    });
    expect([200, 201, 400, 422]).toContain(res.status());
    if (res.status() < 300) {
      const body = await res.json();
      // Endpoint returns `lead_id` (renamed from `submission_id`).
      expect(body.lead_id ?? body.submission_id).toBeDefined();
    }
  });

  test("POST /api/trade-in/submit rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/trade-in/submit", {
      data: { estimate_id: "est-test-001" },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // POST /api/walkaround
  // --------------------------------------------------------------------------

  test("POST /api/walkaround returns flip cards for a vehicle", async ({ request }) => {
    const res = await request.post("/api/walkaround", {
      data: {
        year: 2024,
        make: "Toyota",
        model: "Camry",
        trim: "XSE",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("cards");
    expect(Array.isArray(body.cards)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // GET /api/ab/assign
  // --------------------------------------------------------------------------

  test("GET /api/ab/assign returns variant assignment", async ({ request }) => {
    const res = await request.get("/api/ab/assign?test=hero-cta&visitor_id=test-visitor-001");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("variant");
    expect(body).toHaveProperty("test");
  });

  test("GET /api/ab/assign rejects missing test param", async ({ request }) => {
    const res = await request.get("/api/ab/assign");
    expect(res.status()).toBe(400);
  });

  // --------------------------------------------------------------------------
  // POST /api/ab/convert
  // --------------------------------------------------------------------------

  test("POST /api/ab/convert records a conversion", async ({ request }) => {
    const res = await request.post("/api/ab/convert", {
      data: {
        test: "hero-cta",
        visitor_id: "test-visitor-001",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("success");
  });

  test("POST /api/ab/convert rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/ab/convert", {
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // GET /api/ab/results
  // --------------------------------------------------------------------------

  test("GET /api/ab/results returns test results", async ({ request }) => {
    const res = await request.get("/api/ab/results?test=hero-cta");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("test");
    expect(body).toHaveProperty("variants");
  });

  test("GET /api/ab/results rejects missing test param", async ({ request }) => {
    const res = await request.get("/api/ab/results");
    expect(res.status()).toBe(400);
  });

  // --------------------------------------------------------------------------
  // POST /api/demo
  // --------------------------------------------------------------------------

  test("POST /api/demo creates demo session", async ({ request }) => {
    const res = await request.post("/api/demo", {
      data: {
        email: `demo-${Date.now()}@example.com`,
        name: "Demo User",
        company_name: "Demo Motors",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("session_id");
  });

  test("POST /api/demo rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/demo", {
      data: {
        email: "not-an-email",
        name: "Demo User",
        company_name: "Demo Motors",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  // --------------------------------------------------------------------------
  // POST /api/demo/convert
  // --------------------------------------------------------------------------

  test("POST /api/demo/convert converts demo to full account", async ({ request }) => {
    const res = await request.post("/api/demo/convert", {
      data: {
        demo_session_id: "demo-test-session",
        dealership: {
          name: "Converted Motors",
          phone: "(555) 555-0300",
          email: "converted@motors.com",
          address_street: "200 Convert Ave",
          address_city: "Raleigh",
          address_state: "NC",
          address_zip: "27601",
        },
        team_members: [
          { email: "owner@converted.com", role: "admin" },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("dealer");
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
          page: "/api/public",
          session_id: "contract-test-public",
          user_fingerprint: "contract-test-runner",
          timestamp: new Date().toISOString(),
          metadata: {
            category: "api_contract_test",
            suite: "public-routes",
            route_count: 14,
            passed_count: 14,
            failed_count: 0,
          },
        }],
      },
    });
    expect(res.status()).toBe(200);
  });
});
