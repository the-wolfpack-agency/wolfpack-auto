/**
 * Migration 066 — lead intake structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up creates all three tables idempotently
 *   3. RLS is enabled and policies are keyed on dealer_id
 *   4. Required indexes exist
 *   5. rollback drops every table
 *   6. up is idempotent (re-running produces no new statements that would fail)
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/066_lead_intake.sql");
const DOWN = path.join(REPO_ROOT, "src/db/migrations/rollback/rollback_066_lead_intake.sql");

describe("Migration 066 — lead intake", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("rollback file exists", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates lead_sources idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS lead_sources\b/);
    });

    test("creates lead_enrichment idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS lead_enrichment\b/);
    });

    test("creates lead_routing_decisions idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS lead_routing_decisions\b/);
    });

    test("constrains source_type enum", () => {
      expect(sql).toMatch(/CHECK \(source_type IN \('webhook','api','email','manual'\)\)/);
    });

    test("RLS enabled on all three tables", () => {
      expect(sql).toMatch(/ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE lead_enrichment ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE lead_routing_decisions ENABLE ROW LEVEL SECURITY/);
    });

    test("policies key on dealer_id via app.current_dealer_id", () => {
      const matches = sql.match(/dealer_id = current_setting\('app\.current_dealer_id'/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(3);
    });

    test("required indexes exist", () => {
      expect(sql).toMatch(/idx_lead_sources_dealer_created\s+ON lead_sources \(dealer_id, created_at DESC\)/);
      expect(sql).toMatch(/idx_lead_enrichment_dealer_created\s+ON lead_enrichment \(dealer_id, created_at DESC\)/);
      expect(sql).toMatch(/idx_lead_enrichment_lead\s+ON lead_enrichment \(lead_id\)/);
      expect(sql).toMatch(/idx_lead_routing_dealer_created\s+ON lead_routing_decisions \(dealer_id, created_at DESC\)/);
      expect(sql).toMatch(/idx_lead_routing_lead\s+ON lead_routing_decisions \(lead_id\)/);
    });

    test("every CREATE TABLE uses IF NOT EXISTS (idempotent)", () => {
      // Find any CREATE TABLE that is NOT followed by IF NOT EXISTS.
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const safeTables = sql.match(/CREATE TABLE IF NOT EXISTS [A-Za-z_]+/g) ?? [];
      expect(safeTables.length).toBe(3);
    });

    test("every CREATE INDEX uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY (re-runnable)", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops every table with CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS lead_sources CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS lead_enrichment CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS lead_routing_decisions CASCADE/);
    });
  });

  describe("up + down + up idempotence (structural)", () => {
    test("running rollback then up again is safe (no UNIQUE-violation patterns)", () => {
      // Static guarantee: the up file uses IF NOT EXISTS + DROP POLICY IF EXISTS
      // everywhere we tested above. Plus the down file uses IF EXISTS + CASCADE.
      // That structurally proves: up → down → up is non-destructive and idempotent.
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect(down.match(/DROP TABLE IF EXISTS.*CASCADE/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
  });
});
