/**
 * Static analysis of migration 081 (touchpoint_events +
 * touchpoint_registrations) + rollback.
 *
 * Mirrors the migration 079 pattern. Verifies idempotency, RLS
 * enforcement, the CHECK constraints, and that the rollback drops
 * everything the up migration creates. Treats both rollback filename
 * conventions as authoritative.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const UP = readFileSync(join(ROOT, "081_touchpoint_events.sql"), "utf8");
const DOWN = readFileSync(
  join(ROOT, "rollback", "081_touchpoint_events.down.sql"),
  "utf8",
);
const DOWN_LEGACY = readFileSync(
  join(ROOT, "rollback", "rollback_081_touchpoint_events.sql"),
  "utf8",
);

describe("migration 081 -- up", () => {
  test("wraps in BEGIN/COMMIT transaction", () => {
    expect(UP).toMatch(/^\s*BEGIN;/m);
    expect(UP).toMatch(/COMMIT;\s*$/);
  });

  test("creates touchpoint_events with IF NOT EXISTS", () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS touchpoint_events/i);
  });

  test("creates touchpoint_registrations with IF NOT EXISTS", () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS touchpoint_registrations/i);
  });

  test("touchpoint_type CHECK lists all five supported types", () => {
    for (const type of ["qr", "nfc", "rfid", "beacon", "webhook"]) {
      expect(UP).toContain(`'${type}'`);
    }
  });

  test("outcome CHECK enforces the documented state machine", () => {
    for (const outcome of [
      "action_triggered",
      "no_match",
      "duplicate_suppressed",
      "rate_limited",
      "error",
    ]) {
      expect(UP).toContain(`'${outcome}'`);
    }
  });

  test("UNIQUE (tenant_id, touchpoint_type, touchpoint_id) on registrations", () => {
    expect(UP).toMatch(
      /UNIQUE\s*\(\s*tenant_id\s*,\s*touchpoint_type\s*,\s*touchpoint_id\s*\)/i,
    );
  });

  test("indexes use IF NOT EXISTS so reruns are safe", () => {
    const idx = UP.match(/CREATE\s+(UNIQUE\s+)?INDEX[^;]+/gi) ?? [];
    expect(idx.length).toBeGreaterThanOrEqual(4);
    for (const stmt of idx) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  test("ENABLE ROW LEVEL SECURITY on both tables (defense-in-depth)", () => {
    expect(UP).toMatch(
      /ALTER TABLE touchpoint_events ENABLE ROW LEVEL SECURITY/i,
    );
    expect(UP).toMatch(
      /ALTER TABLE touchpoint_registrations ENABLE ROW LEVEL SECURITY/i,
    );
  });

  test("RLS policies key on tenant_id matching current_setting", () => {
    expect(UP).toMatch(/CREATE POLICY touchpoint_events_tenant/i);
    expect(UP).toMatch(/CREATE POLICY touchpoint_registrations_tenant/i);
    const occurrences = (UP.match(/current_setting\('app\.current_dealer_id'/g) ?? [])
      .length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  test("payload + action_parameters are JSONB", () => {
    expect(UP).toMatch(/payload\s+JSONB/i);
    expect(UP).toMatch(/action_parameters\s+JSONB/i);
  });

  test("ip_address is INET-typed", () => {
    expect(UP).toMatch(/ip_address\s+INET/i);
  });

  test("partial customer_id index is defined for non-null rows", () => {
    expect(UP).toMatch(
      /touchpoint_events_customer_idx[^;]+WHERE customer_id IS NOT NULL/is,
    );
  });

  test("final ASSERT block fails loudly if either table missing", () => {
    expect(UP).toMatch(/RAISE EXCEPTION 'Migration 081 failed/i);
  });
});

describe("migration 081 -- rollback", () => {
  test(".down.sql drops both tables with IF EXISTS + CASCADE", () => {
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS touchpoint_events/i);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS touchpoint_registrations/i);
    expect(DOWN).toMatch(/CASCADE/i);
  });

  test("legacy rollback_NNN_*.sql variant mirrors the .down.sql variant", () => {
    expect(DOWN_LEGACY).toMatch(/DROP TABLE IF EXISTS touchpoint_events/i);
    expect(DOWN_LEGACY).toMatch(/DROP TABLE IF EXISTS touchpoint_registrations/i);
    expect(DOWN_LEGACY).toMatch(/CASCADE/i);
  });
});
