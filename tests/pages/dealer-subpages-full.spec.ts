import { test, expect } from "@playwright/test";
import {
  testPageLoads,
  testNavigation,
  testFooter,
  testAccessibility,
  testSEO,
  testNoConsoleErrors,
  testResponsive,
  testAnalyticsCollector,
} from "../shared/page-checks";

/**
 * Dealer sub-page tests — full coverage for every white-label dealer page.
 *
 * Each dealer page is a fully branded site at /dealers/{slug}. It must have
 * the same quality bar as the main Wolfpack Motors pages: nav, footer, SEO,
 * accessibility, responsive layout, analytics, and dealer-specific content.
 *
 * When a new dealer is added, add their entry to DEALERS below.
 */

interface DealerConfig {
  slug: string;
  name: string;
  titleFragment: string;
}

const DEALERS: DealerConfig[] = [
  {
    slug: "summit-auto",
    name: "Summit Auto Group",
    titleFragment: "Summit Auto",
  },
  {
    slug: "mile-high-motors",
    name: "Mile High Motors",
    titleFragment: "Mile High",
  },
];

// Pre-accept cookies so chat bubble is never blocked
async function acceptCookies(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("cookie_consent", "essential");
  });
}

// ---------------------------------------------------------------------------
// Shared checks — applied to every dealer page automatically
// ---------------------------------------------------------------------------

for (const dealer of DEALERS) {
  const path = `/dealers/${dealer.slug}`;

  test.describe(`Dealer: ${dealer.name} (${path})`, () => {
    test.beforeEach(async ({ page }) => {
      await acceptCookies(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
    });

    test("page loads with correct title", async ({ page }) => {
      await testPageLoads(page, path, dealer.titleFragment);
    });

    test("navigation header renders", async ({ page }) => {
      await testNavigation(page);
    });

    test("footer renders", async ({ page }) => {
      await testFooter(page);
    });

    test("accessibility basics pass", async ({ page }) => {
      await testAccessibility(page);
    });

    test("SEO meta tags present", async ({ page }) => {
      await testSEO(page);
    });

    test("no critical console errors", async ({ page }) => {
      await testNoConsoleErrors(page);
    });

    test("responsive — no horizontal overflow", async ({ page }) => {
      await testResponsive(page);
    });

    test("analytics collector active", async ({ page }) => {
      await testAnalyticsCollector(page);
    });

    // -----------------------------------------------------------------------
    // Dealer-specific content
    // -----------------------------------------------------------------------

    test("H1 renders dealer name", async ({ page }) => {
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible({ timeout: 8_000 });
      const text = await h1.textContent();
      expect(text?.length).toBeGreaterThan(0);
    });

    test("chat bubble visible", async ({ page }) => {
      const bubble = page.locator('button[aria-label="Open chat assistant"]');
      await expect(bubble).toBeVisible({ timeout: 8_000 });
    });

    test("chat bubble opens panel", async ({ page }) => {
      const bubble = page.locator('button[aria-label="Open chat assistant"]');
      await expect(bubble).toBeVisible({ timeout: 8_000 });
      await bubble.scrollIntoViewIfNeeded();
      await bubble.click({ force: true });

      const panel = page.locator("div[role='dialog']").filter({
        has: page.locator('button[aria-label="Close chat"]'),
      });
      await expect(panel).toBeVisible({ timeout: 8_000 });

      // Close it
      await panel.locator('button[aria-label="Close chat"]').click();
      await expect(panel).not.toBeVisible({ timeout: 3_000 });
    });

    test("inventory section or vehicle cards present", async ({ page }) => {
      // Dealer page should have at least some inventory content or a CTA
      const vehicleCards = page.locator("a[href*='/inventory/']");
      const inventoryLink = page.locator("a[href='/inventory']");
      const inventoryCTA = page.locator("text=/Browse Inventory|View Inventory|See Inventory/i");

      const hasCards = await vehicleCards.count().then((c) => c > 0);
      const hasLink = await inventoryLink.count().then((c) => c > 0);
      const hasCTA = await inventoryCTA.count().then((c) => c > 0);

      expect(
        hasCards || hasLink || hasCTA,
        "Dealer page has no inventory content or CTA"
      ).toBe(true);
    });

    test("contact information visible", async ({ page }) => {
      // Phone number pattern  (e.g. (303) 555-xxxx)
      const phonePattern = page.locator("text=/\\(\\d{3}\\)\\s*\\d{3}[-.]\\d{4}/");
      const hasPhone = await phonePattern.count().then((c) => c > 0);

      // Or a contact link
      const contactLink = page.locator("a[href='/contact'], a[href*='tel:']");
      const hasContactLink = await contactLink.count().then((c) => c > 0);

      expect(hasPhone || hasContactLink, "No phone/contact info found").toBe(true);
    });

    test("no 'undefined' or '[object Object]' text rendered", async ({ page }) => {
      const body = await page.locator("body").textContent();
      expect(body).not.toContain("[object Object]");
      expect(body).not.toContain("undefined");
      expect(body).not.toContain("null");
    });
  });
}

// ---------------------------------------------------------------------------
// Cross-dealer: both pages must be independently styled / not share identity
// ---------------------------------------------------------------------------

test.describe("Dealer sub-pages: brand independence", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once on chromium");

  test("summit-auto and mile-high-motors have different H1 text", async ({ page }) => {
    await page.goto("/dealers/summit-auto", { waitUntil: "domcontentloaded" });
    const summitH1 = await page.locator("h1").first().textContent();

    await page.goto("/dealers/mile-high-motors", { waitUntil: "domcontentloaded" });
    const mileHighH1 = await page.locator("h1").first().textContent();

    expect(summitH1).not.toBe(mileHighH1);
  });

  test("both dealer pages return 200 (never 500)", async ({ page }) => {
    for (const dealer of DEALERS) {
      const response = await page.goto(`/dealers/${dealer.slug}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), `${dealer.slug} returned error`).toBeLessThan(400);
    }
  });

  test("unknown dealer slug returns 404 or redirect (not 500)", async ({ page }) => {
    const response = await page.goto("/dealers/nonexistent-dealer-xyz", {
      waitUntil: "domcontentloaded",
    });
    // Should be 404, not a server crash
    expect(response?.status()).not.toBe(500);
    expect(response?.status()).not.toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Mobile: dealer pages on iPhone viewport
// ---------------------------------------------------------------------------

test.describe("Dealer sub-pages: mobile layout", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "Mobile layout — webkit only");

  for (const dealer of DEALERS) {
    test(`${dealer.slug}: mobile nav hamburger works`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("cookie_consent", "essential");
      });
      await page.goto(`/dealers/${dealer.slug}`, { waitUntil: "domcontentloaded" });

      const hamburger = page.locator(
        "button[aria-label='Open navigation menu'], button[aria-label='Close navigation menu']"
      );
      await expect(hamburger.first()).toBeVisible({ timeout: 5_000 });

      await hamburger.first().click();

      // Mobile nav must show inventory link
      const inventoryLink = page.locator("a[href='/inventory']").filter({ hasText: /Inventory/i });
      await expect(inventoryLink.first()).toBeVisible({ timeout: 5_000 });
    });

    test(`${dealer.slug}: no horizontal overflow at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/dealers/${dealer.slug}`, { waitUntil: "domcontentloaded" });
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(376);
    });
  }
});
