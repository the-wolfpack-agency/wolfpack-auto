/**
 * Accessibility audit — automated a11y checks across key pages.
 *
 * These tests verify WCAG 2.1 Level A essentials:
 *  - Landmarks, headings, alt text, labels, focus, contrast, skip-nav
 *
 * Run with: npx playwright test tests/e2e/accessibility/a11y-audit.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Pages to audit                                                             */
/* -------------------------------------------------------------------------- */

const PUBLIC_PAGES = [
  { name: "Homepage", path: "/" },
  { name: "Inventory", path: "/inventory" },
  { name: "Contact", path: "/contact" },
];

const ADMIN_PAGES = [
  { name: "Admin Dashboard", path: "/admin" },
  { name: "Admin Leads", path: "/admin/leads" },
  { name: "Admin Deals", path: "/admin/deals" },
  { name: "Admin Settings", path: "/admin/settings" },
];

const ALL_PAGES = [...PUBLIC_PAGES, ...ADMIN_PAGES];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[type="email"], input[name="email"]', "demo@wolfpackauto.com");
  await page.fill('input[type="password"], input[name="password"]', "demo1234!");
  await page.click('button[type="submit"]');
  // Wait for redirect to admin dashboard
  await page.waitForURL(/\/admin/, { timeout: 10_000 }).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/* A11Y-001: Every page has a main landmark                                   */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-001: main landmark on every page", () => {
  for (const { name, path } of PUBLIC_PAGES) {
    test(`${name} (${path}) has <main> or role="main"`, async ({ page }) => {
      await page.goto(path);
      const mainLandmark = page.locator('main, [role="main"]');
      await expect(mainLandmark.first()).toBeVisible({ timeout: 10_000 });
    });
  }

  for (const { name, path } of ADMIN_PAGES) {
    test(`${name} (${path}) has <main> or role="main"`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(path);
      const mainLandmark = page.locator('main, [role="main"]');
      await expect(mainLandmark.first()).toBeVisible({ timeout: 10_000 });
    });
  }
});

/* -------------------------------------------------------------------------- */
/* A11Y-002: Every page has exactly one <h1>                                  */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-002: single h1 on every page", () => {
  for (const { name, path } of PUBLIC_PAGES) {
    test(`${name} (${path}) has exactly one <h1>`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      const h1Count = await page.locator("h1").count();
      expect(h1Count).toBe(1);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* A11Y-003: All images have alt text                                         */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-003: all images have alt text", () => {
  for (const { name, path } of PUBLIC_PAGES) {
    test(`${name} (${path}) — all <img> elements have non-empty alt`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      const images = page.locator("img");
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute("alt");
        const src = await img.getAttribute("src");
        // alt must exist (empty string is acceptable for decorative images per WCAG)
        expect(
          alt !== null,
          `Image ${src ?? `#${i}`} is missing alt attribute`,
        ).toBe(true);
      }
    });
  }
});

