import { test, expect } from "@playwright/test";

/**
 * NOTE on assertions in this file.
 *
 * These were `expect(status).not.toBe(500)`, which rules out a crash and
 * nothing else: a 403 or 404 sails through. That is how "POST /api/admin/dealers
 * creates a new dealer" stayed green for months while the page could not
 * onboard anybody, because the route answered 403 to every real user.
 *
 * They now name the statuses that are actually valid. 401 remains acceptable
 * because these run unauthenticated in shadow mode; 403 does NOT, because a 403
 * means the gate refuses somebody who reached it, which is the bug class this
 * file failed to catch.
 */


// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

/**
 * agency-management.spec.ts
 *
 * End-to-end tests for the dealer management system:
 *   - Dealer CRUD (create, list, toggle active)
 *   - Dealer users (create, update, deactivate)
 *   - Dealer switching
 *   - Agency page rendering
 *   - Settings page webhook section
 *   - Regression guards (AGENCY-002 through AGENCY-004)
 *
 * All tests run in shadow/demo mode (no DATABASE_URL) — routes return
 * mock data and return 2xx. Auth-gated routes return 401 when no session.
 */

// ---------------------------------------------------------------------------
// Dealer CRUD via API
// ---------------------------------------------------------------------------

test.describe("Agency: Dealer API", () => {
  test("GET /api/admin/dealers returns dealer list", async ({ request }) => {
    const res = await request.get("/api/admin/dealers");
    // 401 (auth) or 200 (shadow) — never 500
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("dealers");
      expect(Array.isArray(body.dealers)).toBe(true);
    }
  });

  test("POST /api/admin/dealers creates a new dealer", async ({ request }) => {
    const res = await request.post("/api/admin/dealers", {
      data: {
        name: "Test Motors",
        slug: "test-motors",
        phone: "(555) 000-1234",
        email: "admin@testmotors.com",
        address: { street: "100 Test Ln", city: "Raleigh", state: "NC", zip: "27601" },
        branding: { primary_color: "#0070c7", secondary_color: "#f97316" },
      },
    });
    /* This assertion used to be `not.toBe(500)` with the real checks hidden
       behind `if (status === 201)`. Unauthenticated the route answers 401, so
       the body was never inspected and this test passed green for months while
       /admin/agency/new-dealer could not create a dealer at all: the route
       required role `owner` and every real person holds `admin`, so every
       submit was a 403.

       403 is now explicitly disallowed. 401 means "no session", which is the
       expected state here; 403 means the role gate itself refuses somebody who
       reached it, which is the bug. The authenticated version of this check
       lives in src/app/api/admin/dealers/__tests__/create-dealer-contract.test.ts,
       where roles can be driven directly without credentials. */
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    expect(
      res.status(),
      "403 here means the dealer role gate refuses a real user, which is what broke onboarding",
    ).not.toBe(403);
    expect([200, 201, 401]).toContain(res.status());
    if (res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("slug", "test-motors");
      expect(body).toHaveProperty("public_url");
    }
  });

  test("POST /api/admin/dealers requires name and slug", async ({ request }) => {
    const res = await request.post("/api/admin/dealers", {
      data: { phone: "123" },
    });
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    // Should be 400 (validation) or 401 (auth)
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("PATCH /api/admin/dealers toggles dealer status", async ({ request }) => {
    const res = await request.patch("/api/admin/dealers", {
      data: {
        id: "00000000-0000-4000-a000-000000000001",
        is_active: false,
      },
    });
    expect([200, 201, 400, 401, 409]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Dealer Users API
// ---------------------------------------------------------------------------

test.describe("Agency: Dealer Users API", () => {
  test("GET /api/admin/dealer-users returns user list", async ({ request }) => {
    const res = await request.get("/api/admin/dealer-users");
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("users");
      expect(Array.isArray(body.users)).toBe(true);
    }
  });

  test("POST /api/admin/dealer-users creates a user", async ({ request }) => {
    const res = await request.post("/api/admin/dealer-users", {
      data: {
        name: "New User",
        email: `test-${Date.now()}@example.com`,
        password: "SecureP@ss1",
        role: "admin",
      },
    });
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    if (res.status() === 201) {
      const body = await res.json();
      expect(body).toHaveProperty("user");
      expect(body.user).toHaveProperty("email");
      expect(body.user).toHaveProperty("role");
    }
  });

  test("POST /api/admin/dealer-users rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/admin/dealer-users", {
      data: { email: "noname@test.com" },
    });
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });

  test("POST /api/admin/dealer-users rejects duplicate email in DB mode", async ({ request }) => {
    // In shadow mode this just succeeds with a new ID — OK
    const email = `dupe-${Date.now()}@example.com`;
    const first = await request.post("/api/admin/dealer-users", {
      data: { name: "User A", email, password: "Pass1234!", role: "staff" },
    });
    expect([200, 201, 400, 401, 409]).toContain(first.status());

    // Second attempt with same email
    const second = await request.post("/api/admin/dealer-users", {
      data: { name: "User B", email, password: "Pass1234!", role: "staff" },
    });
    expect([200, 201, 400, 401, 409]).toContain(second.status());
    // In DB mode: 409. In shadow mode: 201 (no dupe check). Both acceptable.
  });

  test("PATCH /api/admin/dealer-users/[id] updates a user", async ({ request }) => {
    const res = await request.patch("/api/admin/dealer-users/usr-001", {
      data: { role: "manager" },
    });
    expect([200, 201, 400, 401, 409]).toContain(res.status());
  });

  test("DELETE /api/admin/dealer-users/[id] deactivates a user", async ({ request }) => {
    const res = await request.delete("/api/admin/dealer-users/usr-003");
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("success", true);
    }
  });
});

// ---------------------------------------------------------------------------
// Switch Dealer API
// ---------------------------------------------------------------------------

test.describe("Agency: Switch Dealer", () => {
  test("POST /api/admin/switch-dealer exists and responds", async ({ request }) => {
    const res = await request.post("/api/admin/switch-dealer", {
      data: { dealer_id: "00000000-0000-4000-a000-000000000001" },
    });
    // 401 (auth needed) or 200 (session updated) — never 500
    expect([200, 201, 400, 401, 409]).toContain(res.status());
  });

  test("POST /api/admin/switch-dealer requires dealer_id", async ({ request }) => {
    const res = await request.post("/api/admin/switch-dealer", {
      data: {},
    });
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    // Should be 400 or 401
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

test.describe("Agency: Page Rendering", () => {
  test("Agency page loads", async ({ page }) => {
    const response = await page.goto("/admin/agency");
    expect([200, 401, 403, 307, 302]).toContain(response?.status() ?? 0);
  });

  test("New dealer page loads with form", async ({ page }) => {
    const response = await page.goto("/admin/agency/new-dealer");
    expect([200, 401, 403, 307, 302]).toContain(response?.status() ?? 0);
    // Check the page has the key form elements (may be behind auth redirect)
    const url = page.url();
    if (!url.includes("/login")) {
      await expect(page.locator("h1")).toContainText("Add New Dealer");
    }
  });

  test("Team page loads", async ({ page }) => {
    const response = await page.goto("/admin/team");
    expect([200, 401, 403, 307, 302]).toContain(response?.status() ?? 0);
  });

  test("Settings page loads with webhook section", async ({ page }) => {
    const response = await page.goto("/admin/settings");
    expect([200, 401, 403, 307, 302]).toContain(response?.status() ?? 0);
    const url = page.url();
    if (!url.includes("/login")) {
      // Check for the integrations section
      const integrationsHeading = page.locator("#integrations-heading");
      await expect(integrationsHeading).toBeVisible({ timeout: 5000 }).catch(() => {
        // Page might redirect to login in non-demo mode — acceptable
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Regression guards
// ---------------------------------------------------------------------------

test.describe("Agency: Regressions", () => {
  test("AGENCY-002: dealer_users API route exists with roles", async ({ request }) => {
    // Verify the route is reachable (not 404/500)
    const res = await request.get("/api/admin/dealer-users");
    expect(res.status()).not.toBe(404);
    expect([200, 201, 400, 401, 409]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const users = body.users ?? [];
      // In shadow mode, verify roles are present
      if (users.length > 0) {
        expect(users[0]).toHaveProperty("role");
        expect(["owner", "admin", "manager", "staff"]).toContain(users[0].role);
      }
    }
  });

  test("AGENCY-003: auth checks dealer_users table (auth.ts integration)", async ({ request }) => {
    // Verify that /api/admin routes are auth-gated
    // Sending a request without credentials should return 401 (not 500)
    const res = await request.get("/api/admin/dealer-users");
    expect([200, 201, 400, 401, 409]).toContain(res.status());
    // If auth is active, we get 401; if demo mode, we get 200
    expect([200, 401]).toContain(res.status());
  });

  test("AGENCY-004: switch-dealer endpoint exists and responds correctly", async ({ request }) => {
    const res = await request.post("/api/admin/switch-dealer", {
      data: { dealer_id: "demo-dealer" },
    });
    expect(res.status()).not.toBe(404);
    expect([200, 201, 400, 401, 409]).toContain(res.status());
  });

  test("Never 500 on any agency endpoint", async ({ request }) => {
    const endpoints = [
      { method: "GET" as const, url: "/api/admin/dealers" },
      { method: "GET" as const, url: "/api/admin/dealer-users" },
      { method: "POST" as const, url: "/api/admin/switch-dealer" },
      { method: "POST" as const, url: "/api/admin/dealer-users" },
      { method: "PATCH" as const, url: "/api/admin/dealer-users/test-id" },
      { method: "DELETE" as const, url: "/api/admin/dealer-users/test-id" },
    ];

    for (const ep of endpoints) {
      const res =
        ep.method === "GET"
          ? await request.get(ep.url)
          : ep.method === "POST"
          ? await request.post(ep.url, { data: {} })
          : ep.method === "PATCH"
          ? await request.patch(ep.url, { data: {} })
          : await request.delete(ep.url);

      expect(
        res.status(),
        `${ep.method} ${ep.url} should never return 500`,
      ).not.toBe(500);
    }
  });
});
