/**
 * document-vault.spec.ts
 *
 * E2E tests for the Document Vault module.
 * Covers: document listing, filtering by doc_type, creation,
 *         signing (PATCH), deletion, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/document-vault.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/documents — list documents
// ---------------------------------------------------------------------------

test.describe("Documents API — GET /api/admin/documents", () => {
  test("returns documents array with name, doc_type, signed", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/documents");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("documents");
      expect(Array.isArray(body.documents)).toBe(true);

      if (body.documents.length > 0) {
        const doc = body.documents[0];
        expect(doc).toHaveProperty("name");
        expect(doc).toHaveProperty("doc_type");
        expect(doc).toHaveProperty("signed");
        expect(typeof doc.signed).toBe("boolean");
      }
    }
  });

  test("documents have id field", async ({ request }) => {
    const resp = await request.get("/api/admin/documents");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      if (body.documents.length > 0) {
        expect(body.documents[0]).toHaveProperty("id");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/documents");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/documents?doc_type=purchase_agreement — filter
// ---------------------------------------------------------------------------

test.describe("Documents API — GET with doc_type filter", () => {
  test("?doc_type=purchase_agreement returns only purchase agreements", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/admin/documents?doc_type=purchase_agreement",
    );
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("documents");
      expect(Array.isArray(body.documents)).toBe(true);

      for (const doc of body.documents) {
        expect(doc.doc_type).toBe("purchase_agreement");
      }
    }
  });

  test("unknown doc_type returns empty array, not 500", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/admin/documents?doc_type=nonexistent_type_xyz",
    );
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("documents");
      expect(body.documents.length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/documents — create document
// ---------------------------------------------------------------------------

test.describe("Documents API — POST /api/admin/documents", () => {
  test("creates document and returns it (or 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/documents", {
      data: {
        name: "E2E Test Purchase Agreement",
        doc_type: "purchase_agreement",
        deal_id: "deal-001",
        content_url: "https://storage.example.com/docs/e2e-test.pdf",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("document");
      expect(body.document.name).toBe("E2E Test Purchase Agreement");
      expect(body.document.doc_type).toBe("purchase_agreement");
      expect(body.document.signed).toBe(false);
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("missing name returns 400/422, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/documents", {
      data: { doc_type: "purchase_agreement" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: PATCH /api/admin/documents/[docId] — mark as signed
// ---------------------------------------------------------------------------

test.describe("Documents API — PATCH /api/admin/documents/:id", () => {
  test("marks document as signed (or 401/404)", async ({ request }) => {
    const resp = await request.patch("/api/admin/documents/doc-001", {
      data: {
        signed: true,
        signed_at: new Date().toISOString(),
        signer_name: "E2E Test Signer",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("document");
      expect(body.document.signed).toBe(true);
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });

  test("PATCH non-existent doc returns 404, not 500", async ({ request }) => {
    const resp = await request.patch(
      "/api/admin/documents/nonexistent-doc-xyz",
      {
        data: { signed: true },
      },
    );
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: DELETE /api/admin/documents/[docId] — delete document
// ---------------------------------------------------------------------------

test.describe("Documents API — DELETE /api/admin/documents/:id", () => {
  test("deletes document and returns success (or 401/404)", async ({
    request,
  }) => {
    const resp = await request.delete("/api/admin/documents/doc-e2e-delete");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("deleted", true);
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });

  test("DELETE non-existent doc returns 404, not 500", async ({ request }) => {
    const resp = await request.delete(
      "/api/admin/documents/nonexistent-doc-xyz",
    );
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Document Vault pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Documents page loads", async ({ page }) => {
    await page.goto("/admin/documents", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
