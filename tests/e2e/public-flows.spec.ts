import { test, expect } from "@playwright/test";

// Shadow-mode skip: this suite walks inventory VDPs, contact-form submit,
// inventory filter/sort/paginate, and other journeys that depend on real
// inventory + lead persistence. In shadow mode (DATABASE_URL='') VDPs 404,
// contact POSTs short-circuit, and the navigations fail. Re-run with
// DATABASE_URL set.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

/**
 * Public site end-to-end flow tests.
 *
 * These test complete user journeys across multiple pages — the kind of
 * thing a real customer does in one session. They catch regressions that
 * per-page unit tests miss because they involve state, navigation, and
 * cross-page consistency.
 *
 * Coverage:
 *   - Cookie consent banner lifecycle
 *   - Chat widget: open, message, close, keyboard, mobile
 *   - Top info bar: phone link, address, hours
 *   - Payment calculator: actual computation
 *   - Full contact form submission
 *   - VDP → Schedule Test Drive CTA flow
 *   - Inventory filter + sort + paginate journey
 *   - Navigation from every page back to home
 *   - 404 page content
 *   - Privacy & Terms pages load
 *   - Inventory compare route
 *   - Mobile hamburger on all pages
 */

const TEST_VIN = "1HGCV1F34PA000001";

async function acceptCookies(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("cookie_consent", "essential");
  });
}

// ---------------------------------------------------------------------------
// Cookie consent banner
// ---------------------------------------------------------------------------

