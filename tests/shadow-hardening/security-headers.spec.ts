import { test, expect } from '@playwright/test';

const PAGES = ['/', '/inventory', '/contact', '/about'];

const REQUIRED_HEADERS: Record<string, string | RegExp> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-xss-protection': '1; mode=block',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

const FORBIDDEN_HEADERS = ['x-powered-by', 'server'];

const CSP_DIRECTIVES = ['default-src', 'script-src', 'style-src', 'frame-ancestors'];

for (const page of PAGES) {
  test.describe(`Security headers on ${page}`, () => {
    test(`should include all required security headers`, async ({ request }) => {
      const response = await request.get(page);
      const headers = response.headers();

      for (const [header, expected] of Object.entries(REQUIRED_HEADERS)) {
        const value = headers[header];
        expect(value, `Missing header: ${header}`).toBeDefined();
        if (typeof expected === 'string') {
          expect(value).toBe(expected);
        } else {
          expect(value).toMatch(expected);
        }
      }
    });

    test(`should include Content-Security-Policy with key directives`, async ({ request }) => {
      const response = await request.get(page);
      const csp = response.headers()['content-security-policy'];
      expect(csp, 'Content-Security-Policy header missing').toBeDefined();

      for (const directive of CSP_DIRECTIVES) {
        expect(csp, `CSP missing directive: ${directive}`).toContain(directive);
      }
    });

    test(`should include Permissions-Policy header`, async ({ request }) => {
      const response = await request.get(page);
      const pp = response.headers()['permissions-policy'];
      expect(pp, 'Permissions-Policy header missing').toBeDefined();
    });

    test(`should NOT expose X-Powered-By or Server headers`, async ({ request }) => {
      const response = await request.get(page);
      const headers = response.headers();

      for (const forbidden of FORBIDDEN_HEADERS) {
        expect(headers[forbidden], `Forbidden header present: ${forbidden}`).toBeUndefined();
      }
    });
  });
}
