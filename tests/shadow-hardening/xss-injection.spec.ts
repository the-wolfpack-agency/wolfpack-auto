import { test, expect } from '@playwright/test';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '" onmouseover="alert(1)',
  'javascript:alert(1)',
  '<svg/onload=alert(1)>',
];

test.describe('XSS injection resistance', () => {
  test('query param XSS: script tag is not executed', async ({ page }) => {
    const payload = '<script>alert(1)</script>';
    let alertFired = false;

    page.on('dialog', async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    await page.goto(`/inventory?q=${encodeURIComponent(payload)}`);
    await page.waitForTimeout(1000);

    expect(alertFired, 'XSS script tag was executed').toBe(false);

    const bodyHtml = await page.content();
    expect(
      bodyHtml,
      'Raw script tag found in page HTML'
    ).not.toContain('<script>alert(1)</script>');
  });

  test('query param XSS: attribute injection is blocked', async ({ page }) => {
    const payload = '" onmouseover="alert(1)';
    let alertFired = false;

    page.on('dialog', async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    await page.goto(`/inventory?q=${encodeURIComponent(payload)}`);
    await page.waitForTimeout(1000);

    expect(alertFired, 'Attribute injection XSS was executed').toBe(false);

    const bodyHtml = await page.content();
    expect(bodyHtml).not.toContain('onmouseover="alert(1)');
  });

  test('all XSS payloads are neutralized in query params', async ({ page }) => {
    for (const payload of XSS_PAYLOADS) {
      let alertFired = false;

      page.on('dialog', async (dialog) => {
        alertFired = true;
        await dialog.dismiss();
      });

      await page.goto(`/inventory?q=${encodeURIComponent(payload)}`);
      await page.waitForTimeout(500);

      expect(alertFired, `XSS payload executed: ${payload}`).toBe(false);
    }
  });

  test('SQL injection in API returns safe response', async ({ request }) => {
    const payload = "' OR 1=1 --";
    const response = await request.get(`/api/inventory?make=${encodeURIComponent(payload)}`);

    // Should not return a server error (500) — indicates unhandled injection
    expect(response.status()).toBeLessThan(500);

    const body = await response.text();
    // Should not contain SQL error messages
    expect(body.toLowerCase()).not.toContain('sql syntax');
    expect(body.toLowerCase()).not.toContain('sqlite_error');
    expect(body.toLowerCase()).not.toContain('pg_query');
    expect(body.toLowerCase()).not.toContain('uncaught exception');
  });

  test('contact form XSS in message field is sanitized', async ({ page }) => {
    await page.goto('/contact');

    // Fill out the contact form — look for common form field selectors
    const nameField = page.locator(
      'input[name="name"], input[id="name"], input[placeholder*="name" i]'
    ).first();
    const emailField = page.locator(
      'input[name="email"], input[id="email"], input[type="email"]'
    ).first();
    const messageField = page.locator(
      'textarea[name="message"], textarea[id="message"], textarea'
    ).first();

    if ((await nameField.count()) > 0) {
      await nameField.fill('Test User');
    }
    if ((await emailField.count()) > 0) {
      await emailField.fill('test@example.com');
    }

    const xssMessage = '<script>alert(1)</script><img src=x onerror=alert(1)>';

    if ((await messageField.count()) > 0) {
      await messageField.fill(xssMessage);

      let alertFired = false;
      page.on('dialog', async (dialog) => {
        alertFired = true;
        await dialog.dismiss();
      });

      // Submit the form
      const submitButton = page.locator(
        'button[type="submit"], input[type="submit"], button:has-text("Send"), button:has-text("Submit")'
      ).first();

      if ((await submitButton.count()) > 0) {
        await submitButton.click();
        await page.waitForTimeout(1000);
      }

      expect(alertFired, 'XSS in contact form message was executed').toBe(false);

      // Check that the raw payload is not reflected unescaped outside of form inputs
      const bodyHtml = await page.evaluate(() => {
        // Remove textarea/input values from the check — they hold user input, not rendered HTML
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('textarea, input').forEach(el => el.remove());
        return clone.innerHTML;
      });
      expect(bodyHtml).not.toContain('<script>alert(1)</script>');
      expect(bodyHtml).not.toContain('onerror=alert(1)');
    }
  });
});
