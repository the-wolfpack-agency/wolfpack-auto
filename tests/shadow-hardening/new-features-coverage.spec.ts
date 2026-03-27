/**
 * new-features-coverage.spec.ts
 *
 * Shadow-hardening static analysis for every feature added in the production-
 * readiness sprint: email notifications, Sentry, admin inventory CRUD, dealer
 * settings, billing/Stripe, OEM middleware, provisioning scripts, backup
 * scripts, and shadow testing infrastructure.
 *
 * Zero browser / zero network — all assertions read source files on disk.
 * Runs in < 1 s and is safe in CI with no DB or server.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "../..");

function src(...parts: string[]): string {
  return path.join(ROOT, ...parts);
}

function read(...parts: string[]): string {
  const p = src(...parts);
  expect(fs.existsSync(p), `File must exist: ${p}`).toBe(true);
  return fs.readFileSync(p, "utf8");
}

function exists(...parts: string[]): boolean {
  return fs.existsSync(src(...parts));
}

// ---------------------------------------------------------------------------
// 1. Email module (src/lib/email.ts)
// ---------------------------------------------------------------------------

test.describe("Email module", () => {
  test("email.ts exists and exports core functions", () => {
    const code = read("src/lib/email.ts");
    expect(code).toContain("sendLeadNotification");
    expect(code).toContain("sendLeadConfirmation");
  });

  test("email.ts has null guard when RESEND_API_KEY absent", () => {
    const code = read("src/lib/email.ts");
    // Lazy init — client is null when key is absent
    expect(code).toContain("RESEND_API_KEY");
    expect(code).toMatch(/null|undefined/);
  });

  test("email.ts uses official Resend SDK", () => {
    const code = read("src/lib/email.ts");
    expect(code).toContain("from \"resend\"");
  });

  test("email.ts does not hard-code any API key", () => {
    const code = read("src/lib/email.ts");
    expect(code).not.toMatch(/re_[A-Za-z0-9]{20,}/);
  });

  test("email.ts fire-and-forget: errors are caught, not thrown", () => {
    const code = read("src/lib/email.ts");
    expect(code).toContain("catch");
    expect(code).toContain("console.error");
  });
});

// ---------------------------------------------------------------------------
// 2. Notifications module (src/lib/notifications.ts)
// ---------------------------------------------------------------------------

test.describe("Notifications module", () => {
  test("notifications.ts exists and uses Resend SDK", () => {
    const code = read("src/lib/notifications.ts");
    expect(code).toContain("Resend");
  });

  test("notifications.ts exports notifyNewLead", () => {
    const code = read("src/lib/notifications.ts");
    expect(code).toContain("notifyNewLead");
  });

  test("notifications.ts exports notifyContactFormSubmission", () => {
    const code = read("src/lib/notifications.ts");
    expect(code).toContain("notifyContactFormSubmission");
  });
});

// ---------------------------------------------------------------------------
// 3. Leads API fires email notifications
// ---------------------------------------------------------------------------

test.describe("Leads API email integration", () => {
  test("leads route imports email module", () => {
    const code = read("src/app/api/leads/route.ts");
    expect(code).toMatch(/email|notification/i);
  });

  test("contact route imports notification functions", () => {
    const code = read("src/app/api/contact/route.ts");
    expect(code).toMatch(/notification|email/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Sentry configuration files
// ---------------------------------------------------------------------------

test.describe("Sentry monitoring", () => {
  test("sentry.client.config.ts exists", () => {
    expect(exists("sentry.client.config.ts")).toBe(true);
  });

  test("sentry.server.config.ts exists", () => {
    expect(exists("sentry.server.config.ts")).toBe(true);
  });

  test("sentry.edge.config.ts exists", () => {
    expect(exists("sentry.edge.config.ts")).toBe(true);
  });

  test("sentry.client.config.ts initialises Sentry with DSN env var", () => {
    const code = read("sentry.client.config.ts");
    expect(code).toContain("Sentry.init");
    expect(code).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  test("sentry configs do not hard-code a DSN value", () => {
    for (const file of ["sentry.client.config.ts", "sentry.server.config.ts", "sentry.edge.config.ts"]) {
      const code = read(file);
      // Real DSN starts with https://...@o followed by digits
      expect(code).not.toMatch(/https:\/\/[a-f0-9]+@o\d+\.ingest\.sentry\.io/);
    }
  });

  test("sentry client config is safe to import without env vars (enabled: false path)", () => {
    const code = read("sentry.client.config.ts");
    expect(code).toContain("enabled");
  });

  test("global-error.tsx exists and captures exceptions via Sentry", () => {
    const code = read("src/app/global-error.tsx");
    expect(code).toContain("Sentry.captureException");
    expect(code).toContain("useEffect");
    expect(code).toContain('"use client"');
  });
});

// ---------------------------------------------------------------------------
// 5. next.config.mjs — Sentry wrapper + workspace root fix
// ---------------------------------------------------------------------------

test.describe("next.config.mjs", () => {
  test("wraps with withSentryConfig conditionally on SENTRY_AUTH_TOKEN", () => {
    const code = read("next.config.mjs");
    expect(code).toContain("withSentryConfig");
    expect(code).toContain("SENTRY_AUTH_TOKEN");
  });

  test("outputFileTracingRoot silences multi-lockfile warning", () => {
    const code = read("next.config.mjs");
    expect(code).toContain("outputFileTracingRoot");
    expect(code).toContain("__dirname");
  });

  test("Sentry config hides source maps from client bundle", () => {
    const code = read("next.config.mjs");
    expect(code).toContain("hideSourceMaps");
  });
});

// ---------------------------------------------------------------------------
// 6. Admin inventory — Add Vehicle page
// ---------------------------------------------------------------------------

test.describe("Admin inventory add page", () => {
  test("add/page.tsx exists", () => {
    expect(exists("src/app/admin/inventory/add/page.tsx")).toBe(true);
  });

  test("add page is a client component", () => {
    const code = read("src/app/admin/inventory/add/page.tsx");
    expect(code).toContain('"use client"');
  });

  test("add page has VIN input field", () => {
    const code = read("src/app/admin/inventory/add/page.tsx");
    expect(code).toMatch(/id=["']vin["']/);
  });

  test("add page has required price input", () => {
    const code = read("src/app/admin/inventory/add/page.tsx");
    expect(code).toMatch(/id=["']price["']/);
  });

  test("add page has year, make, model inputs", () => {
    const code = read("src/app/admin/inventory/add/page.tsx");
    expect(code).toMatch(/id=["']year["']/);
    expect(code).toMatch(/id=["']make["']/);
    expect(code).toMatch(/id=["']model["']/);
  });

  test("add page submits to inventory API endpoint", () => {
    const code = read("src/app/admin/inventory/add/page.tsx");
    expect(code).toContain("/api/admin/inventory");
  });

  test("add page has inline error display", () => {
    const code = read("src/app/admin/inventory/add/page.tsx");
    expect(code).toMatch(/error/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Admin inventory — Edit/Delete Vehicle page
// ---------------------------------------------------------------------------

test.describe("Admin inventory edit page", () => {
  test("edit/page.tsx exists", () => {
    expect(exists("src/app/admin/inventory/[vin]/edit/page.tsx")).toBe(true);
  });

  test("edit page is a client component", () => {
    const code = read("src/app/admin/inventory/[vin]/edit/page.tsx");
    expect(code).toContain('"use client"');
  });

  test("edit page has delete button", () => {
    const code = read("src/app/admin/inventory/[vin]/edit/page.tsx");
    expect(code).toMatch(/[Dd]elete/);
  });

  test("edit page calls DELETE API endpoint", () => {
    const code = read("src/app/admin/inventory/[vin]/edit/page.tsx");
    expect(code).toContain("DELETE");
    expect(code).toContain("/api/admin/inventory");
  });

  test("edit page has confirmation before delete", () => {
    const code = read("src/app/admin/inventory/[vin]/edit/page.tsx");
    // Either a confirm() call, a modal, or a confirmDelete state
    expect(code).toMatch(/confirm|modal|dialog/i);
  });
});

// ---------------------------------------------------------------------------
// 8. Admin inventory API routes
// ---------------------------------------------------------------------------

test.describe("Admin inventory API", () => {
  test("POST route exists at /api/admin/inventory/route.ts", () => {
    expect(exists("src/app/api/admin/inventory/route.ts")).toBe(true);
  });

  test("POST route requires authentication", () => {
    const code = read("src/app/api/admin/inventory/route.ts");
    expect(code).toContain("requireAuth");
  });

  test("POST route validates VIN format", () => {
    const code = read("src/app/api/admin/inventory/route.ts");
    expect(code).toMatch(/VIN|vin.*pattern|17/i);
  });

  test("POST route returns 400 for missing required fields", () => {
    const code = read("src/app/api/admin/inventory/route.ts");
    expect(code).toContain("400");
    expect(code).toMatch(/missing|required/i);
  });

  test("POST route returns 409 for duplicate VIN", () => {
    const code = read("src/app/api/admin/inventory/route.ts");
    expect(code).toContain("409");
  });

  test("PUT route exists for vehicle updates", () => {
    expect(exists("src/app/api/admin/inventory/[vin]/route.ts")).toBe(true);
    const code = read("src/app/api/admin/inventory/[vin]/route.ts");
    expect(code).toContain("PUT");
  });

  test("DELETE route exists for vehicle removal", () => {
    const code = read("src/app/api/admin/inventory/[vin]/route.ts");
    expect(code).toContain("DELETE");
  });

  test("PUT/DELETE routes require authentication", () => {
    const code = read("src/app/api/admin/inventory/[vin]/route.ts");
    expect(code).toContain("requireAuth");
  });

  test("PUT route returns 404 when VIN not found for this dealer", () => {
    const code = read("src/app/api/admin/inventory/[vin]/route.ts");
    expect(code).toContain("404");
  });

  test("PUT route builds dynamic SET clause (no SQL injection via fixed allowlist)", () => {
    const code = read("src/app/api/admin/inventory/[vin]/route.ts");
    expect(code).toMatch(/allowedFields|allowlist|allowed/i);
  });

  test("inventory routes have audit logging", () => {
    const post = read("src/app/api/admin/inventory/route.ts");
    const putDel = read("src/app/api/admin/inventory/[vin]/route.ts");
    expect(post + putDel).toContain("auditLog");
  });
});

// ---------------------------------------------------------------------------
// 9. Admin settings page
// ---------------------------------------------------------------------------

test.describe("Admin settings page", () => {
  test("settings/page.tsx exists", () => {
    expect(exists("src/app/admin/settings/page.tsx")).toBe(true);
  });

  test("settings page exports metadata", () => {
    const code = read("src/app/admin/settings/page.tsx");
    expect(code).toMatch(/export.*metadata|generateMetadata/);
  });

  test("settings page has dealer name input", () => {
    const code = read("src/app/admin/settings/page.tsx");
    expect(code).toMatch(/dealer-name|name.*input|input.*name/i);
  });

  test("settings page has color inputs for branding", () => {
    const code = read("src/app/admin/settings/page.tsx");
    expect(code).toMatch(/color/i);
  });
});

// ---------------------------------------------------------------------------
// 10. Admin settings API
// ---------------------------------------------------------------------------

test.describe("Admin settings API", () => {
  test("settings API route exists", () => {
    expect(exists("src/app/api/admin/settings/route.ts")).toBe(true);
  });

  test("GET and PUT handlers both present", () => {
    const code = read("src/app/api/admin/settings/route.ts");
    expect(code).toContain("export async function GET");
    expect(code).toContain("export async function PUT");
  });

  test("GET falls back to DEFAULT_CONFIG when dealer not found", () => {
    const code = read("src/app/api/admin/settings/route.ts");
    expect(code).toContain("DEFAULT_CONFIG");
  });

  test("PUT validates hex color format", () => {
    const code = read("src/app/api/admin/settings/route.ts");
    expect(code).toMatch(/#[0-9a-fA-F]{6}|HEX_COLOR|hex/i);
  });

  test("PUT validates email format", () => {
    const code = read("src/app/api/admin/settings/route.ts");
    expect(code).toMatch(/@|EMAIL/i);
  });

  test("settings API requires authentication", () => {
    const code = read("src/app/api/admin/settings/route.ts");
    expect(code).toContain("requireAuth");
  });

  test("settings API has audit logging", () => {
    const code = read("src/app/api/admin/settings/route.ts");
    expect(code).toContain("auditLog");
  });
});

// ---------------------------------------------------------------------------
// 11. Admin billing page
// ---------------------------------------------------------------------------

test.describe("Admin billing page", () => {
  test("billing/page.tsx exists", () => {
    expect(exists("src/app/admin/billing/page.tsx")).toBe(true);
  });

  test("billing page exports metadata", () => {
    const code = read("src/app/admin/billing/page.tsx");
    expect(code).toMatch(/export.*metadata|generateMetadata/);
  });

  test("billing page shows plan tiers (Starter, Professional, Enterprise)", () => {
    const code = read("src/app/admin/billing/page.tsx");
    expect(code).toContain("Starter");
    expect(code).toContain("Professional");
    expect(code).toContain("Enterprise");
  });

  test("billing page handles migration-pending gracefully", () => {
    const code = read("src/app/admin/billing/page.tsx");
    // Either the page itself or the data-fetch function catches errors
    expect(code).toMatch(/migrationPending|catch|try/);
  });

  test("billing page links to Stripe billing portal env var", () => {
    const code = read("src/app/admin/billing/page.tsx");
    expect(code).toContain("STRIPE_BILLING_URL");
  });
});

// ---------------------------------------------------------------------------
// 12. Admin billing API
// ---------------------------------------------------------------------------

test.describe("Admin billing API", () => {
  test("billing API route exists", () => {
    expect(exists("src/app/api/admin/billing/route.ts")).toBe(true);
  });

  test("billing API GET handler present", () => {
    const code = read("src/app/api/admin/billing/route.ts");
    expect(code).toContain("export async function GET");
  });

  test("billing API falls back gracefully when migration not applied", () => {
    const code = read("src/app/api/admin/billing/route.ts");
    expect(code).toMatch(/catch|trial|fallback/i);
  });
});

// ---------------------------------------------------------------------------
// 13. Stripe webhook handler
// ---------------------------------------------------------------------------

test.describe("Stripe webhook", () => {
  test("webhook route exists", () => {
    expect(exists("src/app/api/webhooks/stripe/route.ts")).toBe(true);
  });

  test("webhook returns 503 when Stripe not configured", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("503");
    expect(code).toMatch(/not configured|stripe.*null|!stripe/i);
  });

  test("webhook validates Stripe signature", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("constructEvent");
    expect(code).toContain("stripe-signature");
  });

  test("webhook returns 400 on invalid signature", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("400");
  });

  test("webhook handles subscription created/updated events", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("customer.subscription.created");
    expect(code).toContain("customer.subscription.updated");
  });

  test("webhook handles subscription deleted event", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("customer.subscription.deleted");
  });

  test("webhook handles invoice.payment_failed event", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("invoice.payment_failed");
  });

  test("webhook uses Node.js runtime (not Edge — needs raw body)", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain('runtime = "nodejs"');
  });

  test("webhook reads raw text body (not JSON.parse)", () => {
    const code = read("src/app/api/webhooks/stripe/route.ts");
    expect(code).toContain("request.text()");
  });
});

// ---------------------------------------------------------------------------
// 14. Migration 005 — billing columns
// ---------------------------------------------------------------------------

test.describe("Migration 005 (billing)", () => {
  test("005_billing.sql exists", () => {
    expect(exists("src/db/migrations/005_billing.sql")).toBe(true);
  });

  test("migration adds stripe_customer_id column", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("stripe_customer_id");
  });

  test("migration adds stripe_subscription_id column", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("stripe_subscription_id");
  });

  test("migration adds subscription_status with CHECK constraint", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("subscription_status");
    expect(sql).toContain("CHECK");
  });

  test("migration adds trial_ends_at column", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("trial_ends_at");
  });

  test("migration uses IF NOT EXISTS (safe to replay)", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("IF NOT EXISTS");
  });

  test("migration is wrapped in a transaction", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("BEGIN");
    expect(sql).toContain("COMMIT");
  });

  test("migration creates indexes for Stripe webhook lookups", () => {
    const sql = read("src/db/migrations/005_billing.sql");
    expect(sql).toContain("CREATE INDEX");
    expect(sql).toContain("stripe_customer");
  });
});

// ---------------------------------------------------------------------------
// 15. OEM auth enforcement in middleware
// ---------------------------------------------------------------------------

test.describe("OEM auth middleware", () => {
  test("middleware.ts sets x-oem-id header", () => {
    const code = read("src/middleware.ts");
    expect(code).toContain("x-oem-id");
  });

  test("middleware reads OEM_ID from environment variable", () => {
    const code = read("src/middleware.ts");
    expect(code).toContain("OEM_ID");
    expect(code).toContain("process.env");
  });

  test("middleware sets x-oem-id on admin routes", () => {
    const code = read("src/middleware.ts");
    // OEM_ID assignment near admin route handling
    const adminSection = code.slice(
      code.indexOf("x-is-admin") - 200,
      code.indexOf("x-is-admin") + 400,
    );
    expect(adminSection).toContain("x-oem-id");
  });
});

// ---------------------------------------------------------------------------
// 16. Dealer provisioning CLI
// ---------------------------------------------------------------------------

test.describe("Dealer provisioning CLI", () => {
  test("provision_dealer.ts exists", () => {
    expect(exists("scripts/provision_dealer.ts")).toBe(true);
  });

  test("provision script has --dry-run flag", () => {
    const code = read("scripts/provision_dealer.ts");
    expect(code).toContain("dry-run");
  });

  test("provision script validates required fields", () => {
    const code = read("scripts/provision_dealer.ts");
    expect(code).toMatch(/required|missing|validation/i);
  });

  test("provision script validates slug format", () => {
    const code = read("scripts/provision_dealer.ts");
    expect(code).toMatch(/slug/i);
  });

  test("provision script does not hard-code database credentials", () => {
    const code = read("scripts/provision_dealer.ts");
    expect(code).not.toMatch(/postgresql:\/\/[a-z]+:[^$]/);
  });

  test("provision script uses parameterized queries (not string interpolation)", () => {
    const code = read("scripts/provision_dealer.ts");
    // Should use $1, $2 style params, not template literals with user data
    expect(code).toMatch(/\$1|\$2/);
  });
});

// ---------------------------------------------------------------------------
// 17. Backup and restore scripts
// ---------------------------------------------------------------------------

test.describe("Backup and restore scripts", () => {
  test("backup_neon.sh exists", () => {
    expect(exists("scripts/backup_neon.sh")).toBe(true);
  });

  test("restore_neon.sh exists", () => {
    expect(exists("scripts/restore_neon.sh")).toBe(true);
  });

  test("migrate.sh exists", () => {
    expect(exists("scripts/migrate.sh")).toBe(true);
  });

  test("backup script guards on DATABASE_URL env var", () => {
    const code = read("scripts/backup_neon.sh");
    expect(code).toContain("DATABASE_URL");
  });

  test("restore script requires user confirmation before destructive operation", () => {
    const code = read("scripts/restore_neon.sh");
    expect(code).toMatch(/confirm|yes|proceed/i);
  });

  test("restore script does not log the full connection string with password", () => {
    const code = read("scripts/restore_neon.sh");
    // Should mask password in output
    expect(code).toMatch(/mask|password|hidden|\*\*\*/i);
  });

  test("migrate.sh applies migrations in sorted order", () => {
    const code = read("scripts/migrate.sh");
    expect(code).toMatch(/sort|order|ls.*sql/i);
  });

  test("seed_demo_data.sql uses ON CONFLICT DO NOTHING (idempotent)", () => {
    const sql = read("scripts/seed_demo_data.sql");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO NOTHING");
  });
});

