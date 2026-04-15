/**
 * Security headers configuration.
 *
 * Covers every header Dealer.com is currently missing:
 *   - HSTS with preload (production-only)
 *   - Content-Security-Policy (enforced, restrictive default)
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Permissions-Policy (camera, microphone, geolocation, FLoC)
 *   - X-Frame-Options: DENY (legacy browsers; frame-ancestors 'none' in CSP takes precedence)
 *   - X-XSS-Protection (legacy browsers)
 *
 * HSTS: production-only. After the domain has been live for >1 week with HSTS,
 * submit to https://hstspreload.org (follow-up action — do not submit yet).
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * CSP directives — enforced mode (not report-only).
 *
 * NOTE on 'unsafe-inline' in script-src:
 *   Next.js 14 injects inline scripts for its runtime hydration and
 *   error overlay in both dev and production builds. There is no
 *   first-party nonce support yet (experimentalCacheHandlers in
 *   Next.js 15 is in progress). Once Next.js ships stable nonce
 *   support, replace 'unsafe-inline' with 'nonce-${nonce}' here
 *   and in middleware.
 *
 *   'unsafe-eval' has been removed — it was never required by
 *   Next.js and posed a significant XSS escalation risk.
 *
 *   'unsafe-inline' remains in style-src because Tailwind CSS
 *   and Next.js both inject inline styles at runtime.
 *
 *   JSON-LD structured data (<script type="application/ld+json">)
 *   in inventory pages is server-rendered and covered by 'unsafe-inline'.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://images.unsplash.com",
  "font-src 'self'",
  "connect-src 'self' https://*.ingest.us.sentry.io https://*.ingest.sentry.io",
  "frame-src https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report",
] as const;

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Base security headers (always applied).
 */
const BASE_HEADERS: SecurityHeader[] = [
  {
    key: "Content-Security-Policy",
    value: CSP_DIRECTIVES.join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
];

/**
 * HSTS header — production-only.
 * max-age=63072000 = 2 years. includeSubDomains + preload for preload list eligibility.
 */
const HSTS_HEADER: SecurityHeader = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

export const SECURITY_HEADERS: SecurityHeader[] = IS_PROD
  ? [HSTS_HEADER, ...BASE_HEADERS]
  : BASE_HEADERS;

/**
 * Apply security headers to a Response object (for use in middleware).
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const { key, value } of SECURITY_HEADERS) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
