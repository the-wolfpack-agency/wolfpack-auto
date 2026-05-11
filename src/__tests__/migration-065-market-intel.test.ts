/**
 * Migration 065 — market_intel structural tests.
 *
 * Pure static checks (no DB connection) so the test suite stays fast and
 * CI can run without Postgres. Asserts:
 *
 *  1. Up file exists with three CREATE TABLE IF NOT EXISTS statements.
 *  2. Companion rollback file exists and drops all three tables (idempotent).
 *  3. Migration wraps in BEGIN / COMMIT.
 *  4. RLS enabled on every new table with a `dealer_id = current_setting...`
 *     policy mirrored from migration 055.
 *  5. Required indexes exist on (vehicle_id, captured_at DESC) etc.
 *  6. CHECK constraint enumerates every recommendation value.
 *  7. Up + down are idempotent.
 *
 * A real round-trip (apply -> rollback -> re-apply) is exercised by
 * `npm run test:migrations` against a temporary database.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/065_market_intel.sql");
const DOWN = path.join(REPO_ROOT, "src/db/migrations/rollback/065_market_intel.down.sql");

describe("Migration 065 — market_intel", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("down migration file exists (companion rollback)", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates market_value_snapshots", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS market_value_snapshots\b/);
    });

    test("creates vehicle_market_signals", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS vehicle_market_signals\b/);
    });

    test("creates market_comparable_listings", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS market_comparable_listings\b/);
    });

    test("wraps in BEGIN/COMMIT", () => {
      expect(sql).toMatch(/\bBEGIN;\s/);
      expect(sql).toMatch(/\sCOMMIT;\s*$/);
    });

    test("is fully idempotent (no plain CREATE TABLE without IF NOT EXISTS)", () => {
      const matches = sql.match(/CREATE TABLE\s+(?!IF NOT EXISTS)/g);
      expect(matches).toBeNull();
    });

    test("indexes (vehicle_id, captured_at DESC) on snapshots", () => {
      expect(sql).toMatch(
        /idx_market_value_snapshots_vehicle_captured[\s\S]*\(vehicle_id, captured_at DESC\)/,
      );
    });

    test("indexes (vehicle_id, captured_at DESC) on comparables", () => {
      expect(sql).toMatch(
        /idx_market_comparable_listings_vehicle_captured[\s\S]*\(vehicle_id, captured_at DESC\)/,
      );
    });

    test("indexes recommendation on vehicle_market_signals (dashboard query)", () => {
      expect(sql).toMatch(/idx_vehicle_market_signals_recommendation/);
    });

    test("dealer_id column present on every new table", () => {
      // crude but effective — each table block must mention dealer_id.
      const blocks = sql.split(/CREATE TABLE IF NOT EXISTS /).slice(1);
      expect(blocks.length).toBeGreaterThanOrEqual(3);
      for (const block of blocks) {
        expect(block).toMatch(/dealer_id\s+UUID\s+NOT NULL/i);
      }
    });

    test("enables row-level security and a tenant policy on each table", () => {
      const tables = [
        "market_value_snapshots",
        "vehicle_market_signals",
        "market_comparable_listings",
      ];
      for (const t of tables) {
        expect(sql).toMatch(new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`));
        expect(sql).toMatch(new RegExp(`CREATE POLICY ${t}_tenant`));
      }
      expect(sql).toMatch(/current_setting\('app\.current_dealer_id', true\)::uuid/);
    });

    test("recommendation CHECK enumerates every enum value", () => {
      expect(sql).toMatch(/HOLD/);
      expect(sql).toMatch(/REPRICE_DOWN/);
      expect(sql).toMatch(/REPRICE_UP/);
      expect(sql).toMatch(/MOVE_TO_LOT_FRONT/);
      expect(sql).toMatch(/MOVE_TO_BACK_LOT/);
    });

    test("comp_source CHECK enumerates known sources", () => {
      expect(sql).toMatch(/comp_source IN \('mock'.*\)/);
    });

    test("defensive DO block guards trigger creation", () => {
      expect(sql).toMatch(/DO \$\$[\s\S]*pg_trigger[\s\S]*\$\$/);
    });

    test("defensive DO block asserts the tables exist post-migration", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 065 failed/);
    });
  });

  describe("down migration body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops all three tables", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS market_comparable_listings/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS vehicle_market_signals/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS market_value_snapshots/);
    });

    test("uses IF EXISTS so partial rollbacks don't error", () => {
      const matches = sql.match(/DROP TABLE\s+(?!IF EXISTS)/g);
      expect(matches).toBeNull();
    });

    test("drops the trigger first (CASCADE-safety)", () => {
      expect(sql).toMatch(/DROP TRIGGER IF EXISTS vehicle_market_signals_updated_at/);
    });
  });
});
