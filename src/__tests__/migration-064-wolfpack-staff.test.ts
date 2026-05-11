/**
 * Migration 064 — wolfpack_staff structural test.
 *
 * Pure static checks (no DB connection required) so the test suite stays
 * fast and runs in CI without a Postgres dependency. Asserts:
 *
 *  1. Migration up file exists, contains the three CREATE TABLE statements,
 *     uses IF NOT EXISTS for idempotence, and indexes the columns the
 *     routes select on.
 *  2. Companion rollback file exists and drops all three tables.
 *  3. The migration is wrapped in BEGIN / COMMIT.
 *  4. Up + down are idempotent (rerunning is safe).
 *
 * A real round-trip test (apply → rollback → re-apply) is exercised in
 * the E2E migration script `npm run test:migrations`.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/064_wolfpack_staff.sql");
const DOWN = path.join(REPO_ROOT, "src/db/migrations/rollback/064_wolfpack_staff.down.sql");

describe("Migration 064 — wolfpack_staff", () => {
  test("up migration file exists", () => {
    expect(fs.existsSync(UP)).toBe(true);
  });

  test("down migration file exists (companion rollback)", () => {
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  describe("up migration body", () => {
    const sql = fs.readFileSync(UP, "utf-8");

    test("creates wolfpack_staff", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS wolfpack_staff\b/);
    });

    test("creates wolfpack_staff_invites", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS wolfpack_staff_invites\b/);
    });

    test("creates wolfpack_staff_audit_log", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS wolfpack_staff_audit_log\b/);
    });

    test("constrains role to admin/operator/viewer", () => {
      expect(sql).toMatch(/CHECK \(role IN \('admin', 'operator', 'viewer'\)\)/);
    });

    test("indexes email + token_hash + (staff_id, created_at)", () => {
      expect(sql).toMatch(/idx_wolfpack_staff_email/);
      expect(sql).toMatch(/idx_wolfpack_staff_invites_token_hash/);
      expect(sql).toMatch(/idx_wolfpack_staff_audit_log_staff_created/);
    });

    test("wraps in BEGIN/COMMIT", () => {
      expect(sql.trimStart().startsWith("-- Migration 064")).toBe(true);
      expect(sql).toMatch(/\bBEGIN;\s/);
      expect(sql).toMatch(/\sCOMMIT;\s*$/);
    });

    test("uses citext for case-insensitive email", () => {
      expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS citext/);
      expect(sql).toMatch(/email\s+CITEXT/);
    });

    test("is fully idempotent (no plain CREATE TABLE without IF NOT EXISTS)", () => {
      // Allow CREATE OR REPLACE FUNCTION which is idempotent by construction.
      const matches = sql.match(/CREATE TABLE\s+(?!IF NOT EXISTS)/g);
      expect(matches).toBeNull();
    });
  });

  describe("down migration body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops all three tables", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS wolfpack_staff_audit_log/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS wolfpack_staff_invites/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS wolfpack_staff\b/);
    });

    test("uses IF EXISTS so partial rollbacks don't error", () => {
      const matches = sql.match(/DROP TABLE\s+(?!IF EXISTS)/g);
      expect(matches).toBeNull();
    });

    test("drops the updated_at trigger function", () => {
      expect(sql).toMatch(/DROP TRIGGER IF EXISTS wolfpack_staff_updated_at/);
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS wolfpack_staff_set_updated_at/);
    });
  });
});