// ---------------------------------------------------------------------------
// 18. Shadow testing infrastructure
// ---------------------------------------------------------------------------

test.describe("Shadow testing infrastructure", () => {
  test("playwright.shadow.config.ts exists", () => {
    expect(exists("playwright.shadow.config.ts")).toBe(true);
  });

  test("shadow config targets port 3100 or SHADOW_URL env var", () => {
    const code = read("playwright.shadow.config.ts");
    expect(code).toContain("3100");
    expect(code).toContain("SHADOW_URL");
  });

  test("shadow config points to tests/shadow directory", () => {
    const code = read("playwright.shadow.config.ts");
    expect(code).toContain("tests/shadow");
  });

  test("shadow config runs workers serially (DB consistency)", () => {
    const code = read("playwright.shadow.config.ts");
    expect(code).toMatch(/workers.*1|serial/);
  });

  test("shadow_runner.py exists", () => {
    expect(exists("scripts/shadow_runner.py")).toBe(true);
  });

  test("shadow runner has --skip-branch flag for fast local runs", () => {
    const code = read("scripts/shadow_runner.py");
    expect(code).toContain("--skip-branch");
  });

  test("shadow runner has --keep-branch flag for debugging", () => {
    const code = read("scripts/shadow_runner.py");
    expect(code).toContain("--keep-branch");
  });

  test("shadow runner cleans up server process on failure (try/finally)", () => {
    const code = read("scripts/shadow_runner.py");
    expect(code).toContain("finally");
  });

  test("shadow-integration.spec.ts exists", () => {
    expect(exists("tests/shadow/shadow-integration.spec.ts")).toBe(true);
  });

  test("shadow-api.spec.ts exists", () => {
    expect(exists("tests/shadow/shadow-api.spec.ts")).toBe(true);
  });

  test("shadow-multitenant.spec.ts exists", () => {
    expect(exists("tests/shadow/shadow-multitenant.spec.ts")).toBe(true);
  });

  test("shadow integration tests cover lead submission round-trip", () => {
    const code = read("tests/shadow/shadow-integration.spec.ts");
    expect(code).toContain("/api/leads");
    expect(code).toContain("201");
  });

  test("shadow API tests cover inventory shape contract", () => {
    const code = read("tests/shadow/shadow-api.spec.ts");
    expect(code).toContain("/api/inventory");
    expect(code).toContain("vehicles");
  });

  test("shadow multitenant tests verify dealer isolation", () => {
    const code = read("tests/shadow/shadow-multitenant.spec.ts");
    expect(code).toMatch(/DEALER_1|DEALER_2|isolation|tenant/i);
  });
});

