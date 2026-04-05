/**
 * Production blocker regression tests.
 *
 * 1. NEXTAUTH_SECRET fail-fast in production
 * 2. Billing page cleanup (no broken Stripe Portal link)
 * 3. Migration 055 RLS enforcement on core tables
 * 4. db.ts setTenantContext function
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helper: read a source file relative to project root
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, "../../..");

function readSrc(relativePath: string): string {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

// ===========================================================================
// 1. NEXTAUTH_SECRET fail-fast
// ===========================================================================

describe("NEXTAUTH_SECRET production fail-fast", () => {
  it("auth.ts throws in production when NEXTAUTH_SECRET is missing", () => {
    const src = readSrc("src/lib/auth.ts");

    // Must NOT have the old insecure console.error-only pattern
    expect(src).not.toMatch(
      /console\.error.*NEXTAUTH_SECRET.*Using insecure fallback/,
    );

    // Must throw in production
    expect(src).toMatch(/NODE_ENV\s*===\s*["']production["']/);
    expect(src).toContain("throw new Error");
    expect(src).toContain("NEXTAUTH_SECRET must be set in production");

    // Dev fallback must still exist for local development
    expect(src).toContain("wolfpack-dev-secret-do-not-use-in-production");
  });

  it("middleware.ts throws in production when NEXTAUTH_SECRET is missing", () => {
    const src = readSrc("src/middleware.ts");

    // Old insecure inline fallback must be gone
    expect(src).not.toMatch(
      /NEXTAUTH_SECRET\s*\|\|\s*["']wolfpack-dev-secret-change-in-production["']/,
    );

    // Must throw in production
    expect(src).toContain("NEXTAUTH_SECRET must be set in production");
    expect(src).toContain("throw new Error");

    // Dev fallback preserved
    expect(src).toContain("wolfpack-dev-secret-do-not-use-in-production");
  });

  it("switch-dealer route throws in production when NEXTAUTH_SECRET is missing", () => {
    const src = readSrc("src/app/api/admin/switch-dealer/route.ts");

    // Old insecure inline fallback must be gone
    expect(src).not.toMatch(
      /NEXTAUTH_SECRET\s*\|\|\s*["']wolfpack-dev-secret-do-not-use-in-production["']\s*;/,
    );

    // Must throw in production
    expect(src).toContain("NEXTAUTH_SECRET must be set in production");
    expect(src).toContain("throw new Error");
  });
});

// ===========================================================================
// 2. Billing page cleanup
// ===========================================================================

describe("Billing page cleanup", () => {
  it("billing page file exists", () => {
    expect(existsSync(join(ROOT, "src/app/admin/billing/page.tsx"))).toBe(true);
  });

  it("does not contain broken Stripe Portal link", () => {
    const src = readSrc("src/app/admin/billing/page.tsx");

    // No reference to Stripe billing portal URL
    expect(src).not.toContain("NEXT_PUBLIC_STRIPE_BILLING_URL");

    // No Manage Billing / Manage Subscription button pointing to Stripe
    expect(src).not.toMatch(/Manage\s+Billing/);
    expect(src).not.toMatch(/Manage\s+Subscription/);

    // No stripe_customer_id display logic
    expect(src).not.toContain("stripe_customer_id");
  });

  it("shows contact email for subscription management", () => {
    const src = readSrc("src/app/admin/billing/page.tsx");

    expect(src).toContain("billing@wolfpackauto.com");
    expect(src).toContain("Contact Us to Manage Your Subscription");
  });

  it("displays Current Plan: Professional", () => {
    const src = readSrc("src/app/admin/billing/page.tsx");

    expect(src).toContain("Current Plan: Professional");
  });

  it("tracks billing page view via analytics", () => {
    const src = readSrc("src/app/admin/billing/page.tsx");

    expect(src).toContain("system.analytics_queried");
    expect(src).toContain('module: "billing"');
  });
});

// ===========================================================================
// 3. Migration 055 RLS enforcement
// ===========================================================================

describe("Migration 055: RLS on core tables", () => {
  const MIGRATION_PATH = "src/db/migrations/055_enforce_rls.sql";

  it("migration file exists", () => {
    expect(existsSync(join(ROOT, MIGRATION_PATH))).toBe(true);
  });

  const CORE_TABLES = [
    "dealers",
    "dealer_users",
    "deal_worksheets",
    "service_appointments",
    "repair_orders",
    "documents",
    "reviews",
  ];

  let migrationSql: string;

  beforeAll(() => {
    migrationSql = readSrc(MIGRATION_PATH);
  });

  test.each(CORE_TABLES)("enables RLS on %s", (table) => {
    const pattern = new RegExp(
      `ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i",
    );
    expect(migrationSql).toMatch(pattern);
  });

  test.each(CORE_TABLES)("creates tenant policy on %s", (table) => {
    const pattern = new RegExp(
      `CREATE\\s+POLICY\\s+${table}_tenant\\s+ON\\s+${table}`,
      "i",
    );
    expect(migrationSql).toMatch(pattern);
  });

  test.each(CORE_TABLES)("drops existing policy before creating on %s", (table) => {
    const pattern = new RegExp(
      `DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${table}_tenant\\s+ON\\s+${table}`,
      "i",
    );
    expect(migrationSql).toMatch(pattern);
  });

  it("dealers table uses id (not dealer_id) for scoping", () => {
    // The dealers table scopes by its own id, not dealer_id
    expect(migrationSql).toMatch(
      /CREATE\s+POLICY\s+dealers_tenant\s+ON\s+dealers\s+USING\s*\(\s*id\s*=/i,
    );
  });

  test.each(CORE_TABLES.filter((t) => t !== "dealers"))(
    "%s uses dealer_id for scoping",
    (table) => {
      // All other tables scope by dealer_id
      const pattern = new RegExp(
        `CREATE\\s+POLICY\\s+${table}_tenant\\s+ON\\s+${table}\\s+USING\\s*\\(\\s*dealer_id\\s*=`,
        "i",
      );
      expect(migrationSql).toMatch(pattern);
    },
  );

  it("all policies reference app.current_dealer_id", () => {
    const matches = migrationSql.match(/current_setting\s*\(\s*'app\.current_dealer_id'/g);
    // 7 tables = 7 policy references
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(7);
  });
});

// ===========================================================================
// 4. db.ts setTenantContext
// ===========================================================================

describe("db.ts setTenantContext", () => {
  it("exports setTenantContext function", () => {
    const src = readSrc("src/lib/db.ts");
    expect(src).toContain("export async function setTenantContext");
  });

  it("sets app.current_dealer_id via SET LOCAL", () => {
    const src = readSrc("src/lib/db.ts");
    expect(src).toContain("SET LOCAL app.current_dealer_id");
  });

  it("validates dealer ID format to prevent injection", () => {
    const src = readSrc("src/lib/db.ts");
    // Must have UUID format validation
    expect(src).toMatch(/[0-9a-f].*[0-9a-f].*test\(dealerId\)/i);
    expect(src).toContain("Invalid dealer ID format");
  });
});
