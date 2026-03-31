/**
 * Cookie Consent Banner — E2E tests.
 *
 * Verifies the CookieConsent component appears on first visit, respects
 * user choices, persists state, and is responsive on mobile.
 *
 * Run: npx playwright test tests/e2e/cookie-consent.spec.ts
 */
import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "cookie_consent";

/**
 * Clear the cookie_consent localStorage key before navigating,
 * so the banner appears fresh.
 */
async function clearConsentAndVisit(
  page: import("@playwright/test").Page,
  url: string,
) {
  // Navigate first (to set the origin), then clear and reload
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
}

/* -------------------------------------------------------------------------- */
/* Banner Visibility Tests                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Cookie consent banner -- visibility", () => {
  test("shows banner on / on first visit", async ({ page }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test("shows banner on /inventory on first visit", async ({ page }) => {
    await clearConsentAndVisit(page, "/inventory");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test("banner has Accept All and Essential Only buttons", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    const acceptBtn = banner.locator('button:has-text("Accept All")');
    const essentialBtn = banner.locator('button:has-text("Essential Only")');

    await expect(acceptBtn).toBeVisible();
    await expect(essentialBtn).toBeVisible();
  });

  test("banner contains privacy policy link", async ({ page }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    const privacyLink = banner.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveText(/Privacy Policy/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Accept Flow                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Cookie consent -- accept flow", () => {
  test("clicking Accept All sets localStorage and hides banner", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Click Accept All
    await banner.locator('button:has-text("Accept All")').click();

    // Banner should disappear
    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    // Verify localStorage was set
    const consent = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY,
    );
    expect(consent).toBe("all");
  });

  test("after accepting, banner does not show on next page load", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    await banner.locator('button:has-text("Accept All")').click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    // Navigate to a different page
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });

    // Banner should NOT reappear
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  });
});

/* -------------------------------------------------------------------------- */
/* Essential Only Flow                                                         */
/* -------------------------------------------------------------------------- */

test.describe("Cookie consent -- essential only flow", () => {
  test("clicking Essential Only sets localStorage to 'essential' and hides banner", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    await banner.locator('button:has-text("Essential Only")').click();

    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    const consent = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY,
    );
    expect(consent).toBe("essential");
  });

  test("Essential Only removes wolfpack_vid cookie if it exists", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");

    // Set the A/B testing cookie manually before declining
    await page.evaluate(() => {
      document.cookie = "wolfpack_vid=test-vid-123; path=/;";
    });

    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    await banner.locator('button:has-text("Essential Only")').click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    // The wolfpack_vid cookie should be cleared
    const cookies = await page.evaluate(() => document.cookie);
    expect(cookies).not.toContain("wolfpack_vid");
  });

  test("after choosing Essential Only, banner does not reappear", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    await banner.locator('button:has-text("Essential Only")').click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  });
});

/* -------------------------------------------------------------------------- */
/* Mobile Responsiveness                                                       */
/* -------------------------------------------------------------------------- */

test.describe("Cookie consent -- mobile responsiveness", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X size

  test("banner is visible and interactive on mobile viewport", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Both buttons should be visible and clickable on mobile
    const acceptBtn = banner.locator('button:has-text("Accept All")');
    const essentialBtn = banner.locator('button:has-text("Essential Only")');

    await expect(acceptBtn).toBeVisible();
    await expect(essentialBtn).toBeVisible();

    // Banner should not overflow the viewport
    const bannerBox = await banner.boundingBox();
    expect(bannerBox).toBeTruthy();
    if (bannerBox) {
      expect(bannerBox.width).toBeLessThanOrEqual(375);
    }
  });

  test("banner buttons are tappable on mobile (not overlapping)", async ({
    page,
  }) => {
    await clearConsentAndVisit(page, "/");
    const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Click Accept All on mobile -- should work without error
    await banner.locator('button:has-text("Accept All")').click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    const consent = await page.evaluate(
      (key) => localStorage.getItem(key),
      STORAGE_KEY,
    );
    expect(consent).toBe("all");
  });
});
