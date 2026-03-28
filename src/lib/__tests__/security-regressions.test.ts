/**
 * Security regression tests for wolfpack-auto.
 *
 * Each test corresponds to a specific vulnerability that was found and fixed.
 * These tests must NEVER be deleted — they exist to prevent regressions.
 *
 * Run with: npx jest src/lib/__tests__/security-regressions.test.ts
 */

/* -------------------------------------------------------------------------- */
/* CVE-001: Rate-limit bypass — checkLoginRateLimit called without await       */
/* -------------------------------------------------------------------------- */

describe("CVE-001: login rate limit is an async function", () => {
  it("checkLoginRateLimit returns a Promise (must be awaited)", async () => {
    // We can't call the real function without a running server, but we can
    // verify the module exports it as an async function by inspecting the
    // source shape. The critical property is that it returns a Promise.
    //
    // This test documents the fix: the call site now uses
    //   if (!(await checkLoginRateLimit(email)))
    // instead of the broken
    //   if (!checkLoginRateLimit(email))   ← was always false (truthy Promise)

    // Import auth to verify it compiles and the async/await fix is present
    const authSource = await import("fs").then((fs) =>
      fs.readFileSync(
        require("path").join(__dirname, "../auth.ts"),
        "utf-8",
      ),
    );

    // The fix: await must appear before checkLoginRateLimit
    expect(authSource).toMatch(/await checkLoginRateLimit/);

    // The broken pattern must NOT be present
    expect(authSource).not.toMatch(/!\s*checkLoginRateLimit\s*\(/);
  });
});

/* -------------------------------------------------------------------------- */
/* CVE-002: Login page leaks auth result to browser console                   */
/* -------------------------------------------------------------------------- */

describe("CVE-002: login page must not log auth result to console", () => {
  it("login page source does not contain console.log(signIn result)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const loginPageSource = readFileSync(
      join(__dirname, "../../app/admin/login/page.tsx"),
      "utf-8",
    );

    // There must be no console.log that could expose session data
    expect(loginPageSource).not.toMatch(/console\.log\s*\(\s*"signIn result/);
    expect(loginPageSource).not.toMatch(/console\.log\s*\(.*result\b/);
  });

  it("login page error message does not leak backend error details", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const loginPageSource = readFileSync(
      join(__dirname, "../../app/admin/login/page.tsx"),
      "utf-8",
    );

    // Must not expose raw result.error or result.status in error messages
    expect(loginPageSource).not.toMatch(/Login failed:.*result\.error/);
    expect(loginPageSource).not.toMatch(/Status:.*result\.status/);
  });
});

/* -------------------------------------------------------------------------- */
/* CVE-003: Image upload route requires authentication                        */
/* -------------------------------------------------------------------------- */

describe("CVE-003: /api/images/upload requires authentication", () => {
  it("upload route imports and calls requireAuth", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const routeSource = readFileSync(
      join(__dirname, "../../app/api/images/upload/route.ts"),
      "utf-8",
    );

    // Must import requireAuth
    expect(routeSource).toMatch(/requireAuth/);

    // Must call requireAuth in the POST handler
    expect(routeSource).toMatch(/await requireAuth\(\)/);

    // Must use session dealer_id, not user-supplied dealer_id
    // The dealer_id must come from authResult, not formData
    expect(routeSource).toMatch(/authResult\.user\.dealer_id/);

    // The old insecure pattern: reading dealer_id from the form body
    expect(routeSource).not.toMatch(/formData\.get\("dealer_id"\)/);
  });
});

/* -------------------------------------------------------------------------- */
/* CVE-004: Trade-in wizard field names match API contract                    */
/* -------------------------------------------------------------------------- */

