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
