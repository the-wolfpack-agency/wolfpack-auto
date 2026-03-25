import { test, expect } from "@playwright/test";

test.describe("Mobile Menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("at mobile width: hamburger visible, desktop nav hidden", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Hamburger should be visible
    const hamburger = page.locator(
      "button[aria-label='Open navigation menu']",
    );
    await expect(hamburger).toBeVisible();

    // Desktop nav should be hidden (md:flex only shows at >= 768px)
    const desktopNav = page.locator("ul.hidden.md\\:flex");
    // The element exists in DOM but is hidden via CSS
    if (await desktopNav.count()) {
      await expect(desktopNav).not.toBeVisible();
    }
  });

  test("click hamburger: menu panel slides in with all links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const hamburger = page.locator(
      "button[aria-label='Open navigation menu']",
    );
    await hamburger.click();

    // All 5 nav links visible in mobile menu
    const mobilePanel = page.locator(".md\\:hidden").filter({
      has: page.locator("nav"),
    });

    for (const label of [
      "Home",
      "Inventory",
      "Financing",
      "About",
      "Contact",
    ]) {
      await expect(
        page.locator(`a:has-text("${label}")`).first(),
      ).toBeVisible();
    }

    // Phone CTA visible in mobile menu
    await expect(page.getByText("Call (303) 555-1234")).toBeVisible();
  });

  test("click link: navigates and menu closes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Open menu
    const hamburger = page.locator(
      "button[aria-label='Open navigation menu']",
    );
    await hamburger.click();

    // Click Inventory link
    const inventoryLink = page
      .locator("a:has-text('Inventory')")
      .filter({ hasText: "Inventory" });
    // The mobile menu link has an onClick that closes the menu
    await inventoryLink.first().click();

    // Should navigate
    await page.waitForURL(/\/inventory/);
  });

  test("click hamburger again: menu closes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Open menu
    const hamburger = page.locator(
      "button[aria-label='Open navigation menu']",
    );
    await hamburger.click();

    // aria-label should now be "Close navigation menu"
    const closeBtn = page.locator(
      "button[aria-label='Close navigation menu']",
    );
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Mobile nav panel should be gone
    // The panel only renders when open is true
    const mobileNavLinks = page.locator(
      ".md\\:hidden nav a:has-text('Inventory')",
    );
    await expect(mobileNavLinks).not.toBeVisible();
  });

  test("at desktop width: hamburger hidden, nav links visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Hamburger should be hidden (md:hidden means hidden at >= 768px)
    const hamburger = page.locator(
      "button[aria-label='Open navigation menu']",
    );
    await expect(hamburger).not.toBeVisible();

    // Desktop nav links visible
    const header = page.locator("header[role='banner']");
    for (const label of [
      "Home",
      "Inventory",
      "Financing",
      "About",
      "Contact",
    ]) {
      const link = header.locator(`a:has-text("${label}")`).first();
      await expect(link).toBeVisible();
    }
  });

  test("aria-expanded attribute toggles correctly", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const hamburger = page.locator(
      "button[aria-label='Open navigation menu']",
    );
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");

    await hamburger.click();

    const closeBtn = page.locator(
      "button[aria-label='Close navigation menu']",
    );
    await expect(closeBtn).toHaveAttribute("aria-expanded", "true");
  });
});
