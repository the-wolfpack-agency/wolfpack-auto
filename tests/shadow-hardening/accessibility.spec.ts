/**
 * Accessibility baseline tests — images, forms, headings, buttons,
 * focus visibility, and landmark structure.
 */
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/inventory", "/contact", "/about"];

for (const path of PAGES) {
  test.describe(`Accessibility: ${path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
    });

    test("all <img> tags have non-empty alt text or aria-hidden", async ({
      page,
    }) => {
      const violations = await page.$$eval("img", (imgs) =>
        imgs
          .filter((img) => {
            const alt = img.getAttribute("alt");
            const hidden = img.getAttribute("aria-hidden");
            // Valid if alt is non-empty string OR aria-hidden="true"
            return !(
              (alt !== null && alt.trim().length > 0) ||
              hidden === "true"
            );
          })
          .map((img) => img.outerHTML.slice(0, 120))
      );

      expect(violations, `Images missing alt text: ${violations.join(", ")}`).toEqual([]);
    });

    test("all form inputs have associated labels or aria-label", async ({
      page,
    }) => {
      const violations = await page.$$eval(
        "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select",
        (elements) =>
          elements
            .filter((el) => {
              // Check for aria-label or aria-labelledby
              if (el.getAttribute("aria-label")?.trim()) return false;
              if (el.getAttribute("aria-labelledby")?.trim()) return false;
              // Check for placeholder as fallback
              if (el.getAttribute("placeholder")?.trim()) return false;
              // Check for associated <label>
              const id = el.id;
              if (id && document.querySelector(`label[for="${id}"]`))
                return false;
              // Check for wrapping <label>
              if (el.closest("label")) return false;
              // Check for title attribute
              if (el.getAttribute("title")?.trim()) return false;
              return true;
            })
            .map((el) => el.outerHTML.slice(0, 120))
      );

      expect(violations, `Inputs without labels: ${violations.join(", ")}`).toEqual([]);
    });

    test("heading hierarchy: h1 exists and no skipped levels", async ({
      page,
    }) => {
      const headings = await page.$$eval(
        "h1, h2, h3, h4, h5, h6",
        (els) => els.map((el) => parseInt(el.tagName.replace("H", ""), 10))
      );

      // At least one h1 must exist
      expect(headings.filter((h) => h === 1).length).toBeGreaterThanOrEqual(1);

      // Check no skipped levels (e.g., h1 -> h3 without h2)
      const uniqueLevels = [...new Set(headings)].sort();
      for (let i = 1; i < uniqueLevels.length; i++) {
        const gap = uniqueLevels[i] - uniqueLevels[i - 1];
        expect(
          gap,
          `Heading level skipped: h${uniqueLevels[i - 1]} -> h${uniqueLevels[i]}`
        ).toBeLessThanOrEqual(1);
      }
    });

    test("all buttons have accessible text", async ({ page }) => {
      const violations = await page.$$eval(
        "button, [role='button']",
        (buttons) =>
          buttons
            .filter((btn) => {
              const text = btn.textContent?.trim();
              const ariaLabel = btn.getAttribute("aria-label")?.trim();
              const ariaLabelledBy = btn.getAttribute("aria-labelledby")?.trim();
              const title = btn.getAttribute("title")?.trim();
              return !text && !ariaLabel && !ariaLabelledBy && !title;
            })
            .map((btn) => btn.outerHTML.slice(0, 120))
      );

      expect(violations, `Buttons without accessible text: ${violations.join(", ")}`).toEqual([]);
    });

    test("focus is visible on interactive elements", async ({ page }) => {
      // Tab through the first several interactive elements and check
      // that at least one shows a visible focus indicator
      const focusable = await page.$$(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length === 0) return;

      let foundVisible = false;
      const maxChecks = Math.min(focusable.length, 5);

      for (let i = 0; i < maxChecks; i++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return false;
          const styles = window.getComputedStyle(el);
          // Check for outline, box-shadow, or border changes indicating focus
          return (
            styles.outlineStyle !== "none" ||
            styles.boxShadow !== "none" ||
            el.classList.contains("focus-visible")
          );
        });
        if (focused) {
          foundVisible = true;
          break;
        }
      }

      expect(foundVisible, "No interactive element showed visible focus indicator").toBe(true);
    });

    test("main landmark exists", async ({ page }) => {
      const mainCount = await page.locator("main, [role='main']").count();
      expect(mainCount).toBeGreaterThanOrEqual(1);
    });
  });
}
