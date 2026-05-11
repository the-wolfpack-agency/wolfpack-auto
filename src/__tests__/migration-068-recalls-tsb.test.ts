/**
 * Migration 068 — recalls + TSB awareness structural test.
 *
 * Static checks (no live DB) so the suite stays fast and runs in CI without
 * a Postgres dependency. The full apply → rollback → re-apply round trip is
 * exercised by `npm run test:migrations`.
 *
 * Asserts:
 *   1. Up + down files exist (matching the conventional names).
 *   2. Up creates all four tables with IF NOT EXISTS (idempotent).
 *   3. Up enables RLS on every table and declares a policy.
 *   4. Up indexes the (make, model, year_from, year_to) tuple per spec.
 *   5. Up wraps everything in BEGIN / COMMIT.
 *   6. Down drops all four tables with IF EXISTS (partial-safe).
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/068_recalls_tsb.sql");
const DOWN_NEW = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/068_recalls_tsb.down.sql",
);
const DOWN_RUNNER = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/rollback_068_recalls_tsb.sql",
);

describe("Migration 068 — recalls + TSB awareness", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("companion .down.sql exists", () => {
    expect(fs.existsSync(DOWN_NEW)).toBe(true);
  });

  test("runner-style rollback_*.sql exists", () => {
    expect(fs.existsSync(DOWN_RUNNER)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates recalls", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS recalls\b/);
    });

    test("creates tsbs", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS tsbs\b/);
    });

    test("creates vehicle_recall_status", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS vehicle_recall_status\b/);
    });

    test("creates recall_check_history", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS recall_check_history\b/);
    });

    test("constrains recall severity to minor / moderate / critical", () => {
      expect(sql).toMatch(
        /CHECK \(severity IN \('minor', 'moderate', 'critical'\)\)/,
      );
    });

    test("constrains vehicle_recall_status to open / resolved / dismissed_by_owner", () => {
      expect(sql).toMatch(
        /CHECK \(status IN \('open', 'resolved', 'dismissed_by_owner'\)\)/,
      );
    });

    test("indexes (make, model, year_from, year_to) on recalls per spec", () => {
      expect(sql).toMatch(
        /idx_recalls_make_model_years\s+ON recalls \(make, model, year_from, year_to\)/,
      );
    });

    test("indexes (vehicle_id, recall_id) on vehicle_recall_status per spec", () => {
      expect(sql).toMatch(
        /idx_vehicle_recall_status_vehicle_recall\s+ON vehicle_recall_status \(vehicle_id, recall_id\)/,
      );
    });

    test("enables RLS on every new table", () => {
      expect(sql).toMatch(/ALTER TABLE recalls ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE tsbs ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(
        /ALTER TABLE vehicle_recall_status ENABLE ROW LEVEL SECURITY/,
      );
      expect(sql).toMatch(
        /ALTER TABLE recall_check_history ENABLE ROW LEVEL SECURITY/,
      );
    });

    test("declares an RLS policy for every new table", () => {
      expect(sql).toMatch(/CREATE POLICY recalls_read_all/);
      expect(sql).toMatch(/CREATE POLICY tsbs_read_all/);
      expect(sql).toMatch(/CREATE POLICY vehicle_recall_status_tenant/);
      expect(sql).toMatch(/CREATE POLICY recall_check_history_tenant/);
    });

    test("wraps everything in BEGIN / COMMIT", () => {
      expect(sql).toMatch(/\bBEGIN;\s/);
      expect(sql).toMatch(/\sCOMMIT;\s*$/);
    });

    test("is fully idempotent (no plain CREATE TABLE without IF NOT EXISTS)", () => {
      const matches = sql.match(/CREATE TABLE\s+(?!IF NOT EXISTS)/g);
      expect(matches).toBeNull();
    });

    test("ASSERT block fails loud if any table is missing after apply", () => {
      expect(sql).toMatch(/Migration 068 failed — missing tables/);
    });
  });

  describe("down migration body", () => {
    const downSql = fs.readFileSync(DOWN_NEW, "utf-8");

    test("drops all four tables", () => {
      expect(downSql).toMatch(/DROP TABLE IF EXISTS recall_check_history/);
      expect(downSql).toMatch(/DROP TABLE IF EXISTS vehicle_recall_status/);
      expect(downSql).toMatch(/DROP TABLE IF EXISTS tsbs/);
      expect(downSql).toMatch(/DROP TABLE IF EXISTS recalls\b/);
    });

    test("uses IF EXISTS so partial rollbacks don't error", () => {
      const matches = downSql.match(/DROP TABLE\s+(?!IF EXISTS)/g);
      expect(matches).toBeNull();
    });

    test("uses CASCADE so dependent indexes / policies unwind", () => {
      // Each DROP should end with CASCADE
      expect(downSql.match(/CASCADE/g)?.length).toBeGreaterThanOrEqual(4);
    });
  });
});
