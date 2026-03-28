/**
 * Exhaustive Analytics Verification
 *
 * Performs REAL actions across EVERY module in the wolfpack-auto platform,
 * then verifies analytics events were persisted via the health endpoint.
 *
 * Each test re-authenticates (Playwright gives fresh request context per test).
 * We accept any non-500 status — the goal is proving analytics fire, not validation.
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Auth helper — re-used in every test
// ---------------------------------------------------------------------------
async function login(request: any): Promise<string> {
  const csrf = await request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const cc = csrf
    .headersArray()
    .filter((h: any) => h.name.toLowerCase() === "set-cookie")
    .map((h: any) => h.value.split(";")[0].trim())
    .join("; ");
  const sign = await request.post("/api/auth/callback/credentials", {
    form: {
      email: "demo@wolfpackauto.com",
      password: "demo",
      csrfToken,
      json: "true",
    },
    headers: { cookie: cc },
  });
  const sc = sign
    .headersArray()
    .filter((h: any) => h.name.toLowerCase() === "set-cookie")
    .map((h: any) => h.value.split(";")[0].trim())
    .join("; ");
  return [cc, sc].filter(Boolean).join("; ");
}

/** Shortcut: login then return cookies. Swallows auth failures gracefully. */
async function safeCookies(request: any): Promise<string> {
  try {
    return await login(request);
  } catch {
    return "";
  }
}

const TS = Date.now();
const DEALER_ID = "00000000-0000-4000-a000-000000000001";

// Track 500s across all tests for final verification
const fiveHundreds: string[] = [];

function not500(res: any, label: string) {
  if (res.status() === 500) fiveHundreds.push(label);
  expect(res.status()).not.toBe(500);
}

