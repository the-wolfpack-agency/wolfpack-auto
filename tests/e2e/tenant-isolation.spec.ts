import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * tenant-isolation.spec.ts
 *
 * Verifies multi-tenant data isolation across all admin API routes.
 * Every admin route must scope queries by dealer_id from the authenticated session,
 * not a hardcoded value.
 */

const ADMIN_API_DIR = path.resolve(__dirname, "../../src/app/api/admin");
const LIB_DIR = path.resolve(__dirname, "../../src/lib");

/* -------------------------------------------------------------------------- */
/* Helper: recursively find all route.ts files under a directory              */
/* -------------------------------------------------------------------------- */

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.name === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/* TENANT-ISO-001: getDealerId helper exists and has correct implementation   */
/* -------------------------------------------------------------------------- */

test.describe("TENANT-ISO-001: getDealerId helper", () => {
  test("get-dealer-id.ts exists", () => {
    const filePath = path.join(LIB_DIR, "get-dealer-id.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test("getDealerId reads dealer_id from authResult", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "get-dealer-id.ts"), "utf-8");
    expect(src).toContain("authResult");
    expect(src).toContain("dealer_id");
    expect(src).toContain("export function getDealerId");
  });

  test("getDealerId returns session dealer_id when present and not 'default'", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "get-dealer-id.ts"), "utf-8");
    // Must check that dealer_id is not "default" before using it
    expect(src).toContain('!== "default"');
  });

  test("getDealerId falls back to demo-dealer in shadow mode", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "get-dealer-id.ts"), "utf-8");
    expect(src).toContain("DATABASE_URL");
    expect(src).toContain("demo-dealer");
  });

  test("getDealerId uses UUID fallback in production", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "get-dealer-id.ts"), "utf-8");
    expect(src).toContain("00000000-0000-4000-a000-000000000001");
  });
});

/* -------------------------------------------------------------------------- */
/* TENANT-ISO-002: No admin route hardcodes dealer_id as "default" at         */
/* module level or in DB queries                                              */
/* -------------------------------------------------------------------------- */

test.describe("TENANT-ISO-002: no hardcoded dealer_id in admin routes", () => {
  test('no route uses const DEALER_ID = process.env.DEALER_ID ?? "default"', () => {
    const routeFiles = findRouteFiles(ADMIN_API_DIR);
    const violators: string[] = [];

    for (const file of routeFiles) {
      const src = fs.readFileSync(file, "utf-8");
      if (/const\s+DEALER_ID\s*=\s*process\.env\.DEALER_ID\s*\?\?\s*["']default["']/.test(src)) {
        violators.push(path.relative(ADMIN_API_DIR, file));
      }
    }

    expect(violators).toEqual([]);
  });

  test("no route uses inline process.env.DEALER_ID ?? 'default' in DB queries", () => {
    const routeFiles = findRouteFiles(ADMIN_API_DIR);
    const violators: string[] = [];

    for (const file of routeFiles) {
      const src = fs.readFileSync(file, "utf-8");
      // Check for inline dealer_id = process.env.DEALER_ID ?? "default" inside functions
      // Exclude the public calculator route (no auth)
      if (file.includes("calculator")) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/process\.env\.DEALER_ID\s*\?\?\s*["']default["']/.test(lines[i])) {
          violators.push(`${path.relative(ADMIN_API_DIR, file)}:${i + 1}`);
        }
      }
    }

    expect(violators).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* TENANT-ISO-003: Auth-gated routes import getDealerId                       */
/* -------------------------------------------------------------------------- */

test.describe("TENANT-ISO-003: auth-gated routes use getDealerId", () => {
  test("routes with requireAuth and DB queries import getDealerId", () => {
    const routeFiles = findRouteFiles(ADMIN_API_DIR);
    const violators: string[] = [];

    for (const file of routeFiles) {
      const src = fs.readFileSync(file, "utf-8");
      // Only check routes that have requireAuth AND DB queries with dealer_id
      const hasAuth = src.includes("requireAuth");
      const hasDbDealerQuery = /WHERE.*dealer_id\s*=\s*\$/.test(src) ||
                                src.includes("getDealerId") ||
                                /dealer_id.*\$\d/.test(src);

      if (hasAuth && hasDbDealerQuery && !src.includes("getDealerId") && !src.includes("authResult.user.dealer_id")) {
        violators.push(path.relative(ADMIN_API_DIR, file));
      }
    }

    expect(violators).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* TENANT-ISO-004: Admin GET routes scope data by dealer_id in WHERE clauses  */
/* -------------------------------------------------------------------------- */

test.describe("TENANT-ISO-004: admin GET routes scope by dealer_id", () => {
  test("routes with SQL queries include dealer_id in WHERE clauses", () => {
    const routeFiles = findRouteFiles(ADMIN_API_DIR);
    const violators: string[] = [];

    for (const file of routeFiles) {
      const src = fs.readFileSync(file, "utf-8");

      // Only check routes that have actual SQL SELECT queries
      if (!src.includes("SELECT") || !src.includes("query(") || !src.includes("requireAuth")) continue;
      // Skip routes that are pure mock/no-DB
      if (!src.includes("DATABASE_URL")) continue;

      // Check that SQL SELECT queries reference dealer_id
      const selectMatches = src.match(/SELECT[\s\S]*?FROM[\s\S]*?WHERE[\s\S]*?\]/g);
      if (selectMatches) {
        for (const match of selectMatches) {
          if (!match.includes("dealer_id")) {
            // Only flag if this looks like a multi-tenant table query
            const tables = ["leads", "vehicles", "deals", "documents", "customers",
              "reviews", "appointments", "repair_orders", "resources", "certifications",
              "lenders", "floor_plan", "credit_applications", "compliance_checks"];
            const hasMultiTenantTable = tables.some(t => match.toLowerCase().includes(t));
            if (hasMultiTenantTable) {
              violators.push(path.relative(ADMIN_API_DIR, file));
              break;
            }
          }
        }
      }
    }

    // Deduplicate
    const unique = [...new Set(violators)];
    expect(unique).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* TENANT-ISO-005: Admin routes never return 500                              */
/* -------------------------------------------------------------------------- */

test.describe("TENANT-ISO-005: admin routes wrap DB calls in try/catch", () => {
  const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

  test("GET /api/admin/stats does not 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/stats`);
    expect(res.status()).not.toBe(500);
  });

  test("GET /api/admin/leads does not 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads`);
    expect(res.status()).not.toBe(500);
  });

  test("GET /api/admin/deals does not 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/deals`);
    expect(res.status()).not.toBe(500);
  });

  test("GET /api/admin/documents does not 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/documents`);
    expect(res.status()).not.toBe(500);
  });

  test("GET /api/admin/customers does not 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/customers`);
    expect(res.status()).not.toBe(500);
  });
});
