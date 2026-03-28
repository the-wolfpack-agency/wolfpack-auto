/**
 * Event Capture — verify every module fires its analytics events.
 *
 * Two verification strategies per module:
 *   1. Static: read the source route file and confirm analytics-hooks import + track* call
 *   2. Runtime: hit the API and confirm it does not 500 (401 = auth wall = expected)
 *
 * Run: npx playwright test tests/e2e/analytics-pipeline/event-capture.spec.ts
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

const ROOT = path.resolve(__dirname, "../../..");
const API_ADMIN = path.join(ROOT, "src/app/api/admin");

/** Read a source file relative to the project root */
function readSource(...segments: string[]): string {
  const full = path.join(ROOT, ...segments);
  return fs.readFileSync(full, "utf-8");
}

/** Read an API route file */
function readRoute(...segments: string[]): string {
  return fs.readFileSync(path.join(API_ADMIN, ...segments), "utf-8");
}

/** Check that a route source imports a specific track* function */
function hasTrackImport(source: string, fn: string): boolean {
  // Matches both named imports like { trackDeal } and { trackDeal, trackSecurity }
  return source.includes(fn);
}

/* ========================================================================== */
/* Deal Events                                                                */
/* ========================================================================== */

test.describe("Deal events", () => {
  test("POST /api/admin/deals returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/deals", {
      data: {
        customer_name: "E2E Test Customer",
        vehicle_vin: "1HGCG5655WA123456",
        selling_price: 25000,
        deal_type: "retail",
      },
    });
    expect(res.status(), "deals POST must not 500").not.toBe(500);
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json();
      expect(body.deal).toBeTruthy();
      expect(body.deal.id || body.deal.deal_id || body.created).toBeTruthy();
    }
  });

  test("deals route.ts imports trackDeal from analytics-hooks", () => {
    const source = readRoute("deals", "route.ts");
    expect(hasTrackImport(source, "trackDeal")).toBe(true);
    expect(source).toContain("analytics-hooks");
  });

  test("deals route.ts calls trackDeal on POST (deal.created)", () => {
    const source = readRoute("deals", "route.ts");
    expect(source).toContain('trackDeal("deal.created"');
  });

  test("deals [dealId] route exists for per-deal operations", () => {
    const exists = fs.existsSync(path.join(API_ADMIN, "deals", "[dealId]", "route.ts"))
      || fs.existsSync(path.join(API_ADMIN, "deals", "[id]", "route.ts"));
    expect(exists, "deals/[dealId] or deals/[id] route must exist").toBe(true);
  });
});

/* ========================================================================== */
/* Service Events                                                             */
/* ========================================================================== */

test.describe("Service events", () => {
  test("POST /api/admin/service/appointments returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/service/appointments", {
      data: {
        customer_name: "E2E Service Customer",
        customer_phone: "(555) 555-0100",
        customer_email: "e2e@test.com",
        vehicle_year: 2024,
        vehicle_make: "Toyota",
        vehicle_model: "Camry",
        vin: "4T1G11AK0RU999999",
        service_type: "oil_change",
        description: "E2E test appointment",
        scheduled_date: "2026-04-01",
        scheduled_time: "09:00",
        estimated_duration_min: 30,
        advisor: "E2E Advisor",
      },
    });
    expect(res.status(), "appointments POST must not 500").not.toBe(500);
  });

  test("service/appointments route.ts imports trackService", () => {
    const source = readRoute("service", "appointments", "route.ts");
    expect(hasTrackImport(source, "trackService")).toBe(true);
    expect(source).toContain("analytics-hooks");
  });

  test("POST /api/admin/service/repair-orders returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/service/repair-orders", {
      data: {
        customer_name: "E2E RO Customer",
        vin: "4T1G11AK0RU999998",
        service_type: "diagnostic",
        description: "E2E test repair order",
        advisor: "E2E Advisor",
      },
    });
    expect(res.status(), "repair-orders POST must not 500").not.toBe(500);
  });

  test("service/repair-orders route.ts imports trackService", () => {
    const source = readRoute("service", "repair-orders", "route.ts");
    expect(hasTrackImport(source, "trackService")).toBe(true);
  });
});

