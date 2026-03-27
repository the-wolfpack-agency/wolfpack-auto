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
    // Allow analytics scripts to initialize
    await page.waitForTimeout(1500);

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
    await page.waitForTimeout(1500);

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
    await page.waitForTimeout(1000);

    // Click any visible link or button to trigger tracking
    const clickable = page.locator("a[href], button").first();
    if ((await clickable.count()) > 0) {
      await clickable.click({ timeout: 3000 }).catch(() => {
        // Element may navigate away; that is fine
      });
    }

    // Wait for the batch flush interval (5s) plus margin
    await page.waitForTimeout(6000);

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
    // Wait for the batch flush (5s interval)
    await page.waitForTimeout(6000);

    // Navigate to a second page to trigger another page_view
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    expect(
      analyticsPayloads.length,
      "Expected page_view events to fire during navigation"
    ).toBeGreaterThanOrEqual(1);
  });
});
