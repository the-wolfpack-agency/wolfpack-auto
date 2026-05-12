/**
 * Migration 077 — Wolfpack Assistant Scaffolding structural test.
 *
 * Pure static checks (no DB connection required). Asserts:
 *   1. up + rollback files exist
 *   2. up creates all 4 tables idempotently
 *   3. RLS is enabled on every table
 *   4. assistant_conversations + assistant_conversation_messages have
 *      strict dealer_id-keyed policies
 *   5. CHECK constraints cover side_effect + direction + satisfaction
 *   6. rollback drops every table CASCADE + IF EXISTS
 *   7. up + down structural idempotence
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const UP = path.join(REPO_ROOT, "src/db/migrations/077_assistant_scaffolding.sql");
const DOWN = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/rollback_077_assistant_scaffolding.sql",
);
const DOWN_ALT = path.join(
  REPO_ROOT,
  "src/db/migrations/rollback/077_assistant_scaffolding.down.sql",
);

describe("Migration 077 — Wolfpack Assistant Scaffolding", () => {
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

    test.each([
      "assistant_actions",
      "assistant_capabilities",
      "assistant_conversations",
      "assistant_conversation_messages",
    ])("creates %s idempotently", (table) => {
      const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`);
      expect(sql).toMatch(re);
    });

    test("constrains side_effect to read/mutating/irreversible", () => {
      expect(sql).toMatch(
        /CHECK \(side_effect IN \(\s*'read',\s*'mutating',\s*'irreversible'\s*\)\)/s,
      );
    });

    test("constrains direction to user/assistant", () => {
      expect(sql).toMatch(
        /CHECK \(direction IN \(\s*'user',\s*'assistant'\s*\)\)/s,
      );
    });

    test("constrains satisfaction_signal to positive/neutral/negative/unknown", () => {
      for (const v of [
        "'positive'",
        "'neutral'",
        "'negative'",
        "'unknown'",
      ]) {
        expect(sql).toContain(v);
      }
    });

    test("RLS enabled on every assistant_* table", () => {
      for (const table of [
        "assistant_actions",
        "assistant_capabilities",
        "assistant_conversations",
        "assistant_conversation_messages",
      ]) {
        const re = new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`);
        expect(sql).toMatch(re);
      }
    });

    test("assistant_conversations policy keys on dealer_id (current_setting)", () => {
      expect(sql).toMatch(
        /CREATE POLICY assistant_conversations_tenant ON assistant_conversations[\s\S]*current_setting\('app\.current_dealer_id'/,
      );
    });

    test("assistant_conversation_messages policy keys on dealer_id (current_setting)", () => {
      expect(sql).toMatch(
        /CREATE POLICY assistant_messages_tenant ON assistant_conversation_messages[\s\S]*current_setting\('app\.current_dealer_id'/,
      );
    });

    test("every CREATE TABLE uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const safeTables = sql.match(/CREATE TABLE IF NOT EXISTS [A-Za-z_]+/g) ?? [];
      expect(safeTables.length).toBe(4);
    });

    test("every CREATE INDEX uses IF NOT EXISTS", () => {
      const unsafe = sql.match(/CREATE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafe).toEqual([]);
      const unsafeUniq = sql.match(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/g) ?? [];
      expect(unsafeUniq).toEqual([]);
    });

    test("policies use DROP POLICY IF EXISTS before CREATE POLICY", () => {
      const drops = sql.match(/DROP POLICY IF EXISTS/g) ?? [];
      const creates = sql.match(/CREATE POLICY/g) ?? [];
      expect(drops.length).toBe(creates.length);
      expect(drops.length).toBeGreaterThanOrEqual(4);
    });

    test("ends with a final ASSERT that fails loudly on missing tables", () => {
      expect(sql).toMatch(/RAISE EXCEPTION 'Migration 077 failed/);
    });

    test("trigger updates updated_at on assistant_actions", () => {
      expect(sql).toMatch(/CREATE TRIGGER assistant_actions_updated_at/);
    });

    test("assistant_actions slug is UNIQUE", () => {
      expect(sql).toMatch(/slug\s+TEXT\s+NOT NULL UNIQUE/);
    });

    test("assistant_capabilities (action_id, role) is UNIQUE", () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_capabilities_action_role\s+ON assistant_capabilities \(action_id, role\)/,
      );
    });

    test("assistant_conversation_messages (conversation_id, message_index) is UNIQUE", () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_messages_conv_index\s+ON assistant_conversation_messages \(conversation_id, message_index\)/,
      );
    });
  });

  describe("rollback body", () => {
    const sql = fs.readFileSync(DOWN, "utf-8");

    test("drops every assistant_* table with CASCADE + IF EXISTS", () => {
      for (const table of [
        "assistant_actions",
        "assistant_capabilities",
        "assistant_conversations",
        "assistant_conversation_messages",
      ]) {
        const re = new RegExp(`DROP TABLE IF EXISTS ${table}\\s+CASCADE`);
        expect(sql).toMatch(re);
      }
    });
  });

  describe("up + down structural idempotence", () => {
    test("up uses IF NOT EXISTS everywhere; down uses IF EXISTS + CASCADE", () => {
      const up = fs.readFileSync(UP, "utf-8");
      const down = fs.readFileSync(DOWN, "utf-8");
      expect(up.includes("CREATE TABLE IF NOT EXISTS")).toBe(true);
      expect((down.match(/DROP TABLE IF EXISTS.*CASCADE/g) ?? []).length).toBeGreaterThanOrEqual(4);
    });
  });
});
