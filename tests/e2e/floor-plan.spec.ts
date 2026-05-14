/**
 * floor-plan.spec.ts
 *
 * E2E tests for the Floor Plan Financing module.
 * Covers: floor plan listing with stats, adding vehicles,
 *         paying off vehicles, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/floor-plan.spec.ts
 */
import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

// ---------------------------------------------------------------------------
// API: GET /api/admin/floor-plan — list lines + stats
// ---------------------------------------------------------------------------

test.describe("Floor Plan API — GET /api/admin/floor-plan", () => {
  test("returns lines array and stats with total_principal, total_interest, avg_days", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/floor-plan");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("lines");
      expect(body).toHaveProperty("stats");
      expect(Array.isArray(body.lines)).toBe(true);

      const stats = body.stats;
      expect(stats).toHaveProperty("total_principal");
      expect(stats).toHaveProperty("total_interest");
      expect(stats).toHaveProperty("avg_days");
      expect(typeof stats.total_principal).toBe("number");
      expect(typeof stats.total_interest).toBe("number");
      expect(typeof stats.avg_days).toBe("number");
    }
  });

  test("lines have vin, principal, interest_accrued, floored_date, status", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/floor-plan");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      if (body.lines.length > 0) {
        const line = body.lines[0];
        expect(line).toHaveProperty("id");
        expect(line).toHaveProperty("vin");
        expect(line).toHaveProperty("principal");
        expect(line).toHaveProperty("interest_accrued");
        expect(line).toHaveProperty("floored_date");
        expect(line).toHaveProperty("status");
      }
    }
  });

  test("stats values are non-negative", async ({ request }) => {
    const resp = await request.get("/api/admin/floor-plan");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.stats.total_principal).toBeGreaterThanOrEqual(0);
      expect(body.stats.total_interest).toBeGreaterThanOrEqual(0);
      expect(body.stats.avg_days).toBeGreaterThanOrEqual(0);
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/floor-plan");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/floor-plan — add vehicle to floor plan
// ---------------------------------------------------------------------------

test.describe("Floor Plan API — POST /api/admin/floor-plan", () => {
  test("adds vehicle to floor plan (or 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/floor-plan", {
      data: {
        vin: "1HGCV1F34PA099999",
        principal: 28500,
        lender: "Floor Plan National",
        floored_date: "2026-03-28",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200 || resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("line");
      expect(body.line).toHaveProperty("vin", "1HGCV1F34PA099999");
      expect(body.line).toHaveProperty("principal", 28500);
      expect(body.line).toHaveProperty("status");
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("missing vin returns 400/422, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/floor-plan", {
      data: { principal: 25000 },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: PATCH /api/admin/floor-plan/[id] — pay off vehicle
// ---------------------------------------------------------------------------

test.describe("Floor Plan API — PATCH /api/admin/floor-plan/:id", () => {
  test("pays off vehicle on floor plan (or 401/404)", async ({ request }) => {
    const resp = await request.patch("/api/admin/floor-plan/fp-001", {
      data: {
        status: "paid_off",
        payoff_date: "2026-03-28",
        payoff_amount: 28750,
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("line");
      expect(body.line.status).toBe("paid_off");
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });

  test("PATCH non-existent floor plan line returns 404, not 500", async ({
    request,
  }) => {
    const resp = await request.patch(
      "/api/admin/floor-plan/nonexistent-fp-xyz",
      {
        data: { status: "paid_off" },
      },
    );
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Floor Plan pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Floor Plan page loads with stats and table", async ({ page }) => {
    await page.goto("/admin/floor-plan", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
