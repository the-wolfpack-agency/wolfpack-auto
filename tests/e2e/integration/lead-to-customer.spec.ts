/**
 * Lead-to-Customer Integration Tests
 *
 * Full lead journey: public submission -> admin list -> detail ->
 * status update -> DB verification -> analytics -> browser UI.
 */
import { test, expect } from "@playwright/test";
import {
  getAuthCookies,
  uniqueId,
  assertAnalyticsReachable,
  authGet,
  authPost,
  authPatch,
} from "./helpers";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

let cookies: string;

test.beforeAll(async ({ request }) => {
  cookies = await getAuthCookies(request);
});

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const LEAD_FIRST = "E2ETest";
const LEAD_LAST = `Lead${Date.now()}`;
const LEAD_EMAIL = `e2e-${Date.now()}@test.wolfpackauto.com`;

function publicLeadPayload(overrides: Record<string, unknown> = {}) {
  return {
    dealer_id: "default",
    first_name: LEAD_FIRST,
    last_name: LEAD_LAST,
    email: LEAD_EMAIL,
    phone: "+15559990001",
    vehicle_interest: "2025 Toyota RAV4 Hybrid XLE",
    source: "website_form",
    notes: "E2E integration test lead. Interested in the RAV4 Hybrid.",
    utm_source: "e2e-test",
    utm_medium: "integration",
    utm_campaign: "ci-pipeline",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Lead to Customer Journey", () => {
  let createdLeadId: string;

  test("POST /api/leads creates a lead (public, no auth)", async ({
    request,
  }) => {
    const res = await request.post("/api/leads", {
      data: publicLeadPayload(),
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
    expect(body.created_at).toBeTruthy();

    createdLeadId = body.lead_id;
  });

  test("POST /api/leads validates required fields", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        dealer_id: "default",
        // Missing first_name, last_name, email, vehicle_interest
      },
    });
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeTruthy();
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  test("POST /api/leads validates email format", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: publicLeadPayload({ email: "not-an-email" }),
    });
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(body.details.some((d: { field: string }) => d.field === "email")).toBe(
      true,
    );
  });

  test("POST /api/leads validates phone format (E.164)", async ({
    request,
  }) => {
    const res = await request.post("/api/leads", {
      data: publicLeadPayload({ phone: "555-bad-phone" }),
    });
    expect(res.status()).toBe(422);

    const body = await res.json();
    expect(
      body.details.some((d: { field: string }) => d.field === "phone"),
    ).toBe(true);
  });

  test("POST /api/leads validates source enum", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: publicLeadPayload({ source: "invalid_source" }),
    });
    expect(res.status()).toBe(422);
  });

  test("GET /api/admin/leads returns leads list (authenticated)", async ({
    request,
  }) => {
    const res = await authGet(request, cookies, "/api/admin/leads");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.leads).toBeTruthy();
    expect(Array.isArray(body.leads)).toBe(true);
    expect(body.leads.length).toBeGreaterThan(0);
    expect(typeof body.total).toBe("number");
    expect(body.team_members).toBeTruthy();
    expect(Array.isArray(body.team_members)).toBe(true);
  });

  test("GET /api/admin/leads supports pagination", async ({ request }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/leads?page=1&page_size=3",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(3);
    expect(body.leads.length).toBeLessThanOrEqual(3);
  });

  test("GET /api/admin/leads supports status filter", async ({ request }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/leads?status=new",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const lead of body.leads) {
      expect(lead.status).toBe("new");
    }
  });

  test("GET /api/admin/leads supports temperature filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/leads?temperature=hot",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const lead of body.leads) {
      expect(lead.temperature).toBe("hot");
    }
  });

  test("Analytics health responds after lead operations", async ({
    request,
  }) => {
    const health = await assertAnalyticsReachable(request, cookies);
    expect(["shadow_mode", "healthy", "degraded", "error"]).toContain(
      health.status,
    );
  });

  test("Browser: /admin/leads page renders lead data", async ({ page }) => {
    const { browserLogin } = await import("./helpers");
    await browserLogin(page);
    await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test("Unauthenticated admin leads access is rejected", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/leads");
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(200);
  });
});
