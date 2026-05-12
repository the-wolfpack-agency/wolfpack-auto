/**
 * Migration 070 -- prequal lender routing -- structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + down files exist
 *   2. up creates both tables idempotently
 *   3. RLS is enabled and policies key on app.current_dealer_id
 *   4. Required indexes exist
 *   5. lender_type CHECK lists the 5 allowed types
 *   6. status CHECK lists the 4 dispatch states
 *   7. updated_at trigger present
 *   8. rollback drops every table CASCADE + IF EXISTS
 *   9. up is structurally idempotent
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/070_prequal_lender_routing.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/070_prequal_lender_routing.down.sql",
);

describe("Migration 070 -- prequal lender routing", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("rollback .down.sql exists", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates dealer_lender_routes idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS dealer_lender_routes\b/);
    });

    test("creates prequal_lender_dispatches via dynamic EXECUTE", () => {
      // Wrapped in DO $$ so the FK resolves to whichever prequal table exists.
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS prequal_lender_dispatches/);
      expect(sql).toMatch(/REFERENCES dealer_lender_routes\(id\) ON DELETE RESTRICT/);
    });

    test("dealer_lender_routes has the 5-value lender_type CHECK", () => {
      expect(sql).toContain("'prime'");
      expect(sql).toContain("'sub_prime'");
      expect(sql).toContain("'captive'");
      expect(sql).toContain("'credit_union'");
      expect(sql).toContain("'other'");
    });

    test("prequal_lender_dispatches has the 4-value status CHECK", () => {
      expect(sql).toContain("'queued'");
      expect(sql).toContain("'sent'");
      expect(sql).toContain("'failed'");
      expect(sql).toContain("'viewed'");
    });

    test("RLS enabled on both tables", () => {
      expect(sql).toMatch(/ALTER TABLE dealer_lender_routes ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE prequal_lender_dispatches ENABLE ROW LEVEL SECURITY/);
    });

    test("policies key on dealer_id via app.current_dealer_id", () => {
      const matches = sql.match(/dealer_id = current_setting\('app\.current_dealer_id'/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test("required indexes exist on dealer_lender_routes", () => {
      expect(sql).toMatch(/idx_dealer_lender_routes_dealer_active/);
      expect(sql).toMatch(/idx_dealer_lender_routes_dealer_type/);
    });

    test("required indexes exist on prequal_lender_dispatches", () => {
      expect(sql).toMatch(/idx_prequal_lender_dispatches_prequal/);
      expect(sql).toMatch(/idx_prequal_lender_dispatches_dealer_created/);
      expect(sql).toMatch(/idx_prequal_lender_dispatches_status/);
    });

    test("updated_at trigger exists on dealer_lender_routes", () => {
      expect(sql).toMatch(/CREATE TRIGGER dealer_lender_routes_updated_at/);
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION dealer_lender_routes_set_updated_at\(\)/);
    });

    test("every CREATE INDEX uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
      expect(drops.length).toBeGreaterThanOrEqual(2);
    });

    test("ends with a final ASSERT that fails loudly on missing tables", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 070 failed/);
    });

    test("references prequalifications OR prequal_sessions for FK -- never invents a new prequal table", () => {
      expect(sql).toMatch(/'prequalifications'/);
      expect(sql).toMatch(/'prequal_sessions'/);
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops every table with CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS dealer_lender_routes CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS prequal_lender_dispatches CASCADE/);
    });

    test("drops the updated_at trigger function", () => {
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS dealer_lender_routes_set_updated_at\(\)/);
    });
  });

  describe("up + down + up idempotence (structural)", () => {
    test("up uses IF NOT EXISTS / EXECUTE; down uses IF EXISTS + CASCADE", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect((down.match(/DROP TABLE IF EXISTS.*CASCADE/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });
  });
});
