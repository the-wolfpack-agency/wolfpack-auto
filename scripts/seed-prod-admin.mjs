#!/usr/bin/env node
/**
 * Seed a production admin user for a dealer.
 *
 * Usage:
 *   node scripts/seed-prod-admin.mjs --email admin@dealer.com --name "Jane Smith" --dealer wolfpack-motors
 *   node scripts/seed-prod-admin.mjs --list          # list current users
 *   node scripts/seed-prod-admin.mjs --cleanup-test  # remove @example.com test users
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
});

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function listUsers() {
  const result = await pool.query(`
    SELECT du.name, du.email, du.role, du.is_active, d.name AS dealer_name, du.last_login, du.created_at
    FROM dealer_users du
    LEFT JOIN dealers d ON du.dealer_id::text = d.id::text
    ORDER BY du.created_at
  `);

  if (result.rows.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log(`\n${"Name".padEnd(20)} ${"Email".padEnd(30)} ${"Role".padEnd(8)} ${"Active".padEnd(7)} ${"Dealer".padEnd(20)} Last Login`);
  console.log("-".repeat(110));
  for (const u of result.rows) {
    const login = u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never";
    console.log(
      `${(u.name ?? "").padEnd(20)} ${u.email.padEnd(30)} ${u.role.padEnd(8)} ${String(u.is_active).padEnd(7)} ${(u.dealer_name ?? "?").padEnd(20)} ${login}`
    );
  }
  console.log(`\nTotal: ${result.rows.length} users`);
}

async function cleanupTest() {
  const result = await pool.query(
    "DELETE FROM dealer_users WHERE email LIKE '%@example.com' RETURNING email"
  );
  console.log(`Cleaned up ${result.rowCount} test users.`);
}

async function createAdmin(email, name, dealerSlug) {
  // Find dealer
  const dealerResult = await pool.query(
    "SELECT id, name FROM dealers WHERE slug = $1 LIMIT 1",
    [dealerSlug],
  );

  if (dealerResult.rows.length === 0) {
    // List available dealers
    const dealers = await pool.query("SELECT name, slug, is_active FROM dealers ORDER BY name");
    console.error(`ERROR: Dealer "${dealerSlug}" not found.\n\nAvailable dealers:`);
    for (const d of dealers.rows) {
      console.error(`  ${d.slug.padEnd(25)} ${d.name} ${d.is_active ? "" : "(inactive)"}`);
    }
    return;
  }

  const dealer = dealerResult.rows[0];

  // Check for existing user with that email
  const existing = await pool.query("SELECT id FROM dealer_users WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    console.error(`ERROR: User with email "${email}" already exists.`);
    return;
  }

  // Get password
  const password = await prompt("Set password (min 8 chars): ");
  if (password.length < 8) {
    console.error("ERROR: Password must be at least 8 characters.");
    return;
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'owner', true, NOW(), NOW())
     RETURNING id, email, name, role`,
    [dealer.id, email.toLowerCase(), name, passwordHash],
  );

  const user = result.rows[0];
  console.log(`\nAdmin user created:`);
  console.log(`  Name:   ${user.name}`);
  console.log(`  Email:  ${user.email}`);
  console.log(`  Role:   ${user.role}`);
  console.log(`  Dealer: ${dealer.name}`);
  console.log(`\nThey can now log in at /admin/login`);
}

async function main() {
  const args = process.argv.slice(2);

  try {
    await pool.query("SELECT 1");

    if (args.includes("--list")) {
      await listUsers();
    } else if (args.includes("--cleanup-test")) {
      await cleanupTest();
    } else {
      const emailIdx = args.indexOf("--email");
      const nameIdx = args.indexOf("--name");
      const dealerIdx = args.indexOf("--dealer");

      if (emailIdx === -1 || nameIdx === -1 || dealerIdx === -1) {
        console.log("Usage:");
        console.log('  node scripts/seed-prod-admin.mjs --email admin@dealer.com --name "Jane Smith" --dealer wolfpack-motors');
        console.log("  node scripts/seed-prod-admin.mjs --list");
        console.log("  node scripts/seed-prod-admin.mjs --cleanup-test");
        return;
      }

      await createAdmin(args[emailIdx + 1], args[nameIdx + 1], args[dealerIdx + 1]);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
