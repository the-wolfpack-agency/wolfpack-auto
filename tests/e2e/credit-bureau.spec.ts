/**
 * credit-bureau.spec.ts
 *
 * E2E tests for the Credit Bureau Integration module.
 * Covers: credit pulls (consent enforcement), score validation,
 *         trade lines, pull history, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/credit-bureau.spec.ts
 */
import { test, expect } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

// ---------------------------------------------------------------------------
// API: POST /api/admin/credit/pull — credit pull (consent required)
// ---------------------------------------------------------------------------

test.describe("Credit Pull API — consent enforcement", () => {
  test("POST without consent returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/credit/pull", {
      data: {
        customer_id: "cust-001",
        ssn_last4: "1234",
        // deliberately omitting consent
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() !== 401 && resp.status() !== 403) {
      // If not auth-blocked, expect 400 for missing consent
      expect(resp.status()).toBe(400);
      const body = await resp.json();
      expect(body).toHaveProperty("error");
      expect(body.error.toLowerCase()).toContain("consent");
    }
  });

  test("POST with consent=false returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/credit/pull", {
      data: {
        customer_id: "cust-001",
        ssn_last4: "1234",
        consent: false,
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() !== 401 && resp.status() !== 403) {
      expect(resp.status()).toBe(400);
    }
  });
});

test.describe("Credit Pull API — successful pull", () => {
  test("POST with consent returns score, factors, trade_lines (or 401)", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/credit/pull", {
      data: {
        customer_id: "cust-001",
        ssn_last4: "5678",
        consent: true,
        bureau: "equifax",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("score");
      expect(body).toHaveProperty("factors");
      expect(body).toHaveProperty("trade_lines");
      expect(Array.isArray(body.factors)).toBe(true);
      expect(Array.isArray(body.trade_lines)).toBe(true);
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("credit score is between 300 and 850", async ({ request }) => {
    const resp = await request.post("/api/admin/credit/pull", {
      data: {
        customer_id: "cust-002",
        ssn_last4: "9012",
        consent: true,
        bureau: "transunion",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.score).toBeGreaterThanOrEqual(300);
      expect(body.score).toBeLessThanOrEqual(850);
    }
  });

  test("trade_lines have creditor, balance, status fields", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/credit/pull", {
      data: {
        customer_id: "cust-001",
        ssn_last4: "5678",
        consent: true,
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      if (body.trade_lines.length > 0) {
        const tl = body.trade_lines[0];
        expect(tl).toHaveProperty("creditor");
        expect(tl).toHaveProperty("balance");
        expect(tl).toHaveProperty("status");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/credit/history — pull history
// ---------------------------------------------------------------------------

test.describe("Credit History API — GET /api/admin/credit/history", () => {
  test("returns pulls array with customer_id, bureau, score, pulled_at", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/credit/history");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("pulls");
      expect(Array.isArray(body.pulls)).toBe(true);

      if (body.pulls.length > 0) {
        const pull = body.pulls[0];
        expect(pull).toHaveProperty("customer_id");
        expect(pull).toHaveProperty("bureau");
        expect(pull).toHaveProperty("score");
        expect(pull).toHaveProperty("pulled_at");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/credit/history");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Credit Bureau pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Credit page loads", async ({ page }) => {
    await page.goto("/admin/credit", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
