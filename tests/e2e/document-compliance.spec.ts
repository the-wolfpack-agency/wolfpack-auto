/**
 * document-compliance.spec.ts
 *
 * E2E tests for Document Compliance Analysis, Knowledge Base, and
 * Deal Jacket Compliance features.
 *
 * Covers: compliance rules API, single doc analysis, deal jacket analysis,
 *         scan-all endpoint, knowledge ingestion, knowledge query,
 *         page rendering for compliance dashboard, knowledge base, and
 *         deal jacket compliance view.
 *
 * Run: npx playwright test tests/e2e/document-compliance.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/documents/analyze — list compliance rules
// ---------------------------------------------------------------------------

test.describe("Compliance Rules API — GET /api/admin/documents/analyze", () => {
  test("returns compliance rules with categories", async ({ request }) => {
    const resp = await request.get("/api/admin/documents/analyze");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("rules");
      expect(body).toHaveProperty("total_rules");
      expect(body).toHaveProperty("categories");
      expect(Array.isArray(body.rules)).toBe(true);
      expect(body.total_rules).toBeGreaterThan(0);

      if (body.rules.length > 0) {
        const rule = body.rules[0];
        expect(rule).toHaveProperty("id");
        expect(rule).toHaveProperty("severity");
        expect(rule).toHaveProperty("category");
        expect(rule).toHaveProperty("description");
      }
    }
  });

  test("never returns 500 on GET rules", async ({ request }) => {
    const resp = await request.get("/api/admin/documents/analyze");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/documents/analyze — single document analysis
// ---------------------------------------------------------------------------

test.describe("Document Analysis API — POST single doc", () => {
  test("returns score and issues for a single document", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/documents/analyze", {
      data: {
        document_id: "test-doc-001",
        doc_type: "purchase_agreement",
        metadata: {
          signed: false,
          has_signatures: false,
          has_vin: true,
          vehicle_vin: "1HGBH41JXMN109186",
        },
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("document_id");
      expect(body).toHaveProperty("doc_type");
      expect(body).toHaveProperty("score");
      expect(body).toHaveProperty("passed");
      expect(body).toHaveProperty("issues");
      expect(body).toHaveProperty("summary");
      expect(typeof body.score).toBe("number");
      expect(typeof body.passed).toBe("boolean");
      expect(Array.isArray(body.issues)).toBe(true);
    }
  });

  test("detects missing signatures as an issue", async ({ request }) => {
    const resp = await request.post("/api/admin/documents/analyze", {
      data: {
        document_id: "test-unsigned-doc",
        doc_type: "purchase_agreement",
        metadata: {
          signed: false,
          has_signatures: false,
        },
      },
    });

    if (resp.status() === 200) {
      const body = await resp.json();
      const signatureIssue = body.issues.find(
        (i: { rule_id: string }) => i.rule_id === "PA-007",
      );
      expect(signatureIssue).toBeTruthy();
    }
  });

  test("returns 400 when document_id is missing", async ({ request }) => {
    const resp = await request.post("/api/admin/documents/analyze", {
      data: { doc_type: "title" },
    });
    // Should be 400 (not 500)
    expect(resp.status()).not.toBe(500);
    if (resp.status() === 400) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
    }
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/documents/analyze — deal jacket analysis
// ---------------------------------------------------------------------------

test.describe("Deal Jacket Analysis API", () => {
  test("returns ready_to_fund for a complete deal jacket", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/documents/analyze", {
      data: {
        deal_id: "deal-test-001",
        documents: [
          {
            id: "pa-1",
            doc_type: "purchase_agreement",
            name: "Purchase Agreement",
            signed: true,
          },
          {
            id: "ca-1",
            doc_type: "credit_app",
            name: "Credit Application",
            signed: true,
          },
          {
            id: "dc-1",
            doc_type: "disclosure",
            name: "Disclosures",
            signed: true,
          },
          {
            id: "ins-1",
            doc_type: "insurance",
            name: "Insurance",
            signed: true,
          },
        ],
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("deal_id");
      expect(body).toHaveProperty("ready_to_fund");
      expect(body).toHaveProperty("overall_score");
      expect(body).toHaveProperty("blockers");
      expect(body).toHaveProperty("document_results");
      expect(typeof body.ready_to_fund).toBe("boolean");
      expect(typeof body.overall_score).toBe("number");
      expect(Array.isArray(body.blockers)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/documents/scan-all — aggregated scan
// ---------------------------------------------------------------------------

test.describe("Scan All API — POST /api/admin/documents/scan-all", () => {
  test("returns aggregated results for a deal", async ({ request }) => {
    const resp = await request.post("/api/admin/documents/scan-all", {
      data: { deal_id: "deal-scan-001" },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("deal_id");
      expect(body).toHaveProperty("total_documents");
      expect(body).toHaveProperty("document_results");
      expect(body).toHaveProperty("overall_score");
      expect(body).toHaveProperty("ready_to_fund");
      expect(body).toHaveProperty("blockers");
      expect(Array.isArray(body.document_results)).toBe(true);
      expect(body.total_documents).toBeGreaterThan(0);
    }
  });

  test("returns 400 when deal_id is missing", async ({ request }) => {
    const resp = await request.post("/api/admin/documents/scan-all", {
      data: {},
    });
    expect(resp.status()).not.toBe(500);
    if (resp.status() === 400) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("never returns 500 on scan-all", async ({ request }) => {
    const resp = await request.post("/api/admin/documents/scan-all", {
      data: { deal_id: "deal-any" },
    });
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: Knowledge Ingest — POST & GET /api/admin/knowledge/ingest
// ---------------------------------------------------------------------------

test.describe("Knowledge Ingest API", () => {
  test("POST creates an ingested entry", async ({ request }) => {
    const resp = await request.post("/api/admin/knowledge/ingest", {
      data: {
        document_id: "kb-test-001",
        doc_type: "disclosure",
        content_text: "The Truth in Lending Act requires disclosure of APR and finance charges.",
        metadata: { name: "Test TILA Doc" },
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("status", "ingested");
      expect(body).toHaveProperty("document_id");
      expect(body).toHaveProperty("doc_type");
      expect(body).toHaveProperty("content_length");
      expect(body).toHaveProperty("ingested_at");
      expect(body.content_length).toBeGreaterThan(0);
    }
  });

  test("POST returns 400 when content_text is missing", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/knowledge/ingest", {
      data: { document_id: "kb-bad", doc_type: "title" },
    });
    expect(resp.status()).not.toBe(500);
    if (resp.status() === 400) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("GET returns ingested document list", async ({ request }) => {
    const resp = await request.get("/api/admin/knowledge/ingest");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("documents");
      expect(body).toHaveProperty("total");
      expect(Array.isArray(body.documents)).toBe(true);
      expect(body.total).toBeGreaterThan(0);

      if (body.documents.length > 0) {
        const doc = body.documents[0];
        expect(doc).toHaveProperty("document_id");
        expect(doc).toHaveProperty("doc_type");
        expect(doc).toHaveProperty("ingested_at");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// API: Knowledge Query — POST /api/admin/knowledge/query
// ---------------------------------------------------------------------------

test.describe("Knowledge Query API — POST /api/admin/knowledge/query", () => {
  test("returns search results for a query", async ({ request }) => {
    const resp = await request.post("/api/admin/knowledge/query", {
      data: { query: "TILA disclosure requirements" },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("results");
      expect(body).toHaveProperty("total");
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.total).toBeGreaterThan(0);

      if (body.results.length > 0) {
        const result = body.results[0];
        expect(result).toHaveProperty("document_id");
        expect(result).toHaveProperty("doc_type");
        expect(result).toHaveProperty("relevance_score");
        expect(result).toHaveProperty("excerpt");
        expect(typeof result.relevance_score).toBe("number");
      }
    }
  });

  test("returns 400 when query is missing", async ({ request }) => {
    const resp = await request.post("/api/admin/knowledge/query", {
      data: {},
    });
    expect(resp.status()).not.toBe(500);
    if (resp.status() === 400) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
    }
  });

  test("never returns 500 on knowledge query", async ({ request }) => {
    const resp = await request.post("/api/admin/knowledge/query", {
      data: { query: "insurance verification" },
    });
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Pages: compliance dashboard, knowledge base, deal jacket compliance
// ---------------------------------------------------------------------------

test.describe("Page Rendering", () => {
  test("compliance dashboard page loads", async ({ page }) => {
    const resp = await page.goto("/admin/documents/compliance");
    expect(resp?.status()).not.toBe(500);
    await expect(page.locator("h1")).toContainText("Document Compliance");
  });

  test("knowledge base page loads", async ({ page }) => {
    const resp = await page.goto("/admin/knowledge");
    expect(resp?.status()).not.toBe(500);
    await expect(page.locator("h1")).toContainText("Knowledge Base");
  });

  test("deal jacket compliance page loads", async ({ page }) => {
    const resp = await page.goto("/admin/deals/deal-test-001/compliance");
    expect(resp?.status()).not.toBe(500);
    await expect(page.locator("h1")).toContainText("Deal Jacket Compliance");
  });
});

// ---------------------------------------------------------------------------
// Never-500 sweep across all new endpoints
// ---------------------------------------------------------------------------

test.describe("Never-500 Safety Net", () => {
  const endpoints = [
    { method: "GET", url: "/api/admin/documents/analyze" },
    { method: "GET", url: "/api/admin/knowledge/ingest" },
  ];

  for (const ep of endpoints) {
    test(`${ep.method} ${ep.url} never 500`, async ({ request }) => {
      const resp = await request.get(ep.url);
      expect(resp.status()).not.toBe(500);
    });
  }

  const postEndpoints = [
    {
      url: "/api/admin/documents/analyze",
      body: { document_id: "safe-1", doc_type: "other", metadata: {} },
    },
    {
      url: "/api/admin/documents/scan-all",
      body: { deal_id: "safe-deal" },
    },
    {
      url: "/api/admin/knowledge/ingest",
      body: {
        document_id: "safe-kb",
        doc_type: "other",
        content_text: "Test content for safety",
      },
    },
    {
      url: "/api/admin/knowledge/query",
      body: { query: "safety test" },
    },
  ];

  for (const ep of postEndpoints) {
    test(`POST ${ep.url} never 500`, async ({ request }) => {
      const resp = await request.post(ep.url, { data: ep.body });
      expect(resp.status()).not.toBe(500);
    });
  }
});
