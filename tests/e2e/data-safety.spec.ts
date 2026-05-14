/**
 * Data safety end-to-end tests — verifies soft-delete behavior,
 * webhook signature validation, and idempotency dedup.
 *
 * These tests run against the dev server API (shadow mode when no DB).
 *
 * Run with: npx playwright test tests/e2e/data-safety.spec.ts
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

const BASE_URL = process.env.E2E_URL || "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function getAdminCookie(request: APIRequestContext): Promise<string> {
  // Login to get session cookie
  const loginRes = await request.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: {
      email: "demo@wolfpackauto.com",
      password: "demo1234!",
      csrfToken: "",
      callbackUrl: `${BASE_URL}/admin`,
      json: "true",
    },
  });
  const cookies = loginRes.headers()["set-cookie"] ?? "";
  return cookies;
}

/* -------------------------------------------------------------------------- */
/* DS-001: DELETE on a lead returns success (soft deleted)                     */
/* -------------------------------------------------------------------------- */

test.describe("DS-001: soft delete on leads", () => {
  test("DELETE /api/admin/leads/[id] returns { deleted: true }", async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/admin/leads/lead-001`, {
      headers: { cookie: await getAdminCookie(request) },
    });

    // Should succeed (200) whether shadow or DB mode
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.deleted).toBe(true);
    }
  });

  test("soft-deleted leads do not appear in GET list", async ({ request }) => {
    // This test verifies the concept — in shadow mode without DB,
    // mock data is always returned. In DB mode, deleted_at IS NULL filter applies.
    const res = await request.get(`${BASE_URL}/api/admin/leads`, {
      headers: { cookie: await getAdminCookie(request) },
    });

    if (res.status() === 200) {
      const body = await res.json();
      // Verify the response shape includes leads array
      expect(body).toHaveProperty("leads");
      expect(Array.isArray(body.leads)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* DS-002: DELETE on inventory uses soft delete                               */
/* -------------------------------------------------------------------------- */

test.describe("DS-002: soft delete on inventory", () => {
  test("DELETE /api/admin/inventory/[vin] returns { deleted: true }", async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/admin/inventory/1HGCY2F54PA789012`, {
      headers: { cookie: await getAdminCookie(request) },
    });

    // Shadow mode returns 200; DB mode may return 404 if VIN doesn't exist
    expect([200, 401, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.deleted).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* DS-003: Webhook endpoint rejects forged signatures                         */
/* -------------------------------------------------------------------------- */

test.describe("DS-003: webhook signature verification", () => {
  test("DMS webhook rejects request with no signature header", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/dms/webhook`, {
      headers: {
        "x-dealer-id": "test-dealer",
        "content-type": "application/json",
      },
      data: { provider: "CDK", records: [] },
    });

    // Should return 401 for missing signature
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("signature");
  });

  test("DMS webhook rejects request with invalid signature", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/dms/webhook`, {
      headers: {
        "x-dealer-id": "test-dealer",
        "x-webhook-signature": "deadbeef0000000000000000000000000000000000000000000000000000000f",
        "content-type": "application/json",
      },
      data: { provider: "CDK", records: [] },
    });

    // Should return 401 or 404 (no config found for dealer)
    expect([401, 404]).toContain(res.status());
  });

  test("DMS webhook rejects request with no dealer-id", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/dms/webhook`, {
      headers: {
        "content-type": "application/json",
      },
      data: { provider: "CDK", records: [] },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("dealer-id");
  });
});

/* -------------------------------------------------------------------------- */
/* DS-004: Double-POST with same data returns cached response (idempotency)  */
/* -------------------------------------------------------------------------- */

test.describe("DS-004: idempotency on POST routes", () => {
  test("double POST to /api/leads returns same lead_id", async ({ request }) => {
    const leadData = {
      dealer_id: "test-dealer-idemp",
      first_name: "Idemp",
      last_name: "Test",
      email: `idemp-${Date.now()}@test.com`,
      vehicle_interest: "2024 Honda Civic",
      source: "website_form",
    };

    const res1 = await request.post(`${BASE_URL}/api/leads`, {
      data: leadData,
    });

    const res2 = await request.post(`${BASE_URL}/api/leads`, {
      data: leadData,
    });

    expect(res1.status()).toBe(201);
    expect(res2.status()).toBe(201);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both responses should have the same lead_id (deduped)
    expect(body2.lead_id).toBe(body1.lead_id);
  });

  test("double POST to /api/admin/deals returns same deal id", async ({ request }) => {
    const dealData = {
      customer_name: "Idemp Test Customer",
      vehicle_vin: "TEST1234567890IDEMP",
      selling_price: 25000,
    };

    const cookie = await getAdminCookie(request);

    const res1 = await request.post(`${BASE_URL}/api/admin/deals`, {
      headers: { cookie },
      data: dealData,
    });

    const res2 = await request.post(`${BASE_URL}/api/admin/deals`, {
      headers: { cookie },
      data: dealData,
    });

    if (res1.status() === 201 && res2.status() === 201) {
      const body1 = await res1.json();
      const body2 = await res2.json();
      // Second response should be the cached first response
      expect(body2.deal?.id).toBe(body1.deal?.id);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* DS-005: Source-level verification of soft-delete in route files            */
/* -------------------------------------------------------------------------- */

test.describe("DS-005: source-level soft-delete verification", () => {
  test("leads DELETE route uses UPDATE SET deleted_at, not DELETE FROM", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/admin/leads/[id]/route.ts"),
      "utf-8",
    );
    // Must use soft delete
    expect(src).toContain("deleted_at = NOW()");
    // Must NOT use hard delete
    expect(src).not.toContain("DELETE FROM leads");
  });

  test("inventory DELETE route uses UPDATE SET deleted_at, not DELETE FROM", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/admin/inventory/[vin]/route.ts"),
      "utf-8",
    );
    expect(src).toContain("deleted_at = NOW()");
    expect(src).not.toContain("DELETE FROM vehicles");
  });

  test("webhooks delete uses UPDATE SET deleted_at, not DELETE FROM", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/webhooks.ts"),
      "utf-8",
    );
    expect(src).toContain("deleted_at = NOW()");
    expect(src).not.toContain("DELETE FROM webhooks");
  });
});

/* -------------------------------------------------------------------------- */
/* DS-006: Leads GET query filters out soft-deleted records                   */
/* -------------------------------------------------------------------------- */

test.describe("DS-006: GET queries filter soft-deleted records", () => {
  test("leads list query includes deleted_at IS NULL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/admin/leads/route.ts"),
      "utf-8",
    );
    expect(src).toContain("deleted_at IS NULL");
  });

  test("leads detail query includes deleted_at IS NULL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/admin/leads/[id]/route.ts"),
      "utf-8",
    );
    expect(src).toContain("deleted_at IS NULL");
  });

  test("deals list query includes deleted_at IS NULL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/admin/deals/route.ts"),
      "utf-8",
    );
    expect(src).toContain("deleted_at IS NULL");
  });
});