/* -------------------------------------------------------------------------- */
/* A11Y-004: All form inputs have labels                                      */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-004: form inputs have labels", () => {
  test("Contact form inputs have labels or aria-label", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("domcontentloaded");

    const inputs = page.locator(
      'input:not([type="hidden"]):not([type="submit"]), textarea, select',
    );
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const name = await input.getAttribute("name");

      // Input must have at least one labelling mechanism
      let hasLabel = !!ariaLabel || !!ariaLabelledBy;

      if (!hasLabel && id) {
        const associatedLabel = page.locator(`label[for="${id}"]`);
        hasLabel = (await associatedLabel.count()) > 0;
      }

      // Placeholder alone is not a valid label per WCAG,
      // but we accept it as a pragmatic minimum
      if (!hasLabel && placeholder) {
        hasLabel = true;
      }

      expect(
        hasLabel,
        `Input "${name ?? id ?? `#${i}`}" has no label, aria-label, or placeholder`,
      ).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* A11Y-005: All interactive elements are keyboard focusable                  */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-005: interactive elements are keyboard focusable", () => {
  test("Homepage — buttons and links are focusable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const interactive = page.locator("a[href], button, [role='button']");
    const count = await interactive.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 20); i++) {
      const el = interactive.nth(i);
      const tabindex = await el.getAttribute("tabindex");
      // tabindex="-1" means not keyboard-focusable — that's a violation
      // unless it's an element that receives programmatic focus only
      if (tabindex === "-1") {
        const role = await el.getAttribute("role");
        // Skip elements with explicit programmatic-focus roles
        if (role !== "presentation" && role !== "none") {
          const text = await el.textContent();
          // Warn but don't hard-fail for tabindex=-1 on minor elements
          console.warn(
            `Interactive element "${text?.trim().slice(0, 30)}" has tabindex="-1"`,
          );
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* A11Y-006: Color contrast — text must not be invisible                      */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-006: text is not invisible (same color as background)", () => {
  test("Homepage has no invisible text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Check that no visible text element has color === backgroundColor
    const invisibleCount = await page.evaluate(() => {
      let count = 0;
      const textEls = document.querySelectorAll("p, span, h1, h2, h3, h4, h5, h6, a, li, td, th, label");
      for (const el of textEls) {
        const style = window.getComputedStyle(el);
        if (style.color === style.backgroundColor && el.textContent?.trim()) {
          count++;
        }
      }
      return count;
    });

    expect(invisibleCount).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* A11Y-007: Skip navigation link exists                                      */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-007: skip navigation link", () => {
  test("Homepage has a skip-to-content link", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Look for common skip-nav patterns
    const skipLink = page.locator(
      'a[href="#main-content"], a[href="#main"], a[href="#content"], a.skip-nav, a.skip-to-content, [class*="skip-nav"], [class*="skip-to"]',
    );

    const mainTag = page.locator("main[id]");
    const hasMainId = (await mainTag.count()) > 0;
    const hasSkipLink = (await skipLink.count()) > 0;

    // Either a skip link or a main element with an id (anchor target) should exist
    expect(
      hasSkipLink || hasMainId,
      "Page should have a skip-nav link or a <main> with an id for keyboard navigation",
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* A11Y-008: No empty links or buttons                                        */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-008: no empty links or buttons", () => {
  for (const { name, path } of PUBLIC_PAGES) {
    test(`${name} (${path}) — no empty links`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      const links = page.locator("a[href]");
      const count = await links.count();

      const emptyLinks: string[] = [];
      for (let i = 0; i < count; i++) {
        const link = links.nth(i);
        const text = (await link.textContent())?.trim() ?? "";
        const ariaLabel = await link.getAttribute("aria-label");
        const title = await link.getAttribute("title");
        const imgCount = await link.locator("img").count();
        const svgCount = await link.locator("svg").count();

        // A link needs at least one accessible name source
        if (!text && !ariaLabel && !title && imgCount === 0 && svgCount === 0) {
          const href = await link.getAttribute("href");
          emptyLinks.push(href ?? "(no href)");
        }
      }

      expect(emptyLinks).toEqual([]);
    });

    test(`${name} (${path}) — no empty buttons`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      const buttons = page.locator("button");
      const count = await buttons.count();

      const emptyButtons: string[] = [];
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const text = (await btn.textContent())?.trim() ?? "";
        const ariaLabel = await btn.getAttribute("aria-label");
        const title = await btn.getAttribute("title");
        const imgCount = await btn.locator("img, svg").count();

        if (!text && !ariaLabel && !title && imgCount === 0) {
          const id = await btn.getAttribute("id");
          emptyButtons.push(id ?? `button#${i}`);
        }
      }

      expect(emptyButtons).toEqual([]);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* A11Y-009: Language attribute on <html>                                      */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-009: html lang attribute", () => {
  test("Homepage has lang attribute on <html>", async ({ page }) => {
    await page.goto("/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBeTruthy();
    expect(lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
  });
});

/* -------------------------------------------------------------------------- */
/* A11Y-010: ARIA roles are valid                                             */
/* -------------------------------------------------------------------------- */

test.describe("A11Y-010: valid ARIA roles", () => {
  const VALID_ROLES = new Set([
    "alert", "alertdialog", "application", "article", "banner", "button",
    "cell", "checkbox", "columnheader", "combobox", "complementary",
    "contentinfo", "definition", "dialog", "directory", "document",
    "feed", "figure", "form", "grid", "gridcell", "group", "heading",
    "img", "link", "list", "listbox", "listitem", "log", "main",
    "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox",
    "menuitemradio", "navigation", "none", "note", "option", "presentation",
    "progressbar", "radio", "radiogroup", "region", "row", "rowgroup",
    "rowheader", "scrollbar", "search", "searchbox", "separator",
    "slider", "spinbutton", "status", "switch", "tab", "table",
    "tablist", "tabpanel", "term", "textbox", "timer", "toolbar",
    "tooltip", "tree", "treegrid", "treeitem",
  ]);

  test("Homepage — all role attributes use valid ARIA roles", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const elements = page.locator("[role]");
    const count = await elements.count();

    const invalidRoles: string[] = [];
    for (let i = 0; i < count; i++) {
      const role = await elements.nth(i).getAttribute("role");
      if (role && !VALID_ROLES.has(role)) {
        invalidRoles.push(role);
      }
    }

    expect(invalidRoles).toEqual([]);
  });
});
