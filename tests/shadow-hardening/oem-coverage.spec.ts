/**
 * OEM Program Management — static analysis + structural coverage.
 *
 * These tests verify the implementation is complete and correct WITHOUT
 * requiring a running browser or database. They catch:
 *
 * - Missing files (migration, queries, pages)
 * - Incomplete migration (missing tables, RLS, triggers)
 * - Missing graceful fallbacks in DB query functions
 * - Broken imports or missing exports
 * - AdminSidebar missing OEM navigation
 * - Schema constraints that must exist for data integrity
 *
 * Every new OEM feature MUST have a corresponding assertion here.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");
const TESTS = path.resolve(__dirname, "../..");
const MIGRATION = path.join(SRC, "db/migrations/004_oem_program_management.sql");
const OEM_QUERIES = path.join(SRC, "db/queries/oem.ts");
const SIDEBAR = path.join(SRC, "components/AdminSidebar.tsx");

// ---------------------------------------------------------------------------
// Migration file existence and completeness
// ---------------------------------------------------------------------------

test.describe("Migration 004: file structure", () => {
  test("migration file exists", () => {
    expect(fs.existsSync(MIGRATION), "004_oem_program_management.sql is missing").toBe(true);
  });

  test("migration is wrapped in BEGIN / COMMIT transaction", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});

test.describe("Migration 004: OEM tables", () => {
  let sql: string;
  test.beforeAll(() => { sql = fs.readFileSync(MIGRATION, "utf-8"); });

  const REQUIRED_TABLES = [
    "oems",
    "oem_users",
    "oem_programs",
    "oem_program_enrollments",
    "oem_brand_standard_items",
    "oem_brand_standard_responses",
    "lead_routing_rules",
  ];

  for (const table of REQUIRED_TABLES) {
    test(`CREATE TABLE ${table}`, () => {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    });
  }
});

test.describe("Migration 004: ALTER existing tables", () => {
  let sql: string;
  test.beforeAll(() => { sql = fs.readFileSync(MIGRATION, "utf-8"); });

  test("dealers.oem_id FK added", () => {
    expect(sql).toContain("ALTER TABLE dealers ADD COLUMN IF NOT EXISTS oem_id");
    expect(sql).toContain("REFERENCES oems(id)");
  });

  test("leads.converted_at added (close-rate tracking)", () => {
    expect(sql).toContain("ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at");
  });

  test("leads.deal_value added", () => {
    expect(sql).toContain("ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value");
  });

  test("leads.assigned_to added", () => {
    expect(sql).toContain("ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to");
  });

  test("leads.first_response_at added", () => {
    expect(sql).toContain("ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_response_at");
  });

  test("vehicles.arrival_status added with CHECK constraint", () => {
    expect(sql).toContain("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS arrival_status");
    expect(sql).toContain("in_transit");
    expect(sql).toContain("arriving_soon");
  });

  test("vehicles.expected_arrival_date added", () => {
    expect(sql).toContain("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS expected_arrival_date");
  });
});

test.describe("Migration 004: Row-Level Security", () => {
  let sql: string;
  test.beforeAll(() => { sql = fs.readFileSync(MIGRATION, "utf-8"); });

  const RLS_TABLES = [
    "oem_programs",
    "oem_program_enrollments",
    "oem_brand_standard_items",
    "oem_brand_standard_responses",
    "lead_routing_rules",
  ];

  for (const table of RLS_TABLES) {
    test(`${table} has ENABLE ROW LEVEL SECURITY`, () => {
      // Use regex to handle variable whitespace between table name and ENABLE
      const rls = new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`);
      expect(rls.test(sql), `${table} missing ENABLE ROW LEVEL SECURITY`).toBe(true);
    });

    test(`${table} has at least one CREATE POLICY`, () => {
      // Search for policy targeting this table — use [\s\S]*? to safely span any chars
      const policyPattern = new RegExp(`CREATE POLICY \\S+ ON ${table}\\b`);
      expect(policyPattern.test(sql), `No RLS policy found for ${table}`).toBe(true);
    });
  }
});

test.describe("Migration 004: updated_at triggers", () => {
  let sql: string;
  test.beforeAll(() => { sql = fs.readFileSync(MIGRATION, "utf-8"); });

  const TRIGGER_TABLES = [
    "oems",
    "oem_users",
    "oem_programs",
    "oem_program_enrollments",
    "oem_brand_standard_responses",
    "lead_routing_rules",
  ];

  for (const table of TRIGGER_TABLES) {
    test(`${table} has updated_at trigger`, () => {
      expect(sql).toContain(`BEFORE UPDATE ON ${table}`);
    });
  }
});

test.describe("Migration 004: indexes", () => {
  let sql: string;
  test.beforeAll(() => { sql = fs.readFileSync(MIGRATION, "utf-8"); });

  const REQUIRED_INDEXES = [
    "idx_oems_slug",
    "idx_oem_programs_oem",
    "idx_oem_enrollments_dealer",
    "idx_dealers_oem",
    "idx_leads_converted",
    "idx_vehicles_arrival",
  ];

  for (const idx of REQUIRED_INDEXES) {
    test(`index ${idx} defined`, () => {
      expect(sql).toContain(idx);
    });
  }
});

// ---------------------------------------------------------------------------
// OEM DB queries — exports, structure, graceful fallback
// ---------------------------------------------------------------------------

test.describe("OEM queries: file existence and exports", () => {
  test("src/db/queries/oem.ts exists", () => {
    expect(fs.existsSync(OEM_QUERIES), "oem.ts query file is missing").toBe(true);
  });

  const REQUIRED_EXPORTS = [
    "getOemNetworkStats",
    "getOemNetworkDealers",
    "getOemPrograms",
    "getRecentEnrollments",
  ];

  let content: string;
  test.beforeAll(() => { content = fs.readFileSync(OEM_QUERIES, "utf-8"); });

  for (const fn of REQUIRED_EXPORTS) {
    test(`exports function ${fn}`, () => {
      expect(content).toContain(`export async function ${fn}`);
    });
  }
});

test.describe("OEM queries: TypeScript types", () => {
  let content: string;
  test.beforeAll(() => { content = fs.readFileSync(OEM_QUERIES, "utf-8"); });

  const REQUIRED_TYPES = [
    "OemRow",
    "OemProgram",
    "OemNetworkDealer",
    "OemNetworkStats",
    "OemProgramEnrollment",
  ];

  for (const type of REQUIRED_TYPES) {
    test(`exports interface/type ${type}`, () => {
      expect(content).toContain(`export interface ${type}`);
    });
  }
});

test.describe("OEM queries: graceful failure patterns", () => {
  let content: string;
  test.beforeAll(() => { content = fs.readFileSync(OEM_QUERIES, "utf-8"); });

  test("each query function has a try/catch block", () => {
    // Count 'try {' and 'catch {' — must have at least 4 (one per exported function)
    const tryCount = (content.match(/\btry \{/g) ?? []).length;
    const catchCount = (content.match(/\} catch/g) ?? []).length;
    expect(tryCount).toBeGreaterThanOrEqual(4);
    expect(catchCount).toBeGreaterThanOrEqual(4);
  });

  test("queries check if tables exist before querying (migration guard)", () => {
    expect(content).toContain("information_schema.tables");
    expect(content).toContain("table_name = 'oems'");
  });

  test("getOemNetworkStats returns default zero object on failure", () => {
    // The default object must set network_close_rate: 0
    expect(content).toContain("network_close_rate: 0");
    expect(content).toContain("avg_program_compliance: 0");
  });

  test("getOemNetworkDealers returns empty array on failure", () => {
    expect(content).toContain("return []");
  });

  test("uses pool from @/lib/db (not creating new connections)", () => {
    expect(content).toContain('import { pool } from "@/lib/db"');
    // Must NOT create a new Pool inside the file
    expect(content).not.toContain("new Pool(");
  });
});

// ---------------------------------------------------------------------------
// OEM page files — existence and correct imports
// ---------------------------------------------------------------------------

test.describe("OEM pages: file existence", () => {
  const OEM_PAGES = [
    "app/admin/oem/page.tsx",
    "app/admin/oem/dealers/page.tsx",
    "app/admin/oem/programs/page.tsx",
    "app/admin/oem/analytics/page.tsx",
  ];

  for (const page of OEM_PAGES) {
    test(`${page} exists`, () => {
      expect(fs.existsSync(path.join(SRC, page)), `${page} is missing`).toBe(true);
    });
  }
});

test.describe("OEM pages: metadata exports", () => {
  const PAGES_WITH_METADATA = [
    { file: "app/admin/oem/page.tsx",           title: "OEM Network Overview" },
    { file: "app/admin/oem/dealers/page.tsx",   title: "Dealer Network" },
    { file: "app/admin/oem/programs/page.tsx",  title: "OEM Programs" },
    { file: "app/admin/oem/analytics/page.tsx", title: "Cross-Dealer Analytics" },
  ];

  for (const { file, title } of PAGES_WITH_METADATA) {
    test(`${file} exports correct metadata title`, () => {
      const content = fs.readFileSync(path.join(SRC, file), "utf-8");
      expect(content).toContain("export const metadata");
      expect(content).toContain(title);
    });
  }
});

test.describe("OEM pages: query imports", () => {
  const PAGES = [
    "app/admin/oem/page.tsx",
    "app/admin/oem/dealers/page.tsx",
    "app/admin/oem/programs/page.tsx",
    "app/admin/oem/analytics/page.tsx",
  ];

  for (const file of PAGES) {
    test(`${file} imports from @/db/queries/oem`, () => {
      const content = fs.readFileSync(path.join(SRC, file), "utf-8");
      expect(content).toContain('@/db/queries/oem');
    });
  }
});

test.describe("OEM pages: migration-pending handling", () => {
  test("overview page shows migration notice when no data", () => {
    const content = fs.readFileSync(path.join(SRC, "app/admin/oem/page.tsx"), "utf-8");
    expect(content).toContain("migrationPending");
    expect(content).toContain("004_oem_program_management");
  });

  test("programs page shows template cards when no data", () => {
    const content = fs.readFileSync(path.join(SRC, "app/admin/oem/programs/page.tsx"), "utf-8");
    expect(content).toContain("PROGRAM_TEMPLATES");
    expect(content).toContain("004_oem_program_management");
  });

  test("analytics page shows migration notice when no data", () => {
    const content = fs.readFileSync(path.join(SRC, "app/admin/oem/analytics/page.tsx"), "utf-8");
    expect(content).toContain("migrationPending");
    expect(content).toContain("004_oem_program_management");
  });
});

test.describe("OEM pages: graceful empty states", () => {
  test("overview page handles zero dealers + programs gracefully", () => {
    const content = fs.readFileSync(path.join(SRC, "app/admin/oem/page.tsx"), "utf-8");
    // Empty enrollment state renders a message
    expect(content).toContain("No enrollment activity yet");
    // Stats display toLocaleString (safe for 0 values)
    expect(content).toContain("toLocaleString");
  });

  test("dealers page has empty state UI element", () => {
    const content = fs.readFileSync(path.join(SRC, "app/admin/oem/dealers/page.tsx"), "utf-8");
    expect(content).toContain("No dealers found");
    expect(content).toContain("Apply migration");
  });

  test("analytics page has empty benchmark table state", () => {
    const content = fs.readFileSync(path.join(SRC, "app/admin/oem/analytics/page.tsx"), "utf-8");
    expect(content).toContain("No dealer data available");
  });
});

test.describe("OEM pages: breadcrumb navigation", () => {
  const SUB_PAGES = [
    "app/admin/oem/dealers/page.tsx",
    "app/admin/oem/programs/page.tsx",
    "app/admin/oem/analytics/page.tsx",
  ];

  for (const file of SUB_PAGES) {
    test(`${file} has breadcrumb link back to /admin/oem`, () => {
      const content = fs.readFileSync(path.join(SRC, file), "utf-8");
      expect(content).toContain('href="/admin/oem"');
      expect(content).toContain("OEM Network");
    });
  }
});

// ---------------------------------------------------------------------------
// AdminSidebar — OEM navigation items
// ---------------------------------------------------------------------------

test.describe("AdminSidebar: OEM navigation", () => {
  let content: string;
  test.beforeAll(() => { content = fs.readFileSync(SIDEBAR, "utf-8"); });

  test("OEM_CHILDREN constant defined with 4 sub-nav items", () => {
    expect(content).toContain("OEM_CHILDREN");
    expect(content).toContain('href: "/admin/oem"');
    expect(content).toContain('href: "/admin/oem/dealers"');
    expect(content).toContain('href: "/admin/oem/programs"');
    expect(content).toContain('href: "/admin/oem/analytics"');
  });

  test("NAV_ITEMS includes OEM Network entry", () => {
    expect(content).toContain('"OEM Network"');
    expect(content).toContain("OemIcon");
  });

  test("isOemPage logic detects /admin/oem routes", () => {
    expect(content).toContain("isOemPage");
    expect(content).toContain('pathname.startsWith("/admin/oem")');
  });

  test("OEM sub-nav renders when isOemPage is true", () => {
    expect(content).toContain("isOem && isOemPage");
    expect(content).toContain("OEM_CHILDREN.map");
  });

  test("OemIcon SVG component is defined", () => {
    expect(content).toContain("function OemIcon");
  });
});

// ---------------------------------------------------------------------------
// E2E test file existence — the tests themselves must be present
// ---------------------------------------------------------------------------

test.describe("OEM test coverage: test files exist", () => {
  // __dirname = .../wolfpack-auto/tests/shadow-hardening
  // TESTS     = .../wolfpack-auto  (two levels up)
  test("tests/e2e/oem-portal.spec.ts exists", () => {
    const p = path.join(TESTS, "tests/e2e/oem-portal.spec.ts");
    expect(fs.existsSync(p), "oem-portal.spec.ts is missing").toBe(true);
  });

  test("tests/shadow-hardening/oem-coverage.spec.ts exists", () => {
    const p = path.join(TESTS, "tests/shadow-hardening/oem-coverage.spec.ts");
    expect(fs.existsSync(p), "oem-coverage.spec.ts is missing").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: route-health auto-discovery covers OEM routes
// ---------------------------------------------------------------------------

test.describe("OEM coverage: route auto-discovery", () => {
  test("route-health.spec.ts discovers /admin/oem pages automatically", () => {
    const routeHealth = path.join(TESTS, "tests/shadow-hardening/route-health.spec.ts");
    const content = fs.readFileSync(routeHealth, "utf-8");
    // Auto-discovery uses filesystem scan — verify the logic is in place
    expect(content).toContain("discoverRoutes");
    expect(content).toContain("ADMIN_ROUTES");
    // The OEM pages have page.tsx so they'll be discovered automatically
  });

  test("all 4 OEM page.tsx files are discoverable (no underscore/dot prefix)", () => {
    const OEM_DIR = path.join(SRC, "app/admin/oem");
    function findPageFiles(dir: string): string[] {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
          results.push(...findPageFiles(path.join(dir, entry.name)));
        } else if (entry.name === "page.tsx") {
          results.push(path.join(dir, entry.name));
        }
      }
      return results;
    }

    const pageFiles = findPageFiles(OEM_DIR);
    // Should find: oem/page.tsx + dealers/page.tsx + programs/page.tsx + analytics/page.tsx
    expect(pageFiles.length).toBe(4);
  });
});
