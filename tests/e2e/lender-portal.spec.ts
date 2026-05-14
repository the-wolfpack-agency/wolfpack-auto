/**
 * lender-portal.spec.ts
 *
 * E2E tests for the Lender Portal module.
 * Covers: lender listing, lender creation, rate tiers, deal submissions,
 *         submission tracking, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/lender-portal.spec.ts
 */
import { test, expect } from "@playwright/test";

// Shadow-mode skip: lender portal tests assert lender CRUD, rate tiers,
// deal submissions — all backed by Postgres tables from migration 026
// (lender_portal). In shadow mode (DATABASE_URL='') the routes either 401
// or return empty arrays, breaking the structural assertions. Re-run with
// DATABASE_URL set.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

// ---------------------------------------------------------------------------
// API: GET /api/admin/lenders — list lenders
// ---------------------------------------------------------------------------

test.describe("Lenders API — GET /api/admin/lenders", () => {
  test("returns lenders array with lender_name, portal, rate_sheet", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lenders");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("lenders");
      expect(Array.isArray(body.lenders)).toBe(true);

      if (body.lenders.length > 0) {
        const lender = body.lenders[0];
        expect(lender).toHaveProperty("lender_name");
        expect(lender).toHaveProperty("portal");
        expect(lender).toHaveProperty("rate_sheet");
      }
    }
  });

  test("lenders array items have id field", async ({ request }) => {
    const resp = await request.get("/api/admin/lenders");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      if (body.lenders.length > 0) {
        expect(body.lenders[0]).toHaveProperty("id");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/lenders");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/lenders — create lender
// ---------------------------------------------------------------------------

test.describe("Lenders API — POST /api/admin/lenders", () => {
  test("creates a lender and returns 201 (or 401 if auth required)", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/lenders", {
      data: {
        lender_name: "E2E Test Credit Union",
        portal: "https://portal.e2etestcu.com",
        rate_sheet: "standard_2026",
        contact_email: "e2e@testcu.com",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("lender");
      expect(body.lender.lender_name).toBe("E2E Test Credit Union");
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("missing lender_name returns 400/422, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/lenders", {
      data: { portal: "https://incomplete.com" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/lenders/[lenderId] — single lender with rate tiers
// ---------------------------------------------------------------------------

test.describe("Lenders API — GET /api/admin/lenders/:id", () => {
  test("returns single lender with rate tiers (or 401/404)", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/lenders/lender-001");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("lender");
      expect(body.lender).toHaveProperty("lender_name");
      expect(body.lender).toHaveProperty("rate_tiers");
      expect(Array.isArray(body.lender.rate_tiers)).toBe(true);

      if (body.lender.rate_tiers.length > 0) {
        const tier = body.lender.rate_tiers[0];
        expect(tier).toHaveProperty("credit_range");
        expect(tier).toHaveProperty("rate");
      }
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });

  test("non-existent lender returns 404, not 500", async ({ request }) => {
    const resp = await request.get("/api/admin/lenders/nonexistent-lender-xyz");
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/deals/[dealId]/submit — submit deal to lenders
// ---------------------------------------------------------------------------

test.describe("Deal Submission API — POST /api/admin/deals/:id/submit", () => {
  test("submits deal with lender_ids and returns submissions (or 401)", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/deals/deal-001/submit", {
      data: {
        lender_ids: ["lender-001", "lender-002"],
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200 || resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("submissions");
      expect(Array.isArray(body.submissions)).toBe(true);
      expect(body.submissions.length).toBeGreaterThanOrEqual(1);

      const sub = body.submissions[0];
      expect(sub).toHaveProperty("lender_id");
      expect(sub).toHaveProperty("status");
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });

  test("submit with empty lender_ids returns 400/422, not 500", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/deals/deal-001/submit", {
      data: { lender_ids: [] },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });

  test("submit to non-existent deal returns 404, not 500", async ({
    request,
  }) => {
    const resp = await request.post(
      "/api/admin/deals/nonexistent-deal/submit",
      {
        data: { lender_ids: ["lender-001"] },
      },
    );
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/deals/[dealId]/submissions — list submissions
// ---------------------------------------------------------------------------

test.describe("Deal Submissions API — GET /api/admin/deals/:id/submissions", () => {
  test("returns submissions array with lender_id, status", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/deals/deal-001/submissions");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("submissions");
      expect(Array.isArray(body.submissions)).toBe(true);

      if (body.submissions.length > 0) {
        const sub = body.submissions[0];
        expect(sub).toHaveProperty("lender_id");
        expect(sub).toHaveProperty("status");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/deals/deal-001/submissions");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Lender Portal pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/lenders", label: "Lenders" },
    { path: "/admin/deals", label: "Deals" },
  ];

  for (const pg of PAGES) {
    test(`${pg.label} page loads`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/500.*internal server error/i);
      expect(bodyText).not.toMatch(/Server error: 500/);
    });
  }
});