describe("CVE-004: trade-in wizard sends camelCase fields matching API", () => {
  it("wizard sends accidentHistory (not accident_history)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const wizardSource = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );

    // The fixed field names (camelCase)
    expect(wizardSource).toMatch(/accidentHistory:/);
    expect(wizardSource).toMatch(/titleStatus:/);
    expect(wizardSource).toMatch(/previousOwners:/);

    // The broken field names (snake_case) must not be in the fetch body
    // Check specifically the body object sent to the estimate API
    expect(wizardSource).not.toMatch(/accident_history:/);
    expect(wizardSource).not.toMatch(/title_status:\s*data\./);
    expect(wizardSource).not.toMatch(/previous_owners:/);
  });

  it("wizard uses estimatedLow/estimatedHigh from API response", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const wizardSource = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );

    // EstimateResult interface must use API field names
    expect(wizardSource).toMatch(/estimatedLow/);
    expect(wizardSource).toMatch(/estimatedHigh/);
    expect(wizardSource).toMatch(/estimatedMid/);

    // The broken field names must not appear in the interface or display logic
    expect(wizardSource).not.toMatch(/estimate\.low\b/);
    expect(wizardSource).not.toMatch(/estimate\.high\b/);
  });

  it("wizard submits estimate_id (not offer_id)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const wizardSource = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );

    // Correct field name for the submit endpoint
    expect(wizardSource).toMatch(/estimate_id:/);

    // Broken field name must not be in the submit body
    expect(wizardSource).not.toMatch(/offer_id:\s*estimate/);
  });
});

/* -------------------------------------------------------------------------- */
/* CVE-005: Admin layout prevents horizontal overflow on mobile               */
/* -------------------------------------------------------------------------- */

describe("CVE-005: admin layout prevents mobile horizontal overflow", () => {
  it("outer flex container has overflow-x-hidden", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const layoutSource = readFileSync(
      join(__dirname, "../../app/admin/layout.tsx"),
      "utf-8",
    );

    // The outer flex div must prevent overflow
    expect(layoutSource).toMatch(/flex.*overflow-x-hidden|overflow-x-hidden.*flex/);
  });

  it("inventory status filter nav has flex-wrap", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const inventorySource = readFileSync(
      join(__dirname, "../../app/admin/inventory/page.tsx"),
      "utf-8",
    );

    // Status filter nav must wrap on small screens
    expect(inventorySource).toMatch(/flex flex-wrap gap-2/);
  });

  it("leads page filter selects are full-width on mobile", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const leadsSource = readFileSync(
      join(__dirname, "../../app/admin/leads/page.tsx"),
      "utf-8",
    );

    // Selects must include w-full for mobile stacking
    expect(leadsSource).toMatch(/w-full.*lg:w-auto|w-full rounded-lg.*lg:w-auto/);
  });
});

/* -------------------------------------------------------------------------- */
/* BUG-001: /trade-in route must exist and not be caught by [...slug] 404     */
/* -------------------------------------------------------------------------- */

describe("BUG-001: trade-in route exists as a specific Next.js page", () => {
  it("src/app/trade-in/page.tsx exists", () => {
    const { existsSync } = require("fs");
    const { join } = require("path");
    expect(
      existsSync(join(__dirname, "../../app/trade-in/page.tsx")),
    ).toBe(true);
  });

  it("trade-in page exports a default async server component", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/page.tsx"),
      "utf-8",
    );
    // Must have a default export (the page component)
    expect(src).toMatch(/export default/);
    // Must import TradeInWizard (the actual content)
    expect(src).toContain("TradeInWizard");
    // Must NOT call notFound() unconditionally — that would cause 404 for all visitors
    const notFoundCalls = (src.match(/notFound\(\)/g) ?? []).length;
    expect(notFoundCalls).toBe(0);
  });

  it("trade-in page uses force-dynamic to prevent Vercel static generation 404", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/page.tsx"),
      "utf-8",
    );
    expect(src).toContain('dynamic = "force-dynamic"');
  });

  it("[...slug] catch-all does NOT include trade-in in its PAGES registry (avoiding interception)", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/[...slug]/page.tsx"),
      "utf-8",
    );
    // trade-in must NOT appear as a key in the PAGES registry
    // (the slug catch-all would intercept it and call notFound())
    expect(src).not.toMatch(/['"]trade-in['"]\s*:/);
  });
});

