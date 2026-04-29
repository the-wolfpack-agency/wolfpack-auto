/**
 * Migration 056 — Admin Shadow Durable Tables
 *
 * Static-analysis tests for the migration that closes the shadow-store
 * gap left by the 11 admin-page fixes shipped on 2026-04-28. Mirrors the
 * shape of `migration-052-feature-tables.test.ts` so the verification
 * surface stays uniform.
 *
 * What this asserts:
 *   1. The migration file exists, is idempotent, and contains the expected
 *      tables/columns/policies/indexes.
 *   2. Every new table has dealer_id (UUID), RLS enabled, and a tenant
 *      policy keyed on app.current_dealer_id (clone of 055).
 *   3. The companion rollback file exists and drops the new tables.
 *   4. The routes that back these tables include dealer_id in their INSERTs
 *      and emit the durable analytics counterparts.
 *   5. The new analytics events are declared in the typed unions in
 *      analytics-hooks.ts (typos fail at compile time elsewhere).
 *
 * No live-DB dependency — these are file-level checks. Migration runtime
 * idempotency is covered by `npm run test:migrations` (Docker harness).
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION_FILE = path.join(
  ROOT,
  "src/db/migrations/056_admin_shadow_durable_tables.sql",
);
const ROLLBACK_FILE = path.join(
  ROOT,
  "src/db/migrations/rollback/rollback_056_admin_shadow_durable_tables.sql",
);
const API_DIR = path.join(ROOT, "src/app/api/admin");
const ANALYTICS_HOOKS = path.join(ROOT, "src/lib/analytics-hooks.ts");

function readFile(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

const migrationSQL = readFile(MIGRATION_FILE);
const rollbackSQL = readFile(ROLLBACK_FILE);
const analyticsHooksTS = readFile(ANALYTICS_HOOKS);

/* ------------------------------------------------------------------ */
/*  1. File structure + idempotency                                    */
/* ------------------------------------------------------------------ */

