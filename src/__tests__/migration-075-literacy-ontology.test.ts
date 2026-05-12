/**
 * Migration 075 — Literacy Ontology structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up creates all 6 tables idempotently
 *   3. RLS is enabled on every table
 *   4. literacy_outcomes has the strict dealer_id-keyed policy
 *   5. enum CHECK lists match the lib types (relations, roles, sources)
 *   6. rollback drops every table CASCADE + IF EXISTS
 *   7. up + down + up structural idempotence
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/075_literacy_ontology.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/rollback_075_literacy_ontology.sql",
);
const DOWN_ALT = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/075_literacy_ontology.down.sql",
);

describe("Migration 075 — Literacy Ontology", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("rollback runner-facing file exists", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  test("rollback .down.sql pair exists", () => {
    expect(fs.existsSync(DOWN_ALT)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test.each([
      "literacy_concepts",
      "literacy_mappings",
      "literacy_metrics",
      "literacy_translations",
      "literacy_actions",
      "literacy_outcomes",
    ])("creates %s idempotently", (table) => {
      const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`);
      expect(sql).toMatch(re);
    });

    test("constrains concept domain to digital/physical/hybrid", () => {
      expect(sql).toMatch(
        /CHECK \(domain IN \('digital', 'physical', 'hybrid'\)\)/,
      );
    });

    test("constrains mapping relation to the 5 allowed values", () => {
      for (const rel of [
        "'equivalent_to'",
        "'analog_of'",
        "'precedes'",
        "'measures'",
        "'aggregates'",
      ]) {
        expect(sql).toContain(rel);
      }
    });

    test("constrains source provenance to curated/ai_proposed/ai_approved", () => {
      const matches = sql.match(
        /CHECK \(source IN \('curated', 'ai_proposed', 'ai_approved'\)\)/g,
      ) ?? [];
      // 4 tables carry the source column: mappings, translations, actions
      // (concepts + metrics + outcomes don't). Allow 3+ to be safe.
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    test("constrains translation/action roles to the 9 allowed roles", () => {
      for (const role of [
        "'salesperson'",
        "'fi_manager'",
        "'bdc_agent'",
        "'service_advisor'",
        "'service_manager'",
        "'gm'",
        "'marketing'",
        "'controller'",
        "'any'",
      ]) {
        expect(sql).toContain(role);
      }
    });

    test("confidence column constrained to [0,1]", () => {
      expect(sql).toMatch(
        /CHECK \(confidence >= 0 AND confidence <= 1\)/,
      );
    });

    test("quality_score column constrained to [0,1]", () => {
      expect(sql).toMatch(
        /CHECK \(quality_score >= 0 AND quality_score <= 1\)/,
      );
    });

    test("RLS enabled on every literacy_* table", () => {
      for (const table of [
        "literacy_concepts",
        "literacy_mappings",
        "literacy_metrics",
        "literacy_translations",
        "literacy_actions",
        "literacy_outcomes",
      ]) {
        const re = new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`);
        expect(sql).toMatch(re);
      }
    });

    test("literacy_outcomes policy is keyed on dealer_id (current_setting)", () => {
      expect(sql).toMatch(
        /CREATE POLICY literacy_outcomes_tenant ON literacy_outcomes[\s\S]*current_setting\('app\.current_dealer_id'/,
      );
    });

    test("every CREATE TABLE uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const safeTables = sql.match(/CREATE TABLE IF NOT EXISTS [A-Za-z_]+/g) ?? [];
      expect(safeTables.length).toBe(6);
    });

    test("every CREATE INDEX uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const unsafeUniq = sql.match(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafeUniq).toEqual([]);
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
      expect(drops.length).toBeGreaterThanOrEqual(6);
    });

    test("ends with a final ASSERT that fails loudly on missing tables", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 075 failed/);
    });

    test("trigger updates updated_at on literacy_concepts", () => {
      expect(sql).toMatch(/CREATE TRIGGER literacy_concepts_updated_at/);
    });

    test("self-mapping prevented by CHECK constraint", () => {
      expect(sql).toMatch(
        /literacy_mappings_distinct CHECK \(source_concept_id <> target_concept_id\)/,
      );
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops every literacy_* table with CASCADE + IF EXISTS", () => {
      for (const table of [
        "literacy_concepts",
        "literacy_mappings",
        "literacy_metrics",
        "literacy_translations",
        "literacy_actions",
        "literacy_outcomes",
      ]) {
        const re = new RegExp(`DROP TABLE IF EXISTS ${table}\\s+CASCADE`);
        expect(sql).toMatch(re);
      }
    });
  });

  describe("up + down structural idempotence", () => {
    test("up uses IF NOT EXISTS everywhere; down uses IF EXISTS + CASCADE", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect((down.match(/DROP TABLE IF EXISTS.*CASCADE/g) ?? []).length).toBeGreaterThanOrEqual(6);
    });
  });
});
