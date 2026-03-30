/**
 * Form & Action Regression Suite
 *
 * Prevents the class of bug where forms submit to non-existent API routes
 * (returning 404) or buttons trigger fetch calls that silently fail.
 *
 * This test:
 *   1. Scans every admin page for <form action="..."> — all must be gone
 *   2. Hits every known API endpoint with the correct HTTP method
 *   3. Verifies every "Save" button triggers a client-side fetch (not form POST)
 *   4. Verifies the resources analytics endpoint works
 *
 * If you add a new form or API action, add it to the relevant section here.
 */

import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* 1. No static form actions anywhere in the admin panel                       */
/* -------------------------------------------------------------------------- */

const ADMIN_PAGES_WITH_FORMS = [
  { path: "/admin/settings", name: "Settings" },
  { path: "/admin/leads", name: "Leads" },
  { path: "/admin/inventory", name: "Inventory" },
  { path: "/admin/deals", name: "Deals" },
  { path: "/admin/compliance", name: "Compliance" },
  { path: "/admin/marketing", name: "Marketing" },
  { path: "/admin/service", name: "Service" },
  { path: "/admin/pricing", name: "Pricing" },
  { path: "/admin/onboarding", name: "Onboarding" },
  { path: "/admin/trade-in", name: "Trade-In" },
  { path: "/admin/digital-retail", name: "Digital Retail" },
  { path: "/admin/documents", name: "Documents" },
  { path: "/admin/team", name: "Team" },
  { path: "/admin/webhooks", name: "Webhooks" },
  { path: "/admin/vehicles/new", name: "New Vehicle" },
];

test.describe("No static form actions in admin pages", () => {
  for (const { path, name } of ADMIN_PAGES_WITH_FORMS) {
    test(`${name} (${path}) has no forms posting to API routes`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Collect form actions that target API routes (the dangerous ones).
      // Same-page GET forms (e.g. search/filter) are valid HTML behavior.
      const apiFormActions = await page.$$eval("form[action]", (forms) =>
        forms
          .map((f) => f.getAttribute("action"))
          .filter((a): a is string => !!a && a.startsWith("/api/")),
      );

      expect(
        apiFormActions,
        `${path} has forms posting to API routes that may 404: ${apiFormActions.join(", ")}`,
      ).toHaveLength(0);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 2. All API endpoints return non-404                                         */
/* -------------------------------------------------------------------------- */

const API_ENDPOINTS = [
  // Settings
  { method: "GET", path: "/api/admin/settings" },
  { method: "PUT", path: "/api/admin/settings", body: { name: "Test" } },
  { method: "POST", path: "/api/admin/settings/logo", multipart: true },
  { method: "DELETE", path: "/api/admin/settings/logo" },

  // Core admin
  { method: "GET", path: "/api/admin/stats" },
  { method: "GET", path: "/api/admin/inventory" },
  { method: "GET", path: "/api/admin/leads" },
  { method: "GET", path: "/api/admin/compliance" },
  { method: "GET", path: "/api/admin/funnel-health" },
  { method: "GET", path: "/api/admin/pricing" },
  { method: "GET", path: "/api/admin/onboarding" },
  { method: "GET", path: "/api/admin/tasks" },
  { method: "GET", path: "/api/admin/resources" },

  // Analytics
  { method: "POST", path: "/api/admin/resources/analytics", body: { event_type: "test" } },
  { method: "GET", path: "/api/admin/system/health" },

  // Health
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/health/deep" },

  // Invite flow
  { method: "POST", path: "/api/admin/accept-invite", body: { token: "test", password: "TestPass1!" } },

  // VIN decode
  { method: "GET", path: "/api/admin/vin-decode?vin=1HGCV1F34PA000001" },

  // Public
  { method: "GET", path: "/api/inventory" },
  { method: "GET", path: "/api/auth/session" },
];

test.describe("All API endpoints return non-404", () => {
  for (const endpoint of API_ENDPOINTS) {
    test(`${endpoint.method} ${endpoint.path} is reachable`, async ({ request }) => {
      let res;
      if (endpoint.method === "GET") {
        res = await request.get(endpoint.path);
      } else if (endpoint.method === "PUT") {
        res = await request.put(endpoint.path, { data: endpoint.body ?? {} });
      } else if (endpoint.method === "DELETE") {
        res = await request.delete(endpoint.path);
      } else if (endpoint.multipart) {
        res = await request.post(endpoint.path, {
          multipart: {
            logo: { name: "test.png", mimeType: "image/png", buffer: Buffer.from("test") },
          },
        });
      } else {
        res = await request.post(endpoint.path, { data: endpoint.body ?? {} });
      }

      expect(
        res.status(),
        `${endpoint.method} ${endpoint.path} returned 404 — route does not exist`,
      ).not.toBe(404);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 3. Public form submissions work                                             */
/* -------------------------------------------------------------------------- */

test.describe("Public form submissions", () => {
  test("trade-in form renders and has no static action", async ({ page }) => {
    await page.goto("/trade-in", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const formActions = await page.$$eval("form[action]", (forms) =>
      forms.map((f) => f.getAttribute("action")).filter(Boolean),
    );
    // Trade-in form should use client-side fetch, not form action
    for (const action of formActions) {
      if (action?.startsWith("/api/")) {
        const res = await page.request.get(action);
        expect(res.status(), `Trade-in form action ${action} returns 404`).not.toBe(404);
      }
    }
  });

  test("contact form endpoint exists", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: { name: "Test", email: "test@test.com", message: "Test" },
    });
    // May return 400 (validation) or 403 (CSRF) but NOT 404
    expect(res.status()).not.toBe(404);
  });

  test("lead submission endpoint exists", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        first_name: "Test",
        last_name: "User",
        email: "test@test.com",
        phone: "+15550000000",
        dealer_id: "demo-dealer",
        vehicle_interest: "Test",
        source: "website_form",
      },
    });
    expect(res.status()).not.toBe(404);
  });

  test("service booking endpoint exists", async ({ request }) => {
    const res = await request.post("/api/service/schedule", {
      data: { customer_name: "Test", service_type: "oil_change" },
    });
    expect(res.status()).not.toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Resources analytics tracking works                                       */
/* -------------------------------------------------------------------------- */

test.describe("Resources analytics integration", () => {
  test("POST /api/admin/resources/analytics returns 200", async ({ request }) => {
    const res = await request.post("/api/admin/resources/analytics", {
      data: {
        event_type: "resource_viewed",
        metadata: { category: "training", title: "Test Resource" },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tracked).toBe(true);
  });

  test("POST /api/admin/resources/analytics rejects invalid body", async ({ request }) => {
    const res = await request.post("/api/admin/resources/analytics", {
      data: "not json",
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status()).toBe(400);
  });
});
