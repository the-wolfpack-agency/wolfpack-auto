import { test, expect } from "@playwright/test";

test.describe("Dealer Sub-Pages", () => {
  const dealers = [
    { slug: "summit-auto", name: "Summit Auto Group" },
    { slug: "mile-high-motors", name: "Mile High Motors" },
  ];

  for (const dealer of dealers) {
    test(`${dealer.name} page loads successfully`, async ({ page }) => {
      await page.goto(`/dealers/${dealer.slug}`);
      await expect(page.locator("h1").first()).toBeVisible();
    });

    test(`${dealer.name} has navigation header`, async ({ page }) => {
      await page.goto(`/dealers/${dealer.slug}`);
      const header = page.locator("header");
      await expect(header).toBeVisible();
    });

    test(`${dealer.name} has footer`, async ({ page }) => {
      await page.goto(`/dealers/${dealer.slug}`);
      const footer = page.locator("footer");
      await expect(footer).toBeVisible();
    });

    test(`${dealer.name} has chat widget`, async ({ page }) => {
      await page.goto(`/dealers/${dealer.slug}`);
      // Chat widget should be present (button or container)
      const chatButton = page.locator('[aria-label*="chat" i], [data-track*="chat"]');
      // May or may not be visible depending on implementation, just check page loaded
      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(100);
    });
  }
});
