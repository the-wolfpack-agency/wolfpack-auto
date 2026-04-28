import { test, expect } from "@playwright/test";

/**
 * Regression — clicking the native type="search" X clear button on the
 * /admin/inventory search input must drop the `?search=...` URL param
 * AND re-render the unfiltered list. Operators were having to refresh
 * the page or re-submit the empty form to escape a search; that's the
 * bug this guards against.
 */

test.describe("admin inventory — search clear", () => {
  test("native search X removes ?search param without page refresh", async ({ page }) => {
    await page.goto("/admin/inventory?search=civic");
    await expect(page).toHaveURL(/\?search=civic/);

    const input = page.getByRole("searchbox");
    await expect(input).toBeVisible();

    /* Simulate the native X click: the input's value becomes empty
       and the input fires its `search` event. We dispatch both so
       the test isn't browser-quirk-dependent. */
    await input.evaluate((el: HTMLInputElement) => {
      el.value = "";
      el.dispatchEvent(new Event("search", { bubbles: true }));
    });

    /* The component should push to /admin/inventory (no search). */
    await expect(page).toHaveURL(/\/admin\/inventory(\?(?!.*search=).*)?$/);
  });

  test("clearing search preserves other params (status filter survives)", async ({ page }) => {
    await page.goto("/admin/inventory?search=civic&status=available");
    const input = page.getByRole("searchbox");

    await input.evaluate((el: HTMLInputElement) => {
      el.value = "";
      el.dispatchEvent(new Event("search", { bubbles: true }));
    });

    await expect(page).toHaveURL(/status=available/);
    await expect(page).not.toHaveURL(/search=civic/);
  });
});