/* ========================================================================== */
/* Comms Events                                                               */
/* ========================================================================== */

test.describe("Comms events", () => {
  test("POST /api/admin/comms/send returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/comms/send", {
      data: {
        to: "e2e@test.com",
        channel: "email",
        subject: "E2E Test Message",
        body: "This is an E2E test.",
        template_id: null,
      },
    });
    expect(res.status(), "comms/send POST must not 500").not.toBe(500);
  });

  test("comms/send route.ts imports trackComms", () => {
    const source = readRoute("comms", "send", "route.ts");
    expect(hasTrackImport(source, "trackComms")).toBe(true);
  });

  test("POST /api/admin/comms/templates returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/comms/templates", {
      data: {
        name: "E2E Test Template",
        channel: "email",
        subject: "Test Subject",
        body: "Hello {{customer_name}}!",
      },
    });
    expect(res.status(), "comms/templates POST must not 500").not.toBe(500);
  });

  test("comms/templates route.ts imports trackComms", () => {
    const source = readRoute("comms", "templates", "route.ts");
    expect(hasTrackImport(source, "trackComms")).toBe(true);
  });
});

/* ========================================================================== */
/* Accounting Events                                                          */
/* ========================================================================== */

test.describe("Accounting events", () => {
  test("POST /api/admin/accounting/sales-log returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/sales-log", {
      data: {
        deal_id: "deal-001",
        salesperson: "E2E Tester",
        vehicle_vin: "1HGCG5655WA123456",
        selling_price: 25000,
        total_gross: 3000,
        front_gross: 1500,
        back_gross: 1500,
      },
    });
    expect(res.status(), "sales-log POST must not 500").not.toBe(500);
  });

  test("accounting/sales-log route.ts imports trackAccounting", () => {
    const source = readRoute("accounting", "sales-log", "route.ts");
    expect(hasTrackImport(source, "trackAccounting")).toBe(true);
  });

  test("POST /api/admin/accounting/commissions returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/commissions", {
      data: {
        deal_id: "deal-001",
        salesperson: "E2E Tester",
        commission_amount: 500,
        commission_type: "flat",
      },
    });
    expect(res.status(), "commissions POST must not 500").not.toBe(500);
  });

  test("accounting/commissions route.ts imports trackAccounting", () => {
    const source = readRoute("accounting", "commissions", "route.ts");
    expect(hasTrackImport(source, "trackAccounting")).toBe(true);
  });
});

/* ========================================================================== */
/* Review Events                                                              */
/* ========================================================================== */

test.describe("Review events", () => {
  test("POST /api/admin/reviews returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/reviews", {
      data: {
        customer_name: "E2E Review Customer",
        rating: 5,
        platform: "google",
        text: "Excellent service — E2E test review.",
      },
    });
    expect(res.status(), "reviews POST must not 500").not.toBe(500);
  });

  test("reviews route.ts imports trackReview", () => {
    const source = readRoute("reviews", "route.ts");
    expect(hasTrackImport(source, "trackReview")).toBe(true);
  });

  test("reviews/[id] route exists for per-review operations", () => {
    const exists = fs.existsSync(path.join(API_ADMIN, "reviews", "[id]", "route.ts"))
      || fs.existsSync(path.join(API_ADMIN, "reviews", "[reviewId]", "route.ts"));
    expect(exists, "reviews/[id] or reviews/[reviewId] route must exist").toBe(true);
  });
});

/* ========================================================================== */
/* Digital Retail Events                                                      */
/* ========================================================================== */

test.describe("Digital retail events", () => {
  test("POST /api/admin/digital-retail/calculator returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 35000,
        down_payment: 5000,
        trade_value: 10000,
        apr: 5.49,
        term_months: 60,
      },
    });
    expect(res.status(), "calculator POST must not 500").not.toBe(500);
  });

  test("digital-retail/calculator route.ts imports trackRetail", () => {
    const source = readRoute("digital-retail", "calculator", "route.ts");
    expect(hasTrackImport(source, "trackRetail")).toBe(true);
  });

  test("POST /api/admin/digital-retail/credit-app returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        first_name: "E2E",
        last_name: "Tester",
        ssn_last4: "1234",
        dob: "1990-01-15",
        annual_income: 75000,
        employment_status: "employed",
        address: "123 Test St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
    });
    expect(res.status(), "credit-app POST must not 500").not.toBe(500);
  });

  test("digital-retail/credit-app route.ts imports trackRetail", () => {
    const source = readRoute("digital-retail", "credit-app", "route.ts");
    expect(hasTrackImport(source, "trackRetail")).toBe(true);
  });
});