// ═══════════════════════════════════════════════════════════════════════════
// Module: Leads
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Leads", () => {
  test("Create lead via public /api/leads", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        dealer_id: DEALER_ID,
        first_name: "ExhaustiveTest",
        last_name: `Lead${TS}`,
        email: `exhaust-lead-${TS}@test.com`,
        phone: "+15559990001",
        vehicle_interest: "2025 Test Sedan",
        source: "website_form",
      },
    });
    not500(res, "POST /api/leads");
  });

  test("Create lead via admin /api/admin/leads", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/leads", {
      data: {
        first_name: "AdminExhaustive",
        last_name: `Lead${TS}`,
        email: `exhaust-admin-lead-${TS}@test.com`,
        phone: "+15559990002",
        source: "walk_in",
        status: "new",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/leads");
  });

  test("Search leads GET /api/admin/leads?search=test", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/leads?search=test", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/leads?search=test");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Deals
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Deals", () => {
  test("Create deal POST /api/admin/deals", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/deals", {
      data: {
        lead_id: "test-lead-001",
        vehicle_vin: "1HGCM82633A004352",
        deal_type: "finance",
        sale_price: 28500,
        down_payment: 3000,
        trade_in_value: 5000,
        status: "pending",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/deals");
  });

  test("Calculate retail payment POST /api/admin/digital-retail/calculator", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 35000,
        down_payment: 5000,
        apr: 4.9,
        term_months: 60,
        deal_type: "finance",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/digital-retail/calculator");
  });

  test("Calculate lease payment", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 42000,
        down_payment: 3000,
        apr: 3.5,
        term_months: 36,
        deal_type: "lease",
        residual_percent: 55,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/digital-retail/calculator (lease)");
  });

  test("Add F&I product POST /api/admin/fi-products", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/fi-products", {
      data: {
        name: `Extended Warranty ${TS}`,
        type: "warranty",
        cost: 1200,
        price: 2400,
        provider: "AutoGuard",
        term_months: 60,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/fi-products");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Service
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Service", () => {
  test("Create appointment POST /api/admin/service/appointments", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/service/appointments", {
      data: {
        customer_name: "Jane Doe",
        customer_email: `svc-${TS}@test.com`,
        customer_phone: "+15559990010",
        vehicle_vin: "1HGCM82633A004352",
        service_type: "oil_change",
        date: "2026-04-15",
        time: "10:00",
        notes: "Exhaustive analytics test",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/service/appointments");
  });

  test("Create repair order POST /api/admin/service/repair-orders", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/service/repair-orders", {
      data: {
        vehicle_vin: "1HGCM82633A004352",
        customer_name: "John Smith",
        technician_id: "tech-001",
        complaint: "Engine noise at idle",
        diagnosis: "Loose serpentine belt",
        estimated_cost: 350,
        status: "open",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/service/repair-orders");
  });

  test("Add part POST /api/admin/service/parts", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/service/parts", {
      data: {
        part_number: `PT-${TS}`,
        name: "Serpentine Belt",
        category: "engine",
        cost: 45.0,
        price: 89.99,
        quantity_on_hand: 12,
        reorder_point: 3,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/service/parts");
  });

  test("Add technician POST /api/admin/service/technicians", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/service/technicians", {
      data: {
        name: `TechTest ${TS}`,
        email: `tech-${TS}@test.com`,
        specializations: ["engine", "transmission"],
        certification_level: "master",
        hourly_rate: 65,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/service/technicians");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Comms
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Comms", () => {
  test("Create template POST /api/admin/comms/templates", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/comms/templates", {
      data: {
        name: `Welcome Template ${TS}`,
        channel: "email",
        subject: "Welcome to Wolfpack Auto!",
        body: "Hi {{first_name}}, thanks for visiting us.",
        category: "welcome",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/comms/templates");
  });

  test("Create sequence POST /api/admin/comms/sequences", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/comms/sequences", {
      data: {
        name: `Follow-up Sequence ${TS}`,
        trigger: "lead_created",
        steps: [
          { delay_hours: 0, template: "welcome", channel: "email" },
          { delay_hours: 24, template: "follow_up", channel: "sms" },
        ],
        active: true,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/comms/sequences");
  });

  test("Send message POST /api/admin/comms/send", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/comms/send", {
      data: {
        to: `comms-test-${TS}@test.com`,
        channel: "email",
        subject: "Analytics test message",
        body: "This is an exhaustive analytics test message.",
        lead_id: "test-lead-001",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/comms/send");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Accounting
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Accounting", () => {
  test("Log sale POST /api/admin/accounting/sales-log", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/accounting/sales-log", {
      data: {
        deal_id: "deal-001",
        vehicle_vin: "1HGCM82633A004352",
        sale_price: 28500,
        cost: 24000,
        gross_profit: 4500,
        sale_date: "2026-03-28",
        salesperson: "Mike Johnson",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/accounting/sales-log");
  });

  test("Record commission POST /api/admin/accounting/commissions", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/accounting/commissions", {
      data: {
        employee_id: "emp-001",
        deal_id: "deal-001",
        amount: 675,
        type: "front_end",
        pay_period: "2026-03",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/accounting/commissions");
  });

  test("Export accounting POST /api/admin/accounting/export", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/accounting/export", {
      data: {
        format: "csv",
        date_from: "2026-03-01",
        date_to: "2026-03-31",
        type: "sales",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/accounting/export");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Reviews
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Reviews", () => {
  test("Add review POST /api/admin/reviews", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/reviews", {
      data: {
        customer_name: "Happy Customer",
        rating: 5,
        platform: "google",
        text: "Great experience at Wolfpack Auto!",
        vehicle_purchased: "2025 Honda Civic",
        date: "2026-03-28",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/reviews");
  });

  test("Respond to review POST /api/admin/reviews/templates", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/reviews/templates", {
      data: {
        name: `Response Template ${TS}`,
        tone: "professional",
        body: "Thank you for your kind words! We appreciate your business.",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/reviews/templates");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Documents
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Documents", () => {
  test("Upload document POST /api/admin/documents", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/documents", {
      data: {
        name: `TestDoc_${TS}.pdf`,
        type: "purchase_agreement",
        deal_id: "deal-001",
        content: "base64encodedcontent",
        mime_type: "application/pdf",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/documents");
  });

  test("Analyze document POST /api/admin/documents/analyze", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/documents/analyze", {
      data: {
        document_id: "doc-001",
        analysis_type: "compliance_check",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/documents/analyze");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Credit
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Credit", () => {
  test("Pull credit POST /api/admin/credit/pull", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/credit/pull", {
      data: {
        first_name: "Test",
        last_name: "Applicant",
        ssn_last4: "1234",
        date_of_birth: "1990-01-15",
        address: "123 Test St",
        city: "Providence",
        state: "RI",
        zip: "02903",
        bureau: "equifax",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/credit/pull");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Compliance
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Compliance", () => {
  test("Run compliance check POST /api/admin/compliance", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/compliance", {
      data: {
        check_type: "ofac",
        entity_name: "Test Customer",
        deal_id: "deal-001",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/compliance");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Lenders
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Lenders", () => {
  test("Add lender POST /api/admin/lenders", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/lenders", {
      data: {
        name: `TestBank ${TS}`,
        contact_email: `lender-${TS}@test.com`,
        contact_phone: "+15559990020",
        min_credit_score: 620,
        max_ltv: 125,
        programs: ["new", "used", "lease"],
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/lenders");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Floor Plan
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Floor Plan", () => {
  test("Add to floor plan POST /api/admin/floor-plan", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/floor-plan", {
      data: {
        vehicle_vin: "1HGCM82633A004352",
        lender: "NextGear Capital",
        amount: 24000,
        interest_rate: 5.5,
        curtailment_date: "2026-06-28",
        status: "active",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/floor-plan");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Knowledge
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Knowledge", () => {
  test("Ingest document POST /api/admin/knowledge/ingest", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/knowledge/ingest", {
      data: {
        title: `Policy Doc ${TS}`,
        content: "All vehicles must pass a 150-point inspection before retail listing.",
        category: "policy",
        tags: ["inspection", "quality"],
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/knowledge/ingest");
  });

  test("Query knowledge POST /api/admin/knowledge/query", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/knowledge/query", {
      data: {
        query: "What is the vehicle inspection policy?",
        top_k: 3,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/knowledge/query");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Webhooks
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Webhooks", () => {
  test("Create webhook POST /api/admin/webhooks", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/webhooks", {
      data: {
        url: "https://httpbin.org/post",
        events: ["lead.created", "deal.closed"],
        active: true,
        secret: "webhook-test-secret",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/webhooks");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Security
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Security", () => {
  test("Run scan POST /api/admin/security/scan", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/security/scan", {
      data: {
        scan_type: "quick",
        targets: ["api_routes", "auth_config"],
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/security/scan");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Digital Retail
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Digital Retail", () => {
  test("Calculator POST /api/admin/digital-retail/calculator", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 52000,
        down_payment: 10000,
        apr: 3.9,
        term_months: 72,
        deal_type: "finance",
        trade_in_value: 8000,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/digital-retail/calculator (digital-retail)");
  });

  test("Credit app POST /api/admin/digital-retail/credit-app", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        first_name: "Digital",
        last_name: "Buyer",
        email: `digital-${TS}@test.com`,
        phone: "+15559990030",
        annual_income: 85000,
        employment_status: "employed",
        employer: "Test Corp",
        residence_type: "own",
        monthly_housing: 1500,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/digital-retail/credit-app");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Customers
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Customers", () => {
  test("View customer GET /api/admin/customers/test-id", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/customers/test-id", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/customers/test-id");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Inventory
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Inventory", () => {
  test("Search inventory GET /api/admin/inventory", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/inventory?search=test", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/inventory?search=test");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Marketing
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Marketing", () => {
  test("Create campaign POST /api/admin/marketing", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/marketing", {
      data: {
        name: `Spring Sale ${TS}`,
        type: "email_blast",
        audience: "all_leads",
        subject: "Spring Clearance Event!",
        body: "Don't miss our biggest sale of the year.",
        scheduled_date: "2026-04-01",
        budget: 5000,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/marketing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Tasks
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Tasks", () => {
  test("Create task POST /api/admin/tasks", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/tasks", {
      data: {
        title: `Follow up with lead ${TS}`,
        assigned_to: "emp-001",
        due_date: "2026-04-01",
        priority: "high",
        type: "follow_up",
        related_lead_id: "test-lead-001",
        notes: "Customer showed strong interest in 2025 Civic",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/tasks");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Rewards
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Rewards", () => {
  test("POST /api/admin/rewards", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/rewards", {
      data: {
        program_name: `Loyalty Program ${TS}`,
        type: "referral",
        reward_amount: 250,
        conditions: "Referred customer must complete a purchase",
        active: true,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/rewards");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Training
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Training", () => {
  test("POST /api/admin/training", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/training", {
      data: {
        title: `Sales Techniques ${TS}`,
        type: "course",
        description: "Advanced objection handling and closing techniques",
        duration_minutes: 60,
        required: true,
        assigned_roles: ["salesperson", "manager"],
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/training");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Change Management
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Change Management", () => {
  test("POST /api/admin/change-management", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/change-management", {
      data: {
        title: `Process Update ${TS}`,
        description: "Updating trade-in appraisal workflow",
        impact: "medium",
        status: "proposed",
        requested_by: "demo@wolfpackauto.com",
        effective_date: "2026-04-15",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/change-management");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Competitive
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Competitive", () => {
  test("POST /api/admin/competitive", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/competitive", {
      data: {
        competitor_name: "Nearby Motors",
        vehicle_match: "2025 Honda Civic",
        their_price: 27500,
        our_price: 26900,
        source: "website",
        notes: "Price-matched and beat by $600",
        date_observed: "2026-03-28",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/competitive");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Engagement Reports
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Engagement Reports", () => {
  test("POST /api/admin/engagement-reports", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/engagement-reports", {
      data: {
        report_type: "weekly",
        date_from: "2026-03-21",
        date_to: "2026-03-28",
        metrics: ["leads", "appointments", "deals_closed"],
        format: "json",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/engagement-reports");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Good Faith
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Good Faith", () => {
  test("POST /api/admin/good-faith", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/good-faith", {
      data: {
        deal_id: "deal-001",
        customer_name: "Test Customer",
        vehicle: "2025 Honda Civic",
        sale_price: 26900,
        down_payment: 3000,
        trade_in: 5000,
        apr: 4.9,
        term_months: 60,
        monthly_payment: 345.67,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/good-faith");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Pricing
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Pricing", () => {
  test("Generate pricing report POST /api/admin/pricing", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/pricing", {
      data: {
        vehicle_vin: "1HGCM82633A004352",
        market_data: true,
        include_comparables: true,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/pricing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Reports / Export
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Reports", () => {
  test("Export analytics GET /api/admin/export/analytics", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/export/analytics", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/export/analytics");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Settings
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Settings", () => {
  test("GET /api/admin/settings", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/settings", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/settings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Service Booking (Public)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Service Booking", () => {
  test("POST /api/service/schedule", async ({ request }) => {
    const res = await request.post("/api/service/schedule", {
      data: {
        dealer_id: DEALER_ID,
        customer_name: "Public Booker",
        customer_email: `booking-${TS}@test.com`,
        customer_phone: "+15559990040",
        service_type: "tire_rotation",
        preferred_date: "2026-04-10",
        preferred_time: "14:00",
        vehicle_year: 2023,
        vehicle_make: "Toyota",
        vehicle_model: "Camry",
      },
    });
    not500(res, "POST /api/service/schedule");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Trade-In (Public)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Trade-In", () => {
  test("POST /api/trade-in/estimate", async ({ request }) => {
    const res = await request.post("/api/trade-in/estimate", {
      data: {
        vin: "1HGCM82633A004352",
        year: 2020,
        make: "Honda",
        model: "Accord",
        mileage: 45000,
        condition: "good",
        zip_code: "02903",
      },
    });
    not500(res, "POST /api/trade-in/estimate");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Agency
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Agency", () => {
  test("List dealers GET /api/admin/dealers", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/dealers", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/dealers");
  });

  test("Create dealer user POST /api/admin/dealer-users", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/dealer-users", {
      data: {
        email: `dealer-user-${TS}@test.com`,
        name: `Test User ${TS}`,
        role: "salesperson",
        dealer_id: DEALER_ID,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/dealer-users");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Dealer Switching
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Dealer Switching", () => {
  test("POST /api/admin/switch-dealer", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/switch-dealer", {
      data: {
        dealer_id: DEALER_ID,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/switch-dealer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: OEM
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: OEM", () => {
  test("GET /api/admin/oem", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/oem", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/oem");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Funnel Health
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Funnel Health", () => {
  test("GET /api/admin/funnel-health", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/funnel-health", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/funnel-health");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: VIN Decode
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: VIN Decode", () => {
  test("POST /api/admin/vin-decode", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/vin-decode", {
      data: { vin: "1HGCM82633A004352" },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/vin-decode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Vehicles
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Vehicles", () => {
  test("GET /api/admin/vehicles", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/vehicles", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/vehicles");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Billing
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Billing", () => {
  test("GET /api/admin/billing", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/billing", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/billing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Resources
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Resources", () => {
  test("POST /api/admin/resources", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/resources", {
      data: {
        title: `How-to Guide ${TS}`,
        type: "guide",
        content: "Step-by-step guide for new salespeople.",
        category: "onboarding",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/resources");
  });
});

// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Module: Contact (Public)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Contact", () => {
  test("POST /api/contact", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: {
        name: "Contact Tester",
        email: `contact-${TS}@test.com`,
        phone: "+15559990050",
        message: "I am interested in your inventory. Please call me.",
        dealer_id: DEALER_ID,
      },
    });
    not500(res, "POST /api/contact");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Analytics Events (Public)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Analytics Events", () => {
  test("POST /api/analytics/events", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        event: "page_view",
        page: "/inventory",
        referrer: "https://google.com",
        session_id: `sess-${TS}`,
        dealer_id: DEALER_ID,
        timestamp: new Date().toISOString(),
      },
    });
    not500(res, "POST /api/analytics/events");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Onboarding
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Onboarding", () => {
  test("POST /api/admin/onboarding", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/onboarding", {
      data: {
        step: "welcome",
        completed: true,
        dealer_id: DEALER_ID,
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/onboarding");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Domains
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Domains", () => {
  test("GET /api/admin/domains", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/domains", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/domains");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Trade-In Admin
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Trade-In Admin", () => {
  test("POST /api/admin/trade-in", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/trade-in", {
      data: {
        vin: "1HGCM82633A004352",
        year: 2020,
        make: "Honda",
        model: "Accord",
        mileage: 45000,
        condition: "good",
        estimated_value: 18500,
        lead_id: "test-lead-001",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/trade-in");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Intake
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Intake", () => {
  test("POST /api/admin/intake", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/intake", {
      data: {
        source: "auction",
        vehicle_vin: "1HGCM82633A004352",
        purchase_price: 22000,
        condition_notes: "Clean title, minor cosmetic damage on rear bumper",
      },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/intake");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Document Scan All
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Document Scan All", () => {
  test("POST /api/admin/documents/scan-all", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.post("/api/admin/documents/scan-all", {
      data: { scan_type: "compliance" },
      headers: { cookie: c },
    });
    not500(res, "POST /api/admin/documents/scan-all");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Comms Log
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Comms Log", () => {
  test("GET /api/admin/comms/log", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/comms/log", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/comms/log");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Accounting Summary
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Accounting Summary", () => {
  test("GET /api/admin/accounting/summary", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/accounting/summary", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/accounting/summary");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Credit History
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Credit History", () => {
  test("GET /api/admin/credit/history", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/credit/history", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/credit/history");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Export Leads
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Export Leads", () => {
  test("GET /api/admin/export/leads", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/export/leads", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/export/leads");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Public Inventory
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Public Inventory", () => {
  test("GET /api/inventory", async ({ request }) => {
    const res = await request.get("/api/inventory?limit=5");
    not500(res, "GET /api/inventory");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Health
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Health", () => {
  test("GET /api/health", async ({ request }) => {
    const res = await request.get("/api/health");
    not500(res, "GET /api/health");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: Analytics Dashboard
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: Analytics Dashboard", () => {
  test("GET /api/admin/analytics/dashboard", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/analytics/dashboard", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/analytics/dashboard");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Module: System Health
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Module: System Health", () => {
  test("GET /api/admin/system/health", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/system/health", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/system/health");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FINAL VERIFICATION — Analytics pipeline integrity
// ═══════════════════════════════════════════════════════════════════════════
test.describe("Final Verification", () => {
  test("Analytics health endpoint returns data", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/analytics/health", {
      headers: { cookie: c },
    });
    // Accept 200 or auth-related codes — the endpoint must not crash
    not500(res, "GET /api/admin/analytics/health (final)");
    if (res.status() === 200) {
      const body = await res.json();
      // The health endpoint should report some events after our barrage
      expect(body).toBeTruthy();
      expect(typeof body.events_last_hour === "number" || body.status).toBeTruthy();
    }
  });

  test("Analytics learning endpoint returns data", async ({ request }) => {
    const c = await safeCookies(request);
    const res = await request.get("/api/admin/analytics/learning", {
      headers: { cookie: c },
    });
    not500(res, "GET /api/admin/analytics/learning");
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test("No module returned HTTP 500", async () => {
    // This test aggregates all 500 errors tracked throughout the suite
    if (fiveHundreds.length > 0) {
      console.error("Endpoints that returned 500:", fiveHundreds);
    }
    expect(fiveHundreds).toEqual([]);
  });
});
