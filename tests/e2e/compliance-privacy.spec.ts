import { test, expect } from "@playwright/test";

/**
 * compliance-privacy.spec.ts
 *
 * E2E tests for CCPA privacy compliance:
 *   - POST /api/privacy/delete-data — data deletion requests
 *   - POST /api/privacy/export-data — data export requests
 *   - GET  /admin/privacy            — privacy admin page
 *
 * Design rules:
 *   - HTTP 500 is NEVER acceptable.
 *   - Auth-gated routes return 401 for unauthenticated requests.
 *   - Shadow mode (no DB) returns mock confirmation data.
 */

// ---------------------------------------------------------------------------
// POST /api/privacy/delete-data
// ---------------------------------------------------------------------------

test.describe("CCPA: POST /api/privacy/delete-data", () => {
  test("Valid email returns deletion confirmation or 401 (auth required), never 500", async ({
    request,
  }) => {
    const resp = await request.post("/api/privacy/delete-data", {
      data: { email: "customer@example.com" },
    });

    expect(resp.status()).not.toBe(500);
    // Auth-gated: 401 in production, 200 with deletion data in demo/shadow mode
    expect([200, 401, 403]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.deletion).toBeDefined();
      const deletion = body.deletion as Record<string, unknown>;
      expect(typeof deletion.id).toBe("string");
      expect(deletion.status).toBe("completed");
      expect(Array.isArray(deletion.data_categories_deleted)).toBe(true);
    }
  });

  test("Missing email returns 400 or 401, never 500", async ({ request }) => {
    const resp = await request.post("/api/privacy/delete-data", {
      data: {},
    });

    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });

  test("Invalid email format returns 400 or 422, never 500", async ({
    request,
  }) => {
    const resp = await request.post("/api/privacy/delete-data", {
      data: { email: "not-an-email" },
    });

    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });

  test("Empty body returns 400 or 401, never 500", async ({ request }) => {
    const resp = await request.post("/api/privacy/delete-data", {
      headers: { "Content-Type": "application/json" },
      data: "{}",
    });

    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });

  test("Response never contains raw customer PII in deletion confirmation", async ({
    request,
  }) => {
    const testEmail = "sensitive-customer@example.com";
    const resp = await request.post("/api/privacy/delete-data", {
      data: { email: testEmail },
    });

    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const text = await resp.text();
      // The response should NOT echo back the customer email in the deletion record
      // (the route hashes it for audit logging)
      expect(text).not.toContain(testEmail);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/privacy/export-data
// ---------------------------------------------------------------------------

test.describe("CCPA: POST /api/privacy/export-data", () => {
  test("Valid email returns customer data export or 401, never 500", async ({
    request,
  }) => {
    const resp = await request.post("/api/privacy/export-data", {
      data: { email: "customer@example.com" },
    });

    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.export).toBeDefined();
      const exportData = body.export as Record<string, unknown>;
      expect(typeof exportData.exported_at).toBe("string");
    }
  });

  test("Missing email returns 400 or 401, never 500", async ({ request }) => {
    const resp = await request.post("/api/privacy/export-data", {
      data: {},
    });

    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("Invalid email returns 400 or 401, never 500", async ({ request }) => {
    const resp = await request.post("/api/privacy/export-data", {
      data: { email: "bad" },
    });

    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// GET /admin/privacy — Admin page
// ---------------------------------------------------------------------------

test.describe("CCPA: Privacy admin page", () => {
  test("GET /admin/privacy loads or redirects to login, never 500", async ({
    request,
  }) => {
    const resp = await request.get("/admin/privacy");

    expect(resp.status()).not.toBe(500);
    // Page loads (200), or redirects to login (302/307), or auth required
    expect([200, 302, 307, 401, 403]).toContain(resp.status());

    if (resp.status() === 200) {
      const text = await resp.text();
      // Page should contain privacy-related content
      expect(
        text.includes("Privacy") ||
          text.includes("privacy") ||
          text.includes("CCPA") ||
          text.includes("ccpa"),
      ).toBe(true);
    }
  });
});
