/**
 * Static analysis of migration 078 (website_audit_runs) + rollback.
 *
 * Mirrors the migration-074 pattern. Verifies idempotency and that the
 * rollback drops everything the up migration creates.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const UP = readFileSync(join(ROOT, "078_website_audit_runs.sql"), "utf8");
const DOWN = readFileSync(
  join(ROOT, "rollback", "078_website_audit_runs.down.sql"),
  "utf8",
);

describe("migration 078 — up", () => {
  test("wraps in BEGIN/COMMIT transaction", () => {
    expect(UP).toMatch(/^\s*BEGIN;/m);
    expect(UP).toMatch(/COMMIT;\s*$/);
  });

  test("creates table with IF NOT EXISTS", () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS website_audit_runs/i);
  });

  test("indexes use IF NOT EXISTS so reruns are safe", () => {
    const idx = UP.match(/CREATE\s+(UNIQUE\s+)?INDEX[^;]+/gi) ?? [];
    expect(idx.length).toBeGreaterThanOrEqual(3);
    for (const stmt of idx) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  test("declares the documented state-machine values", () => {
    for (const status of [
      "pending",
      "scanning",
      "generating_report",
      "delivered",
      "failed",
      "demo_booked",
      "converted",
    ]) {
      expect(UP).toContain(`'${status}'`);
    }
  });

  test("declares the documented columns", () => {
    expect(UP).toMatch(/dealership_name\s+text NOT NULL/i);
    expect(UP).toMatch(/website_url\s+text NOT NULL/i);
    expect(UP).toMatch(/contact_email\s+text NOT NULL/i);
    expect(UP).toMatch(/summary_metrics\s+jsonb/i);
    expect(UP).toMatch(/raw_findings\s+jsonb/i);
    expect(UP).toMatch(/oem_affiliation\s+text/i);
    expect(UP).toMatch(/ip_address\s+inet/i);
  });

  test("does NOT enable RLS (pre-customer lead intake by design)", () => {
    expect(UP).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});

describe("migration 078 — rollback", () => {
  test("drops the table with IF EXISTS", () => {
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS website_audit_runs/i);
  });

  test("uses CASCADE to remove dependent indexes", () => {
    expect(DOWN).toMatch(/CASCADE/i);
  });
});
