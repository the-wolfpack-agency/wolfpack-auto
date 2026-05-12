/**
 * Migration 074 — fi_audit_runs structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up creates the fi_audit_runs table idempotently
 *   3. Required indexes exist (status, requested_at, email)
 *   4. Status CHECK constraint covers the documented state machine
 *   5. rollback drops the table with CASCADE + IF EXISTS
 *   6. up + down + up cycle is structurally safe (idempotent shape)
 *
 * RLS is deliberately NOT enforced on this table — it is pre-customer
 * lead intake with no dealer_id key. App-layer policy gates access.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/074_fi_audit_runs.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/074_fi_audit_runs.down.sql",
);

describe("Migration 074 — fi_audit_runs", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("rollback file exists", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates fi_audit_runs idempotently", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS fi_audit_runs\b/);
    });

    test("uses uuid primary key with gen_random_uuid default", () => {
      expect(sql).toMatch(/id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    });

    test("status CHECK covers documented state machine", () => {
      expect(sql).toMatch(
        /CHECK \(status IN \('pending','processing','delivered','failed','demo_booked','converted'\)\)/,
      );
    });

    test("declares ip_address as inet (abuse detection)", () => {
      expect(sql).toMatch(/ip_address\s+inet/);
    });

    test("declares summary_metrics as jsonb", () => {
      expect(sql).toMatch(/summary_metrics\s+jsonb/);
    });

    test("required indexes exist", () => {
      expect(sql).toMatch(
        /fi_audit_runs_status_idx\s+ON fi_audit_runs \(status\)/,
      );
      expect(sql).toMatch(
        /fi_audit_runs_requested_at_idx\s+ON fi_audit_runs \(requested_at DESC\)/,
      );
      expect(sql).toMatch(
        /fi_audit_runs_email_idx\s+ON fi_audit_runs \(contact_email\)/,
      );
    });

    test("every CREATE TABLE uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("every CREATE INDEX uses IF NOT EXISTS (idempotent)", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("does not enable RLS (pre-customer lead intake — no dealer_id column)", () => {
      // App-layer policy applies; ensure we did NOT silently add a dealer_id
      // column (comments are allowed to reference the concept).
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/);
      // No dealer_id column: must not appear as a column declaration. We
      // strip line comments + the standalone comment block to test the
      // executable SQL only.
      const codeOnly = sql
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect(codeOnly).not.toMatch(/\bdealer_id\b/);
    });

    test("status defaults to pending", () => {
      expect(sql).toMatch(/status\s+text NOT NULL DEFAULT 'pending'/);
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops the table with CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS fi_audit_runs CASCADE/);
    });
  });

  describe("up + down + up idempotence (structural)", () => {
    test("up → down → up is non-destructive (static guarantee)", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect(down).toMatch(/DROP TABLE IF EXISTS.*CASCADE/);
    });
  });
});
