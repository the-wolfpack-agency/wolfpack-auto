/**
 * Static analysis of migration 076 + its rollback.
 *
 * Verifies the migration is idempotent (CREATE TABLE IF NOT EXISTS,
 * DROP POLICY IF EXISTS + CREATE POLICY for every policy), enables RLS on
 * both tables, declares the FK to literacy_concepts on tooltips, and the
 * rollback drops everything the up migration created. No Postgres required.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const UP = readFileSync(
  join(ROOT, "076_literacy_walkthroughs_tooltips.sql"),
  "utf8",
);
const DOWN_RUNNER = readFileSync(
  join(ROOT, "rollback", "rollback_076_literacy_walkthroughs_tooltips.sql"),
  "utf8",
);

describe("migration 076 — up", () => {
  test("wraps in BEGIN/COMMIT transaction", () => {
    expect(UP).toMatch(/^\s*BEGIN;/m);
    expect(UP).toMatch(/COMMIT;\s*$/);
  });

  test("creates both tables with IF NOT EXISTS", () => {
    expect(UP).toMatch(
      /CREATE TABLE IF NOT EXISTS literacy_walkthroughs/i,
    );
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS literacy_tooltips/i);
  });

  test("indexes use IF NOT EXISTS so reruns are safe", () => {
    const idx = UP.match(/CREATE (UNIQUE )?INDEX[^;]+/gi) ?? [];
    expect(idx.length).toBeGreaterThan(0);
    for (const stmt of idx) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  test("literacy_walkthroughs has the documented columns + CHECKs", () => {
    expect(UP).toMatch(/slug\s+TEXT\s+NOT NULL UNIQUE/i);
    expect(UP).toMatch(/role\s+TEXT\s+NOT NULL CHECK \(role IN \(/i);
    // CHECK covers all nine role values per the strategy doc.
    for (const role of [
      "salesperson",
      "fi_manager",
      "bdc_agent",
      "service_advisor",
      "service_manager",
      "gm",
      "marketing",
      "controller",
      "any",
    ]) {
      expect(UP).toContain(`'${role}'`);
    }
    expect(UP).toMatch(/steps\s+JSONB\s+NOT NULL/i);
    expect(UP).toMatch(
      /source\s+TEXT\s+NOT NULL DEFAULT 'ai_proposed'/i,
    );
    expect(UP).toMatch(/active\s+BOOLEAN\s+NOT NULL DEFAULT TRUE/i);
  });

  test("literacy_tooltips FK references literacy_concepts(id) ON DELETE CASCADE", () => {
    expect(UP).toMatch(
      /concept_id\s+UUID\s+NOT NULL REFERENCES literacy_concepts\(id\)\s+ON DELETE CASCADE/i,
    );
  });

  test("literacy_tooltips has unique (concept_id, role) index", () => {
    expect(UP).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_literacy_tooltips_concept_role[\s\S]+ON literacy_tooltips \(concept_id, role\)/i,
    );
  });

  test("documents the literacy_walkthroughs (role, active) supporting index", () => {
    expect(UP).toMatch(
      /literacy_walkthroughs_role_active_idx[\s\S]+\(role, active\)/i,
    );
  });

  test("enables RLS on both new tables", () => {
    expect(UP).toMatch(
      /ALTER TABLE literacy_walkthroughs\s+ENABLE ROW LEVEL SECURITY/i,
    );
    expect(UP).toMatch(
      /ALTER TABLE literacy_tooltips\s+ENABLE ROW LEVEL SECURITY/i,
    );
  });

  test("policies are idempotent (DROP POLICY IF EXISTS + CREATE POLICY)", () => {
    const drops = UP.match(/DROP POLICY IF EXISTS [a-z_]+\s+ON literacy_/gi) ?? [];
    const creates = UP.match(/CREATE POLICY [a-z_]+\s+ON literacy_/gi) ?? [];
    expect(drops.length).toBeGreaterThanOrEqual(4);
    expect(creates.length).toBe(drops.length);
  });

  test("includes permissive SELECT policies (curated content, shared across dealers)", () => {
    expect(UP).toMatch(
      /CREATE POLICY literacy_walkthroughs_read\s+ON literacy_walkthroughs[\s\S]+FOR SELECT USING \(true\)/i,
    );
    expect(UP).toMatch(
      /CREATE POLICY literacy_tooltips_read\s+ON literacy_tooltips[\s\S]+FOR SELECT USING \(true\)/i,
    );
  });

  test("ends with a final ASSERT that fails loudly when tables are missing", () => {
    expect(UP).toMatch(/RAISE EXCEPTION 'Migration 076 failed/);
  });
});

describe("migration 076 — rollback", () => {
  test("drops both tables with IF EXISTS so partial rollbacks don't error", () => {
    expect(DOWN_RUNNER).toMatch(/DROP TABLE IF EXISTS literacy_tooltips/i);
    expect(DOWN_RUNNER).toMatch(
      /DROP TABLE IF EXISTS literacy_walkthroughs/i,
    );
  });

  test("drops tooltips BEFORE walkthroughs (no cross-table FK, order is still safest)", () => {
    const tIdx = DOWN_RUNNER.indexOf("literacy_tooltips");
    const wIdx = DOWN_RUNNER.indexOf("literacy_walkthroughs");
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(wIdx).toBeGreaterThan(tIdx);
  });

  test("drops the supporting trigger function", () => {
    expect(DOWN_RUNNER).toMatch(
      /DROP FUNCTION IF EXISTS literacy_walkthroughs_set_updated_at/i,
    );
  });
});
