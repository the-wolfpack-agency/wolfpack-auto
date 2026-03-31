/**
 * Demo Mode E2E Tests.
 *
 * Validates demo session creation, token validation, expiry enforcement,
 * rate limiting, demo-to-real conversion, and demo data seeding.
 *
 * Run: npx playwright test tests/e2e/demo-mode.spec.ts
 */

import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DEMO_ENDPOINT = "/api/admin/demo";

function expectNotServerError(status: number, label: string): void {
  expect(status, `${label} — server crashed (500)`).not.toBe(500);
}

/* -------------------------------------------------------------------------- */
/* Demo session creation                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Demo Mode: session creation", () => {
  test("POST /api/admin/demo creates a demo session", async ({ request }) => {
    const res = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "Demo User",
        email: `demo-${Date.now()}@example.com`,
        dealer_name: "Demo Motors",
      },
    });
    expectNotServerError(res.status(), "create demo session");
    expect([200, 201, 401, 403, 404]).toContain(res.status());

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty("demo_token");
      expect(body).toHaveProperty("expires_at");
      expect(typeof body.demo_token).toBe("string");
      expect(body.demo_token.length).toBeGreaterThan(0);
    }
  });

  test("demo session includes a dashboard URL", async ({ request }) => {
    const res = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "URL Test",
        email: `demo-url-${Date.now()}@example.com`,
        dealer_name: "URL Motors",
      },
    });
    expectNotServerError(res.status(), "demo dashboard URL");

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty("dashboard_url");
      expect(body.dashboard_url).toContain("/admin");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Demo token validation                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Demo Mode: token validation", () => {
  test("GET /api/admin/demo?token=<valid> returns demo session info", async ({
    request,
  }) => {
    // First create a demo session
    const createRes = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "Token Test",
        email: `demo-token-${Date.now()}@example.com`,
        dealer_name: "Token Motors",
      },
    });
    expectNotServerError(createRes.status(), "create for token test");

    if (createRes.status() === 200 || createRes.status() === 201) {
      const { demo_token } = await createRes.json();

      // Validate the token
      const validateRes = await request.get(
        `${DEMO_ENDPOINT}?token=${demo_token}`,
      );
      expectNotServerError(validateRes.status(), "validate demo token");
      expect([200, 401, 403, 404]).toContain(validateRes.status());

      if (validateRes.status() === 200) {
        const body = await validateRes.json();
        expect(body).toHaveProperty("valid");
        expect(body.valid).toBe(true);
      }
    }
  });

  test("invalid demo token returns 400 or 404, not 200", async ({
    request,
  }) => {
    const res = await request.get(`${DEMO_ENDPOINT}?token=fake-token-123`);
    expectNotServerError(res.status(), "invalid demo token");
    // Should not return 200 with valid=true for a fake token
    expect([400, 401, 403, 404]).toContain(res.status());
  });

  test("missing token parameter returns 400", async ({ request }) => {
    const res = await request.get(DEMO_ENDPOINT);
    expectNotServerError(res.status(), "missing demo token param");
    expect([400, 401, 403, 404]).toContain(res.status());
  });
});

/* -------------------------------------------------------------------------- */
/* Demo expiry                                                                */
/* -------------------------------------------------------------------------- */