test.describe("Cookie consent banner", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("banner appears on first visit (no prior consent)", async ({ page }) => {
    // Do NOT pre-accept — we want to see the banner
    await page.goto("/", { waitUntil: "load" });

    const banner = page.locator("#wolfpack-cookie").or(
      page.locator('[aria-label*="cookie" i], [aria-label*="consent" i]')
    );
    // Accept Essential or Accept All button
    const acceptBtn = page.locator(
      'button:has-text("Accept Essential"), button:has-text("Accept All"), button:has-text("Got it")'
    );
    const hasBanner = await acceptBtn.first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasBanner).toBe(true);
  });

  test("accepting consent hides the banner", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    const acceptBtn = page.locator(
      'button:has-text("Accept Essential"), button:has-text("Accept All"), button:has-text("Got it")'
    );
    const hasBanner = await acceptBtn.first().isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasBanner) {
      test.info().annotations.push({ type: "info", description: "Consent already set — banner not shown" });
      return;
    }

    await acceptBtn.first().click();
    await expect(acceptBtn.first()).not.toBeVisible({ timeout: 5_000 });
  });

  test("consent is persisted after page reload", async ({ page }) => {
    // Accept on first load
    await page.goto("/", { waitUntil: "load" });

    const acceptBtn = page.locator(
      'button:has-text("Accept Essential"), button:has-text("Accept All"), button:has-text("Got it")'
    );
    const hasBanner = await acceptBtn.first().isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasBanner) {
      await acceptBtn.first().click();
    }

    // Reload — banner must not reappear
    await page.reload({ waitUntil: "load" });
    const bannerAgain = await acceptBtn.first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(bannerAgain, "Cookie banner reappeared after consent").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chat widget: full lifecycle on public pages
// ---------------------------------------------------------------------------

test.describe("Chat widget: public pages", () => {
  const PUBLIC_PAGES_WITH_CHAT = [
    "/",
    "/inventory",
    "/financing",
    "/about",
    "/contact",
    `/inventory/${TEST_VIN}`,
  ];

  test("chat bubble visible on all public pages", async ({ page }) => {
    await acceptCookies(page);
    for (const path of PUBLIC_PAGES_WITH_CHAT) {
      await page.goto(path, { waitUntil: "load" });

      const bubble = page.locator('button[aria-label="Open chat assistant"]');
      await expect(bubble).toBeVisible({ timeout: 8_000 });
    }
  });

  test("chat opens, sends message, and closes", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/", { waitUntil: "load" });

    const bubble = page.locator('button[aria-label="Open chat assistant"]');
    await expect(bubble).toBeVisible({ timeout: 8_000 });
    await bubble.scrollIntoViewIfNeeded();
    await bubble.click({ force: true });

    const panel = page.locator("div[role='dialog']").filter({
      has: page.locator('button[aria-label="Close chat"]'),
    });
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // Panel has a heading
    await expect(panel.locator("h2")).toBeVisible({ timeout: 5_000 });

    // Type a message
    const input = panel.locator("#chat-input");
    await expect(input).toBeVisible();
    await input.fill("Do you have any SUVs available?");

    // Send
    const sendBtn = panel.locator('button[aria-label="Send message"]');
    await sendBtn.click();

    // Message log visible
    const log = panel.locator("[role='log']");
    await expect(log).toBeVisible({ timeout: 5_000 });

    // Close
    const closeBtn = panel.locator('button[aria-label="Close chat"]');
    await closeBtn.click();
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("Escape key closes chat panel", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/", { waitUntil: "load" });

    const bubble = page.locator('button[aria-label="Open chat assistant"]');
    await expect(bubble).toBeVisible({ timeout: 8_000 });
    await bubble.click({ force: true });

    const panel = page.locator("div[role='dialog']").filter({
      has: page.locator('button[aria-label="Close chat"]'),
    });
    await expect(panel).toBeVisible({ timeout: 8_000 });

    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("chat input attributes correct", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/", { waitUntil: "load" });

    const bubble = page.locator('button[aria-label="Open chat assistant"]');
    await expect(bubble).toBeVisible({ timeout: 8_000 });
    await bubble.click({ force: true });
    const panel = page.locator("div[role='dialog']").filter({
      has: page.locator('button[aria-label="Close chat"]'),
    });
    await expect(panel).toBeVisible({ timeout: 8_000 });

    const input = panel.locator("#chat-input");
    await expect(input).toHaveAttribute("maxlength", "500");
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("placeholder", "Type a message...");
  });
});

// ---------------------------------------------------------------------------
// Top info bar
// ---------------------------------------------------------------------------

test.describe("Top info bar", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("visible on desktop, hidden on mobile", async ({ page }) => {
    await acceptCookies(page);

    // Desktop: visible
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const topBar = page.locator("#wolfpack-top-bar");
    await expect(topBar).toBeVisible({ timeout: 5_000 });

    // Mobile: hidden via CSS (sm:block — hidden below sm breakpoint)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: "domcontentloaded" });
    // Top bar has class "hidden sm:block" so it's hidden on mobile
    await expect(topBar).toBeHidden({ timeout: 3_000 });
  });

  test("top bar contains phone number and address", async ({ page }) => {
    await acceptCookies(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const topBar = page.locator("#wolfpack-top-bar");
    await expect(topBar).toBeVisible({ timeout: 5_000 });

    // Phone number (clickable tel: link)
    const phoneLink = topBar.locator("a[href^='tel:']");
    await expect(phoneLink.first()).toBeVisible({ timeout: 3_000 });

    // Address text
    const hasAddress = await topBar.locator("text=/Denver|Auto Drive|CO/i").count().then((c) => c > 0);
    expect(hasAddress).toBe(true);
  });

  test("top bar does not appear on admin pages", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const topBar = page.locator("#wolfpack-top-bar");
    await expect(topBar).not.toBeVisible({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// VDP payment calculator — actual computation
// ---------------------------------------------------------------------------

test.describe("VDP payment calculator", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("calculator shows estimated payment after interaction", async ({ page }) => {
    await acceptCookies(page);
    await page.goto(`/inventory/${TEST_VIN}`, { waitUntil: "domcontentloaded" });

    // Calculator section must be visible
    await expect(page.getByText("Payment Calculator")).toBeVisible({ timeout: 8_000 });

    const downInput = page.locator("#calc-down");
    const termSelect = page.locator("#calc-term");
    const calcBtn = page.locator("button:has-text('Calculate Payment')");

    await expect(downInput).toBeVisible({ timeout: 5_000 });
    await expect(termSelect).toBeVisible({ timeout: 5_000 });

    // Enter a down payment
    await downInput.fill("5000");
    await termSelect.selectOption("60");
    await calcBtn.click();

    // Estimated payment result should appear
    const result = page.locator("text=/\\$[0-9,]+\\/mo|per month|monthly payment/i");
    await expect(result.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Financing calculator — actual computation
// ---------------------------------------------------------------------------

test.describe("Financing calculator", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("calculator updates on input change", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/financing", { waitUntil: "domcontentloaded" });

    const priceInput = page.locator("#calc-price");
    const downInput = page.locator("#calc-down");

    await expect(priceInput).toBeVisible({ timeout: 5_000 });

    // Change price
    await priceInput.fill("30000");
    await downInput.fill("6000");

    // Either the payment updates automatically or there's a calculate button
    const calcBtn = page.locator("button:has-text('Calculate'), button:has-text('Estimate')");
    const hasCta = await calcBtn.count().then((c) => c > 0);
    if (hasCta) await calcBtn.first().click();

    // Estimated monthly payment is displayed somewhere
    const estPayment = page.locator("text=/Estimated Monthly Payment/i");
    await expect(estPayment).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Contact form: full submission flow
// ---------------------------------------------------------------------------

test.describe("Contact form: full submission", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once — has side effects");

  test("valid submission shows success state", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/contact", { waitUntil: "domcontentloaded" });

    await page.locator("#contact-first-name").fill("Test");
    await page.locator("#contact-last-name").fill("User");
    await page.locator("#contact-email").fill("test@wolfpacktest.invalid");
    await page.locator("#contact-phone").fill("(303) 555-0001");
    await page.locator("#contact-subject").selectOption("General Inquiry");
    await page.locator("#contact-message").fill("This is an automated test message.");

    await page.locator("button[type='submit']:has-text('Send Message')").click();

    // Success state OR form persists without crashing
    await expect(page.locator("text=/sent|success|thank you|received/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("empty form submission shows all required field errors", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/contact", { waitUntil: "domcontentloaded" });

    await page.locator("button[type='submit']:has-text('Send Message')").click();

    await expect(page.getByText("First name is required.")).toBeVisible();
    await expect(page.getByText("Last name is required.")).toBeVisible();
    await expect(page.getByText("Email address is required.")).toBeVisible();
    await expect(page.getByText("Message is required.")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Navigation: nav links work from every public page
// ---------------------------------------------------------------------------

test.describe("Navigation: links from all pages", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES_TO_TEST = ["/", "/inventory", "/financing", "/about", "/contact"];

  for (const startPath of PAGES_TO_TEST) {
    test(`${startPath}: all nav links reachable`, async ({ page }) => {
      await acceptCookies(page);
      await page.goto(startPath, { waitUntil: "domcontentloaded" });

      const NAV_LINKS = [
        { href: "/", label: /^Home$/i },
        { href: "/inventory", label: /^Inventory$/i },
        { href: "/financing", label: /^Financing$/i },
        { href: "/about", label: /^About$/i },
        { href: "/contact", label: /^Contact$/i },
      ];

      const header = page.locator("header[role='banner']");
      await expect(header).toBeVisible({ timeout: 5_000 });

      for (const { href, label } of NAV_LINKS) {
        const link = header.locator(`a[href="${href}"]`).filter({ hasText: label });
        await expect(link.first()).toHaveAttribute("href", href);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 404 page content
// ---------------------------------------------------------------------------

test.describe("404 page", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("returns 404 status", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-xyz", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });

  test("404 page has content and link back home", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/this-page-does-not-exist-xyz", { waitUntil: "domcontentloaded" });

    const body = await page.locator("body").textContent();
    // Should have meaningful content, not a blank screen
    expect(body?.length ?? 0).toBeGreaterThan(50);

    // Should have a way back home
    const homeLink = page.locator("a[href='/']");
    await expect(homeLink.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Privacy and Terms pages
// ---------------------------------------------------------------------------

test.describe("Privacy and Terms pages", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  for (const { path, keyword } of [
    { path: "/privacy", keyword: /privacy|data|personal/i },
    { path: "/terms", keyword: /terms|conditions|agreement/i },
  ]) {
    test(`${path}: loads with relevant content`, async ({ page }) => {
      await acceptCookies(page);
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);

      const body = await page.locator("body").textContent();
      expect(body?.length ?? 0).toBeGreaterThan(200);
      expect(body?.toLowerCase()).toMatch(keyword);

      // Nav and footer present
      await expect(page.locator("header[role='banner']")).toBeVisible({ timeout: 5_000 });
      await expect(page.locator("footer[role='contentinfo']")).toBeVisible({ timeout: 5_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// Inventory compare page
// ---------------------------------------------------------------------------

test.describe("Inventory compare page", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("/inventory/compare loads without error", async ({ page }) => {
    await acceptCookies(page);
    const response = await page.goto("/inventory/compare", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).not.toBe(500);
    expect(response?.status()).not.toBe(502);

    const body = await page.locator("body").textContent();
    expect(body?.length ?? 0).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Full customer journey: arrive → search → view VDP → submit lead
// ---------------------------------------------------------------------------

test.describe("Customer journey: search → VDP → lead", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("homepage → inventory search → vehicle detail page", async ({ page }) => {
    await acceptCookies(page);

    // 1. Land on homepage
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("h1")).toBeVisible({ timeout: 5_000 });

    // 2. Search for Honda
    const searchInput = page.locator('input[name="q"]');
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("Honda");
    await page.locator('button[type="submit"]').click();

    // 3. Land on inventory with results
    await page.waitForURL(/\/inventory/, { timeout: 10_000 });
    expect(page.url()).toContain("/inventory");

    // 4. Click first result
    const firstCard = page.locator("a[href^='/inventory/']").first();
    await expect(firstCard).toBeVisible({ timeout: 8_000 });
    await firstCard.click();

    // 5. Arrive on VDP
    await page.waitForURL(/\/inventory\//, { timeout: 10_000 });
    await expect(page.locator("h1")).toBeVisible({ timeout: 5_000 });

    // 6. Price visible
    const price = page.locator("text=$");
    await expect(price.first()).toBeVisible({ timeout: 5_000 });

    // 7. CTA buttons visible
    const cta = page.locator(
      "button:has-text('Schedule Test Drive'), button:has-text('Request Price'), button:has-text('Get Pre-Approved')"
    );
    await expect(cta.first()).toBeVisible({ timeout: 5_000 });
  });

  test("inventory → sort → results reorder", async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });

    const sortSelect = page.locator("#sort-by");
    await expect(sortSelect).toBeVisible({ timeout: 5_000 });

    // Sort by price ascending
    await sortSelect.selectOption("price_asc");
    await page.waitForURL(/sort=price_asc/, { timeout: 5_000 });
    expect(page.url()).toContain("sort=price_asc");

    // Results still render
    const cards = page.locator("a[href^='/inventory/']");
    await expect(cards.first()).toBeVisible({ timeout: 8_000 });

    // Sort by price descending
    await sortSelect.selectOption("price_desc");
    await page.waitForURL(/sort=price_desc/, { timeout: 5_000 });
    expect(page.url()).toContain("sort=price_desc");
  });

  test("VDP breadcrumb → back to inventory", async ({ page }) => {
    await acceptCookies(page);
    await page.goto(`/inventory/${TEST_VIN}`, { waitUntil: "domcontentloaded" });

    const breadcrumb = page.locator("nav[aria-label='Breadcrumb']");
    await expect(breadcrumb).toBeVisible({ timeout: 5_000 });

    // Click "Inventory" breadcrumb link
    await breadcrumb.locator("a[href='/inventory']").click();
    await page.waitForURL(/\/inventory$/, { timeout: 8_000 });
    await expect(page.locator("h1", { hasText: /Vehicle Inventory/i })).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Mobile hamburger nav on every public page
// ---------------------------------------------------------------------------

test.describe("Mobile hamburger nav: all public pages", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "Mobile only — webkit project");

  const MOBILE_PAGES = [
    { path: "/",          label: "Homepage" },
    { path: "/inventory", label: "Inventory" },
    { path: "/financing", label: "Financing" },
    { path: "/about",     label: "About" },
    { path: "/contact",   label: "Contact" },
  ];

  for (const { path, label } of MOBILE_PAGES) {
    test(`${label}: hamburger opens nav with all links`, async ({ page }) => {
      await acceptCookies(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const hamburger = page.locator(
        "button[aria-label='Open navigation menu'], button[aria-label='Close navigation menu']"
      );
      await expect(hamburger.first()).toBeVisible({ timeout: 5_000 });
      await hamburger.first().click();

      // All 5 nav links visible in mobile menu
      for (const [href, text] of [
        ["/", "Home"],
        ["/inventory", "Inventory"],
        ["/financing", "Financing"],
        ["/about", "About"],
        ["/contact", "Contact"],
      ]) {
        const link = page.locator(`a[href="${href}"]`).filter({ hasText: text });
        await expect(link.first()).toBeVisible({ timeout: 5_000 });
      }
    });
  }
});
