import { test, expect } from "@playwright/test";

/**
 * shadow-auth.spec.ts
 *
 * Auth-specific shadow tests, verify that:
 *   1. Admin routes never return 500 for unauthenticated requests.
 *   2. The login page is always accessible (never behind an auth wall).
 *   3. Public routes never require authentication (never return 401).
 *
 * These tests mirror the shadow suite philosophy: they must pass in both
 * DEMO MODE (auth disabled, `false &&` guard in middleware) and PRODUCTION
 * MODE (auth enforced), so all status assertions use permissive patterns.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_API_ROUTES = [
  "/api/admin/leads",
  "/api/admin/stats",
  "/api/admin/billing",
  "/api/admin/settings",
];

// ---------------------------------------------------------------------------
// 1. Admin routes enforce auth, returns 401/403 or 200 in demo, never 500
// ---------------------------------------------------------------------------

test.describe("Shadow auth: admin API routes never return 500 unauthenticated", () => {
  for (const route of ADMIN_API_ROUTES) {
    test(`${route}: unauthenticated request returns 200, 401, or 403, never 500`, async ({
      request,
    }) => {
      const resp = await request.get(route);
      const status = resp.status();

      // The only acceptable outcomes for an unauthenticated request:
      //   200, demo mode (auth disabled)
      //   401, auth required (production middleware active)
      //   403, insufficient permissions
      // Never acceptable: 500 (server crash), 502/504 (gateway error)
      expect([200, 401, 403]).toContain(status);
    });
  }

  test("No admin API route returns a gateway error (502/504) when unauthenticated", async ({
    request,
  }) => {
    for (const route of ADMIN_API_ROUTES) {
      const resp = await request.get(route);
      expect([502, 504]).not.toContain(resp.status());
    }
  });

  test("Admin API routes that return 200 in demo mode still return valid JSON", async ({
    request,
  }) => {
    for (const route of ADMIN_API_ROUTES) {
      const resp = await request.get(route);
      if (resp.status() === 200) {
        // Must be parseable JSON, not an HTML error page
        const contentType = resp.headers()["content-type"] ?? "";
        expect(contentType).toContain("application/json");

        const body = await resp.json();
        expect(typeof body).toBe("object");
        expect(body).not.toBeNull();
      }
    }
  });

  test("Admin browser routes never return 500 for unauthenticated access", async ({
    page,
  }) => {
    const adminBrowserRoutes = ["/admin", "/admin/inventory", "/admin/leads"];

    for (const route of adminBrowserRoutes) {
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      // After redirects the final response must not be 500
      expect(resp?.status()).not.toBe(500);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Login page is always accessible, never behind an auth wall
// ---------------------------------------------------------------------------

test.describe("Shadow auth: login page always accessible", () => {
  test("GET /admin/login returns 200 (never 401, 403, or 500)", async ({
    request,
  }) => {
    const resp = await request.get("/admin/login");
    // The login page must always be accessible to unauthenticated users
    expect(resp.status()).toBe(200);
  });

  test("Browser navigation to /admin/login does not redirect away", async ({
    page,
  }) => {
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

    const finalUrl = page.url();
    // Must still be on the login page (not redirected to some other auth page)
    expect(finalUrl).toContain("/admin/login");
  });

  test("/admin/login renders an HTML form (not a JSON error)", async ({
    page,
  }) => {
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

    // Must have actual form inputs, not a JSON 401 rendered as text
    const emailInput = page.locator(
      'input[type="email"], input[name="email"]',
    );
    await expect(emailInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test("/admin/login is not a 500 error page", async ({ page }) => {
    const resp = await page.goto("/admin/login", {
      waitUntil: "domcontentloaded",
    });
    expect(resp?.status()).not.toBe(500);

    // Verify the page is not the Next.js generic error page
    const bodyText = await page.textContent("body");
    expect(bodyText!.toLowerCase()).not.toMatch(/application error|a server-side exception/i);
  });
});

// ---------------------------------------------------------------------------
// 2b. Password reset is always accessible, a locked-out user has no session,
//     so gating it behind auth creates a login -> reset -> login redirect loop.
// ---------------------------------------------------------------------------

test.describe("Shadow auth: password reset is public", () => {
  test("Browser navigation to /admin/reset-password does not redirect to login", async ({
    page,
  }) => {
    await page.goto("/admin/reset-password", { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/admin/reset-password");
    expect(page.url()).not.toContain("/admin/login");
  });

  test("/admin/reset-password renders the request form (an email input)", async ({
    page,
  }) => {
    await page.goto("/admin/reset-password", { waitUntil: "domcontentloaded" });
    const emailInput = page.locator(
      'input[type="email"], input[name="email"]',
    );
    await expect(emailInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test("/admin/reset-password does not render the admin sidebar nav", async ({
    page,
  }) => {
    await page.goto("/admin/reset-password", { waitUntil: "domcontentloaded" });
    // A logged-out visitor must not see the admin navigation or app structure.
    await expect(
      page.locator('[aria-label^="Admin navigation"]'),
    ).toHaveCount(0);
  });

  test("POST /api/admin/reset-password is public (never 401)", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/reset-password", {
      data: { email: "nobody@example.com" },
    });
    expect(resp.status()).not.toBe(401);
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 3. Public routes never require auth (never return 401)
// ---------------------------------------------------------------------------

test.describe("Shadow auth: public routes never return 401", () => {
  const PUBLIC_API_ROUTES = [
    { path: "/api/health", method: "GET" as const },
    { path: "/api/inventory", method: "GET" as const },
  ];

  for (const { path, method } of PUBLIC_API_ROUTES) {
    test(`${method} ${path} is publicly accessible, never returns 401`, async ({
      request,
    }) => {
      const resp =
        method === "GET"
          ? await request.get(path)
          : await request.post(path, { data: {} });

      // Public routes must never return 401 (auth required) or 403 (forbidden)
      expect(resp.status()).not.toBe(401);
      expect(resp.status()).not.toBe(403);
    });
  }

  test("POST /api/leads is publicly accessible, never returns 401", async ({
    request,
  }) => {
    // Submit an invalid payload, we expect 422 (validation) not 401 (auth)
    const resp = await request.post("/api/leads", {
      data: { first_name: "Public" }, // intentionally incomplete
    });

    // 422 = public route reached, validated and rejected
    // 201 = public route reached and accepted (no DB mode)
    // Never 401 or 403, that would mean auth is blocking a public route
    expect(resp.status()).not.toBe(401);
    expect(resp.status()).not.toBe(403);
    expect([201, 400, 422, 429]).toContain(resp.status());
  });

  test("POST /api/contact is publicly accessible, never returns 401", async ({
    request,
  }) => {
    // Bearer auth header bypasses CSRF so we can test the route is reachable
    const resp = await request.post("/api/contact", {
      headers: { Authorization: "Bearer e2e-test" },
      data: { first_name: "Shadow" }, // intentionally incomplete
    });

    expect(resp.status()).not.toBe(401);
    expect([201, 400, 422, 429]).toContain(resp.status());
  });

  test("Public page routes are accessible without auth", async ({ page }) => {
    const publicPages = ["/", "/inventory", "/contact", "/financing"];

    for (const path of publicPages) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      // Must not be auth-blocked or crash
      expect(resp?.status()).not.toBe(401);
      expect(resp?.status()).not.toBe(403);
      expect(resp?.status()).not.toBe(500);
    }
  });

  test("GET /api/health is always accessible without credentials", async ({
    request,
  }) => {
    // Health endpoint must be reachable by monitoring tools (no auth)
    const resp = await request.get("/api/health");
    expect([200, 503]).toContain(resp.status());
    expect(resp.status()).not.toBe(401);
    expect(resp.status()).not.toBe(403);
  });
});