// ---------------------------------------------------------------------------
// 19. Admin sidebar includes all new nav items
// ---------------------------------------------------------------------------

test.describe("AdminSidebar navigation", () => {
  test("AdminSidebar.tsx exists", () => {
    const p = src("src/components/AdminSidebar.tsx");
    expect(fs.existsSync(p), "AdminSidebar.tsx must exist").toBe(true);
  });

  test("sidebar includes Settings nav item", () => {
    const code = read("src/components/AdminSidebar.tsx");
    expect(code).toMatch(/[Ss]ettings/);
  });

  test("sidebar includes Billing nav item", () => {
    const code = read("src/components/AdminSidebar.tsx");
    expect(code).toMatch(/[Bb]illing/);
  });

  test("sidebar links to /admin/settings", () => {
    const code = read("src/components/AdminSidebar.tsx");
    expect(code).toContain("/admin/settings");
  });
});

// ---------------------------------------------------------------------------
// 20. No secrets committed to any new file
// ---------------------------------------------------------------------------

test.describe("Security — no committed secrets", () => {
  const filesToCheck = [
    "src/lib/email.ts",
    "src/lib/notifications.ts",
    "sentry.client.config.ts",
    "sentry.server.config.ts",
    "sentry.edge.config.ts",
    "src/app/api/webhooks/stripe/route.ts",
    "src/app/api/admin/billing/route.ts",
    "scripts/provision_dealer.ts",
    "scripts/backup_neon.sh",
    "scripts/restore_neon.sh",
  ];

  for (const file of filesToCheck) {
    test(`${file} contains no hardcoded secrets`, () => {
      const code = read(file);
      // Stripe secret key pattern
      expect(code).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{24,}/);
      // Resend API key pattern
      expect(code).not.toMatch(/re_[A-Za-z0-9]{20,}/);
      // Sentry DSN
      expect(code).not.toMatch(/https:\/\/[a-f0-9]+@o\d+\.ingest\.sentry\.io/);
      // Neon connection string with literal password
      expect(code).not.toMatch(/postgresql:\/\/[^:]+:[^@${}(]+@[^/]/);
    });
  }
});