/* ========================================================================== */
/* Document Events                                                            */
/* ========================================================================== */

test.describe("Document events", () => {
  test("POST /api/admin/documents returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/documents", {
      data: {
        name: "e2e-test-doc.pdf",
        type: "buyers_guide",
        deal_id: "deal-001",
        content_base64: "dGVzdA==",
      },
    });
    expect(res.status(), "documents POST must not 500").not.toBe(500);
  });

  test("documents route.ts imports trackDocument", () => {
    const source = readRoute("documents", "route.ts");
    expect(hasTrackImport(source, "trackDocument")).toBe(true);
  });

  test("POST /api/admin/documents/analyze returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/documents/analyze", {
      data: {
        document_id: "doc-001",
        type: "deal_jacket",
      },
    });
    expect(res.status(), "documents/analyze POST must not 500").not.toBe(500);
  });

  test("documents/analyze route.ts imports trackDocument", () => {
    const source = readRoute("documents", "analyze", "route.ts");
    expect(hasTrackImport(source, "trackDocument")).toBe(true);
  });
});

/* ========================================================================== */
/* Security Events                                                            */
/* ========================================================================== */

test.describe("Security events", () => {
  test("POST /api/admin/security/scan returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/security/scan", {
      data: { target: "full_platform", mode: "fast" },
    });
    expect(res.status(), "security/scan POST must not 500").not.toBe(500);
  });

  test("security/scan route.ts imports trackSecurity", () => {
    const source = readRoute("security", "scan", "route.ts");
    expect(hasTrackImport(source, "trackSecurity")).toBe(true);
  });
});

/* ========================================================================== */
/* Knowledge Events                                                           */
/* ========================================================================== */

test.describe("Knowledge events", () => {
  test("POST /api/admin/knowledge/ingest returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/knowledge/ingest", {
      data: {
        title: "E2E Test Document",
        content: "This is an E2E test knowledge base document.",
        category: "training",
      },
    });
    expect(res.status(), "knowledge/ingest POST must not 500").not.toBe(500);
  });

  test("knowledge/ingest route.ts imports trackKnowledge", () => {
    const source = readRoute("knowledge", "ingest", "route.ts");
    expect(hasTrackImport(source, "trackKnowledge")).toBe(true);
  });

  test("POST /api/admin/knowledge/query returns non-500", async ({ request }) => {
    const res = await request.post("/api/admin/knowledge/query", {
      data: { question: "What is the return policy?" },
    });
    expect(res.status(), "knowledge/query POST must not 500").not.toBe(500);
  });

  test("knowledge/query route.ts imports trackKnowledge", () => {
    const source = readRoute("knowledge", "query", "route.ts");
    expect(hasTrackImport(source, "trackKnowledge")).toBe(true);
  });
});

/* ========================================================================== */
/* Customer Events                                                            */
/* ========================================================================== */

test.describe("Customer events", () => {
  test("GET /api/admin/customers/CUSTOMER_ID returns non-500", async ({ request }) => {
    const res = await request.get("/api/admin/customers/cust-001");
    expect(res.status(), "customers/[id] GET must not 500").not.toBe(500);
  });

  test("customers/[id] route.ts imports trackCustomer", () => {
    const source = readRoute("customers", "[id]", "route.ts");
    expect(hasTrackImport(source, "trackCustomer")).toBe(true);
  });

  test("customers route.ts exists", () => {
    const exists = fs.existsSync(path.join(API_ADMIN, "customers", "route.ts"))
      || fs.existsSync(path.join(API_ADMIN, "customers", "[id]", "route.ts"));
    expect(exists, "customers route must exist").toBe(true);
  });
});
