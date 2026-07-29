import { test, expect } from "@playwright/test";

/**
 * The homepage "resume where you left off" bar is driven by REAL browsing
 * history (recently-viewed vehicles captured on the VDP), never fabricated.
 * These tests drive the real journey through the UI.
 */
test.describe("Homepage resume bar", () => {
  test("does not show for a first-time visitor", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator('a[data-track="resume_search_click"]'),
    ).toHaveCount(0);
  });

  test("appears after viewing a vehicle and links back to it", async ({ page }) => {
    // Discover a real vehicle from inventory (exclude the /inventory/compare
    // tool link), then open its detail page.
    await page.goto("/inventory");
    const firstCard = page
      .locator('a[href^="/inventory/"]:not([href$="/compare"])')
      .first();
    await expect(firstCard).toBeVisible();
    const href = await firstCard.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    // Deterministically wait for the RecentlyViewedTracker effect to persist
    // before navigating away (avoids a cross-browser flush race).
    await page.waitForFunction(
      () => !!window.localStorage.getItem("wolfpack_recently_viewed"),
    );

    await page.goto("/");
    const resume = page.locator('a[data-track="resume_search_click"]');
    await expect(resume).toBeVisible();
    await expect(resume).toHaveAttribute("href", href!);
    await expect(page.getByText("Welcome back")).toBeVisible();

    // Dismiss hides it for the session.
    await page.locator('button[aria-label="Dismiss"]').click();
    await expect(resume).toHaveCount(0);
    await page.reload();
    await expect(resume).toHaveCount(0);
  });
});
