/**
 * Public Page Render Verification
 *
 * Every customer-facing page must render visible content.
 * These are the pages Hoxsie's customers will see — a white screen here
 * means lost leads and lost trust.
 *
 * Verifies:
 *   1. HTTP 200
 *   2. Page has visible text (not blank)
 *   3. No uncaught JS errors in console
 */

import { test, expect } from "@playwright/test";

const PUBLIC_PAGES = [
  { path: "/", name: "Homepage" },
  { path: "/about", name: "About" },
  { path: "/contact", name: "Contact" },
  { path: "/financing", name: "Financing" },
  { path: "/inventory", name: "Inventory" },
  { path: "/trade-in", name: "Trade-In" },
  { path: "/service-booking", name: "Service Booking" },
  { path: "/walkaround", name: "Walkaround" },
  { path: "/privacy", name: "Privacy" },
  { path: "/terms", name: "Terms" },
  { path: "/accessibility", name: "Accessibility" },
];

test.describe("Public Pages — every page must render for customers", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) renders without errors`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => {
        jsErrors.push(err.message);
      });

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });

      // Must return 200
      expect(
        response?.status(),
        `${path} returned ${response?.status()}`,
      ).toBe(200);

      // Must have visible content
      const bodyText = await page.locator("body").innerText();
      expect(
        bodyText.trim().length,
        `${path} rendered a blank page`,
      ).toBeGreaterThan(10);

      // No uncaught JS errors
      expect(
        jsErrors,
        `${path} has JS errors: ${jsErrors.join("; ")}`,
      ).toHaveLength(0);
    });
  }
});
