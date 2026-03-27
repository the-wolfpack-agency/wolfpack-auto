import { test, expect } from '@playwright/test';

const PAGES = ['/', '/inventory', '/contact', '/about'];
const REQUIRED_NAV_LINKS = ['/', '/inventory', '/contact', '/about'];

test.describe('Link integrity', () => {
  test('all internal links across pages return status < 400', async ({ page, request }) => {
    const internalLinks = new Set<string>();

    for (const pagePath of PAGES) {
      await page.goto(pagePath);

      const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
        anchors
          .map((a) => a.getAttribute('href') || '')
          .filter((href) => href.startsWith('/') && !href.startsWith('//'))
      );

      for (const href of hrefs) {
        // Normalize: strip trailing slash except for root, strip hash fragments
        const clean = href.split('#')[0].split('?')[0];
        if (clean) {
          internalLinks.add(clean);
        }
      }
    }

    expect(internalLinks.size, 'No internal links found').toBeGreaterThan(0);

    const failures: string[] = [];

    for (const link of internalLinks) {
      const response = await request.get(link);
      if (response.status() >= 400) {
        failures.push(`${link} returned ${response.status()}`);
      }
    }

    expect(failures, `Broken internal links:\n${failures.join('\n')}`).toHaveLength(0);
  });

  test('main nav links all resolve successfully', async ({ request }) => {
    for (const navLink of REQUIRED_NAV_LINKS) {
      const response = await request.get(navLink);
      expect(
        response.status(),
        `Nav link ${navLink} returned ${response.status()}`
      ).toBeLessThan(400);
    }
  });

  test('non-existent page returns 404', async ({ request }) => {
    const response = await request.get('/this-page-does-not-exist');
    expect(response.status()).toBe(404);
  });
});
