/**
 * Shadow Hardening — shared test utilities.
 *
 * Provides canonical page lists, expected security headers, XSS payloads,
 * and helper functions used across every shadow-hardening spec file.
 */
import { expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Pages to test — every public route in the dealer platform
// ---------------------------------------------------------------------------

export const SHADOW_PAGES = ["/", "/inventory", "/contact", "/about"] as const;

// ---------------------------------------------------------------------------
// Expected security headers (must match src/lib/security-headers.ts)
// ---------------------------------------------------------------------------

export const EXPECTED_HEADERS: Record<string, string | RegExp> = {
  "strict-transport-security":
    "max-age=63072000; includeSubDomains; preload",
  "content-security-policy": /default-src 'self'/,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
};

// ---------------------------------------------------------------------------
// XSS injection payloads
// ---------------------------------------------------------------------------

export const XSS_PAYLOADS: string[] = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg/onload=alert(1)>',
  "javascript:alert(document.cookie)",
  '<iframe src="javascript:alert(1)">',
  "';!--\"<XSS>=&{()}",
  '<body onload=alert("xss")>',
  "<input onfocus=alert(1) autofocus>",
  "${7*7}{{7*7}}<%= 7*7 %>",
  "' OR '1'='1'; --",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the page and verify it loaded successfully on the shadow
 * server. Waits for DOM content, checks for a non-error HTTP status,
 * and confirms the document title is non-empty.
 */
export async function waitForShadowReady(
  page: Page,
  path: string = "/",
): Promise<void> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });

  expect(
    response?.status(),
    `Shadow page ${path} returned HTTP ${response?.status()}`,
  ).toBeLessThan(400);

  const title = await page.title();
  expect(
    title.length,
    `Shadow page ${path} has an empty <title>`,
  ).toBeGreaterThan(0);
}