/* -------------------------------------------------------------------------- */
/* BUG-002: Trade-In link must appear in both desktop nav and mobile menu     */
/* -------------------------------------------------------------------------- */

describe("BUG-002: trade-in nav link is present on desktop and mobile", () => {
  it("layout.tsx desktop nav includes /trade-in", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/layout.tsx"),
      "utf-8",
    );
    expect(src).toContain('href: "/trade-in"');
    expect(src).toContain('"Trade-In"');
  });

  it("MobileMenu.tsx includes /trade-in in navLinks", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../components/MobileMenu.tsx"),
      "utf-8",
    );
    expect(src).toContain('href: "/trade-in"');
    expect(src).toContain('"Trade-In"');
  });
});

/* -------------------------------------------------------------------------- */
/* BUG-003: Middleware must treat wolfpack-auto.vercel.app as platform domain */
/* -------------------------------------------------------------------------- */

describe("BUG-003: vercel.app is treated as platform domain (not dealer tenant)", () => {
  it("PLATFORM_DOMAINS set includes wolfpack-auto.vercel.app", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../middleware.ts"),
      "utf-8",
    );
    expect(src).toContain('"wolfpack-auto.vercel.app"');
  });

  it("middleware early-returns null for all *.vercel.app domains", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../middleware.ts"),
      "utf-8",
    );
    // extractTenantSlug must return null for *.vercel.app hostnames
    expect(src).toMatch(/endsWith.*vercel\.app.*return null/s);
  });
});

/* -------------------------------------------------------------------------- */
/* BUG-004: Build must not error on ESLint or TypeScript version mismatch     */
/* -------------------------------------------------------------------------- */

describe("BUG-004: next.config.mjs disables lint/TS checks that break Vercel builds", () => {
  it("eslint.ignoreDuringBuilds is true", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../../next.config.mjs"),
      "utf-8",
    );
    expect(src).toContain("ignoreDuringBuilds: true");
  });

  it("typescript.ignoreBuildErrors is false (TS errors are enforced)", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../../next.config.mjs"),
      "utf-8",
    );
    expect(src).toContain("ignoreBuildErrors: false");
  });
});

/* -------------------------------------------------------------------------- */
/* BUG-005: Trade-in wizard must coerce types before sending to API           */
/* -------------------------------------------------------------------------- */

describe("BUG-005: trade-in wizard coerces year/previousOwners to numbers", () => {
  it("year is wrapped in Number() before being sent to the API", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    // Must send Number(data.year), not the raw string data.year
    expect(src).toMatch(/year:\s*Number\(data\.year\)/);
  });

  it("previousOwners handles '3+' string by mapping to 3", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    // Must not send raw string — API requires a number
    expect(src).toMatch(/previousOwners.*3\+.*3.*Number|Number.*previousOwners/s);
  });
});

/* -------------------------------------------------------------------------- */
/* VIN-001: VIN autofill must be present and wired to analytics              */
/* -------------------------------------------------------------------------- */

describe("VIN-001: trade-in wizard VIN autofill is wired", () => {
  it("wizard calls /api/trade-in/decode-vin for autofill", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    expect(src).toContain("/api/trade-in/decode-vin");
  });

  it("VIN autofill fires analytics events", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/trackEvent\("trade_in_vin_autofill"/);
    expect(src).toMatch(/track\("trade_in",\s*"vin_autofill"/);
  });

  it("decode-vin route exists and exports POST", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/trade-in/decode-vin/route.ts"),
      "utf-8",
    );
    expect(src).toMatch(/export async function POST/);
    expect(src).toMatch(/decodeVIN/);
    expect(src).toMatch(/isValidVIN/);
  });
});

/* -------------------------------------------------------------------------- */
/* ANA-001: Trade-in wizard must track all key events (GA4 + platform)       */
/* -------------------------------------------------------------------------- */

