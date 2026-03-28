/**
 * Review Flow Integration Tests
 *
 * Review management lifecycle: add review -> verify in list ->
 * filter by platform/rating -> fetch response templates ->
 * check analytics -> verify in browser UI.
 */
import { test, expect } from "@playwright/test";
import {
  getAuthCookies,
  assertAnalyticsReachable,
  authGet,
  authPost,
} from "./helpers";

let cookies: string;

test.beforeAll(async ({ request }) => {
  cookies = await getAuthCookies(request);
});

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const REVIEWER_NAME = `E2E Reviewer ${Date.now()}`;

function reviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    platform: "google" as const,
    reviewer_name: REVIEWER_NAME,
    rating: 5,
    text: "Absolutely fantastic experience buying our new SUV! The team was professional, transparent, and made the whole process a breeze. Jake went above and beyond to find exactly what we wanted. Highly recommend Wolfpack Auto to anyone in the market.",
    date: "2026-03-28",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Review Flow", () => {
  let createdReviewId: string;

  test("POST /api/admin/reviews adds a new review", async ({ request }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/reviews",
      reviewPayload(),
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();

    createdReviewId = body.id;
  });

  test("POST /api/admin/reviews with 1-star review", async ({ request }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/reviews",
      reviewPayload({
        reviewer_name: `Unhappy E2E ${Date.now()}`,
        rating: 1,
        platform: "yelp",
        text: "Very disappointed with the service. Waited over two hours for a simple oil change and was charged more than quoted. The front desk was unresponsive when I tried to get an update. Will not be returning.",
      }),
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST /api/admin/reviews rejects missing fields", async ({
    request,
  }) => {
    const res = await authPost(request, cookies, "/api/admin/reviews", {
      platform: "google",
      // Missing reviewer_name, rating, text
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("GET /api/admin/reviews returns reviews list", async ({ request }) => {
    const res = await authGet(request, cookies, "/api/admin/reviews");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.reviews).toBeTruthy();
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(body.reviews.length).toBeGreaterThan(0);

    // Verify review shape
    const review = body.reviews[0];
    expect(review.id).toBeTruthy();
    expect(review.platform).toBeTruthy();
    expect(review.reviewer_name).toBeTruthy();
    expect(typeof review.rating).toBe("number");
    expect(review.rating).toBeGreaterThanOrEqual(1);
    expect(review.rating).toBeLessThanOrEqual(5);
    expect(review.text).toBeTruthy();
  });

  test("GET /api/admin/reviews supports platform filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/reviews?platform=google",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const review of body.reviews) {
      expect(review.platform).toBe("google");
    }
  });

  test("GET /api/admin/reviews supports rating filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/reviews?rating=5",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const review of body.reviews) {
      expect(review.rating).toBe(5);
    }
  });

  test("GET /api/admin/reviews supports responded filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/reviews?responded=false",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const review of body.reviews) {
      expect(review.responded).toBe(false);
    }
  });

  test("GET /api/admin/reviews/templates returns response templates", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/reviews/templates",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.templates).toBeTruthy();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBeGreaterThan(0);

    // Verify template shape
    const tmpl = body.templates[0];
    expect(tmpl.id).toBeTruthy();
    expect(tmpl.name).toBeTruthy();
    expect(tmpl.category).toBeTruthy();
    expect(["positive", "neutral", "recovery"]).toContain(tmpl.category);
    expect(tmpl.text).toBeTruthy();
    // Templates should contain the {reviewer_name} placeholder
    expect(tmpl.text).toContain("{reviewer_name}");
  });

  test("Analytics health responds after review operations", async ({
    request,
  }) => {
    const health = await assertAnalyticsReachable(request, cookies);
    expect(["shadow_mode", "healthy", "degraded", "error"]).toContain(
      health.status,
    );
  });

  test("Unauthenticated review access is rejected", async ({ request }) => {
    const res = await request.get("/api/admin/reviews");
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(200);
  });
});
