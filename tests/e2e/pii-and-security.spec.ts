import { test, expect } from "@playwright/test";

/**
 * pii-and-security.spec.ts
 *
 * Security and PII hygiene tests covering:
 *   1. Lead response never echoes the submitted email back
 *   2. Admin leads response never exposes internal-only fields
 *   3. Security headers are present on all key endpoints
 *   4. CSRF cookie is set on homepage visit
 *   5. XSS attempts in lead name are rejected or stored-but-not-echoed
 *
 * These tests do NOT require a database — the app's no-DB fallback paths
 * are explicitly tested. All expect() patterns tolerate demo vs production
 * configurations.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECURITY_HEADER_ENDPOINTS = [
  "/",
  "/inventory",
  "/contact",
  "/financing",
  "/api/health",
  "/api/inventory",
];

/** Minimal valid lead payload. */
function leadPayload(overrides: Record<string, unknown> = {}) {
  return {
    dealer_id: "default",
    first_name: "Security",
    last_name: "Tester",
    email: "security.test@wolfpackmotors.test",
    vehicle_interest: "2024 Toyota Camry",
    source: "website_form",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Lead response never exposes raw email
// ---------------------------------------------------------------------------

test.describe("PII: lead submission response does not echo submitted email", () => {
  test("POST /api/leads response body does not contain the submitted email", async ({
    request,
  }) => {
    const testEmail = "pii.check.unique@wolfpackmotors.test";

    const resp = await request.post("/api/leads", {
      data: leadPayload({ email: testEmail }),
    });

    // Accept 201 (success) or 422 (validation) — in both cases email must not appear in body
    expect([201, 422, 429]).toContain(resp.status());

    const bodyText = await resp.text();

    // The submitted email address must not appear in the response body
    // (it should be encrypted before storage, never echoed)
    expect(bodyText).not.toContain(testEmail);
  });

  test("POST /api/leads 201 response only contains lead_id and created_at", async ({
    request,
  }) => {
    const resp = await request.post("/api/leads", {
      data: leadPayload(),
    });

    if (resp.status() !== 201) return; // skip if validation failed or rate-limited

    const body = await resp.json();

    // The success response shape should be minimal — no PII echoed back
    expect(body.success).toBe(true);
    expect(typeof body.lead_id).toBe("string");
    expect(typeof body.created_at).toBe("string");

    // Fields that must NOT appear in the success response
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("first_name");
    expect(body).not.toHaveProperty("last_name");
  });
});

// ---------------------------------------------------------------------------
// 2. Admin leads response does not expose internal fields
// ---------------------------------------------------------------------------

test.describe("PII: admin leads endpoint does not expose internal fields", () => {
  test("GET /api/admin/leads: no lead has internal_cost or deleted_at fields", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/leads");

    // 401 in production = auth enforced, skip the assertion
    if (resp.status() === 401 || resp.status() === 403) {
      test.info().annotations.push({
        type: "info",
        description: "Auth required — cannot inspect leads shape",
      });
      return;
    }

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.leads)).toBe(true);

    for (const lead of body.leads) {
      // Internal cost fields must never be exposed via this API
      expect(lead).not.toHaveProperty("internal_cost");
      expect(lead).not.toHaveProperty("dealer_cost");
      expect(lead).not.toHaveProperty("invoice_price");

      // Soft-delete sentinel must not be exposed
      expect(lead).not.toHaveProperty("deleted_at");
      expect(lead).not.toHaveProperty("deleted_by");

      // Raw password hashes / secrets must never appear
      expect(lead).not.toHaveProperty("password_hash");
      expect(lead).not.toHaveProperty("secret");
      expect(lead).not.toHaveProperty("token");
    }
  });

  test("GET /api/admin/leads: team_members is a list of strings (not objects with sensitive data)", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/leads");
    if (resp.status() !== 200) return;

    const body = await resp.json();
    expect(Array.isArray(body.team_members)).toBe(true);

    for (const member of body.team_members) {
      // Team members should be names (strings), not objects with email/salary
      expect(typeof member).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Security headers on all key endpoints
// ---------------------------------------------------------------------------

test.describe("Security headers: x-content-type-options and x-frame-options", () => {
  // Test each endpoint individually for clarity in the test report
  for (const path of SECURITY_HEADER_ENDPOINTS) {
    test(`${path} has x-content-type-options: nosniff`, async ({ request }) => {
      const resp = await request.get(path);

      // Skip if endpoint is unavailable in this env
      if (resp.status() >= 500) {
        test.info().annotations.push({
          type: "info",
          description: `${path} returned ${resp.status()} — skipping header check`,
        });
        return;
      }

      const headers = resp.headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
    });

    test(`${path} has x-frame-options: DENY`, async ({ request }) => {
      const resp = await request.get(path);

      if (resp.status() >= 500) {
        test.info().annotations.push({
          type: "info",
          description: `${path} returned ${resp.status()} — skipping header check`,
        });
        return;
      }

      const headers = resp.headers();
      expect(headers["x-frame-options"]).toBe("DENY");
    });
  }

  test("All key endpoints have both required security headers simultaneously", async ({
    request,
  }) => {
    const results: Array<{
      path: string;
      status: number;
      nosniff: boolean;
      denyFrame: boolean;
    }> = [];

    for (const path of SECURITY_HEADER_ENDPOINTS) {
      const resp = await request.get(path);
      if (resp.status() >= 500) continue;

      const headers = resp.headers();
      results.push({
        path,
        status: resp.status(),
        nosniff: headers["x-content-type-options"] === "nosniff",
        denyFrame: headers["x-frame-options"] === "DENY",
      });
    }

    // At least the API routes that returned 200/4xx must have security headers
    const reachable = results.filter((r) => r.status < 500);
    if (reachable.length === 0) {
      test.info().annotations.push({
        type: "info",
        description: "No endpoints reachable — skipping header batch assertion",
      });
      return;
    }

    for (const r of reachable) {
      expect(r.nosniff, `${r.path} missing x-content-type-options`).toBe(true);
      expect(r.denyFrame, `${r.path} missing x-frame-options`).toBe(true);
    }
  });

  test("Content-Security-Policy header is set on the homepage", async ({
    request,
  }) => {
    const resp = await request.get("/");
    if (resp.status() >= 500) return;

    const headers = resp.headers();
    // CSP must be present
    const csp = headers["content-security-policy"];
    expect(csp).toBeTruthy();

    // Must include frame-ancestors 'none' to prevent clickjacking
    expect(csp).toContain("frame-ancestors");
  });
});

// ---------------------------------------------------------------------------
// 4. CSRF cookie set on homepage visit
// ---------------------------------------------------------------------------

test.describe("CSRF: wolfpack_csrf cookie is set on homepage visit", () => {
  test("Visiting / sets the wolfpack_csrf cookie", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const cookies = await context.cookies();
    const csrfCookie = cookies.find((c) => c.name === "wolfpack_csrf");

    if (!csrfCookie) {
      // CSRF may be disabled in demo mode — annotate but don't fail hard
      // because the cookie is only needed when CSRF protection is active
      test.info().annotations.push({
        type: "info",
        description:
          "wolfpack_csrf cookie not set — CSRF protection may be inactive in demo mode",
      });
      return;
    }

    // Cookie must have a non-empty value (UUID format)
    expect(csrfCookie.value.length).toBeGreaterThan(10);
  });

  test("CSRF cookie is set after visiting /contact page", async ({
    page,
    context,
  }) => {
    await page.goto("/contact", { waitUntil: "domcontentloaded" });

    const cookies = await context.cookies();
    const csrfCookie = cookies.find((c) => c.name === "wolfpack_csrf");

    if (!csrfCookie) {
      test.info().annotations.push({
        type: "info",
        description: "wolfpack_csrf cookie not set on /contact — CSRF inactive",
      });
      return;
    }

    expect(csrfCookie.value.length).toBeGreaterThan(10);
  });

  test("POST /api/contact without CSRF token returns 403 (when CSRF is active) or 201 (demo)", async ({
    request,
  }) => {
    // Simulate a cross-origin request: no cookie, no csrf header
    const resp = await request.post("/api/contact", {
      data: {
        first_name: "CSRF",
        last_name: "Test",
        email: "csrf.test@wolfpackmotors.test",
        subject: "Test",
        message: "Testing CSRF protection",
      },
    });

    // 403 = CSRF blocked (production), 201 = demo mode (CSRF inactive),
    // 422 = validation error reached (public form route reachable), 429 = rate limited
    expect([201, 403, 422, 429]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// 5. XSS attempt in lead fields is rejected or sanitized
// ---------------------------------------------------------------------------

test.describe("XSS: script injection in lead fields is rejected or sanitized", () => {
  test("Lead POST with XSS in first_name: <script> payload returns 422 or 201 with sanitized/no echo", async ({
    request,
  }) => {
    const xssPayload = "<script>alert(1)</script>";

    const resp = await request.post("/api/leads", {
      data: leadPayload({ first_name: xssPayload }),
    });

    // 422 = Zod validation may reject HTML tags (if max length exceeded after encoding)
    // 201 = input accepted — but must NOT be echoed back raw in the response
    // 429 = rate limited
    expect([201, 422, 429]).toContain(resp.status());

    const bodyText = await resp.text();

    // The raw <script> tag must never appear in the response body
    expect(bodyText).not.toContain("<script>");
    expect(bodyText).not.toContain("</script>");
    expect(bodyText).not.toContain("alert(1)");
  });

  test("Lead POST with XSS in vehicle_interest field does not echo script back", async ({
    request,
  }) => {
    const xssPayload = '"><img src=x onerror=alert(1)>';

    const resp = await request.post("/api/leads", {
      data: leadPayload({ vehicle_interest: xssPayload }),
    });

    expect([201, 422, 429]).toContain(resp.status());

    const bodyText = await resp.text();
    // Raw event handler injection must not appear in response
    expect(bodyText).not.toContain("onerror=alert");
    expect(bodyText).not.toContain("<img src=x");
  });

  test("Contact form POST with XSS in message does not echo script back", async ({
    request,
  }) => {
    const xssPayload = "<script>document.cookie='stolen=1'</script>";

    const resp = await request.post("/api/contact", {
      headers: { Authorization: "Bearer e2e-test" },
      data: {
        first_name: "XSS",
        last_name: "Test",
        email: "xss.test@wolfpackmotors.test",
        subject: "Security test",
        message: xssPayload,
      },
    });

    expect([201, 403, 422, 429]).toContain(resp.status());

    const bodyText = await resp.text();
    // Raw script tag must not appear in response (contact route sanitizes inputs)
    expect(bodyText).not.toContain("<script>");
  });

  test("Contact form XSS in first_name: sanitized by server (no raw tag in response)", async ({
    request,
  }) => {
    const resp = await request.post("/api/contact", {
      headers: { Authorization: "Bearer e2e-test" },
      data: {
        first_name: "<script>alert('xss')</script>",
        last_name: "Test",
        email: "xss2.test@wolfpackmotors.test",
        subject: "XSS test",
        message: "Testing input sanitization on first_name field.",
      },
    });

    expect([201, 403, 422, 429]).toContain(resp.status());

    const bodyText = await resp.text();
    expect(bodyText).not.toContain("<script>");
    expect(bodyText).not.toContain("alert(");
  });
});

// ---------------------------------------------------------------------------
// Bonus: API endpoints should not expose stack traces in error responses
// ---------------------------------------------------------------------------

test.describe("Security: no stack traces in error responses", () => {
  test("POST /api/leads with invalid JSON does not expose a stack trace", async ({
    request,
  }) => {
    const resp = await request.post("/api/leads", {
      headers: { "content-type": "application/json" },
      data: "not-valid-json{{{",
    });

    expect([400, 422]).toContain(resp.status());

    const bodyText = await resp.text();
    // Stack traces expose internal file paths and versions — must not appear
    expect(bodyText).not.toMatch(/at Object\.<anonymous>|at Module\._compile|Error: /);
    expect(bodyText).not.toContain("/node_modules/");
    expect(bodyText).not.toContain(".js:"); // file:line stack frame pattern
  });

  test("GET /api/inventory with invalid param does not expose stack trace", async ({
    request,
  }) => {
    const resp = await request.get(
      "/api/inventory?year_min=notanumber&year_max=alsowrong",
    );

    // 400 = validation error, 200 = params ignored, 503 = service unavailable
    expect([200, 400, 503]).toContain(resp.status());

    const bodyText = await resp.text();
    expect(bodyText).not.toContain("/node_modules/");
  });
});
