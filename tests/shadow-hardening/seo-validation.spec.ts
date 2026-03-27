import { test, expect } from '@playwright/test';

const PAGES = ['/', '/inventory', '/contact', '/about'];

for (const pagePath of PAGES) {
  test.describe(`SEO validation on ${pagePath}`, () => {
    test('should have a valid title tag', async ({ page }) => {
      await page.goto(pagePath);
      const title = await page.title();
      expect(title, 'Title tag is empty').toBeTruthy();
      expect(title.length, `Title too long (${title.length} chars, max 70)`).toBeLessThanOrEqual(70);
    });

    test('should have a meta description between 10-160 chars', async ({ page }) => {
      await page.goto(pagePath);
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
      expect(description, 'Meta description missing').toBeTruthy();
      expect(description!.length).toBeGreaterThanOrEqual(10);
      expect(description!.length).toBeLessThanOrEqual(160);
    });

    test('should have a meta viewport tag', async ({ page }) => {
      await page.goto(pagePath);
      const viewport = await page
        .locator('meta[name="viewport"]')
        .getAttribute('content');
      expect(viewport, 'Meta viewport missing').toBeTruthy();
    });

    test('should have html lang="en" attribute', async ({ page }) => {
      await page.goto(pagePath);
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).toBe('en');
    });

    test('should have Open Graph title and description', async ({ page }) => {
      await page.goto(pagePath);

      const ogTitle = await page
        .locator('meta[property="og:title"]')
        .getAttribute('content');
      expect(ogTitle, 'og:title missing').toBeTruthy();

      const ogDescription = await page
        .locator('meta[property="og:description"]')
        .getAttribute('content');
      expect(ogDescription, 'og:description missing').toBeTruthy();
    });
  });
}

test.describe('Inventory page JSON-LD', () => {
  test('should contain JSON-LD structured data with @type', async ({ page }) => {
    await page.goto('/inventory');

    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    const count = await jsonLdScript.count();
    expect(count, 'No JSON-LD script found on inventory page').toBeGreaterThan(0);

    const content = await jsonLdScript.first().textContent();
    expect(content).toBeTruthy();

    const parsed = JSON.parse(content!);
    expect(parsed['@type'], 'JSON-LD missing @type').toBeTruthy();
  });
});