// ---------------------------------------------------------------------------
// 21. Admin inventory list page — Add Vehicle button
// ---------------------------------------------------------------------------

test.describe("Admin inventory list page", () => {
  test("inventory list page links to /admin/inventory/add", () => {
    const code = read("src/app/admin/inventory/page.tsx");
    expect(code).toContain("/admin/inventory/add");
  });

  test("inventory list page has Edit links pointing to /admin/inventory/[vin]/edit", () => {
    const code = read("src/app/admin/inventory/page.tsx");
    expect(code).toContain("/admin/inventory/");
    expect(code).toContain("edit");
  });
});

// ---------------------------------------------------------------------------
// 22. Inventory spotlight endpoint (auto-detected via static analysis)
// ---------------------------------------------------------------------------

test.describe("Inventory spotlight endpoint", () => {
  test("spotlight route exists", () => {
    expect(exists("src/app/api/inventory/spotlight/route.ts")).toBe(true);
  });

  test("spotlight route exports GET handler", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toContain("export async function GET");
  });

  test("spotlight route validates dealer_id is required", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toContain("dealer_id");
    expect(code).toContain("400");
  });

  test("spotlight route validates UUID format", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toMatch(/UUID|uuid|UUID_RE/i);
  });

  test("spotlight route validates limit bounds (max 12)", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toContain("12");
    expect(code).toContain("400");
  });

  test("spotlight route has sample data fallback (DB unavailable)", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toContain("sample");
    expect(code).toContain("catch");
  });

  test("spotlight response shape has vehicles, total, source fields", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toContain("vehicles:");
    expect(code).toContain("total:");
    expect(code).toContain("source:");
  });

  test("spotlight uses parameterized queries (no SQL injection)", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    expect(code).toMatch(/\$1|\$2/);
    // Must not use template literal with user input in SQL
    expect(code).not.toMatch(/`.*\$\{dealerId\}.*`/s);
  });

  test("spotlight filters by dealer_id (no cross-tenant leakage)", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    // The WHERE clause must include dealer_id to prevent cross-tenant data leaks
    expect(code).toMatch(/WHERE.*dealer_id|dealer_id.*WHERE/s);
  });

  test("spotlight does not expose internal cost fields", () => {
    const code = read("src/app/api/inventory/spotlight/route.ts");
    // dealer_cost must never appear (not fetched, not stripped — completely absent)
    expect(code).not.toContain("dealer_cost");
    // internal_cost is allowed to appear ONLY in a destructuring strip pattern
    // (e.g. { internal_cost: _ic, ...safe }) — it must never be in the SELECT
    if (code.includes("internal_cost")) {
      // Must be in a strip/omit pattern, not in SELECT
      expect(code).not.toMatch(/SELECT[\s\S]*internal_cost[\s\S]*FROM/);
    }
  });
});