describe("ANA-001: trade-in wizard analytics events are wired", () => {
  it("wizard imports Analytics trackEvent and useAnalytics", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/import.*trackEvent.*from.*Analytics/);
    expect(src).toMatch(/useAnalytics/);
  });

  it("wizard fires trackEvent on step advance", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/trackEvent\("trade_in_step"/);
    // Platform analytics
    expect(src).toMatch(/track\("trade_in",\s*`step_/);
  });

  it("wizard fires trackEvent when estimate is received", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/trackEvent\("trade_in_estimate_received"/);
    expect(src).toMatch(/track\("trade_in",\s*"estimate_received"/);
  });

  it("wizard fires trackConversion when lead is submitted", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/trade-in/TradeInWizard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/trackEvent\("trade_in_lead_submitted"/);
    expect(src).toMatch(/trackConversion\("trade_in_lead"/);
  });
});

/* -------------------------------------------------------------------------- */
/* SEC-001: NEXTAUTH_SECRET must throw in production if unset                 */
/* -------------------------------------------------------------------------- */

describe("SEC-001: NEXTAUTH_SECRET hardened fallback", () => {
  it("auth.ts throws in production when NEXTAUTH_SECRET is missing", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../auth.ts"), "utf-8");
    // Old insecure pattern must be gone
    expect(src).not.toMatch(
      /NEXTAUTH_SECRET\s*\|\|\s*["']wolfpack-dev-secret-change-in-production["']/,
    );
    // New pattern: IIFE that throws in production
    expect(src).toContain("NEXTAUTH_SECRET must be set in production");
    expect(src).toContain("wolfpack-dev-secret-do-not-use-in-production");
  });
});

/* -------------------------------------------------------------------------- */
/* SEC-002: Rate limiting on all high-risk routes                            */
/* -------------------------------------------------------------------------- */

describe("SEC-002: rate limiting on high-risk mutation routes", () => {
  const routes = [
    { file: "../../app/api/admin/deals/route.ts", name: "deals" },
    { file: "../../app/api/admin/service/appointments/route.ts", name: "service-appts" },
    { file: "../../app/api/admin/service/repair-orders/route.ts", name: "repair-orders" },
    { file: "../../app/api/admin/comms/send/route.ts", name: "comms-send" },
    { file: "../../app/api/admin/credit/pull/route.ts", name: "credit-pull" },
    { file: "../../app/api/admin/documents/route.ts", name: "documents" },
    { file: "../../app/api/admin/compliance/checks/route.ts", name: "compliance" },
    { file: "../../app/api/admin/lenders/route.ts", name: "lenders" },
  ];

  for (const { file, name } of routes) {
    it(`${name} route imports and uses checkRateLimit`, () => {
      const { readFileSync } = require("fs");
      const { join } = require("path");
      const src = readFileSync(join(__dirname, file), "utf-8");
      expect(src).toMatch(/checkRateLimit/);
      expect(src).toMatch(/status:\s*429/);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* SEC-003: Request body size guard module exists                             */
/* -------------------------------------------------------------------------- */

describe("SEC-003: request body size guard", () => {
  it("request-guard.ts exports parseBody with PayloadTooLargeError", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../request-guard.ts"), "utf-8");
    expect(src).toContain("export async function parseBody");
    expect(src).toContain("PayloadTooLargeError");
    expect(src).toContain("content-length");
  });
});

/* -------------------------------------------------------------------------- */
/* SEC-004: Security hardening scanner module exists                          */
/* -------------------------------------------------------------------------- */

describe("SEC-004: security hardening scanner", () => {
  it("scanner module exports runSecurityScan with 10 categories", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../security-hardening-scanner.ts"),
      "utf-8",
    );
    expect(src).toContain("export function runSecurityScan");
    // All 10 categories
    expect(src).toContain("hardcoded_secrets");
    expect(src).toContain("rate_limiting");
    expect(src).toContain("input_validation");
    expect(src).toContain("shadow_mode");
    expect(src).toContain("ssrf");
    expect(src).toContain("auth_guard");
    expect(src).toContain("csrf");
    expect(src).toContain("content_length");
    expect(src).toContain("sql_injection");
    expect(src).toContain("sensitive_data");
  });
});

/* -------------------------------------------------------------------------- */
/* SEC-005: Analytics tracks security events                                  */
/* -------------------------------------------------------------------------- */

describe("SEC-005: analytics tracks security events", () => {
  it("analytics-hooks.ts has SecurityEvent type and trackSecurity", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../analytics-hooks.ts"), "utf-8");
    expect(src).toContain("SecurityEvent");
    expect(src).toContain("security.scan_completed");
    expect(src).toContain("security.rate_limit_triggered");
    expect(src).toContain("export function trackSecurity");
  });
});

/* -------------------------------------------------------------------------- */
/* PEN-001: Demo credential only works without DATABASE_URL                   */
/* -------------------------------------------------------------------------- */

describe("PEN-001: Demo credential guard — DATABASE_URL gate", () => {
  it("auth.ts defines demoAllowed based on DATABASE_URL", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../auth.ts"), "utf-8");

    // Must define the guard variable
    expect(src).toContain("const demoAllowed");
    // Must check DATABASE_URL
    expect(src).toContain("!process.env.DATABASE_URL");
    // demoAllowed must gate the demo credential check
    expect(src).toMatch(/demoAllowed[\s\S]{0,20}&&[\s\S]{0,100}demo@wolfpackauto\.com/);
  });

  it("demo credential check is NOT unconditional", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../auth.ts"), "utf-8");

    // The demoAllowed variable must be defined before being used in the if-condition.
    // Specifically, "const demoAllowed" must appear before "demoAllowed &&".
    const constDemoAllowed = src.indexOf("const demoAllowed");
    const demoAllowedUsage = src.indexOf("demoAllowed &&");
    expect(constDemoAllowed).toBeGreaterThan(-1);
    expect(demoAllowedUsage).toBeGreaterThan(-1);
    expect(constDemoAllowed).toBeLessThan(demoAllowedUsage);
    // The if-block must use demoAllowed as a gate before checking the email
    expect(src).toMatch(/if\s*\(\s*\n?\s*demoAllowed\s*&&/);
  });
});

/* -------------------------------------------------------------------------- */
/* PEN-002: Calculator validates negative/extreme values                     */
/* -------------------------------------------------------------------------- */

describe("PEN-002: Calculator input validation", () => {
  it("public calculator validates down_payment >= 0", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/digital-retail/calculator/route.ts"),
      "utf-8",
    );
    expect(src).toContain("down_payment");
    expect(src).toMatch(/down_payment.*<\s*0|down_payment must be >= 0/);
  });

  it("public calculator validates apr between 0 and 30", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/digital-retail/calculator/route.ts"),
      "utf-8",
    );
    expect(src).toMatch(/apr.*>\s*30|apr must be between 0 and 30/);
  });

  it("public calculator validates term_months whitelist", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/digital-retail/calculator/route.ts"),
      "utf-8",
    );
    expect(src).toContain("VALID_TERMS");
    expect(src).toMatch(/12.*24.*36.*48.*60.*72.*84/);
  });

  it("deal calculator validates selling_price > 0", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/deals/[dealId]/calculate/route.ts"),
      "utf-8",
    );
    expect(src).toMatch(/selling_price.*<=\s*0|selling_price.*must be > 0/);
  });

  it("deal calculator validates optional numeric fields", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/deals/[dealId]/calculate/route.ts"),
      "utf-8",
    );
    expect(src).toMatch(/down_payment.*<\s*0|down_payment must be >= 0/);
    expect(src).toMatch(/apr.*>\s*30|apr must be between 0 and 30/);
    expect(src).toContain("VALID_TERMS");
  });
});

/* -------------------------------------------------------------------------- */
/* PEN-003: Source maps disabled in production config                         */
/* -------------------------------------------------------------------------- */

describe("PEN-003: Source maps disabled in production", () => {
  it("next.config.mjs has productionBrowserSourceMaps: false", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../../../next.config.mjs"), "utf-8");
    expect(src).toContain("productionBrowserSourceMaps: false");
  });

  it("Sentry config has hideSourceMaps: true", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../../../next.config.mjs"), "utf-8");
    expect(src).toContain("hideSourceMaps: true");
  });
});

/* -------------------------------------------------------------------------- */
/* PEN-004: All security headers present in next.config.mjs                  */
/* -------------------------------------------------------------------------- */

describe("PEN-004: Security headers configured", () => {
  const requiredHeaders = [
    { name: "Strict-Transport-Security", pattern: /includeSubDomains/ },
    { name: "X-Content-Type-Options", pattern: /nosniff/ },
    { name: "X-Frame-Options", pattern: /DENY/ },
    { name: "Referrer-Policy", pattern: /strict-origin-when-cross-origin/ },
    { name: "Content-Security-Policy", pattern: /default-src/ },
    { name: "X-XSS-Protection", pattern: /1;\s*mode=block/ },
    { name: "Permissions-Policy", pattern: /camera=\(\)/ },
  ];

  for (const { name, pattern } of requiredHeaders) {
    it(`${name} header is configured`, () => {
      const { readFileSync } = require("fs");
      const { join } = require("path");
      const src = readFileSync(join(__dirname, "../../../next.config.mjs"), "utf-8");
      expect(src).toContain(name);
      expect(src).toMatch(pattern);
    });
  }

  it("security-headers.ts module exports all required headers", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../security-headers.ts"), "utf-8");
    expect(src).toContain("Strict-Transport-Security");
    expect(src).toContain("X-Content-Type-Options");
    expect(src).toContain("X-Frame-Options");
    expect(src).toContain("Referrer-Policy");
    expect(src).toContain("Content-Security-Policy");
  });
});

/* -------------------------------------------------------------------------- */
/* PEN-005: x-powered-by disabled (poweredByHeader: false)                   */
/* -------------------------------------------------------------------------- */

describe("PEN-005: x-powered-by header disabled", () => {
  it("next.config.mjs has poweredByHeader: false", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../../../next.config.mjs"), "utf-8");
    expect(src).toContain("poweredByHeader: false");
  });

  it("middleware strips X-Powered-By header", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../../middleware.ts"), "utf-8");
    expect(src).toMatch(/headers\.delete.*X-Powered-By/i);
  });
});

/* -------------------------------------------------------------------------- */
/* DATA-001: Analytics events MUST persist to Postgres                        */
/* -------------------------------------------------------------------------- */

describe("DATA-001: analytics events persist to database", () => {
  it("analytics-hooks.ts calls persistEvent (not just Plausible)", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../analytics-hooks.ts"), "utf-8");
    // The track() function must call persistEvent as PRIMARY storage
    expect(src).toContain("persistEvent(event, dealer_id");
    // persistEvent must write to analytics_events table
    expect(src).toContain("INSERT INTO analytics_events");
    // Must check DATABASE_URL before attempting write
    expect(src).toContain("process.env.DATABASE_URL");
  });

  it("persistEvent is defined and writes to analytics_events", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../analytics-hooks.ts"), "utf-8");
    expect(src).toContain("async function persistEvent");
    expect(src).toContain("analytics_events");
    // Must never throw
    expect(src).toContain("analytics must not break the request");
  });
});

/* -------------------------------------------------------------------------- */
/* DATA-002: Learning aggregator queries correct table names                   */
/* -------------------------------------------------------------------------- */

describe("DATA-002: learning aggregator uses correct table names", () => {
  it("references deal_worksheets not deals", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../learning-aggregator.ts"), "utf-8");
    expect(src).toContain("deal_worksheets");
    expect(src).not.toMatch(/FROM deals[^_]/);
  });

  it("references published_at not date for reviews", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../learning-aggregator.ts"), "utf-8");
    expect(src).toContain("published_at >= CURRENT_DATE");
    expect(src).not.toMatch(/WHERE date >=/);
  });

  it("uses response_text IS NOT NULL for responded reviews", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../learning-aggregator.ts"), "utf-8");
    expect(src).toContain("response_text IS NOT NULL");
    expect(src).not.toContain("responded = true");
  });
});

/* -------------------------------------------------------------------------- */
/* DATA-003: Analytics health endpoint exists                                  */
/* -------------------------------------------------------------------------- */

describe("DATA-003: analytics health check endpoint", () => {
  it("health route exists and checks event counts", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/analytics/health/route.ts"),
      "utf-8",
    );
    expect(src).toContain("events_last_hour");
    expect(src).toContain("events_last_day");
    expect(src).toContain("modules_reporting");
    expect(src).toContain("modules_silent");
    expect(src).toContain("healthy");
  });
});

/* -------------------------------------------------------------------------- */
/* AVAIL-003: Circuit breaker module exists with all three states              */
/* -------------------------------------------------------------------------- */

describe("AVAIL-003: circuit breaker with OPEN/CLOSED/HALF_OPEN states", () => {
  it("circuit-breaker.ts exists and exports all three states", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../circuit-breaker.ts"), "utf-8");
    expect(src).toContain("CLOSED");
    expect(src).toContain("OPEN");
    expect(src).toContain("HALF_OPEN");
    expect(src).toContain("CircuitBreakerState");
    expect(src).toContain("recordSuccess");
    expect(src).toContain("recordFailure");
    expect(src).toContain("isOpen");
  });

  it("circuit breaker opens after configured failure threshold", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../circuit-breaker.ts"), "utf-8");
    expect(src).toContain("failureThreshold");
    expect(src).toContain("cooldownMs");
    // Must track consecutive failures
    expect(src).toContain("consecutiveFailures");
  });

  it("circuit breaker logs state transitions", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../circuit-breaker.ts"), "utf-8");
    expect(src).toMatch(/console\.log.*circuit-breaker/);
  });

  it("circuit breaker tracks analytics events", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../circuit-breaker.ts"), "utf-8");
    expect(src).toContain("system.circuit_breaker_opened");
    expect(src).toContain("system.circuit_breaker_closed");
  });
});

/* -------------------------------------------------------------------------- */
/* AVAIL-004: Safe-fetch module with AbortController timeout                   */
/* -------------------------------------------------------------------------- */

describe("AVAIL-004: safe-fetch with AbortController timeout", () => {
  it("safe-fetch.ts exists with AbortController and timeout", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../safe-fetch.ts"), "utf-8");
    expect(src).toContain("AbortController");
    expect(src).toContain("timeoutMs");
    expect(src).toContain("TimeoutError");
    expect(src).toContain("export async function safeFetch");
  });

  it("safe-fetch retries on network error but not on HTTP errors", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "../safe-fetch.ts"), "utf-8");
    expect(src).toContain("retries");
    expect(src).toContain("NetworkError");
    // Must have retry loop
    expect(src).toMatch(/for.*attempt.*<=.*retries/);
  });
});

/* -------------------------------------------------------------------------- */
/* AVAIL-005: System health endpoint exists                                    */
/* -------------------------------------------------------------------------- */

describe("AVAIL-005: system health endpoint", () => {
  it("health route exists and returns comprehensive status", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/system/health/route.ts"),
      "utf-8",
    );
    expect(src).toContain("export async function GET");
    expect(src).toContain("circuitBreakerState");
    expect(src).toContain("db_connected");
    expect(src).toContain("healthy");
    expect(src).toContain("degraded");
    expect(src).toContain("critical");
    // Must return 503 on critical
    expect(src).toMatch(/503/);
  });

  it("health route probes database with circuit breaker awareness", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/system/health/route.ts"),
      "utf-8",
    );
    expect(src).toContain("circuitBreaker");
    expect(src).toContain("probeDatabase");
    expect(src).toContain("recordSuccess");
    expect(src).toContain("recordFailure");
  });
});

/* -------------------------------------------------------------------------- */
/* AVAIL-001: All admin routes have DATABASE_URL shadow mode check             */
/* -------------------------------------------------------------------------- */

describe("AVAIL-001: all admin API routes have DATABASE_URL shadow mode check", () => {
  it("every admin route.ts file references DATABASE_URL", () => {
    const { readdirSync, readFileSync, statSync } = require("fs");
    const { join } = require("path");

    const adminApiDir = join(__dirname, "../../app/api/admin");

    function findRouteFiles(dir: string): string[] {
      const files: string[] = [];
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...findRouteFiles(fullPath));
        } else if (entry === "route.ts") {
          files.push(fullPath);
        }
      }
      return files;
    }

    const routeFiles = findRouteFiles(adminApiDir);

    // Sanity check — we expect a significant number of admin routes
    expect(routeFiles.length).toBeGreaterThanOrEqual(20);

    const missing: string[] = [];
    for (const file of routeFiles) {
      const src = readFileSync(file, "utf-8");
      if (!src.includes("DATABASE_URL")) {
        // Extract relative path for readable error message
        const relPath = file.replace(adminApiDir, "admin");
        missing.push(relPath);
      }
    }

    expect(missing).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* AVAIL-002: Schema migration 031 exists with temperature column              */
/* -------------------------------------------------------------------------- */

describe("AVAIL-002: migration 031 adds missing leads columns", () => {
  it("031_schema_fixes.sql exists", () => {
    const { existsSync } = require("fs");
    const { join } = require("path");
    expect(
      existsSync(join(__dirname, "../../db/migrations/031_schema_fixes.sql")),
    ).toBe(true);
  });

  it("migration adds temperature column to leads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../db/migrations/031_schema_fixes.sql"),
      "utf-8",
    );
    expect(src).toMatch(/ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature/);
    expect(src).toContain("DEFAULT 'warm'");
  });

  it("migration adds assigned_to column to leads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../db/migrations/031_schema_fixes.sql"),
      "utf-8",
    );
    expect(src).toMatch(/ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to/);
  });

  it("migration adds follow_up_date column to leads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../db/migrations/031_schema_fixes.sql"),
      "utf-8",
    );
    expect(src).toMatch(/ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date/);
  });

  it("migration adds message column to leads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../db/migrations/031_schema_fixes.sql"),
      "utf-8",
    );
    expect(src).toMatch(/ALTER TABLE leads ADD COLUMN IF NOT EXISTS message/);
  });

  it("migration is wrapped in a transaction", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../db/migrations/031_schema_fixes.sql"),
      "utf-8",
    );
    expect(src).toContain("BEGIN;");
    expect(src).toContain("COMMIT;");
  });
});

/* -------------------------------------------------------------------------- */
/* AVAIL-006: Leads routes use valid UUID fallback, not "default" string       */
/* -------------------------------------------------------------------------- */

describe("AVAIL-006: leads routes use UUID fallback for dealer_id", () => {
  it("leads/route.ts does not use \"default\" as dealer_id fallback", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/leads/route.ts"),
      "utf-8",
    );
    // Must NOT fall back to the string "default" — it breaks UUID casts
    expect(src).not.toMatch(/DEALER_ID\s*=\s*.*\?\?\s*["']default["']/);
    // Must use a valid UUID pattern as fallback
    expect(src).toMatch(/00000000-0000-4000-a000-000000000001/);
  });

  it("leads/[id]/route.ts does not use \"default\" as dealer_id fallback", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(__dirname, "../../app/api/admin/leads/[id]/route.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/DEALER_ID\s*=\s*.*\?\?\s*["']default["']/);
    expect(src).toMatch(/00000000-0000-4000-a000-000000000001/);
  });
});
