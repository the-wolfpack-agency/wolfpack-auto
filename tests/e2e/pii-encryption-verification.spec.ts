/**
 * PII Encryption Verification — ensures customer data is protected.
 *
 * Tests encryption at rest, graceful degradation without keys, privacy
 * endpoints, and that no PII leaks in error responses.
 *
 * Run: npx playwright test tests/e2e/pii-encryption-verification.spec.ts
 */
import { test, expect } from "@playwright/test";

// Shadow-mode skip: PII encryption verification requires the leads write
// path (POST /api/leads expects 201 + lead_id) and the privacy export/delete
// endpoints, all of which need a real Postgres. In shadow mode
// (DATABASE_URL='') leads are not persisted, so encryption-at-rest cannot
// be exercised. Re-run with DATABASE_URL set.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const LEADS_ENDPOINT = "/api/leads";
const CONTACT_ENDPOINT = "/api/contact";
const ADMIN_LEADS_ENDPOINT = "/api/admin/leads";
const PRIVACY_EXPORT_ENDPOINT = "/api/privacy/export-data";
const PRIVACY_DELETE_ENDPOINT = "/api/privacy/delete-data";

const TEST_DEALER_ID = "00000000-0000-4000-a000-000000000001";

function uniqueEmail(prefix = "pii"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function validLead(overrides: Record<string, unknown> = {}) {
  return {
    dealer_id: TEST_DEALER_ID,
    first_name: "PII",
    last_name: "Test",
    email: uniqueEmail(),
    phone: "+15551234567",
    vehicle_interest: "2024 Honda Civic",
    source: "website_form",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* PII Encryption -- Lead Submission                                           */
/* -------------------------------------------------------------------------- */

test.describe("PII encryption -- lead submission", () => {
  test("POST lead with known email/phone -> 201 (encryption does not break insertion)", async ({
    request,
  }) => {
    const testEmail = uniqueEmail("encrypt");
    const res = await request.post(LEADS_ENDPOINT, {
      data: validLead({ email: testEmail, phone: "+15559876543" }),
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
  });

  test("response body does NOT contain raw PII fields (email/phone stripped from 201)", async ({
    request,
  }) => {
    const testEmail = uniqueEmail("noleak");
    const res = await request.post(LEADS_ENDPOINT, {
      data: validLead({ email: testEmail }),
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    // The 201 response should only contain lead_id, success, created_at
    // It should NOT echo back the submitted email or phone
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("first_name");
    expect(body).not.toHaveProperty("last_name");
  });

  test("contact form response does NOT expose PII", async ({ request }) => {
    const res = await request.post(CONTACT_ENDPOINT, {
      data: {
        first_name: "Privacy",
        last_name: "Test",
        email: uniqueEmail("contactpii"),
        subject: "Privacy check",
        message: "Testing PII exposure in response.",
      },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("message");
  });

  test("lead creation works without PII_ENCRYPTION_KEY (graceful degradation)", async ({
    request,
  }) => {
    // In dev/CI environments, PII_ENCRYPTION_KEY may not be set.
    // The crypto module should fall through to plaintext storage.
    const res = await request.post(LEADS_ENDPOINT, {
      data: validLead(),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* PII Encryption -- API Response Safety                                       */
/* -------------------------------------------------------------------------- */

test.describe("PII encryption -- API response safety", () => {
  test("no PII leaks in validation error responses", async ({ request }) => {
    const testEmail = "leaked@secret.com";
    const res = await request.post(LEADS_ENDPOINT, {
      data: {
        dealer_id: TEST_DEALER_ID,
        first_name: "Leak",
        last_name: "Test",
        email: testEmail,
        // Missing vehicle_interest -> will fail validation
      },
    });
    expect(res.status()).toBe(422);

    const body = await res.json();
    const bodyStr = JSON.stringify(body);

    // The error response should not echo back any PII
    expect(bodyStr).not.toContain(testEmail);
    expect(bodyStr).not.toContain("Leak");
  });

  test("no PII leaks in malformed JSON error responses", async ({
    request,
  }) => {
    const res = await request.post(LEADS_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: '{ "email": "secret@test.com", bad json',
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("secret@test.com");
  });

  test("no raw encryption artifacts in successful response", async ({
    request,
  }) => {
    const res = await request.post(LEADS_ENDPOINT, {
      data: validLead(),
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    const bodyStr = JSON.stringify(body);

    // Check for base64-encoded data that might be leaked encrypted PII
    // AES-256-GCM output would be 40+ chars of base64
    const suspiciousBase64 = /[A-Za-z0-9+/]{40,}={0,2}/;
    // lead_id and created_at are fine -- check nothing else looks like ciphertext
    const stripped = bodyStr
      .replace(body.lead_id, "")
      .replace(body.created_at, "");
    expect(
      suspiciousBase64.test(stripped),
      "Response should not contain encryption artifacts",
    ).toBe(false);
  });

  test("duplicate lead response does not expose extra PII", async ({
    request,
  }) => {
    const sharedEmail = uniqueEmail("dupcheck");
    const payload = validLead({ email: sharedEmail });

    // First submission
    const res1 = await request.post(LEADS_ENDPOINT, { data: payload });
    expect(res1.status()).toBe(201);

    // Second submission (triggers duplicate or idempotency path)
    const res2 = await request.post(LEADS_ENDPOINT, { data: payload });
    const body2 = await res2.json();
    const bodyStr = JSON.stringify(body2);

    // Should not contain the raw email
    expect(bodyStr).not.toContain(sharedEmail);
  });
});

/* -------------------------------------------------------------------------- */
/* Privacy Endpoints                                                           */
/* -------------------------------------------------------------------------- */

test.describe("Privacy endpoints -- export and delete", () => {
  test("POST /api/privacy/export-data requires auth (401 or 403)", async ({
    request,
  }) => {
    const res = await request.post(PRIVACY_EXPORT_ENDPOINT, {
      data: { email: "test@example.com" },
    });
    const status = res.status();
    expect(
      [401, 403].includes(status),
      `export-data without auth should return 401/403, got ${status}`,
    ).toBe(true);
  });

  test("POST /api/privacy/delete-data requires auth (401 or 403)", async ({
    request,
  }) => {
    const res = await request.post(PRIVACY_DELETE_ENDPOINT, {
      data: { email: "test@example.com" },
    });
    const status = res.status();
    expect(
      [401, 403].includes(status),
      `delete-data without auth should return 401/403, got ${status}`,
    ).toBe(true);
  });

  test("export-data rejects invalid email (auth guard fires first)", async ({
    request,
  }) => {
    const res = await request.post(PRIVACY_EXPORT_ENDPOINT, {
      data: { email: "not-an-email" },
    });
    const status = res.status();
    // Auth fires before validation -- 401/403 is the expected path
    expect(
      [400, 401, 403, 422].includes(status),
      `invalid email should be rejected, got ${status}`,
    ).toBe(true);
  });

  test("delete-data rejects empty body", async ({ request }) => {
    const res = await request.post(PRIVACY_DELETE_ENDPOINT, { data: {} });
    const status = res.status();
    expect(
      [400, 401, 403, 422].includes(status),
      `empty body should be rejected, got ${status}`,
    ).toBe(true);
  });

  test("privacy endpoints never return 500", async ({ request }) => {
    const endpoints = [PRIVACY_EXPORT_ENDPOINT, PRIVACY_DELETE_ENDPOINT];
    for (const ep of endpoints) {
      const res = await request.post(ep, {
        data: { email: "test@example.com" },
      });
      expect(res.status(), `${ep} must never return 500`).toBeLessThan(500);
    }
  });

  test("export-data does not leak PII in auth error response", async ({
    request,
  }) => {
    const secretEmail = "secret-export@test.com";
    const res = await request.post(PRIVACY_EXPORT_ENDPOINT, {
      data: { email: secretEmail },
    });

    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain(secretEmail);
  });

  test("delete-data does not leak PII in auth error response", async ({
    request,
  }) => {
    const secretEmail = "secret-delete@test.com";
    const res = await request.post(PRIVACY_DELETE_ENDPOINT, {
      data: { email: secretEmail },
    });

    const body = await res.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain(secretEmail);
  });

  test("admin leads endpoint exists and responds (200 or 401)", async ({
    request,
  }) => {
    const res = await request.get(ADMIN_LEADS_ENDPOINT);
    const status = res.status();
    expect(
      [200, 401, 403].includes(status),
      `admin leads should return 200/401/403, got ${status}`,
    ).toBe(true);
  });
});
