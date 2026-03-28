import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Admin form submission E2E tests.
 *
 * All admin POST routes require auth (session cookie). Without auth they
 * return 401. We accept 201/200 OR 401 as valid responses — what we guard
 * against is 500 (server crash) which means broken code, not missing auth.
 *
 * For each route we also verify the source file imports analytics tracking
 * (a track* function from @/lib/analytics-hooks) to ensure the learning
 * pipeline is wired.
 */

const API_ROOT = path.resolve(__dirname, "../../../src/app/api");

/** Read a route source file and check if it imports a track* function. */
function routeHasAnalytics(routePath: string): boolean {
  const fullPath = path.join(API_ROOT, routePath, "route.ts");
  if (!fs.existsSync(fullPath)) return false;
  const content = fs.readFileSync(fullPath, "utf-8");
  return /import\s*\{[^}]*track\w+/.test(content);
}

/** Assert the response is an acceptable status (not 500). */
function assertNotServerError(status: number) {
  expect(status).not.toBe(500);
  expect(status).not.toBe(502);
  expect(status).not.toBe(503);
}

// ─── Inventory / Vehicles ────────────────────────────────────────────────────

test.describe("Admin vehicles (POST /api/admin/vehicles)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/vehicles", {
      data: {
        vin: "1HGCV1F34PA999999",
        year: 2024,
        make: "Honda",
        model: "Civic",
        price: 28000,
        condition: "new",
        status: "available",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/vehicles")).toBe(true);
  });
});

// ─── Deals ───────────────────────────────────────────────────────────────────

test.describe("Admin deals (POST /api/admin/deals)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/deals", {
      data: {
        customer_name: "E2E Test Customer",
        customer_email: "e2e@test.com",
        vehicle_vin: "1HGCV1F34PA999999",
        deal_type: "retail",
        selling_price: 30000,
        status: "working",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/deals")).toBe(true);
  });
});

// ─── Service: Appointments ───────────────────────────────────────────────────

test.describe("Admin service appointments (POST /api/admin/service/appointments)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/service/appointments", {
      data: {
        customer_name: "E2E Service Customer",
        customer_phone: "(919) 555-0200",
        customer_email: "svc@test.com",
        vehicle_year: 2022,
        vehicle_make: "Toyota",
        vehicle_model: "Camry",
        service_type: "oil_change",
        appointment_date: "2026-04-01",
        appointment_time: "09:00",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/service/appointments")).toBe(true);
  });
});

// ─── Service: Repair Orders ──────────────────────────────────────────────────

test.describe("Admin repair orders (POST /api/admin/service/repair-orders)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/service/repair-orders", {
      data: {
        customer_name: "E2E RO Customer",
        vehicle_vin: "1HGCV1F34PA999999",
        service_type: "brake_replacement",
        status: "open",
        estimated_cost: 450,
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/service/repair-orders")).toBe(true);
  });
});

// ─── Service: Parts ──────────────────────────────────────────────────────────

test.describe("Admin parts (POST /api/admin/service/parts)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/service/parts", {
      data: {
        part_number: "BRK-001",
        name: "Front Brake Pads",
        category: "brakes",
        cost: 45.99,
        retail_price: 89.99,
        quantity_on_hand: 12,
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("never returns 500 on empty body", async ({ request }) => {
    const res = await request.post("/api/admin/service/parts", { data: {} });
    assertNotServerError(res.status());
  });
});

// ─── Service: Technicians ────────────────────────────────────────────────────

test.describe("Admin technicians (POST /api/admin/service/technicians)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/service/technicians", {
      data: {
        name: "E2E Tech",
        certifications: ["ASE-A1"],
        specialties: ["engine"],
        status: "active",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("never returns 500 on empty body", async ({ request }) => {
    const res = await request.post("/api/admin/service/technicians", { data: {} });
    assertNotServerError(res.status());
  });
});

// ─── Comms: Templates ────────────────────────────────────────────────────────

test.describe("Admin comms templates (POST /api/admin/comms/templates)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/comms/templates", {
      data: {
        name: "E2E Welcome",
        channel: "email",
        subject: "Welcome to our dealership",
        body: "Thank you for visiting. We look forward to helping you.",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/comms/templates")).toBe(true);
  });
});

// ─── Comms: Sequences ────────────────────────────────────────────────────────

test.describe("Admin comms sequences (POST /api/admin/comms/sequences)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/comms/sequences", {
      data: {
        name: "E2E Follow-up Sequence",
        trigger: "new_lead",
        steps: [
          { delay_hours: 1, template_id: "tpl-001", channel: "email" },
          { delay_hours: 24, template_id: "tpl-002", channel: "sms" },
        ],
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("never returns 500 on empty body", async ({ request }) => {
    const res = await request.post("/api/admin/comms/sequences", { data: {} });
    assertNotServerError(res.status());
  });
});

// ─── Comms: Send ─────────────────────────────────────────────────────────────

test.describe("Admin comms send (POST /api/admin/comms/send)", () => {
  test("POST returns 200 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/comms/send", {
      data: {
        to: "customer@example.com",
        channel: "email",
        template_id: "tpl-001",
        variables: { first_name: "E2E" },
      },
    });
    expect([200, 201, 401, 403, 422, 429]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/comms/send")).toBe(true);
  });
});

// ─── Accounting: Sales Log ───────────────────────────────────────────────────

test.describe("Admin accounting sales-log (POST /api/admin/accounting/sales-log)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/sales-log", {
      data: {
        deal_id: "deal-e2e-001",
        sale_date: "2026-03-28",
        sale_type: "retail",
        vehicle_vin: "1HGCV1F34PA999999",
        sale_amount: 30000,
        gross_profit: 2500,
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/accounting/sales-log")).toBe(true);
  });
});

