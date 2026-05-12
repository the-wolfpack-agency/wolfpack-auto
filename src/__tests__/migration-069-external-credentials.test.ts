/**
 * Migration 069 — BYO external credentials structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up creates both tables idempotently
 *   3. RLS is enabled with a dealer_id-keyed policy on each
 *   4. encrypted columns are BYTEA (not TEXT, not plaintext)
 *   5. provider CHECK list matches the 7 allowed slots
 *   6. rollback drops every table CASCADE + IF EXISTS
 *   7. up + down structural idempotence
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/069_external_credentials.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/rollback_069_external_credentials.sql",
);
const DOWN_ALT = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/069_external_credentials.down.sql",
);

describe("Migration 069 — BYO external credentials", () => {
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

    test("creates dealer_external_credentials idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS dealer_external_credentials\b/);
    });

    test("creates external_credential_audit idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS external_credential_audit\b/);
    });

    test("constrains provider to the 7 BYO slots", () => {
      expect(sql).toMatch(/CHECK \(provider IN \(/);
      for (const p of [
        "'kbb'",
        "'vauto'",
        "'mmr'",
        "'carfax'",
        "'autocheck'",
        "'plaid'",
        "'edmunds'",
      ]) {
        expect(sql).toContain(p);
      }
    });

    test("constrains status to active/revoked/rotating", () => {
      expect(sql).toMatch(/CHECK \(status IN \('active', 'revoked', 'rotating'\)\)/);
    });

    test("encrypts credential at rest (BYTEA, never plaintext)", () => {
      expect(sql).toMatch(/credential_blob_encrypted\s+BYTEA\s+NOT NULL/);
      expect(sql).toMatch(/credential_iv\s+BYTEA\s+NOT NULL/);
      // Sanity: no `credential_plaintext` column anywhere.
      expect(sql).not.toMatch(/credential_plaintext/);
    });

    test("unique index enforces one default credential per (dealer, provider)", () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_external_credentials_default[\s\S]+WHERE label IS NULL/,
      );
    });

    test("unique index enforces label uniqueness per (dealer, provider, label)", () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_external_credentials_labeled[\s\S]+WHERE label IS NOT NULL/,
      );
    });

    test("audit table action CHECK includes added/rotated/revoked/used/use_failed", () => {
      expect(sql).toMatch(/CHECK \(action IN \(/);
      for (const a of ["'added'", "'rotated'", "'revoked'", "'used'", "'use_failed'"]) {
        expect(sql).toContain(a);
      }
    });

    test("RLS enabled on both tables", () => {
      expect(sql).toMatch(/ALTER TABLE dealer_external_credentials ENABLE ROW LEVEL SECURITY/);
      expect(sql).toMatch(/ALTER TABLE external_credential_audit ENABLE ROW LEVEL SECURITY/);
    });

    test("policies key on dealer_id via app.current_dealer_id", () => {
      const matches = sql.match(/dealer_id = current_setting\('app\.current_dealer_id'/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test("every CREATE TABLE uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const safeTables = sql.match(/CREATE TABLE IF NOT EXISTS [A-Za-z_]+/g) ?? [];
      expect(safeTables.length).toBe(2);
    });

    test("every CREATE INDEX uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const unsafeUniq = sql.match(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafeUniq).toEqual([]);
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY (re-runnable)", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
      expect(drops.length).toBeGreaterThanOrEqual(2);
    });

    test("ends with a final ASSERT that fails loudly on missing tables", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 069 failed/);
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops every table with CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS dealer_external_credentials CASCADE/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS external_credential_audit CASCADE/);
    });
  });

  describe("up + down + up structural idempotence", () => {
    test("up uses IF NOT EXISTS everywhere; down uses IF EXISTS + CASCADE", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect((down.match(/DROP TABLE IF EXISTS.*CASCADE/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });
  });
});
