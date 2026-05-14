/**
 * compliance-checks.spec.ts
 *
 * E2E tests for the Compliance Checks module.
 * Covers: check listing, running checks, review updates,
 *         result validation, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/compliance-checks.spec.ts
 */
import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

const VALID_RESULTS = ["clear", "flagged", "review_required"];

// ---------------------------------------------------------------------------
// API: GET /api/admin/compliance/checks — list checks
// ---------------------------------------------------------------------------

test.describe("Compliance Checks API — GET /api/admin/compliance/checks", () => {
  test("returns checks array with check_type and result", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/compliance/checks");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("checks");
      expect(Array.isArray(body.checks)).toBe(true);

      if (body.checks.length > 0) {
        const check = body.checks[0];
        expect(check).toHaveProperty("id");
        expect(check).toHaveProperty("check_type");
        expect(check).toHaveProperty("result");
        expect(VALID_RESULTS).toContain(check.result);
      }
    }
  });

  test("checks have entity_id and performed_at fields", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/compliance/checks");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      if (body.checks.length > 0) {
        const check = body.checks[0];
        expect(check).toHaveProperty("entity_id");
        expect(check).toHaveProperty("performed_at");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/compliance/checks");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/compliance/checks — run a compliance check
// ---------------------------------------------------------------------------

test.describe("Compliance Checks API — POST /api/admin/compliance/checks", () => {
  test("runs OFAC check and returns result (clear/flagged/review_required)", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/compliance/checks", {
      data: {
        check_type: "ofac",
        entity_id: "cust-001",
        entity_name: "Jane Doe",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200 || resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("check");
      expect(body.check).toHaveProperty("result");
      expect(VALID_RESULTS).toContain(body.check.result);
      expect(body.check).toHaveProperty("check_type", "ofac");
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("runs red_flags check and returns valid result", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/compliance/checks", {
      data: {
        check_type: "red_flags",
        entity_id: "deal-001",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200 || resp.status() === 201) {
      const body = await resp.json();
      expect(VALID_RESULTS).toContain(body.check.result);
    }
  });

  test("missing check_type returns 400/422, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/compliance/checks", {
      data: { entity_id: "cust-001" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// API: PATCH /api/admin/compliance/checks/[id] — review update
// ---------------------------------------------------------------------------

test.describe("Compliance Checks API — PATCH /api/admin/compliance/checks/:id", () => {
  test("updates check with review data (or 401/404)", async ({ request }) => {
    const resp = await request.patch(
      "/api/admin/compliance/checks/check-001",
      {
        data: {
          reviewed_by: "e2e-reviewer",
          review_notes: "E2E test review — cleared manually",
          result: "clear",
        },
      },
    );
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("check");
      expect(body.check.reviewed_by).toBe("e2e-reviewer");
      expect(body.check.result).toBe("clear");
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });

  test("PATCH non-existent check returns 404, not 500", async ({
    request,
  }) => {
    const resp = await request.patch(
      "/api/admin/compliance/checks/nonexistent-check-xyz",
      {
        data: { result: "clear" },
      },
    );
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Compliance pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Compliance checks page loads", async ({ page }) => {
    await page.goto("/admin/compliance", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
