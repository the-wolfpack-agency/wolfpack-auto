/**
 * Static analysis of migration 079 (dms_adapter_credentials) + rollback.
 *
 * Mirrors the migration 078/077 pattern. Verifies idempotency, RLS
 * enforcement, the CHECK constraints on provider + status, and that the
 * rollback drops everything the up migration creates.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const UP = readFileSync(join(ROOT, "079_dms_adapter_credentials.sql"), "utf8");
const DOWN = readFileSync(
  join(ROOT, "rollback", "079_dms_adapter_credentials.down.sql"),
  "utf8",
);
const DOWN_LEGACY = readFileSync(
  join(ROOT, "rollback", "rollback_079_dms_adapter_credentials.sql"),
  "utf8",
);

describe("migration 079 — up", () => {
  test("wraps in BEGIN/COMMIT transaction", () => {
    expect(UP).toMatch(/^\s*BEGIN;/m);
    expect(UP).toMatch(/COMMIT;\s*$/);
  });

  test("creates table with IF NOT EXISTS", () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS dms_adapter_credentials/i);
  });

  test("provider CHECK lists all seven supported providers", () => {
    for (const provider of [
      "mock",
      "cox_vauto",
      "dealersocket",
      "cdk",
      "reynolds",
      "dealertrack",
      "dealercenter",
    ]) {
      expect(UP).toContain(`'${provider}'`);
    }
  });

  test("status CHECK enforces the documented state machine", () => {
    for (const status of [
      "pending",
      "active",
      "failed",
      "revoked",
      "rotating",
    ]) {
      expect(UP).toContain(`'${status}'`);
    }
  });

  test("UNIQUE (dealer_id, provider) is declared", () => {
    expect(UP).toMatch(/UNIQUE\s*\(\s*dealer_id\s*,\s*provider\s*\)/i);
  });

  test("indexes use IF NOT EXISTS so reruns are safe", () => {
    const idx = UP.match(/CREATE\s+(UNIQUE\s+)?INDEX[^;]+/gi) ?? [];
    expect(idx.length).toBeGreaterThanOrEqual(2);
    for (const stmt of idx) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  test("ENABLE ROW LEVEL SECURITY (defense-in-depth)", () => {
    expect(UP).toMatch(/ALTER TABLE dms_adapter_credentials ENABLE ROW LEVEL SECURITY/i);
  });

  test("RLS policy keyed on dealer_id matching current_setting", () => {
    expect(UP).toMatch(/CREATE POLICY dms_adapter_credentials_dealer/i);
    expect(UP).toMatch(/current_setting\('app\.current_dealer_id'/);
  });

  test("BYTEA columns for the encrypted blob + IV", () => {
    expect(UP).toMatch(/credential_blob_encrypted\s+BYTEA/i);
    expect(UP).toMatch(/credential_iv\s+BYTEA/i);
  });

  test("capability_set is JSONB", () => {
    expect(UP).toMatch(/capability_set\s+JSONB/i);
  });

  test("updated_at trigger function is defined idempotently", () => {
    expect(UP).toMatch(/CREATE OR REPLACE FUNCTION dms_adapter_credentials_set_updated_at/i);
    expect(UP).toMatch(/pg_trigger WHERE tgname = 'dms_adapter_credentials_updated_at'/);
  });

  test("final ASSERT block fails loudly if table missing", () => {
    expect(UP).toMatch(/RAISE EXCEPTION 'Migration 079 failed/i);
  });
});

describe("migration 079 — rollback", () => {
  test("drops the table with IF EXISTS", () => {
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS dms_adapter_credentials/i);
  });

  test("uses CASCADE so dependent indexes drop", () => {
    expect(DOWN).toMatch(/CASCADE/i);
  });

  test("drops trigger + trigger function", () => {
    expect(DOWN).toMatch(/DROP TRIGGER IF EXISTS dms_adapter_credentials_updated_at/i);
    expect(DOWN).toMatch(/DROP FUNCTION IF EXISTS dms_adapter_credentials_set_updated_at/i);
  });

  test("legacy rollback_NNN_*.sql variant mirrors the .down.sql variant", () => {
    expect(DOWN_LEGACY).toMatch(/DROP TABLE IF EXISTS dms_adapter_credentials/i);
    expect(DOWN_LEGACY).toMatch(/CASCADE/i);
  });
});