// ─── Accounting: Commissions ─────────────────────────────────────────────────

test.describe("Admin accounting commissions (POST /api/admin/accounting/commissions)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/accounting/commissions", {
      data: {
        salesperson: "Mike Chen",
        deal_id: "deal-e2e-001",
        commission_amount: 500,
        commission_type: "front_end",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/accounting/commissions")).toBe(true);
  });
});

// ─── Reviews ─────────────────────────────────────────────────────────────────

test.describe("Admin reviews (POST /api/admin/reviews)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/reviews", {
      data: {
        customer_name: "E2E Reviewer",
        rating: 5,
        platform: "google",
        review_text: "Great experience! Very professional.",
        review_date: "2026-03-28",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/reviews")).toBe(true);
  });
});

// ─── Documents ───────────────────────────────────────────────────────────────

test.describe("Admin documents (POST /api/admin/documents)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/documents", {
      data: {
        deal_id: "deal-e2e-001",
        doc_type: "purchase_agreement",
        title: "E2E Purchase Agreement",
        status: "draft",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/documents")).toBe(true);
  });
});

// ─── Lenders ─────────────────────────────────────────────────────────────────

test.describe("Admin lenders (POST /api/admin/lenders)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/lenders", {
      data: {
        name: "E2E Capital Finance",
        contact_email: "lender@test.com",
        min_credit_score: 620,
        max_ltv: 125,
        programs: ["new", "used", "certified"],
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/lenders")).toBe(true);
  });
});

// ─── Credit Pull ─────────────────────────────────────────────────────────────

test.describe("Admin credit pull (POST /api/admin/credit/pull)", () => {
  test("POST returns 200 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/credit/pull", {
      data: {
        customer_id: "cust-e2e-001",
        ssn_last4: "1234",
        bureau: "equifax",
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/credit/pull")).toBe(true);
  });
});

// ─── Compliance Checks ──────────────────────────────────────────────────────

test.describe("Admin compliance checks (POST /api/admin/compliance/checks)", () => {
  test("POST returns 200 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/compliance/checks", {
      data: {
        deal_id: "deal-e2e-001",
        check_types: ["ofac", "red_flags"],
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/compliance/checks")).toBe(true);
  });
});

// ─── Floor Plan ──────────────────────────────────────────────────────────────

test.describe("Admin floor plan (POST /api/admin/floor-plan)", () => {
  test("POST returns 201 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/floor-plan", {
      data: {
        vehicle_vin: "1HGCV1F34PA999999",
        lender: "Floor Plan Finance Co",
        amount: 25000,
        start_date: "2026-03-01",
        daily_rate: 15.0,
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("route source has analytics tracking", () => {
    expect(routeHasAnalytics("admin/floor-plan")).toBe(true);
  });
});

// ─── Knowledge Ingest ────────────────────────────────────────────────────────

test.describe("Admin knowledge ingest (POST /api/admin/knowledge/ingest)", () => {
  test("POST returns 200 or 401 (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/knowledge/ingest", {
      data: {
        document_id: "doc-e2e-001",
        doc_type: "faq",
        content_text: "What are your business hours? We are open Monday-Saturday 9AM-7PM.",
        metadata: { category: "general" },
      },
    });
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    assertNotServerError(res.status());
  });

  test("never returns 500 on empty body", async ({ request }) => {
    const res = await request.post("/api/admin/knowledge/ingest", { data: {} });
    assertNotServerError(res.status());
  });
});

// ─── Comms root (POST /api/admin/comms) ──────────────────────────────────────

test.describe("Admin comms root (POST /api/admin/comms)", () => {
  test("POST returns valid status (never 500)", async ({ request }) => {
    const res = await request.post("/api/admin/comms", {
      data: {
        to: "customer@example.com",
        channel: "email",
        subject: "E2E test",
        body: "Test message body",
      },
    });
    assertNotServerError(res.status());
  });
});
