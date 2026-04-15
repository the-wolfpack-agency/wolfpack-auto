/**
 * Security headers tests for Wolfpack Auto.
 *
 * Asserts:
 *   - CSP is enforced (no Content-Security-Policy-Report-Only)
 *   - HSTS max-age >= 31536000, includeSubDomains, preload (production)
 *   - HSTS not present in non-production
 *   - All secondary headers present with correct values
 *   - No unsafe-eval in production script-src
 *   - report-uri points at /api/csp-report
 */

describe("SECURITY_HEADERS", () => {
  function getHeaders(env: string = "test") {
    jest.resetModules();
    // @ts-expect-error override readonly NODE_ENV for test
    process.env.NODE_ENV = env;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SECURITY_HEADERS } = require("@/lib/security-headers") as {
      SECURITY_HEADERS: Array<{ key: string; value: string }>;
    };
    return SECURITY_HEADERS;
  }

  afterEach(() => {
    jest.resetModules();
    // @ts-expect-error
    process.env.NODE_ENV = "test";
  });

  it("includes Content-Security-Policy (enforced, not report-only)", () => {
    const headers = getHeaders();
    const cspHeader = headers.find((h) => h.key === "Content-Security-Policy");
    expect(cspHeader).toBeDefined();
    const reportOnly = headers.find((h) => h.key === "Content-Security-Policy-Report-Only");
    expect(reportOnly).toBeUndefined();
  });

  it("CSP contains report-uri /api/csp-report", () => {
    const headers = getHeaders();
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("CSP in production does not contain unsafe-eval", () => {
    const headers = getHeaders("production");
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).not.toContain("unsafe-eval");
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    const headers = getHeaders();
    const h = headers.find((h) => h.key === "X-Content-Type-Options");
    expect(h?.value).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", () => {
    const headers = getHeaders();
    const h = headers.find((h) => h.key === "X-Frame-Options");
    expect(h?.value).toBe("DENY");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", () => {
    const headers = getHeaders();
    const h = headers.find((h) => h.key === "Referrer-Policy");
    expect(h?.value).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy with camera, microphone, geolocation", () => {
    const headers = getHeaders();
    const pp = headers.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=");
  });

  it("does NOT set HSTS in non-production", () => {
    const headers = getHeaders("test");
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts).toBeUndefined();
  });

  it("sets HSTS in production with max-age >= 31536000, includeSubDomains, preload", () => {
    const headers = getHeaders("production");
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts).toBeDefined();
    const value = hsts?.value ?? "";
    const maxAgeMatch = value.match(/max-age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    const maxAge = parseInt(maxAgeMatch![1], 10);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
    expect(value).toContain("includeSubDomains");
    expect(value).toContain("preload");
  });
});
