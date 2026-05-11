/**
 * Migration 067 -- pre-qualification structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up creates all four tables idempotently
 *   3. RLS is enabled and policies are keyed on dealer_id
 *   4. Required indexes exist
 *   5. rollback drops every table
 *   6. up is structurally idempotent (re-runnable, no unique-violation patterns)
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/067_prequalification.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/rollback_067_prequalification.sql",
);
const DOWN_ALT = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/067_prequalification.down.sql",
);

describe("Migration 067 -- pre-qualification", () => {
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

    test("creates prequal_sessions idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS prequal_sessions\b/);
    });

    test("creates soft_credit_pulls idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS soft_credit_pulls\b/);
    });

    test("creates plaid_links idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS plaid_links\b/);
    });

    test("creates prequal_offers idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS prequal_offers\b/);
    });

    test("constrains prequal_sessions.status to the 6 allowed states", () => {
      expect(sql).toMatch(/CHECK \(status IN \(/);
      expect(sql).toContain("'started'");
      expect(sql).toContain("'credit_pulled'");
      expect(sql).toContain("'income_verified'");
      expect(sql).toContain("'offers_returned'");
      expect(sql).toContain("'completed'");
      expect(sql).toContain("'abandoned'");
    });

    test("constrains bureau_used to the 4 allowed bureaus", () => {
      expect(sql).toMatch(/CHECK \(bureau_used IN \(/);
      expect(sql).toContain("'mock'");
      expect(sql).toContain("'experian'");
      expect(sql).toContain("'equifax'");
      expect(sql).toContain("'transunion'");
    });

    test("constrains credit tier to the 5 FICO tiers", () => {
      expect(sql).toMatch(/CHECK \(tier IN \(/);
      expect(sql).toContain("'super_prime'");
      expect(sql).toContain("'prime'");
      expect(sql).toContain("'near_prime'");
      expect(sql).toContain("'subprime'");
      expect(sql).toContain("'deep_subprime'");
    });

    test("bounds score range to FICO scale (300-850)", () => {
      expect(sql).toMatch(/score_range_min\s+INTEGER\s+NOT NULL CHECK \(score_range_min BETWEEN 300 AND 850\)/);
      expect(sql).toMatch(/score_range_max\s+INTEGER\s+NOT NULL CHECK \(score_range_max BETWEEN 300 AND 850\)/);
      expect(sql).toMatch(/CHECK \(score_range_max >= score_range_min\)/);
    });

    test("encrypts raw_response + access_token at rest", () => {
      // Schema requires *_encrypted columns (TEXT, no plaintext column allowed)
      expect(sql).toMatch(/raw_response_encrypted\s+TEXT/);
      expect(sql).toMatch(/access_token_encrypted\s+TEXT/);
      expect(sql).not.toMatch(/raw_response\s+TEXT(?!_)/); // no plain raw_response column
      expect(sql).not.toMatch(/access_token\s+TEXT(?!_)/); // no plain access_token column
    });

    test("RLS enabled on all four tables", () => {
      expect(sql).toMatch(/ALTER TABLE prequal_sessions ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE soft_credit_pulls ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE plaid_links ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE prequal_offers ENABLE ROW LEVEL SECURITY/);
    });

    test("policies key on dealer_id via app.current_dealer_id", () => {
      const matches = sql.match(/dealer_id = current_setting\('app\.current_dealer_id'/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });

    test("required indexes exist on prequal_sessions", () => {
      expect(sql).toMatch(/idx_prequal_sessions_dealer_started\s+ON prequal_sessions \(dealer_id, started_at DESC\)/);
      expect(sql).toMatch(/idx_prequal_sessions_dealer_status\s+ON prequal_sessions \(dealer_id, status\)/);
    });

    test("required indexes exist on soft_credit_pulls", () => {
      expect(sql).toMatch(/idx_soft_credit_pulls_session\s+ON soft_credit_pulls \(session_id\)/);
      expect(sql).toMatch(/idx_soft_credit_pulls_dealer_pulled\s+ON soft_credit_pulls \(dealer_id, credit_pulled_at DESC\)/);
    });

    test("required indexes exist on plaid_links", () => {
      expect(sql).toMatch(/idx_plaid_links_session\s+ON plaid_links \(session_id\)/);
      expect(sql).toMatch(/idx_plaid_links_dealer_linked\s+ON plaid_links \(dealer_id, linked_at DESC\)/);
    });

    test("required indexes exist on prequal_offers", () => {
      expect(sql).toMatch(/idx_prequal_offers_session\s+ON prequal_offers \(session_id, apr_bps ASC\)/);
      expect(sql).toMatch(/idx_prequal_offers_dealer_created\s+ON prequal_offers \(dealer_id, created_at DESC\)/);
    });

    test("every CREATE TABLE uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const safeTables = sql.match(/CREATE TABLE IF NOT EXISTS [A-Za-z_]+/g) ?? [];
      expect(safeTables.length).toBe(4);
    });

    test("every CREATE INDEX uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY (re-runnable)", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
      expect(drops.length).toBeGreaterThanOrEqual(4);
    });

    test("ends with a final ASSERT that fails loudly on missing tables", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 067 failed/);
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops every table with CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS prequal_sessions CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS soft_credit_pulls CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS plaid_links CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS prequal_offers CASCADE/);
    });

    test("drops the updated_at trigger function", () => {
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS prequal_sessions_set_updated_at\(\)/);
    });
  });

  describe("up + down + up idempotence (structural)", () => {
    test("up uses IF NOT EXISTS everywhere; down uses IF EXISTS + CASCADE", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect((down.match(/DROP TABLE IF EXISTS.*CASCADE/g) ?? []).length).toBeGreaterThanOrEqual(4);
    });
  });
});
