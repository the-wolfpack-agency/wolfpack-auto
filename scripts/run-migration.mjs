#!/usr/bin/env node
/**
 * Run SQL migration files against the production Neon database.
 *
 * Usage:
 *   node scripts/run-migration.mjs 036 037 038 039
 *   node scripts/run-migration.mjs --verify
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { splitStatements } from "./lib/split-sql.cjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../src/db/migrations");

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.+)"$/);
    if (match) process.env[match[1]] ??= match[2];
  }
} catch { /* no .env.local */ }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});

async function verify() {
  console.log("=== Database Verification ===\n");

  // Table count
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log(`Tables: ${tables.rows.length}`);
  for (const r of tables.rows) {
    console.log(`  - ${r.table_name}`);
  }

  // Check specific columns from migrations 036-039
  console.log("\n=== Migration Status ===\n");

  const checks = [
    { label: "036: leads.deleted_at", query: "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='deleted_at'" },
    { label: "036: customers table", query: "SELECT table_name FROM information_schema.tables WHERE table_name='customers' AND table_schema='public'" },
    { label: "036: dealer_users table", query: "SELECT table_name FROM information_schema.tables WHERE table_name='dealer_users' AND table_schema='public'" },
    { label: "036: marketing_campaigns", query: "SELECT table_name FROM information_schema.tables WHERE table_name='marketing_campaigns' AND table_schema='public'" },
    { label: "037: dealers.logo_url", query: "SELECT column_name FROM information_schema.columns WHERE table_name='dealers' AND column_name='logo_url'" },
    { label: "038: dealers.font_family", query: "SELECT column_name FROM information_schema.columns WHERE table_name='dealers' AND column_name='font_family'" },
    { label: "038: dealers.webhook_url", query: "SELECT column_name FROM information_schema.columns WHERE table_name='dealers' AND column_name='webhook_url'" },
    { label: "039: dealer_users.invite_token", query: "SELECT column_name FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='invite_token'" },
    { label: "039: dealer_users.invite_expires_at", query: "SELECT column_name FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='invite_expires_at'" },
  ];

  for (const check of checks) {
    const result = await pool.query(check.query);
    const status = result.rows.length > 0 ? "✓" : "✗ MISSING";
    console.log(`  ${status}  ${check.label}`);
  }
}

async function runMigration(num) {
  const padded = String(num).padStart(3, "0");
  const files = (await import("fs")).readdirSync(MIGRATIONS_DIR);
  const file = files.find(f => f.startsWith(padded));

  if (!file) {
    console.error(`  ERROR: No migration file starting with ${padded}`);
    return false;
  }

  const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
  console.log(`\n--- Running ${file} ---`);

  // Split on semicolons and run each statement individually
  // (some statements may fail independently, e.g. IF NOT EXISTS).
  // See scripts/lib/split-sql.cjs — the previous inline filter dropped any
  // chunk starting with "--", which silently discarded the FIRST statement of
  // every migration that opens with a header comment.
  const statements = splitStatements(sql);

  let success = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      success++;
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        skipped++;
      } else {
        console.error(`  WARN: ${msg.slice(0, 120)}`);
        // Continue — IF NOT EXISTS should handle most cases
        skipped++;
      }
    }
  }

  console.log(`  ${success} executed, ${skipped} skipped (already exist)`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  try {
    // Test connection
    const connTest = await pool.query("SELECT NOW() AS now");
    console.log(`Connected to Neon at ${new Date(connTest.rows[0].now).toISOString()}\n`);

    if (args.includes("--verify")) {
      await verify();
    } else if (args.length === 0) {
      console.log("Usage:");
      console.log("  node scripts/run-migration.mjs 036 037 038 039");
      console.log("  node scripts/run-migration.mjs --verify");
    } else {
      for (const arg of args) {
        if (arg === "--verify") continue;
        await runMigration(arg);
      }
      // Verify after running
      console.log("");
      await verify();
    }
  } catch (err) {
    console.error("Connection failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
