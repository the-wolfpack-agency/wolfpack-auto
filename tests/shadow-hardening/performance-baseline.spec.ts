/**
 * Performance baseline tests — verify page load times, no JS errors,
 * and no server errors during navigation.
 */
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/inventory", "/contact", "/about"];
const MAX_LOAD_MS = 5000;

for (const path of PAGES) {
  test.describe(`Performance: ${path}`, () => {
    test(`page load (domcontentloaded) completes under ${MAX_LOAD_MS}ms`, async ({
      page,
    }) => {
      const start = Date.now();
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(MAX_LOAD_MS);
    });

    test("no JavaScript console errors during load", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          errors.push(msg.text());
        }
      });

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");

      expect(errors).toEqual([]);
    });

    test("no failed network requests (status >= 500)", async ({ page }) => {
      const serverErrors: { url: string; status: number }[] = [];

      page.on("response", (response) => {
        if (response.status() >= 500) {
          serverErrors.push({
            url: response.url(),
            status: response.status(),
          });
        }
      });

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      expect(serverErrors).toEqual([]);
    });
  });
}
