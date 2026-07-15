#!/usr/bin/env node
/**
 * Run SQL migration files against the production Neon database.
 *
 * Usage:
 *   node scripts/run-migration.mjs 087 --dry-run   # apply inside a tx, ROLL BACK, report
 *   node scripts/run-migration.mjs 036 037 038 039
 *   node scripts/run-migration.mjs --verify
 *
 * ALWAYS --dry-run first. It executes every statement against the real schema
 * inside a transaction and rolls back, so it catches a broken migration without
 * writing anything.
 *
 * Two guarantees this script did NOT have, added after it half-applied 087 to
 * production and reported success:
 *
 *  1. ATOMIC. Every statement runs in one transaction, each wrapped in a
 *     SAVEPOINT. A real error rolls the whole migration back — a migration can
 *     no longer leave the schema half-changed (087 created phone_hash and
 *     silently skipped email_hash, so the deployed app queried a column that
 *     did not exist).
 *  2. HONEST. A real error is a FAILURE and exits non-zero. It used to be
 *     counted as "skipped (already exist)" alongside genuine no-ops, so four
 *     syntax errors printed as success.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { splitStatements } from "./lib/split-sql.cjs";
import { isBenignMigrationError } from "./lib/migration-errors.cjs";

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

async function runMigration(num, { dryRun = false } = {}) {
  const padded = String(num).padStart(3, "0");
  const files = (await import("fs")).readdirSync(MIGRATIONS_DIR);
  const file = files.find(f => f.startsWith(padded));

  if (!file) {
    console.error(`  ERROR: No migration file starting with ${padded}`);
    return false;
  }

  const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
  console.log(`\n--- ${dryRun ? "DRY RUN" : "Running"} ${file} ---`);

  // See scripts/lib/split-sql.cjs — the previous inline filter dropped any
  // chunk starting with "--", which silently discarded the FIRST statement of
  // every migration that opens with a header comment.
  const statements = splitStatements(sql);
  // Print the plan. A statement count that does not match the file is the
  // cheapest possible signal that the splitter ate something.
  console.log(`  ${statements.length} statement(s) parsed:`);
  for (const [i, s] of statements.entries()) {
    console.log(`    [${i + 1}] ${s.replace(/\s+/g, " ").slice(0, 72)}`);
  }

  let success = 0;
  let skipped = 0;
  const failures = [];

  // One transaction, one SAVEPOINT per statement. A benign error rolls back
  // just that statement and we carry on; a real error aborts the WHOLE
  // migration, so the schema can never end up half-changed.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [i, stmt] of statements.entries()) {
      await client.query("SAVEPOINT stmt");
      try {
        await client.query(stmt);
        await client.query("RELEASE SAVEPOINT stmt");
        success++;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT stmt");
        const msg = err.message || "";
        if (isBenignMigrationError(msg)) {
          skipped++;
        } else {
          failures.push({ index: i + 1, msg, stmt: stmt.replace(/\s+/g, " ").slice(0, 90) });
          break; // stop at the first real error — do not compound it
        }
      }
    }

    if (failures.length > 0 || dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } finally {
    client.release();
  }

  if (failures.length > 0) {
    console.error(`  FAILED — nothing was applied (rolled back):`);
    for (const f of failures) {
      console.error(`    [${f.index}] ${f.msg.slice(0, 140)}`);
      console.error(`         ${f.stmt}`);
    }
    console.error(`  ${success} would have applied before the failure, ${skipped} already present.`);
    return false;
  }

  if (dryRun) {
    console.log(`  DRY RUN OK — ${success} would apply, ${skipped} already present. Rolled back, nothing written.`);
    return true;
  }

  console.log(`  ${success} executed, ${skipped} skipped (already exist)`);
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const args = argv.filter((a) => a !== "--dry-run");

  try {
    // Test connection
    const connTest = await pool.query("SELECT NOW() AS now");
    console.log(`Connected to Neon at ${new Date(connTest.rows[0].now).toISOString()}`);
    if (dryRun) console.log("DRY RUN — every statement is rolled back, nothing is written.\n");
    else console.log("");

    if (args.includes("--verify")) {
      await verify();
    } else if (args.length === 0) {
      console.log("Usage:");
      console.log("  node scripts/run-migration.mjs 087 --dry-run   (ALWAYS do this first)");
      console.log("  node scripts/run-migration.mjs 036 037 038 039");
      console.log("  node scripts/run-migration.mjs --verify");
    } else {
      let allOk = true;
      for (const arg of args) {
        if (arg === "--verify") continue;
        const ok = await runMigration(arg, { dryRun });
        if (!ok) allOk = false;
      }
      if (!dryRun) {
        console.log("");
        await verify();
      }
      // Exit non-zero on any failure. This used to exit 0 while statements were
      // failing, which is how a half-applied migration read as success.
      if (!allOk) {
        console.error("\nMIGRATION FAILED — see errors above. Nothing was applied.");
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error("Connection failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
