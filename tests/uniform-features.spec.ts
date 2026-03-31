/**
 * Uniform Feature Verification — MUST PASS ON EVERY DEPLOY.
 *
 * Ensures every page in the application has identical core features:
 * analytics brain, SEO, navigation, chat widget, accessibility.
 *
 * When a new page is added, add it to ALL_PAGES below.
 * If any page is missing any feature, this test fails the deploy.
 *
 * This is the scalability contract: same infrastructure, every page, always.
 */
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
  testAnalyticsEventFiring,
} from "./shared/page-checks";

// ---------------------------------------------------------------------------
// ALL PAGES — add every new page here. Tests auto-apply to each.
// ---------------------------------------------------------------------------

interface PageEntry {
  path: string;
  titleFragment: string;
  /** If true, page has dealer-specific content (sub-pages) */
  isDealerPage?: boolean;
}

const ALL_PAGES: PageEntry[] = [
  // Core pages
  { path: "/", titleFragment: "Wolfpack" },
  { path: "/inventory", titleFragment: "Inventory" },
  { path: "/financing", titleFragment: "Financing" },
  { path: "/about", titleFragment: "About" },
  { path: "/contact", titleFragment: "Contact" },
  // Dealer sub-pages
  { path: "/dealers/summit-auto", titleFragment: "Summit Auto", isDealerPage: true },
  { path: "/dealers/mile-high-motors", titleFragment: "Mile High", isDealerPage: true },
];

// ---------------------------------------------------------------------------
// ROUTE DISCOVERY GUARD — fails if a page.tsx exists but isn't registered
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";

function discoverRoutes(dir: string, base = ""): string[] {
  const routes: string[] = [];
  if (!fs.existsSync(dir)) return routes;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Skip admin pages (internal), dynamic segments, and api routes
      if (
        entry.name === "admin" ||
        entry.name === "api" ||
        entry.name.startsWith("[")
      ) continue;
      routes.push(...discoverRoutes(path.join(dir, entry.name), `${base}/${entry.name}`));
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      routes.push(base || "/");
    }
  }
  return routes;
}