describe("Migration 056 — File Structure", () => {
  test("migration file exists", () => {
    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);
  });

  test("migration is non-trivial", () => {
    expect(migrationSQL.length).toBeGreaterThan(500);
  });

  test("every CREATE TABLE uses IF NOT EXISTS", () => {
    const total = (migrationSQL.match(/CREATE TABLE/gi) ?? []).length;
    const safe = (migrationSQL.match(/CREATE TABLE IF NOT EXISTS/gi) ?? []).length;
    expect(safe).toBe(total);
  });

  test("every CREATE INDEX uses IF NOT EXISTS", () => {
    const total = (migrationSQL.match(/CREATE INDEX/gi) ?? []).length;
    const safe = (migrationSQL.match(/CREATE INDEX IF NOT EXISTS/gi) ?? []).length;
    expect(safe).toBe(total);
  });

  test("ALTER TABLE column adds use defensive DO block (re-runnable)", () => {
    /* The contracts.deleted_at add is wrapped in a DO/IF NOT EXISTS
       guard — without that, a second run errors. */
    expect(migrationSQL).toMatch(
      /DO\s+\$\$[\s\S]*?information_schema\.columns[\s\S]*?contracts[\s\S]*?deleted_at[\s\S]*?ADD COLUMN deleted_at/i,
    );
  });

  test("does not contain DROP TABLE", () => {
    expect(migrationSQL).not.toMatch(/DROP TABLE/i);
  });

  test("does not contain TRUNCATE", () => {
    expect(migrationSQL).not.toMatch(/TRUNCATE/i);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Tables created                                                  */
/* ------------------------------------------------------------------ */

const NEW_TABLES = [
  "engagement_reports",
  "good_faith_gestures",
  "error_monitor_resolutions",
];

describe("Migration 056 — Table Creation", () => {
  test.each(NEW_TABLES)("creates table %s", (table) => {
    expect(migrationSQL).toMatch(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, "i"),
    );
  });

  test("creates exactly the 3 expected tables", () => {
    /* Strip comments before counting so SQL-comment narration of the
       pattern doesn't inflate the count. */
    const codeOnly = migrationSQL
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const created = (codeOnly.match(/CREATE TABLE IF NOT EXISTS/gi) ?? []).length;
    expect(created).toBe(NEW_TABLES.length);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Tenancy column + RLS on every new table                         */
/* ------------------------------------------------------------------ */

describe("Migration 056 — Multi-tenant isolation", () => {
  test.each(NEW_TABLES)("%s has dealer_id UUID NOT NULL", (table) => {
    /* Within the CREATE TABLE block for this table, dealer_id must be
       declared NOT NULL and as a UUID (matches dealers.id). */
    const block = migrationSQL.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?\\);`, "i"),
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/dealer_id\s+UUID\s+NOT NULL/i);
  });

  test.each(NEW_TABLES)("%s has RLS enabled", (table) => {
    expect(migrationSQL).toMatch(
      new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`, "i"),
    );
  });

  test.each(NEW_TABLES)("%s has tenant policy keyed on app.current_dealer_id", (table) => {
    expect(migrationSQL).toMatch(
      new RegExp(
        `CREATE POLICY[\\s\\S]*?ON ${table}[\\s\\S]*?current_setting\\(\\s*'app\\.current_dealer_id'`,
        "i",
      ),
    );
  });

  test.each(NEW_TABLES)("%s policy is dropped first (idempotent re-runs)", (table) => {
    expect(migrationSQL).toMatch(
      new RegExp(`DROP POLICY IF EXISTS ${table}_tenant ON ${table}`, "i"),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  4. Indexes for the common access pattern                           */
/* ------------------------------------------------------------------ */

describe("Migration 056 — Indexes", () => {
  test("engagement_reports has (dealer_id, created_at DESC) index", () => {
    expect(migrationSQL).toMatch(
      /idx_engagement_reports_dealer_created[\s\S]*?dealer_id,\s*created_at DESC/i,
    );
  });

  test("good_faith_gestures has (dealer_id, created_at DESC) index", () => {
    expect(migrationSQL).toMatch(
      /idx_good_faith_gestures_dealer_created[\s\S]*?dealer_id,\s*created_at DESC/i,
    );
  });

  test("error_monitor_resolutions enforces UNIQUE (dealer_id, error_id)", () => {
    expect(migrationSQL).toMatch(/UNIQUE\s*\(\s*dealer_id,\s*error_id\s*\)/i);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Domain-shape sanity (route ↔ schema match)                       */
/* ------------------------------------------------------------------ */

describe("Migration 056 — Route ↔ Schema match", () => {
  test("engagement_reports CHECK matches the route's interaction_type union", () => {
    expect(migrationSQL).toMatch(
      /interaction_type[\s\S]*?CHECK[\s\S]*?test_drive[\s\S]*?purchase[\s\S]*?service[\s\S]*?follow_up[\s\S]*?walk_in/i,
    );
  });

  test("engagement_reports CHECK matches the route's outcome union", () => {
    expect(migrationSQL).toMatch(
      /outcome[\s\S]*?CHECK[\s\S]*?purchased[\s\S]*?returning[\s\S]*?lost[\s\S]*?follow_up_needed/i,
    );
  });

  test("good_faith_gestures CHECK matches the route's gesture_type union", () => {
    expect(migrationSQL).toMatch(
      /gesture_type[\s\S]*?CHECK[\s\S]*?service_credit[\s\S]*?accessory[\s\S]*?loaner[\s\S]*?discount[\s\S]*?apology_gift/i,
    );
  });

  test("good_faith_gestures CHECK matches the route's status union", () => {
    expect(migrationSQL).toMatch(
      /good_faith_gestures[\s\S]*?status[\s\S]*?CHECK[\s\S]*?pending[\s\S]*?approved[\s\S]*?claimed[\s\S]*?denied/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  6. contracts (045) — deleted_at + RLS additive hardening           */
/* ------------------------------------------------------------------ */

describe("Migration 056 — contracts hardening", () => {
  test("adds deleted_at column to contracts", () => {
    expect(migrationSQL).toMatch(
      /information_schema\.columns[\s\S]*?contracts[\s\S]*?deleted_at[\s\S]*?ALTER TABLE contracts ADD COLUMN deleted_at/i,
    );
  });

  test("adds active-only index that uses deleted_at IS NULL", () => {
    expect(migrationSQL).toMatch(
      /idx_contracts_active[\s\S]*?dealer_id,\s*updated_at DESC[\s\S]*?WHERE deleted_at IS NULL/i,
    );
  });

  test("enables RLS on contracts", () => {
    expect(migrationSQL).toMatch(/ALTER TABLE contracts\s+ENABLE ROW LEVEL SECURITY/i);
  });

  test("contracts policy uses app.current_dealer_id (UUID)", () => {
    expect(migrationSQL).toMatch(
      /CREATE POLICY contracts_tenant ON contracts[\s\S]*?current_setting\(\s*'app\.current_dealer_id'[\s\S]*?::uuid/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  7. Rollback                                                         */
/* ------------------------------------------------------------------ */

describe("Migration 056 — Rollback", () => {
  test("rollback file exists", () => {
    expect(fs.existsSync(ROLLBACK_FILE)).toBe(true);
  });

  test.each(NEW_TABLES)("rollback drops %s with CASCADE + IF EXISTS", (table) => {
    expect(rollbackSQL).toMatch(
      new RegExp(`DROP TABLE IF EXISTS ${table} CASCADE`, "i"),
    );
  });

  test("rollback drops the contracts policy", () => {
    expect(rollbackSQL).toMatch(/DROP POLICY IF EXISTS contracts_tenant ON contracts/i);
  });
});

/* ------------------------------------------------------------------ */
/*  8. Already-existing tables — sanity check                          */
/* ------------------------------------------------------------------ */

/**
 * The task brief listed 9 routes / tables; this migration only creates
 * the missing 3 (+ contracts hardening). The other tables were already
 * created in 045/047/052. Assert here that we didn't accidentally
 * recreate them (would conflict with the older migrations).
 */
describe("Migration 056 — does not duplicate existing tables", () => {
  const ALREADY_EXISTING = [
    "data_exports",
    "deal_desk",
    "fi_products",
    "surveys",
    "survey_responses",
    "user_tests",
    "test_recordings",
  ];

  test.each(ALREADY_EXISTING)("%s is NOT recreated in 056", (table) => {
    expect(migrationSQL).not.toMatch(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, "i"),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  9. Routes write dealer_id (durable insert path)                    */
/* ------------------------------------------------------------------ */

describe("Routes — durable insert paths include dealer_id", () => {
  test("engagement-reports POST includes dealer_id in INSERT", () => {
    const route = readFile(path.join(API_DIR, "engagement-reports/route.ts"));
    /* Loosely matches `INSERT INTO engagement_reports (dealer_id, ...)`
       with arbitrary whitespace. */
    expect(route).toMatch(
      /INSERT INTO engagement_reports[\s\S]*?\(\s*dealer_id\s*,/i,
    );
  });

  test("good-faith POST includes dealer_id in INSERT", () => {
    const route = readFile(path.join(API_DIR, "good-faith/route.ts"));
    expect(route).toMatch(
      /INSERT INTO good_faith_gestures[\s\S]*?\(\s*dealer_id\s*,/i,
    );
  });

  test("good-faith PATCH scopes UPDATE by dealer_id", () => {
    const route = readFile(path.join(API_DIR, "good-faith/route.ts"));
    expect(route).toMatch(
      /UPDATE good_faith_gestures[\s\S]*?WHERE id = \$\d+ AND dealer_id = \$\d+/i,
    );
  });

  test("error-monitor resolve writes to error_monitor_resolutions", () => {
    const route = readFile(path.join(API_DIR, "error-monitor/route.ts"));
    expect(route).toMatch(
      /INSERT INTO error_monitor_resolutions[\s\S]*?ON CONFLICT[\s\S]*?dealer_id,\s*error_id/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  10. New analytics events declared in the typed unions              */
/* ------------------------------------------------------------------ */

describe("Analytics hooks — durable counterparts declared", () => {
  const NEW_EVENTS = [
    "system.engagement_logged_durable",
    "system.engagement_logged_shadow",
    "system.good_faith_created_durable",
    "system.good_faith_created_shadow",
    "system.error_resolution_persisted",
    "system.error_resolution_persisted_shadow",
    "error.resolved_durable",
    "error.resolved_shadow",
  ];

  test.each(NEW_EVENTS)('"%s" is declared in analytics-hooks.ts', (event) => {
    /* Each event lives as a string-literal in a type union — this catches
       drift where someone deletes the union entry but leaves the call
       site (or vice versa). */
    expect(analyticsHooksTS).toContain(`"${event}"`);
  });

  test("engagement-reports route emits the durable counterpart on success", () => {
    const route = readFile(path.join(API_DIR, "engagement-reports/route.ts"));
    expect(route).toContain("system.engagement_logged_durable");
  });

  test("good-faith route emits the durable counterpart on success", () => {
    const route = readFile(path.join(API_DIR, "good-faith/route.ts"));
    expect(route).toContain("system.good_faith_created_durable");
  });

  test("error-monitor route emits durable + shadow markers", () => {
    const route = readFile(path.join(API_DIR, "error-monitor/route.ts"));
    expect(route).toContain("error.resolved_durable");
    expect(route).toContain("error.resolved_shadow");
  });
});
