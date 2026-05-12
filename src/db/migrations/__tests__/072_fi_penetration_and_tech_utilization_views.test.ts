/**
 * Static analysis of migration 072 + its rollback.
 *
 * Verifies the views are idempotent (`CREATE OR REPLACE`), the supporting
 * indexes use `IF NOT EXISTS`, and the rollback drops everything the up
 * migration created. No Postgres required — pure file-content assertions.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const UP = readFileSync(
  join(ROOT, "072_fi_penetration_and_tech_utilization_views.sql"),
  "utf8",
);
const DOWN = readFileSync(
  join(ROOT, "rollback", "072_fi_penetration_and_tech_utilization_views.down.sql"),
  "utf8",
);

describe("migration 072 — up", () => {
  test("creates both views via CREATE OR REPLACE so reruns are safe", () => {
    expect(UP).toMatch(/CREATE OR REPLACE VIEW v_fi_penetration/i);
    expect(UP).toMatch(/CREATE OR REPLACE VIEW v_tech_utilization/i);
  });

  test("supporting indexes use IF NOT EXISTS", () => {
    const idxMatches = UP.match(/CREATE INDEX[^;]+/gi) ?? [];
    expect(idxMatches.length).toBeGreaterThan(0);
    for (const stmt of idxMatches) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  test("wraps everything in a single transaction", () => {
    expect(UP).toMatch(/^\s*BEGIN;/m);
    expect(UP).toMatch(/COMMIT;\s*$/);
  });

  test("v_fi_penetration GROUPs BY dealer + manager + product + month", () => {
    // product_type is exposed as a SELECT alias; the GROUP BY expression is
    // the same COALESCE(items.category, 'none') the SELECT projects.
    expect(UP).toMatch(/GROUP BY[\s\S]+dealer_id[\s\S]+created_by[\s\S]+COALESCE\(items\.category[\s\S]+DATE_TRUNC\('month'/i);
  });

  test("v_tech_utilization GROUPs BY dealer + tech + bay + week", () => {
    // tech_id is the alias for `t.id`; bay_id aliases appt.bay_number.
    expect(UP).toMatch(/GROUP BY[\s\S]+ro\.dealer_id[\s\S]+t\.id[\s\S]+bay_number[\s\S]+DATE_TRUNC\('week'/i);
  });

  test("hours_available defaults to 40h/week with an explicit TODO comment", () => {
    expect(UP).toMatch(/40::numeric\s+AS hours_available/);
    expect(UP).toMatch(/TODO[\s\S]+tech_schedule/i);
  });

  test("does not invent a parallel dealer_id source for either view", () => {
    // dealer_id must come from the underlying tables, not be hardcoded.
    expect(UP).not.toMatch(/dealer_id\s*=\s*'/);
  });
});

describe("migration 072 — rollback", () => {
  test("drops both views with IF EXISTS so partial rollbacks don't error", () => {
    expect(DOWN).toMatch(/DROP VIEW\s+IF EXISTS\s+v_tech_utilization/i);
    expect(DOWN).toMatch(/DROP VIEW\s+IF EXISTS\s+v_fi_penetration/i);
  });

  test("drops every supporting index the up migration created", () => {
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_deal_desk_dealer_funded_at/);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_repair_orders_dealer_week/);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_deal_fi_items_dealer_deal/);
  });
});
