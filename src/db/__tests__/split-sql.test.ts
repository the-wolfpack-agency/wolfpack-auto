/**
 * Tests for the migration statement splitter (scripts/lib/split-sql.mjs).
 *
 * The regression these pin cost a half-applied production migration: the old
 * filter dropped any chunk starting with "--", so the header comment every
 * migration opens with swallowed the first statement beneath it. The runner
 * still reported success. Applying 087 created `phone_hash` (second ALTER, no
 * leading comment) but silently skipped `email_hash` (first ALTER, under the
 * header) — leaving prod with half the schema the deployed code required.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitStatements, stripCommentLines } = require("../../../scripts/lib/split-sql.cjs");

describe("splitStatements", () => {
  it("keeps a statement that sits under a header comment (the 087 bug)", () => {
    const sql = [
      "-- 087_something.sql",
      "--",
      "-- A long header explaining the migration.",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_hash TEXT;",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_hash TEXT;",
    ].join("\n");

    const out = splitStatements(sql) as string[];
    expect(out).toHaveLength(2);
    // The old filter returned only the phone_hash ALTER. That is the whole bug.
    expect(out[0]).toContain("email_hash");
    expect(out[1]).toContain("phone_hash");
  });

  it("drops chunks that are only comments", () => {
    const sql = "-- just a note\n-- and another;\nSELECT 1;";
    const out = splitStatements(sql) as string[];
    expect(out).toEqual(["SELECT 1"]);
  });

  it("returns nothing for a comment-only file", () => {
    expect(splitStatements("-- nothing here\n--\n") as string[]).toEqual([]);
  });

  it("preserves multi-line statement bodies verbatim", () => {
    const sql = "-- head\nCREATE INDEX IF NOT EXISTS i\n  ON leads (dealer_id, email_hash);";
    const out = splitStatements(sql) as string[];
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("CREATE INDEX IF NOT EXISTS i");
    expect(out[0]).toContain("ON leads (dealer_id, email_hash)");
  });

  it("strips only whole-line comments, not trailing text", () => {
    expect(stripCommentLines("  -- a comment\nSELECT 1")).toBe("SELECT 1");
    expect(stripCommentLines("SELECT 1")).toBe("SELECT 1");
  });
});

describe("the real 087 migration file", () => {
  const sql = readFileSync(
    resolve(__dirname, "../migrations/087_lead_pii_blind_index.sql"),
    "utf-8",
  );

  it("yields all six statements, email_hash included", () => {
    const out = splitStatements(sql) as string[];
    expect(out).toHaveLength(6);
    // The exact statement production lost.
    expect(out.some((s) => /ADD COLUMN IF NOT EXISTS email_hash/.test(s))).toBe(true);
    expect(out.some((s) => /ADD COLUMN IF NOT EXISTS phone_hash/.test(s))).toBe(true);
    expect(out.filter((s) => /CREATE INDEX/.test(s))).toHaveLength(2);
  });

  it("has no semicolon inside a comment line", () => {
    // The splitter cuts on ";" without parsing, so a prose semicolon severs a
    // comment and turns the remainder into bare SQL. This is how the first
    // version of 087 produced 'syntax error at or near "erasure"'.
    const offenders = sql
      .split("\n")
      .filter((l) => l.trim().startsWith("--") && l.includes(";"));
    expect(offenders).toEqual([]);
  });

  it("produces no statement that still looks like prose", () => {
    for (const stmt of splitStatements(sql) as string[]) {
      expect(stmt).toMatch(/^(ALTER|CREATE|COMMENT|DROP|INSERT|UPDATE|SELECT|GRANT)/i);
    }
  });
});
