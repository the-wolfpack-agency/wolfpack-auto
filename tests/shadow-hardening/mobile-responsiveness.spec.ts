/**
 * Mobile responsiveness tests — verify no overflow, readable text,
 * and adaptive navigation across viewport sizes.
 */
import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "iPhone (375x812)", width: 375, height: 812 },
  { name: "iPad (768x1024)", width: 768, height: 1024 },
  { name: "Desktop (1280x720)", width: 1280, height: 720 },
] as const;

const PAGES = ["/", "/inventory", "/contact", "/about"];

for (const viewport of VIEWPORTS) {
  test.describe(`Responsive: ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
    });

    for (const path of PAGES) {
      test(`${path} — no horizontal overflow`, async ({ page }) => {
        await page.goto(path, { waitUntil: "domcontentloaded" });

        const overflow = await page.evaluate(() => {
          const body = document.body;
          // Allow 1px tolerance for sub-pixel rounding
          return body.scrollWidth - body.clientWidth;
        });

        expect(overflow).toBeLessThanOrEqual(1);
      });

      test(`${path} — key content is visible (h1, navigation)`, async ({
        page,
      }) => {
        await page.goto(path, { waitUntil: "domcontentloaded" });

        // At least one heading should be visible
        const h1Count = await page.locator("h1").count();
        expect(h1Count).toBeGreaterThanOrEqual(1);

        // Navigation element should exist
        const navCount = await page
          .locator("nav, [role='navigation'], header")
          .count();
        expect(navCount).toBeGreaterThanOrEqual(1);
      });
    }

    test("body font-size is at least 12px", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const fontSize = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.body);
        return parseFloat(styles.fontSize);
      });

      expect(fontSize).toBeGreaterThanOrEqual(12);
    });
  });
}

test.describe("Mobile navigation collapse", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("navigation collapses into hamburger or mobile menu on small viewport", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Look for common mobile menu patterns:
    // - A hamburger button (aria-label, class, or SVG with 3 lines)
    // - A mobile menu toggle
    // - Hidden desktop nav links
    const mobileMenuIndicator = await page.evaluate(() => {
      // Check for hamburger button
      const hamburger = document.querySelector(
        '[aria-label*="menu" i], [aria-label*="Menu" i], ' +
        '[class*="hamburger" i], [class*="mobile-menu" i], ' +
        '[class*="menu-toggle" i], [class*="MobileMenu" i], ' +
        'button[class*="menu" i]'
      );
      if (hamburger) return "hamburger-found";

      // Check if desktop nav links are hidden
      const navLinks = document.querySelectorAll("nav a, header a");
      let hiddenCount = 0;
      navLinks.forEach((link) => {
        const styles = window.getComputedStyle(link);
        if (
          styles.display === "none" ||
          styles.visibility === "hidden" ||
          styles.opacity === "0"
        ) {
          hiddenCount++;
        }
      });
      if (hiddenCount > 2) return "nav-hidden";

      // Check for any button inside header/nav
      const headerButton = document.querySelector(
        "header button, nav button"
      );
      if (headerButton) return "header-button-found";

      return null;
    });

    expect(
      mobileMenuIndicator,
      "Expected a mobile navigation pattern (hamburger, hidden nav links, or header button)"
    ).not.toBeNull();
  });
});
