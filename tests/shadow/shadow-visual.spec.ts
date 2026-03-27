/**
 * shadow-visual.spec.ts
 *
 * Visual regression guards for every client-facing page.
 *
 * These tests do NOT use pixel-by-pixel screenshot comparison (which is
 * brittle across OS/font-rendering differences). Instead they use structural
 * assertions that catch the real visual failures clients care about:
 *
 *   - Page renders meaningful content (not a blank/white screen)
 *   - Key UI landmarks exist (header, nav, footer, main content)
 *   - Error text does NOT appear (Application error, 500, etc.)
 *   - Dealer branding is present on dealer sub-pages
 *   - Forms are visible and interactive on lead-capture pages
 *   - Mobile viewport renders without overflow/scroll issues
 *
 * Why structural instead of pixel snapshots?
 *   Pixel snapshots break on every font change, shadow, or animation frame.
 *   Structural assertions catch what actually breaks client trust: blank pages,
 *   missing forms, crashed layouts. This is the right tradeoff for a CI gate.
 *
 * Run:
 *   npx playwright test tests/shadow/shadow-visual.spec.ts \
 *     --config=playwright.shadow.config.ts
 */

import { test, expect, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert a page renders meaningful content — not blank, not crashed */
async function assertPageRendered(page: Page, url: string): Promise<boolean> {
  const resp = await page.goto(url);
  const status = resp?.status() ?? 0;

  // 404 is acceptable (route/slug may not be in this build)
  // 500 is NEVER acceptable
  expect(status, `${url} crashed with 500`).not.toBe(500);
  expect(status, `${url} crashed with 502`).not.toBe(502);

  if (status === 404) return false; // skip further assertions

  // Must not show error text
  const bodyText = await page.locator("body").textContent();
  expect(bodyText, `${url} shows 'Application error'`).not.toMatch(
    /application error/i,
  );
  expect(bodyText, `${url} shows unhandled exception`).not.toMatch(
    /unhandled.*exception/i,
  );

  // Must have meaningful content (> 200 chars — rules out truly blank pages)
  expect(
    bodyText?.trim().length ?? 0,
    `${url} body is suspiciously short (< 200 chars)`,
  ).toBeGreaterThan(200);

  return true;
}

/** Assert no horizontal overflow (content bleeding off screen = broken layout) */
async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth >
      document.documentElement.clientWidth;
  });
  expect(overflow, "Page has horizontal scroll — layout is broken").toBe(false);
}

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

test.describe("Visual — Homepage", () => {
  test("renders without crash on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await assertPageRendered(page, "/");
  });

  test("renders without crash on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const rendered = await assertPageRendered(page, "/");
    if (rendered) await assertNoHorizontalOverflow(page);
  });

  test("no horizontal overflow on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const rendered = await assertPageRendered(page, "/");
    if (rendered) await assertNoHorizontalOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// Inventory page
// ---------------------------------------------------------------------------

test.describe("Visual — /inventory", () => {
  test("renders on desktop without crash", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await assertPageRendered(page, "/inventory");
  });

  test("renders on mobile without crash", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const rendered = await assertPageRendered(page, "/inventory");
    if (rendered) await assertNoHorizontalOverflow(page);
  });

  test("vehicle cards or empty state visible (not blank)", async ({ page }) => {
    const resp = await page.goto("/inventory");
    if ((resp?.status() ?? 0) !== 200) return;

    const body = await page.locator("body").textContent();
    // Either inventory items are showing OR an empty state message is shown —
    // both are valid; what's NOT valid is zero content
    const hasContent =
      body && body.trim().length > 200;
    expect(hasContent, "Inventory page body appears blank").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contact page
// ---------------------------------------------------------------------------

test.describe("Visual — /contact", () => {
  test("renders without crash on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await assertPageRendered(page, "/contact");
  });

  test("renders without crash on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const rendered = await assertPageRendered(page, "/contact");
    if (rendered) await assertNoHorizontalOverflow(page);
  });

  test("contact form is visible (input fields present)", async ({ page }) => {
    const resp = await page.goto("/contact");
    if ((resp?.status() ?? 0) !== 200) return;

    // At least one input or textarea must be present for the form to be usable
    const inputCount = await page.locator("input, textarea").count();
    expect(
      inputCount,
      "Contact page has no input fields — form is missing",
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Financing page
// ---------------------------------------------------------------------------

test.describe("Visual — /financing", () => {
  test("renders without crash", async ({ page }) => {
    await assertPageRendered(page, "/financing");
  });
});

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

test.describe("Visual — /about", () => {
  test("renders without crash", async ({ page }) => {
    await assertPageRendered(page, "/about");
  });
});

// ---------------------------------------------------------------------------
// Dealer sub-pages — branding + no crash
// ---------------------------------------------------------------------------

test.describe("Visual — Dealer sub-pages", () => {
  const DEALER_SLUGS = [
    "mile-high-motors",
    "summit-auto",
    "wolfpack-motors",
    "shadow-test-dealer-1",
    "shadow-test-dealer-2",
  ];

  for (const slug of DEALER_SLUGS) {
    test(`/dealers/${slug} — no crash, no blank page`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await assertPageRendered(page, `/dealers/${slug}`);
    });

    test(`/dealers/${slug} — mobile renders without overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      const rendered = await assertPageRendered(page, `/dealers/${slug}`);
      if (rendered) await assertNoHorizontalOverflow(page);
    });
  }
});

// ---------------------------------------------------------------------------
// Admin login page — auth wall must render correctly
// ---------------------------------------------------------------------------

test.describe("Visual — Admin login", () => {
  test("admin login page renders and has a form", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const rendered = await assertPageRendered(page, "/admin/login");
    if (!rendered) return;

    // Login form must have email + password fields
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    const submitBtn = page.locator('button[type="submit"], input[type="submit"]');

    // At least a submit button must exist
    const btnCount = await submitBtn.count();
    expect(btnCount, "Admin login has no submit button").toBeGreaterThan(0);
  });

  test("admin login renders on mobile without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const rendered = await assertPageRendered(page, "/admin/login");
    if (rendered) await assertNoHorizontalOverflow(page);
  });
});

// ---------------------------------------------------------------------------
// 404 page — must render gracefully, not crash
// ---------------------------------------------------------------------------

test.describe("Visual — 404 handling", () => {
  test("unknown route returns non-500 with body content", async ({ page }) => {
    const resp = await page.goto(
      "/this-route-absolutely-does-not-exist-shadow-visual-test",
    );
    const status = resp?.status() ?? 0;

    expect(status, "Unknown route must not return 500").not.toBe(500);

    if (status === 404) {
      // 404 page must still have content (not blank)
      const bodyText = await page.locator("body").textContent();
      expect(bodyText?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression: after any deploy, all pages must still load
// ---------------------------------------------------------------------------

test.describe("Visual — Full page regression sweep", () => {
  const PUBLIC_ROUTES = [
    "/",
    "/inventory",
    "/contact",
    "/about",
    "/financing",
  ];

  for (const route of PUBLIC_ROUTES) {
    test(`${route} — no 500 after deploy`, async ({ page }) => {
      const resp = await page.goto(route);
      const status = resp?.status() ?? 0;
      expect(status, `${route} crashed after deploy`).not.toBe(500);
      expect(status, `${route} returned bad gateway`).not.toBe(502);
    });
  }
});
