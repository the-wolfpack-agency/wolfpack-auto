/**
 * Static analysis of migration 082 (ecommerce_adapter_credentials) + rollback.
 *
 * Mirrors migration 079's test. Verifies idempotency, RLS enforcement, the
 * CHECK constraints on provider + status, and that the rollback drops
 * everything the up migration creates.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const UP = readFileSync(join(ROOT, "082_ecommerce_adapter_credentials.sql"), "utf8");
const DOWN = readFileSync(
  join(ROOT, "rollback", "082_ecommerce_adapter_credentials.down.sql"),
  "utf8",
);
const DOWN_LEGACY = readFileSync(
  join(ROOT, "rollback", "rollback_082_ecommerce_adapter_credentials.sql"),
  "utf8",
);

describe("migration 082 — up", () => {
  test("wraps in BEGIN/COMMIT transaction", () => {
    expect(UP).toMatch(/^\s*BEGIN;/m);
    expect(UP).toMatch(/COMMIT;\s*$/);
  });

  test("creates table with IF NOT EXISTS", () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS ecommerce_adapter_credentials/i);
  });

  test("provider CHECK lists all eight supported providers", () => {
    for (const provider of [
      "mock_shop",
      "shopify",
      "bigcommerce",
      "adobe_commerce",
      "klaviyo",
      "attentive",
      "meta_ads",
      "google_ads",
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

  test("UNIQUE (tenant_id, provider) is declared", () => {
    expect(UP).toMatch(/UNIQUE\s*\(\s*tenant_id\s*,\s*provider\s*\)/i);
  });

  test("indexes use IF NOT EXISTS so reruns are safe", () => {
    const idx = UP.match(/CREATE\s+(UNIQUE\s+)?INDEX[^;]+/gi) ?? [];
    expect(idx.length).toBeGreaterThanOrEqual(2);
    for (const stmt of idx) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  test("ENABLE ROW LEVEL SECURITY (defense-in-depth)", () => {
    expect(UP).toMatch(
      /ALTER TABLE ecommerce_adapter_credentials ENABLE ROW LEVEL SECURITY/i,
    );
  });

  test("RLS policy keyed on tenant_id matching current_setting", () => {
    expect(UP).toMatch(/CREATE POLICY ecommerce_adapter_credentials_tenant/i);
    expect(UP).toMatch(/current_setting\('app\.current_dealer_id'/);
    expect(UP).toMatch(/tenant_id::text\s*=\s*current_setting/);
  });

  test("BYTEA columns for the encrypted blob + IV", () => {
    expect(UP).toMatch(/credential_blob_encrypted\s+BYTEA/i);
    expect(UP).toMatch(/credential_iv\s+BYTEA/i);
  });

  test("capability_set is JSONB", () => {
    expect(UP).toMatch(/capability_set\s+JSONB/i);
  });

  test("updated_at trigger function is defined idempotently", () => {
    expect(UP).toMatch(
      /CREATE OR REPLACE FUNCTION ecommerce_adapter_credentials_set_updated_at/i,
    );
    expect(UP).toMatch(
      /pg_trigger WHERE tgname = 'ecommerce_adapter_credentials_updated_at'/,
    );
  });

  test("final ASSERT block fails loudly if table missing", () => {
    expect(UP).toMatch(/RAISE EXCEPTION 'Migration 082 failed/i);
  });
});

describe("migration 082 — rollback", () => {
  test("drops the table with IF EXISTS", () => {
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS ecommerce_adapter_credentials/i);
  });

  test("uses CASCADE so dependent indexes drop", () => {
    expect(DOWN).toMatch(/CASCADE/i);
  });

  test("drops trigger + trigger function", () => {
    expect(DOWN).toMatch(
      /DROP TRIGGER IF EXISTS ecommerce_adapter_credentials_updated_at/i,
    );
    expect(DOWN).toMatch(
      /DROP FUNCTION IF EXISTS ecommerce_adapter_credentials_set_updated_at/i,
    );
  });

  test("legacy rollback_NNN_*.sql variant mirrors the .down.sql variant", () => {
    expect(DOWN_LEGACY).toMatch(
      /DROP TABLE IF EXISTS ecommerce_adapter_credentials/i,
    );
    expect(DOWN_LEGACY).toMatch(/CASCADE/i);
  });
});