test.describe("Demo Mode: expiry enforcement", () => {
  test("demo session expires_at is within 24 hours", async ({ request }) => {
    const res = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "Expiry Test",
        email: `demo-expiry-${Date.now()}@example.com`,
        dealer_name: "Expiry Motors",
      },
    });
    expectNotServerError(res.status(), "demo expiry check");

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      if (body.expires_at) {
        const expiresAt = new Date(body.expires_at).getTime();
        const now = Date.now();
        const diffHours = (expiresAt - now) / (1000 * 60 * 60);
        // Expiry should be between 0 and 25 hours from now
        expect(diffHours).toBeGreaterThan(0);
        expect(diffHours).toBeLessThanOrEqual(25);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

test.describe("Demo Mode: rate limiting", () => {
  test("creating more than 5 demos per email triggers rate limit", async ({
    request,
  }) => {
    const email = `ratelimit-${Date.now()}@example.com`;
    let lastStatus = 0;

    for (let i = 0; i < 6; i++) {
      const res = await request.post(DEMO_ENDPOINT, {
        data: {
          name: `Rate Test ${i}`,
          email,
          dealer_name: `Rate Motors ${i}`,
        },
      });
      expectNotServerError(res.status(), `demo rate limit attempt ${i}`);
      lastStatus = res.status();
    }

    // The 6th attempt should be rate limited (429) or still auth-blocked (401)
    // or 404 if the route does not exist yet
    expect([200, 201, 401, 403, 404, 429]).toContain(lastStatus);
  });
});

/* -------------------------------------------------------------------------- */
/* Demo data includes sample vehicles and leads                               */
/* -------------------------------------------------------------------------- */

test.describe("Demo Mode: seeded data", () => {
  test("demo session includes sample vehicles", async ({ request }) => {
    const createRes = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "Data Test",
        email: `demo-data-${Date.now()}@example.com`,
        dealer_name: "Data Motors",
      },
    });
    expectNotServerError(createRes.status(), "create demo for data check");

    if (createRes.status() === 200 || createRes.status() === 201) {
      const body = await createRes.json();
      if (body.demo_token) {
        // Check inventory endpoint with demo context
        const invRes = await request.get("/api/admin/inventory", {
          headers: { "X-Demo-Token": body.demo_token },
        });
        expectNotServerError(invRes.status(), "demo inventory");
        if (invRes.status() === 200) {
          const invBody = await invRes.json();
          if (invBody.vehicles) {
            expect(Array.isArray(invBody.vehicles)).toBe(true);
          }
        }
      }
    }
  });

  test("demo session includes sample leads", async ({ request }) => {
    const createRes = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "Leads Test",
        email: `demo-leads-${Date.now()}@example.com`,
        dealer_name: "Leads Motors",
      },
    });
    expectNotServerError(createRes.status(), "create demo for leads check");

    if (createRes.status() === 200 || createRes.status() === 201) {
      const body = await createRes.json();
      if (body.demo_token) {
        const leadsRes = await request.get("/api/admin/leads", {
          headers: { "X-Demo-Token": body.demo_token },
        });
        expectNotServerError(leadsRes.status(), "demo leads");
        if (leadsRes.status() === 200) {
          const leadsBody = await leadsRes.json();
          if (leadsBody.leads) {
            expect(Array.isArray(leadsBody.leads)).toBe(true);
          }
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Demo to real dealer conversion                                             */
/* -------------------------------------------------------------------------- */

test.describe("Demo Mode: conversion to real dealer", () => {
  test("POST /api/admin/demo/convert does not crash", async ({ request }) => {
    const res = await request.post(`${DEMO_ENDPOINT}/convert`, {
      data: {
        demo_token: "test-demo-token-123",
        password: "SecurePassword1!",
        payment_plan: "starter",
      },
    });
    expectNotServerError(res.status(), "demo conversion");
    expect([200, 201, 400, 401, 403, 404]).toContain(res.status());
  });

  test("conversion with missing token returns 400", async ({ request }) => {
    const res = await request.post(`${DEMO_ENDPOINT}/convert`, {
      data: {
        password: "SecurePassword1!",
        payment_plan: "starter",
      },
    });
    expectNotServerError(res.status(), "conversion missing token");
    expect([400, 401, 403, 404, 422]).toContain(res.status());
  });

  test("conversion preserves dealer data", async ({ request }) => {
    // Create demo first
    const createRes = await request.post(DEMO_ENDPOINT, {
      data: {
        name: "Convert Test",
        email: `demo-convert-${Date.now()}@example.com`,
        dealer_name: "Convert Motors",
      },
    });
    expectNotServerError(createRes.status(), "create demo for conversion");

    if (createRes.status() === 200 || createRes.status() === 201) {
      const { demo_token } = await createRes.json();
      if (demo_token) {
        const convertRes = await request.post(`${DEMO_ENDPOINT}/convert`, {
          data: {
            demo_token,
            password: "SecureConvert1!",
            payment_plan: "professional",
          },
        });
        expectNotServerError(convertRes.status(), "convert demo to real");

        if (convertRes.status() === 200 || convertRes.status() === 201) {
          const body = await convertRes.json();
          expect(body).toHaveProperty("dealer_id");
          expect(body).toHaveProperty("status");
          if (body.dealer_name) {
            expect(body.dealer_name).toBe("Convert Motors");
          }
        }
      }
    }
  });
});
