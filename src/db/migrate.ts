/**
 * Simple SQL migration runner for Wolfpack Auto.
 *
 * Reads .sql files from src/db/migrations/ and applies them in
 * lexicographic order. Tracks applied migrations in a `_migrations` table.
 *
 * Usage:
 *   npx tsx src/db/migrate.ts
 */

import fs from "node:fs";
import path from "node:path";
import { pool } from "@/lib/db";

const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

interface MigrationRecord {
  name: string;
  applied_at: string;
}

/**
 * Ensure the _migrations tracking table exists.
 */
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Return the set of migration names already applied.
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<MigrationRecord>(
    "SELECT name FROM _migrations ORDER BY name",
  );
  return new Set(result.rows.map((r) => r.name));
}

/**
 * Discover all .sql files in the migrations directory, sorted by name.
 */
function discoverMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn(`[migrate] Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Apply a single migration inside a transaction.
 */
async function applyMigration(name: string): Promise<void> {
  const filePath = path.join(MIGRATIONS_DIR, name);
  const sql = fs.readFileSync(filePath, "utf-8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log(`[migrate] Applied: ${name}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw new Error(
      `[migrate] Failed to apply ${name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    client.release();
  }
}

/**
 * Run all pending migrations.
 */
export async function migrate(): Promise<void> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const all = discoverMigrations();
  const pending = all.filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log("[migrate] All migrations are up to date.");
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s)...`);

  for (const name of pending) {
    await applyMigration(name);
  }

  console.log("[migrate] Done.");
}

// CLI entry point
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
