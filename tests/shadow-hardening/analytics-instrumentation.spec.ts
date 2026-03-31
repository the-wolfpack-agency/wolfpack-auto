/**
 * Analytics instrumentation tests — verify session/fingerprint storage,
 * tracking requests, and page_view event firing.
 *
 * The EventCollector stores:
 *  - sessionStorage "wolfpack_analytics_session"  (value starts with "s_")
 *  - localStorage   "wolfpack_analytics_fp"       (value starts with "fp_")
 *  - sessionStorage "wolfpack_interaction_chain"
 *  - sessionStorage "wolfpack_price_trajectory"
 *  - localStorage   "wolfpack_visit_history"
 *  - localStorage   "wolfpack_buyer_lifecycle"
 *
 * Events are batched and flushed to POST /api/analytics/events.
 */
import { test, expect } from "@playwright/test";

test.describe("Analytics instrumentation", () => {
  test("page navigation sets sessionStorage session key", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Wait for analytics scripts to initialize and set the session key
    await page.waitForFunction(
      () => sessionStorage.getItem("wolfpack_analytics_session") !== null,
      { timeout: 10_000 }
    );

    const sessionValue = await page.evaluate(() => {
      return sessionStorage.getItem("wolfpack_analytics_session");
    });

    expect(
      sessionValue,
      'Expected sessionStorage key "wolfpack_analytics_session" to be set'
    ).toBeTruthy();
    expect(
      sessionValue!.startsWith("s_"),
      'Expected session value to start with "s_"'
    ).toBe(true);
  });

  test("page navigation sets localStorage fingerprint key", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Wait for analytics scripts to initialize and set the fingerprint key
    await page.waitForFunction(
      () => localStorage.getItem("wolfpack_analytics_fp") !== null,
      { timeout: 10_000 }
    );

    const fpValue = await page.evaluate(() => {
      return localStorage.getItem("wolfpack_analytics_fp");
    });

    expect(
      fpValue,
      'Expected localStorage key "wolfpack_analytics_fp" to be set'
    ).toBeTruthy();
    expect(
      fpValue!.startsWith("fp_"),
      'Expected fingerprint value to start with "fp_"'
    ).toBe(true);
  });

  test("clicking elements generates tracking requests to /api/analytics/events", async ({
    page,
  }) => {
    const analyticsRequests: string[] = [];

    await page.route("**/api/analytics/events**", async (route) => {
      analyticsRequests.push(route.request().url());
      // Let the request continue so the app behaves normally
      await route.continue();
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Set up a promise to wait for the analytics batch request
    const analyticsRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/analytics/events"),
      { timeout: 15_000 }
    );

    // Click any visible link or button to trigger tracking
    const clickable = page.locator("a[href], button").first();
    if ((await clickable.count()) > 0) {
      await clickable.click({ timeout: 3000 }).catch(() => {
        // Element may navigate away; that is fine
      });
    }

    // Wait for the batch flush to fire the analytics request
    await analyticsRequestPromise;

    expect(
      analyticsRequests.length,
      "Expected at least one /api/analytics/events request after user interaction"
    ).toBeGreaterThanOrEqual(1);
  });

  test("page_view events fire on navigation", async ({ page }) => {
    const analyticsPayloads: string[] = [];

    // Intercept analytics batch calls and look for page_view in the body
    await page.route("**/api/analytics/events**", async (route) => {
      const request = route.request();
      const body = request.postData() || "";
      if (body.includes("page_view")) {
        analyticsPayloads.push(body);
      }
      await route.continue();
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Wait for the first batch flush containing page_view
    await page.waitForRequest(
      (req) => req.url().includes("/api/analytics/events") && (req.postData() || "").includes("page_view"),
      { timeout: 15_000 }
    ).catch(() => {
      // First page may not flush before navigation; continue
    });

    // Navigate to a second page to trigger another page_view
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    // Wait for the batch flush containing page_view from second navigation
    await page.waitForRequest(
      (req) => req.url().includes("/api/analytics/events"),
      { timeout: 15_000 }
    );

    expect(
      analyticsPayloads.length,
      "Expected page_view events to fire during navigation"
    ).toBeGreaterThanOrEqual(1);
  });
});
