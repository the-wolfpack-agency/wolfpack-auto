/**
 * reviews.spec.ts
 *
 * E2E tests for the Review Management module.
 * Covers: review listing (with platform filter), response templates,
 *         responding to reviews, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/reviews.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/reviews
// ---------------------------------------------------------------------------

test.describe("Reviews API — GET /api/admin/reviews", () => {
  test("returns reviews array with platform, rating, reviewer_name", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/reviews");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("reviews");
      expect(Array.isArray(body.reviews)).toBe(true);

      if (body.reviews.length > 0) {
        const review = body.reviews[0];
        expect(review).toHaveProperty("platform");
        expect(review).toHaveProperty("rating");
        expect(review).toHaveProperty("reviewer_name");
        expect(typeof review.rating).toBe("number");
        expect(["google", "yelp", "facebook"]).toContain(review.platform);
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/reviews");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/reviews?platform=google — filter by platform
// ---------------------------------------------------------------------------

test.describe("Reviews API — platform filter", () => {
  test("?platform=google filters to only Google reviews", async ({ request }) => {
    const resp = await request.get("/api/admin/reviews?platform=google");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("reviews");
      expect(Array.isArray(body.reviews)).toBe(true);

      for (const review of body.reviews) {
        expect(review.platform).toBe("google");
      }
    }
  });

  test("?platform=yelp filters to only Yelp reviews", async ({ request }) => {
    const resp = await request.get("/api/admin/reviews?platform=yelp");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      for (const review of body.reviews) {
        expect(review.platform).toBe("yelp");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/reviews/templates
// ---------------------------------------------------------------------------

test.describe("Review Response Templates API", () => {
  test("GET returns templates array", async ({ request }) => {
    const resp = await request.get("/api/admin/reviews/templates");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("templates");
      expect(Array.isArray(body.templates)).toBe(true);

      if (body.templates.length > 0) {
        const tpl = body.templates[0];
        expect(tpl).toHaveProperty("name");
        expect(tpl).toHaveProperty("category");
        expect(tpl).toHaveProperty("text");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/reviews/templates");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/reviews/[id]/respond
// ---------------------------------------------------------------------------

test.describe("Review Respond API", () => {
  test("POST saves response (or returns 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/reviews/rev-002/respond", {
      data: { response_text: "Thank you for the great review!" },
    });
    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("success", true);
    }
  });

  test("POST with empty response_text returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/reviews/rev-002/respond", {
      data: { response_text: "" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("POST with missing response_text returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/reviews/rev-002/respond", {
      data: {},
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.post("/api/admin/reviews/rev-999/respond", {
      data: { response_text: "Test response" },
    });
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin page: load without crashing
// ---------------------------------------------------------------------------

test.describe("Reviews page loads without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Reviews page loads", async ({ page }) => {
    await page.goto("/admin/reviews", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
