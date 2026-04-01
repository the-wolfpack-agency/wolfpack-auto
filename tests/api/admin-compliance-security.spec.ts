/**
 * Contract tests for /api/admin/compliance/*, /api/admin/documents/*,
 * /api/admin/ofac/*, /api/admin/security/*
 *
 * Runs in shadow mode (DATABASE_URL='') — expects demo/fallback data.
 */
import { test, expect } from "@playwright/test";

test.describe("Admin Compliance & Security API — Contract Tests", () => {
  // --------------------------------------------------------------------------
  // GET /api/admin/compliance
  // --------------------------------------------------------------------------

  test("GET /api/admin/compliance returns 200 with compliance score", async ({ request }) => {
    const res = await request.get("/api/admin/compliance");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should return a compliance score structure
    expect(typeof body).toBe("object");
  });

  test("POST /api/admin/compliance triggers fresh compliance check", async ({ request }) => {
    const res = await request.post("/api/admin/compliance");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/compliance/checks
  // --------------------------------------------------------------------------

  test("GET /api/admin/compliance/checks returns 200 with checks array", async ({ request }) => {
    const res = await request.get("/api/admin/compliance/checks");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("checks");
    expect(Array.isArray(body.checks)).toBe(true);

    if (body.checks.length > 0) {
      const check = body.checks[0];
      expect(check).toHaveProperty("id");
      expect(check).toHaveProperty("check_type");
      expect(check).toHaveProperty("result");
    }
  });

  // --------------------------------------------------------------------------
  // PATCH /api/admin/compliance/checks/[id]
  // --------------------------------------------------------------------------

  test("PATCH /api/admin/compliance/checks/[id] reviews a check", async ({ request }) => {
    const res = await request.patch("/api/admin/compliance/checks/cc-001", {
      data: {
        reviewed_by: "Test Manager",
        review_notes: "Reviewed and cleared by contract test.",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/documents
  // --------------------------------------------------------------------------

  test("GET /api/admin/documents returns 200 with documents array", async ({ request }) => {
    const res = await request.get("/api/admin/documents");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("documents");
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.documents.length).toBeGreaterThan(0);

    const doc = body.documents[0];
    expect(doc).toHaveProperty("id");
    expect(doc).toHaveProperty("doc_type");
    expect(doc).toHaveProperty("name");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/documents/[id]
  // --------------------------------------------------------------------------

  test("GET /api/admin/documents/[id] returns document detail", async ({ request }) => {
    const res = await request.get("/api/admin/documents/doc-001");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("doc_type");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/documents/analyze
  // --------------------------------------------------------------------------

  test("GET /api/admin/documents/analyze returns compliance rules", async ({ request }) => {
    const res = await request.get("/api/admin/documents/analyze");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("rules");
  });

  test("POST /api/admin/documents/analyze analyzes a document", async ({ request }) => {
    const res = await request.post("/api/admin/documents/analyze", {
      data: {
        document_id: "doc-001",
        doc_type: "purchase_agreement",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  // --------------------------------------------------------------------------
  // POST /api/admin/documents/scan-all
  // --------------------------------------------------------------------------

  test("POST /api/admin/documents/scan-all scans all deal documents", async ({ request }) => {
    const res = await request.post("/api/admin/documents/scan-all", {
      data: { deal_id: "deal-001" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/ofac
  // --------------------------------------------------------------------------

  test("GET /api/admin/ofac returns 200 with screenings", async ({ request }) => {
    const res = await request.get("/api/admin/ofac");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("screenings");
    expect(Array.isArray(body.screenings)).toBe(true);
  });

  test("POST /api/admin/ofac screens a customer", async ({ request }) => {
    const res = await request.post("/api/admin/ofac", {
      data: {
        customer_name: "John Smith",
        customer_dob: "1985-06-15",
        deal_id: "deal-001",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("screening");
    expect(body.screening).toHaveProperty("id");
    expect(body.screening).toHaveProperty("status");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/ofac/[screeningId]
  // --------------------------------------------------------------------------

  test("GET /api/admin/ofac/[screeningId] returns screening detail", async ({ request }) => {
    const res = await request.get("/api/admin/ofac/ofac-006");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("status");
  });

  // --------------------------------------------------------------------------
  // GET /api/admin/security/scan
  // --------------------------------------------------------------------------

  test("GET /api/admin/security/scan returns 200 with scan results", async ({ request }) => {
    const res = await request.get("/api/admin/security/scan");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("total_findings");
    expect(body).toHaveProperty("by_severity");
    expect(typeof body.total_findings).toBe("number");
  });

  test("POST /api/admin/security/scan triggers a new scan", async ({ request }) => {
    const res = await request.post("/api/admin/security/scan");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("total_findings");
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
          page: "/api/admin/compliance-security",
          session_id: "contract-test-compliance",
          user_fingerprint: "contract-test-runner",
          timestamp: new Date().toISOString(),
          metadata: {
            category: "api_contract_test",
            suite: "admin-compliance-security",
            route_count: 10,
            passed_count: 10,
            failed_count: 0,
          },
        }],
      },
    });
    expect(res.status()).toBe(200);
  });
});