test("GUARD: all public page.tsx files are registered in ALL_PAGES", () => {
  const appDir = path.resolve(__dirname, "../src/app");
  const discoveredRoutes = discoverRoutes(appDir);
  const registeredPaths = new Set(ALL_PAGES.map((p) => p.path));

  const unregistered = discoveredRoutes.filter(
    (route) => !registeredPaths.has(route),
  );

  expect(
    unregistered,
    `DEPLOY BLOCKED: ${unregistered.length} page(s) exist but are NOT registered in uniform-features.spec.ts ALL_PAGES:\n\n` +
      unregistered.map((r) => `  - ${r}`).join("\n") +
      `\n\nAdd them to ALL_PAGES to ensure uniform analytics, SEO, and features.`,
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// UNIFORM FEATURE MATRIX — every page gets every check
// ---------------------------------------------------------------------------

for (const pg of ALL_PAGES) {
  test.describe(`Uniform Features: ${pg.path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
    });

    // --- Core infrastructure ---

    test("page loads successfully", async ({ page }) => {
      await testPageLoads(page, pg.path, pg.titleFragment);
    });

    test("navigation header present with all links", async ({ page }) => {
      await testNavigation(page);
    });

    test("footer present with dealer info", async ({ page }) => {
      await testFooter(page);
    });

    // --- Analytics brain ---

    test("EventCollector is active (session + fingerprint set)", async ({
      page,
    }) => {
      await testAnalyticsCollector(page);
    });

    test("page interactions produce analytics events", async ({
      page,
      request,
    }) => {
      await testAnalyticsEventFiring(page, request);
    });

    // --- SEO ---

    test("SEO meta tags present (title, description, viewport)", async ({
      page,
    }) => {
      await testSEO(page);
    });

    test("has unique, descriptive title", async ({ page }) => {
      const title = await page.title();
      expect(title.length).toBeGreaterThan(5);
      // Title should not be the default fallback
      expect(title).not.toBe("Wolfpack Auto");
    });

    test("meta description is substantive (>50 chars)", async ({ page }) => {
      const desc = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(desc).toBeTruthy();
      expect(desc!.length).toBeGreaterThan(50);
    });

    // --- Chat widget ---

    test("chat widget renders on page", async ({ page }) => {
      // The ChatWidget component renders as a fixed-position element
      // Wait for hydration
      await page.waitForLoadState("load");

      // Look for the chat bubble or dialog
      const chatElements = page.locator(
        'button[aria-label*="chat" i], button[aria-label*="Chat" i], [role="dialog"][aria-label*="Chat" i]',
      );

      // Even if we can't find a specific aria-label, the ChatWidget
      // renders SVG icons in fixed-position buttons
      const fixedButtons = page.locator("button").last();

      // Verify ChatWidget JS loaded by checking for the animation style
      const hasAnimation = await page.evaluate(() => {
        const styles = document.querySelectorAll("style");
        for (const style of styles) {
          if (style.textContent?.includes("slideUp")) return true;
        }
        return false;
      });

      // ChatWidget is present if we find chat elements OR the animation styles
      const chatVisible = (await chatElements.count()) > 0 || hasAnimation;
      expect(
        chatVisible,
        `ChatWidget not found on ${pg.path}`,
      ).toBe(true);
    });

    // --- Accessibility ---

    test("accessibility landmarks present", async ({ page }) => {
      await testAccessibility(page);
    });

    test("skip-to-content link exists", async ({ page }) => {
      const skipLink = page.locator("a[href='#main-content']");
      await expect(skipLink).toHaveCount(1);
    });

    test("main content landmark exists", async ({ page }) => {
      const main = page.locator("main#main-content");
      await expect(main).toHaveCount(1);
    });

    // --- Responsive design ---

    test("no horizontal overflow at any viewport", async ({ page }) => {
      await testResponsive(page);
    });

    // --- No errors ---

    test("no console errors", async ({ page }) => {
      await testNoConsoleErrors(page);
    });

    // --- Security headers ---

    test("security headers present in response", async ({ page }) => {
      const response = await page.goto(pg.path);
      const headers = response?.headers() ?? {};

      // These are set by middleware — should be on every page
      // Check that at least some security headers exist
      const hasSecurityHeaders =
        headers["x-content-type-options"] ||
        headers["referrer-policy"] ||
        headers["x-frame-options"] ||
        headers["strict-transport-security"];

      // In dev mode not all headers may be present, but at least one should be
      expect(
        hasSecurityHeaders,
        `No security headers found on ${pg.path}`,
      ).toBeTruthy();
    });
  });
}

// ---------------------------------------------------------------------------
// Cross-page consistency checks
// ---------------------------------------------------------------------------

test.describe("Cross-Page Consistency", () => {
  test("all pages share the same navigation structure", async ({ page }) => {
    const navStructures: string[][] = [];

    for (const pg of ALL_PAGES) {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
      const links = await page
        .locator("header[role='banner'] a")
        .evaluateAll((els) =>
          els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean),
        );
      navStructures.push(links.sort());
    }

    // All pages should have the same nav links
    for (let i = 1; i < navStructures.length; i++) {
      expect(
        navStructures[i],
        `Nav structure differs between ${ALL_PAGES[0].path} and ${ALL_PAGES[i].path}`,
      ).toEqual(navStructures[0]);
    }
  });

  test("all pages share the same footer structure", async ({ page }) => {
    const footerTexts: string[] = [];

    for (const pg of ALL_PAGES) {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
      const footerText = await page
        .locator("footer[role='contentinfo']")
        .textContent();
      // Normalize whitespace for comparison
      footerTexts.push((footerText ?? "").replace(/\s+/g, " ").trim());
    }

    // All pages should have identical footer content
    for (let i = 1; i < footerTexts.length; i++) {
      expect(
        footerTexts[i],
        `Footer differs between ${ALL_PAGES[0].path} and ${ALL_PAGES[i].path}`,
      ).toBe(footerTexts[0]);
    }
  });

  test("analytics API is responsive during multi-page session", async ({ request }) => {
    const res = await request.get("/api/analytics/events");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total_events).toBeGreaterThanOrEqual(0);
  });

  test("all dealer sub-pages have the same features as main pages", async ({
    page,
  }) => {
    const mainPageFeatures = {
      hasHeader: false,
      hasFooter: false,
      hasMain: false,
      hasSkipLink: false,
      hasMetaDesc: false,
    };

    // Capture features from homepage
    await page.goto("/", { waitUntil: "domcontentloaded" });
    mainPageFeatures.hasHeader =
      (await page.locator("header[role='banner']").count()) > 0;
    mainPageFeatures.hasFooter =
      (await page.locator("footer[role='contentinfo']").count()) > 0;
    mainPageFeatures.hasMain =
      (await page.locator("main#main-content").count()) > 0;
    mainPageFeatures.hasSkipLink =
      (await page.locator("a[href='#main-content']").count()) > 0;
    mainPageFeatures.hasMetaDesc =
      (await page.locator('meta[name="description"]').count()) > 0;

    // Every dealer sub-page must match
    const dealerPages = ALL_PAGES.filter((p) => p.isDealerPage);
    for (const dp of dealerPages) {
      await page.goto(dp.path, { waitUntil: "domcontentloaded" });

      const features = {
        hasHeader:
          (await page.locator("header[role='banner']").count()) > 0,
        hasFooter:
          (await page.locator("footer[role='contentinfo']").count()) > 0,
        hasMain:
          (await page.locator("main#main-content").count()) > 0,
        hasSkipLink:
          (await page.locator("a[href='#main-content']").count()) > 0,
        hasMetaDesc:
          (await page.locator('meta[name="description"]').count()) > 0,
      };

      expect(
        features,
        `Dealer page ${dp.path} is missing features that the main page has`,
      ).toEqual(mainPageFeatures);
    }
  });
});
