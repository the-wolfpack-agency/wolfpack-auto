/**
 * Smoke test suite — runs ALL shared checks across ALL pages.
 *
 * To add a new page, just append it to the PAGES array below.
 * All modular checks from page-checks.ts will automatically apply.
 */
import { test, expect } from "@playwright/test";
import {
  testPageLoads,
  testNavigation,
  testFooter,
  testAccessibility,
  testSEO,
  testNoConsoleErrors,
  testImagesLoad,
  testResponsive,
  testAnalyticsCollector,
} from "./shared/page-checks";

// ---------------------------------------------------------------------------
// All pages in the application. Add new pages here for automatic coverage.
// ---------------------------------------------------------------------------

interface PageConfig {
  path: string;
  titleFragment: string;
}

const PAGES: PageConfig[] = [
  { path: "/", titleFragment: "Wolfpack" },
  { path: "/inventory", titleFragment: "Inventory" },
  { path: "/inventory/1HGCV1F34PA000001", titleFragment: "Honda" },
  { path: "/financing", titleFragment: "Financing" },
  { path: "/trade-in", titleFragment: "Trade" },
  { path: "/about", titleFragment: "About" },
  { path: "/contact", titleFragment: "Contact" },
  // Dealer sub-pages — must have ALL the same features as main pages
  { path: "/dealers/summit-auto", titleFragment: "Summit Auto" },
  { path: "/dealers/mile-high-motors", titleFragment: "Mile High" },
];

// ---------------------------------------------------------------------------
// Smoke tests — every page gets every shared check
// ---------------------------------------------------------------------------

for (const pg of PAGES) {
  test.describe(`Smoke: ${pg.path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
    });

    test("page loads with correct title", async ({ page }) => {
      await testPageLoads(page, pg.path, pg.titleFragment);
    });

    test("navigation present", async ({ page }) => {
      await testNavigation(page);
    });

    test("footer present", async ({ page }) => {
      await testFooter(page);
    });

    test("accessibility basics", async ({ page }) => {
      await testAccessibility(page);
    });

    test("SEO meta tags", async ({ page }) => {
      await testSEO(page);
    });

    test("no console errors", async ({ page }) => {
      await testNoConsoleErrors(page);
    });

    test("responsive layout", async ({ page }) => {
      await testResponsive(page);
    });

    test("analytics collector active", async ({ page }) => {
      await testAnalyticsCollector(page);
    });
  });
}

// ---------------------------------------------------------------------------
// Cross-page navigation smoke test
// ---------------------------------------------------------------------------

test("navigate through all pages sequentially", async ({ page }) => {
  for (const pg of PAGES) {
    await page.goto(pg.path, { waitUntil: "domcontentloaded" });
    const response = await page.goto(pg.path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(new RegExp(pg.titleFragment, "i"));
  }
});

// ---------------------------------------------------------------------------
// 404 handling
// ---------------------------------------------------------------------------

test("non-existent page returns 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(404);
});
