/**
 * Migration 071 — trim-velocity + lead-source-ROI views structural test.
 *
 * Static checks (no DB connection required). Asserts:
 *  1. Up file exists and creates both views with CREATE OR REPLACE.
 *  2. Down file exists and drops both views with DROP VIEW IF EXISTS.
 *  3. Supporting indexes are guarded with IF NOT EXISTS.
 *  4. Up file is idempotent (re-running is safe).
 *  5. Views reference dealer_id (the column every consumer filters on).
 *
 * Real round-trip (up → down → up) runs in `npm run test:migrations`.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(
  REPO_ROOT,
  "src/db/migrations/071_trim_velocity_and_lead_source_views.sql",
);
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/071_trim_velocity_and_lead_source_views.down.sql",
);

describe("Migration 071 — trim-velocity + lead-source-ROI views", () => {
  test("up file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("down file exists", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  describe("up file body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates v_trim_velocity with CREATE OR REPLACE", () => {
      expect(sql).toMatch(/CREATE OR REPLACE VIEW v_trim_velocity\b/);
    });

    test("creates v_lead_source_roi with CREATE OR REPLACE", () => {
      expect(sql).toMatch(/CREATE OR REPLACE VIEW v_lead_source_roi\b/);
    });

    test("references dealer_id in both views", () => {
      // Split on the second view's CREATE OR REPLACE so the comment header
      // doesn't end up alone in the first chunk.
      const idx = sql.indexOf("CREATE OR REPLACE VIEW v_lead_source_roi");
      expect(idx).toBeGreaterThan(0);
      const trimSection = sql.slice(0, idx);
      const roiSection = sql.slice(idx);
      expect(trimSection).toMatch(/dealer_id/);
      expect(roiSection).toMatch(/dealer_id/);
    });

    test("uses the real schema columns (trim, total_gross, funded_at, source)", () => {
      // Column names verified against migrations 001 + 021.
      expect(sql).toContain("v.trim");
      expect(sql).toContain("dw.total_gross");
      expect(sql).toContain("dw.funded_at");
      expect(sql).toContain("l.source");
    });

    test("uses CREATE INDEX IF NOT EXISTS for every supporting index", () => {
      const idxLines = sql.match(/CREATE INDEX[^\n]*/g) ?? [];
      expect(idxLines.length).toBeGreaterThan(0);
      for (const line of idxLines) {
        expect(line).toContain("IF NOT EXISTS");
      }
    });

    test("uses CREATE OR REPLACE for every view (idempotent)", () => {
      // Count every actual view statement (uppercase CREATE prefix followed by VIEW).
      // Plain `CREATE VIEW` (no OR REPLACE) would not be idempotent.
      const replaceCount = (sql.match(/CREATE OR REPLACE VIEW\s+v_/g) ?? []).length;
      const plainCount = (sql.match(/^\s*CREATE VIEW\s+v_/gm) ?? []).length;
      expect(replaceCount).toBeGreaterThanOrEqual(2); // both views
      expect(plainCount).toBe(0);                      // none missed
    });

    test("PERCENTILE_CONT median-days is wrapped in FILTER for funded-only", () => {
      expect(sql).toMatch(/PERCENTILE_CONT\(0\.5\)[\s\S]{0,400}FILTER \(WHERE dw\.status = 'funded'/);
    });

    test("filters by status='funded' in trim-velocity gross / days computations", () => {
      expect(sql).toContain("FILTER (WHERE dw.status = 'funded'");
    });

    test("computes lead-source conversion as percentage, guarded against div-by-zero", () => {
      expect(sql).toMatch(/CASE\s+WHEN COUNT\(DISTINCT l\.id\) = 0 THEN 0/);
    });
  });

  describe("down file body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops both views with IF EXISTS", () => {
      expect(sql).toMatch(/DROP VIEW IF EXISTS v_trim_velocity\b/);
      expect(sql).toMatch(/DROP VIEW IF EXISTS v_lead_source_roi\b/);
    });
  });
});
