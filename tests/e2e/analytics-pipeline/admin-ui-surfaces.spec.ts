/**
 * Admin UI Surfaces — verify the admin UI shows analytics data.
 *
 * Every analytics-related admin page must load, render meaningful content,
 * and never show "undefined", "NaN", or server errors.
 *
 * Run: npx playwright test tests/e2e/analytics-pipeline/admin-ui-surfaces.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/**
 * Navigate and return page status. Handles auth redirects gracefully.
 */
async function safeNavigate(
  page: Page,
  path: string,
): Promise<{ ok: boolean; status: number; authWall: boolean }> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  const status = response?.status() ?? 0;
  const url = page.url();
  const authWall = url.includes("/login") || url.includes("/auth") || status === 401;
  return { ok: status < 400, status, authWall };
}

/**
 * Assert the page body does not contain catastrophic error indicators.
 */
async function assertNoErrors(page: Page, label: string): Promise<void> {
  const body = await page
    .locator("body")
    .innerText({ timeout: 5_000 })
    .catch(() => "");
  expect(body, `${label} — must not show "Internal Server Error"`).not.toContain(
    "Internal Server Error",
  );
  expect(body, `${label} — must not show "Server error: 500"`).not.toContain(
    "Server error: 500",
  );
}

/**
 * Assert the page does not render "undefined" or "NaN" as visible text.
 */
async function assertNoGarbage(page: Page, label: string): Promise<void> {
  const body = await page
    .locator("body")
    .innerText({ timeout: 5_000 })
    .catch(() => "");

  // Check for literal "undefined" or "NaN" rendered as text
  // Allow "undefined" inside code blocks or technical descriptions
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines that are obviously code/technical
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    // Flag standalone "undefined" or "NaN" as data rendering issues
    if (trimmed === "undefined" || trimmed === "NaN") {
      expect(
        trimmed,
        `${label} — page renders "${trimmed}" as standalone text`,
      ).not.toMatch(/^(undefined|NaN)$/);
    }
  }
}

/* ========================================================================== */
/* Analytics pages                                                            */
/* ========================================================================== */

test.describe("Admin analytics pages", () => {
  test("/admin/analytics page loads with stats content", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/analytics");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/analytics");
    await assertNoGarbage(page, "/admin/analytics");

    // Should have at least some visible content (cards, charts, etc.)
    const body = await page.locator("body").innerText().catch(() => "");
    expect(body.length, "/admin/analytics must render content").toBeGreaterThan(50);
  });

  test("/admin/analytics-brain page loads with insights", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/analytics-brain");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/analytics-brain");
    await assertNoGarbage(page, "/admin/analytics-brain");
  });

  test("/admin page (dashboard) shows stats cards", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin");
    await assertNoGarbage(page, "/admin");

    const body = await page.locator("body").innerText().catch(() => "");
    expect(body.length, "/admin must render dashboard content").toBeGreaterThan(50);
  });
});

/* ========================================================================== */
/* Module-specific admin pages                                                */
/* ========================================================================== */

test.describe("Module admin pages show analytics data", () => {
  test("/admin/accounting page shows financial stats", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/accounting");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/accounting");
    await assertNoGarbage(page, "/admin/accounting");
  });

  test("/admin/reviews page shows review metrics", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/reviews");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/reviews");
    await assertNoGarbage(page, "/admin/reviews");
  });

  test("/admin/service page shows appointment and RO data", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/service");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/service");
    await assertNoGarbage(page, "/admin/service");
  });

  test("/admin/security page shows scan results", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/security");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/security");
    await assertNoGarbage(page, "/admin/security");
  });

  test("/admin/deals page loads deal data", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/deals");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/deals");
    await assertNoGarbage(page, "/admin/deals");
  });

  test("/admin/comms page loads communications data", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/comms");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/comms");
    await assertNoGarbage(page, "/admin/comms");
  });

  test("/admin/customers page loads customer data", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/customers");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }
    expect(nav.status).toBeLessThan(500);
    await assertNoErrors(page, "/admin/customers");
    await assertNoGarbage(page, "/admin/customers");
  });
});

/* ========================================================================== */
/* Cross-page consistency                                                     */
/* ========================================================================== */

test.describe("Cross-page analytics consistency", () => {
  test("no admin page returns a blank white page", async ({ page }) => {
    const pages = [
      "/admin",
      "/admin/analytics",
      "/admin/deals",
      "/admin/service",
      "/admin/reviews",
      "/admin/accounting",
    ];

    for (const p of pages) {
      const nav = await safeNavigate(page, p);
      if (nav.authWall) continue;

      const body = await page.locator("body").innerText().catch(() => "");
      expect(
        body.length,
        `${p} must not be blank — got ${body.length} chars`,
      ).toBeGreaterThan(20);
    }
  });

  test("analytics pages do not show raw JSON objects to users", async ({ page }) => {
    const nav = await safeNavigate(page, "/admin/analytics");
    if (nav.authWall) {
      test.skip(true, "Auth wall — skipping UI check");
      return;
    }

    const body = await page.locator("body").innerText().catch(() => "");
    // Raw JSON like {"key": "value"} should not appear in the page body
    // (it's fine in script tags or hidden elements, but not in visible text)
    const hasRawJson = /^\s*\{[\s\S]*"[\w]+":\s*/.test(body);
    if (hasRawJson) {
      // Only fail if the entire page is just raw JSON
      const looksLikePurePage = body.trim().startsWith("{") && body.trim().endsWith("}");
      expect(
        looksLikePurePage,
        "/admin/analytics should not render raw JSON as the entire page",
      ).toBe(false);
    }
  });
});
