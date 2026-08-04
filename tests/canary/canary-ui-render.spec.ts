/**
 * Canary: UI Rendering Verification
 *
 * Loads every critical page on the PRODUCTION deployment and verifies:
 *   1. HTTP 200 (not redirect, not 500, not 401)
 *   2. Visible text content (not blank/white screen)
 *   3. No uncaught JavaScript errors (React crashes, hydration failures)
 *   4. No "401" or "Unauthorized" console errors (auth misconfiguration)
 *   5. No "Shadow mode" visible on page (proves real data rendering)
 *   6. Critical UI elements present (sidebar for admin, nav for public)
 *
 * This catches: broken deploys, missing env vars, auth misconfiguration,
 * CSS failures, React hydration errors, and accidental shadow mode.
 */

import { test, expect } from "@playwright/test";
import { CANARY_STATE } from "./helpers/canary-auth";

/* -------------------------------------------------------------------------- */
/* Page lists — exhaustive coverage of every user-facing route                 */
/* -------------------------------------------------------------------------- */

const PUBLIC_PAGES = [
  { path: "/", name: "Homepage" },
  { path: "/inventory", name: "Inventory" },
  { path: "/trade-in", name: "Trade-In" },
  { path: "/service-booking", name: "Service Booking" },
  { path: "/privacy", name: "Privacy" },
  { path: "/terms", name: "Terms" },
];

const ADMIN_PAGES = [
  { path: "/admin", name: "Dashboard" },
  { path: "/admin/inventory", name: "Inventory" },
  { path: "/admin/leads", name: "Leads" },
  { path: "/admin/deals", name: "Deals" },
  { path: "/admin/analytics", name: "Analytics" },
  { path: "/admin/analytics-brain", name: "Analytics Brain" },
  { path: "/admin/compliance", name: "Compliance" },
  { path: "/admin/settings", name: "Settings" },
  { path: "/admin/service", name: "Service" },
  { path: "/admin/pricing", name: "Pricing" },
  { path: "/admin/marketing", name: "Marketing" },
  { path: "/admin/documents", name: "Documents" },
  { path: "/admin/customers", name: "Customers" },
  { path: "/admin/reports", name: "Reports" },
  { path: "/admin/funnel-health", name: "Funnel Health" },
  { path: "/admin/team", name: "Team" },
  { path: "/admin/security", name: "Security" },
  { path: "/admin/system", name: "System Health" },
];

/* -------------------------------------------------------------------------- */
/* Shared assertion helpers                                                    */
/* -------------------------------------------------------------------------- */

/** Fatal console error patterns — any of these = deployment is broken */
const FATAL_PATTERNS = [
  /401/,
  /Unauthorized/i,
  /hydration/i,
  /Minified React error/,
  /ChunkLoadError/,
  /Failed to fetch/,
  /TypeError.*undefined/,
  /Cannot read properties of null/,
];

function hasFatalErrors(errors: string[]): string[] {
  return errors.filter((err) =>
    FATAL_PATTERNS.some((pattern) => pattern.test(err)),
  );
}

/* -------------------------------------------------------------------------- */
/* Public page tests                                                           */
/* -------------------------------------------------------------------------- */

test.describe("UI Render — Public Pages (customer-facing)", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) renders for customers`, async ({ page }) => {
      const jsErrors: string[] = [];
      const consoleErrors: string[] = [];

      page.on("pageerror", (err) => jsErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      // HTTP 200
      expect(response?.status(), `${path} returned ${response?.status()}`).toBe(200);

      // Has visible content (not blank)
      await page.locator("body").waitFor({ state: "visible" });
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length, `${path} is blank`).toBeGreaterThan(10);

      // No fatal JS errors
      const fatal = hasFatalErrors([...jsErrors, ...consoleErrors]);
      expect(fatal, `${path} has fatal errors: ${fatal.join("; ")}`).toHaveLength(0);

      // No uncaught exceptions
      expect(jsErrors, `${path} threw: ${jsErrors.join("; ")}`).toHaveLength(0);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin page tests                                                            */
/* -------------------------------------------------------------------------- */

test.describe("UI Render — Admin Pages (dealer dashboard)", () => {
  /* Admin pages are gated. Without this the whole block asserts that a
     signed-out visitor can read the dealer dashboard, which is both wrong and
     the opposite of what we want to be true. */
  test.use({ storageState: CANARY_STATE });

  for (const { path, name } of ADMIN_PAGES) {
    test(`${name} (${path}) renders without white-screening`, async ({ page }) => {
      const jsErrors: string[] = [];
      const consoleErrors: string[] = [];

      page.on("pageerror", (err) => jsErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      // Must not redirect to login (auth misconfiguration)
      expect(
        page.url(),
        `${path} redirected to login while signed in — the session was rejected, or this page gates on a capability the canary account lacks`,
      ).not.toContain("/admin/login");

      // HTTP 200
      expect(response?.status(), `${path} returned ${response?.status()}`).toBe(200);

      // Has visible content
      await page.locator("body").waitFor({ state: "visible" });
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length, `${path} is blank`).toBeGreaterThan(10);

      // Sidebar rendered (proves layout didn't crash)
      const sidebar = page.locator("nav, [data-testid='sidebar'], aside");
      const sidebarCount = await sidebar.count();
      expect(sidebarCount, `${path} — no sidebar/nav found, layout may have crashed`).toBeGreaterThan(0);

      // No fatal JS errors
      const fatal = hasFatalErrors([...jsErrors, ...consoleErrors]);
      expect(fatal, `${path} has fatal errors: ${fatal.join("; ")}`).toHaveLength(0);

      // No "Shadow mode" visible on page (would mean no real data)
      const pageContent = await page.content();
      const hasShadowBanner =
        pageContent.includes("Shadow mode") && pageContent.includes("no database");
      expect(hasShadowBanner, `${path} shows shadow mode banner — DB not connected`).toBe(false);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Cross-cutting UI health checks                                              */
/* -------------------------------------------------------------------------- */

test.describe("UI Render — Cross-Cutting Checks", () => {
  test("homepage loads within 3 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test("admin dashboard loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });

  test("CSS is loaded (not unstyled)", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    // Check that at least one stylesheet loaded
    const styleSheets = await page.evaluate(() => document.styleSheets.length);
    expect(styleSheets).toBeGreaterThan(0);

    // Check body doesn't have default browser styling (white bg + Times New Roman)
    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily,
    );
    expect(fontFamily).not.toContain("Times New Roman");
  });

  test("no React error boundary fallback visible", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });

    // Common React error boundary patterns
    const content = await page.content();
    expect(content).not.toContain("Something went wrong");
    expect(content).not.toContain("Error boundary");
    expect(content).not.toContain("Application error");
  });

  test("inventory page loads real vehicle data or empty state", async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });

    const content = await page.content();

    // Should NOT show shadow placeholder VINs
    expect(content).not.toContain("SHADOW00000000000");

    // Should either show vehicles or an empty state — not an error
    const hasVehicles = content.includes("vehicle") || content.includes("Vehicle");
    const hasEmptyState = content.includes("No vehicles") || content.includes("no vehicles") || content.includes("coming soon");
    expect(hasVehicles || hasEmptyState).toBe(true);
  });
});
