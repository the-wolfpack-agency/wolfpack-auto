/**
 * Migration 080 — vertical-aware action registry + tenant_verticals.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up adds assistant_actions.vertical idempotently with CHECK constraint
 *   3. up creates tenant_verticals idempotently with RLS + CHECK
 *   4. backfill is wrapped defensively in a DO block so the migration still
 *      succeeds when `dealers` is absent
 *   5. rollback drops everything with IF EXISTS + CASCADE
 *   6. up + down structural idempotence
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/080_assistant_actions_vertical.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/rollback_080_assistant_actions_vertical.sql",
);
const DOWN_ALT = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/080_assistant_actions_vertical.down.sql",
);

describe("Migration 080 — assistant_actions vertical + tenant_verticals", () => {
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

    test("adds vertical column to assistant_actions with NOT NULL DEFAULT 'any'", () => {
      expect(sql).toMatch(
        /ALTER TABLE assistant_actions[\s\S]*ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'any'/,
      );
    });

    test("CHECK constraint covers all five vertical values", () => {
      for (const v of ["'auto'", "'retail'", "'service'", "'hospitality'", "'any'"]) {
        expect(sql).toContain(v);
      }
      expect(sql).toMatch(
        /CHECK \(vertical IN \('auto', 'retail', 'service', 'hospitality', 'any'\)\)/,
      );
    });

    test("CHECK constraint added defensively (idempotent via pg_constraint check)", () => {
      expect(sql).toMatch(/assistant_actions_vertical_check/);
      expect(sql).toMatch(/IF NOT EXISTS[\s\S]*pg_constraint/);
    });

    test("creates assistant_actions_vertical_idx idempotently", () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS assistant_actions_vertical_idx\s+ON assistant_actions \(vertical\)/,
      );
    });

    test("creates tenant_verticals idempotently with PK on tenant_id", () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS tenant_verticals/);
      expect(sql).toMatch(/tenant_id\s+UUID\s+PRIMARY KEY/);
    });

    test("tenant_verticals CHECK constraint omits 'any' (tenants are single-vertical)", () => {
      // Tenants must be in exactly one vertical — 'any' is action-side only.
      expect(sql).toMatch(
        /CHECK \(vertical IN \(\s*'auto',\s*'retail',\s*'service',\s*'hospitality'\s*\)\)/,
      );
    });

    test("creates tenant_verticals_vertical_idx idempotently", () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS tenant_verticals_vertical_idx\s+ON tenant_verticals \(vertical\)/,
      );
    });

    test("backfill wrapped defensively in DO block when `dealers` exists", () => {
      expect(sql).toMatch(/IF EXISTS[\s\S]*information_schema\.tables[\s\S]*'dealers'/);
      expect(sql).toMatch(
        /INSERT INTO tenant_verticals \(tenant_id, vertical\)[\s\S]*SELECT id, 'auto' FROM dealers[\s\S]*ON CONFLICT \(tenant_id\) DO NOTHING/,
      );
    });

    test("backfill logs a NOTICE rather than throwing when dealers is missing", () => {
      expect(sql).toMatch(/RAISE NOTICE '\[migration 080\] dealers table missing/);
    });

    test("RLS enabled on tenant_verticals", () => {
      expect(sql).toMatch(/ALTER TABLE tenant_verticals\s+ENABLE ROW LEVEL SECURITY/);
    });

    test("tenant_verticals_read policy is permissive on SELECT", () => {
      expect(sql).toMatch(
        /CREATE POLICY tenant_verticals_read ON tenant_verticals\s+FOR SELECT USING \(true\)/,
      );
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY (idempotent)", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
      expect(drops.length).toBeGreaterThanOrEqual(2);
    });

    test("every CREATE TABLE uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("every CREATE INDEX uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
    });

    test("updated_at trigger on tenant_verticals fires before update", () => {
      expect(sql).toMatch(/CREATE TRIGGER tenant_verticals_updated_at/);
      expect(sql).toMatch(/BEFORE UPDATE ON tenant_verticals/);
    });

    test("ends with a final ASSERT that fails loudly on missing column or table", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 080 failed/);
      expect(sql).toMatch(/assistant_actions\.vertical/);
      expect(sql).toMatch(/tenant_verticals/);
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops tenant_verticals CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS tenant_verticals\s+CASCADE/);
    });

    test("drops the vertical CHECK constraint defensively", () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS assistant_actions_vertical_check/);
    });

    test("drops the vertical column defensively", () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS vertical/);
    });

    test("drops the vertical index defensively", () => {
      expect(sql).toMatch(/DROP INDEX IF EXISTS assistant_actions_vertical_idx/);
    });

    test("drops the updated_at function CASCADE + IF EXISTS", () => {
      expect(sql).toMatch(
        /DROP FUNCTION IF EXISTS tenant_verticals_set_updated_at\(\)\s+CASCADE/,
      );
    });
  });

  describe("up + down structural idempotence", () => {
    test("up uses IF NOT EXISTS everywhere; down uses IF EXISTS", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("ADD COLUMN IF NOT EXISTS vertical")).toBe(true);
      expect(up.includes("CREATE TABLE IF NOT EXISTS tenant_verticals")).toBe(true);
      expect((down.match(/IF EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(4);
    });

    test("up + down .down.sql pair are byte-identical (single source of truth)", () => {
      const a = fs.readFileSync(DOWN, "utf-8");
      const b = fs.readFileSync(DOWN_ALT, "utf-8");
      expect(a).toBe(b);
    });
  });
});
