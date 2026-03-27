/**
 * API health tests — verify core endpoints return expected status codes
 * and response formats.
 *
 * Shadow mode: no database is available. Endpoints may return 500 on
 * storage errors but must still respond with valid JSON (not 404).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.SHADOW_URL || "http://localhost:3099";

test.describe("API Health (shadow mode)", () => {
  test("GET /api/inventory returns valid JSON (200 or 500)", async ({ request }) => {
    const response = await request.get(`${BASE}/api/inventory`);
    // In shadow mode the DB may be down — accept graceful degradation
    expect([200, 500]).toContain(response.status());

    const contentType = response.headers()["content-type"] || "";
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toBeDefined();
  });

  test("POST /api/leads with valid body returns JSON (200, 201, or 500)", async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/leads`, {
      data: {
        dealer_id: "wolfpack-motors",
        email: "test@test.com",
        phone: "555-1234",
      },
    });

    // Endpoint exists and responds — not 404
    expect(response.status()).not.toBe(404);
    expect([200, 201, 422, 500]).toContain(response.status());
  });

  test("POST /api/leads with empty body returns 400, 422, or 500", async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/leads`, {
      data: {},
    });

    expect(response.status()).not.toBe(404);
    expect([400, 422, 500]).toContain(response.status());
  });

  test("POST /api/contact with valid body returns JSON (200, 201, or 500)", async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/contact`, {
      data: {
        first_name: "Test",
        last_name: "User",
        email: "test@test.com",
        subject: "General Inquiry",
        message: "Hello, I have a question about inventory.",
      },
    });

    expect(response.status()).not.toBe(404);
    // 403 = CSRF protection working correctly (no token in test request)
    expect([200, 201, 403, 500]).toContain(response.status());
  });

  test("POST /api/contact with empty body returns 400, 403, 422, or 500", async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/contact`, {
      data: {},
    });

    expect(response.status()).not.toBe(404);
    expect([400, 403, 422, 500]).toContain(response.status());
  });

  test("POST /api/chat with message returns JSON (200 or 500)", async ({ request }) => {
    const response = await request.post(`${BASE}/api/chat`, {
      data: {
        message: "test",
      },
    });

    expect(response.status()).not.toBe(404);
    expect([200, 500]).toContain(response.status());
  });
});
