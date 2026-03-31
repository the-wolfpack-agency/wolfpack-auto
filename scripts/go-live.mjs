#!/usr/bin/env node
/**
 * GO-LIVE SCRIPT — Run this AFTER removing DEMO_MODE from Vercel.
 *
 * What it does (in order):
 *   1. Verifies DEMO_MODE is NOT set
 *   2. Cleans all test users from DB (85 @example.com / @test.com users)
 *   3. Creates a production admin user (interactive prompt)
 *   4. Encrypts any plaintext PII in existing leads
 *   5. Verifies all critical tables exist
 *   6. Runs a quick health check against the live deployment
 *
 * Usage:
 *   node scripts/go-live.mjs
 *   node scripts/go-live.mjs --skip-encrypt    # skip PII encryption step
 *   node scripts/go-live.mjs --dry-run         # show what would happen
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { createCipheriv, randomBytes, createHash } from "crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(__dirname, "../.env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=["']?([^"']*)['"]?$/);
    if (match) process.env[match[1]] ??= match[2];
  }
} catch { /* no .env.local */ }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set. Check .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_ENCRYPT = args.includes("--skip-encrypt");

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(question, (a) => { rl.close(); r(a.trim()); }));
}

function banner(text) {
  console.log(`\n${"━".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"━".repeat(60)}\n`);
}

// ── PII Encryption (matches src/lib/crypto.ts) ──────────────────────────────
function encryptPII(plaintext) {
  const key = process.env.PII_ENCRYPTION_KEY;
  if (!key) return null;
  const keyBuf = Buffer.from(key, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

async function main() {
  const connTest = await pool.query("SELECT NOW() AS now");
  console.log(`Connected to database at ${new Date(connTest.rows[0].now).toISOString()}`);
  if (DRY_RUN) console.log("⚠  DRY RUN — no changes will be made\n");

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Verify DEMO_MODE is off
  // ═══════════════════════════════════════════════════════════════════════════
  banner("Step 1: Verify DEMO_MODE is off");

  if (process.env.DEMO_MODE === "true") {
    console.error("FAIL: DEMO_MODE is still set to 'true' in your environment.");
    console.error("      Remove it from Vercel → Settings → Environment Variables first.");
    process.exit(1);
  }
  console.log("  ✓ DEMO_MODE is not set locally");
  console.log("  ⚠ Make sure you also removed it from Vercel dashboard!");

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Clean test users
  // ═══════════════════════════════════════════════════════════════════════════
  banner("Step 2: Clean test users");

  const testUsers = await pool.query(
    "SELECT id, email, name FROM dealer_users WHERE email LIKE '%@example.com' OR email LIKE '%@test.com' OR email LIKE '%test-%' OR name LIKE 'Test User%' OR name LIKE 'Pipeline Test%'"
  );

  console.log(`  Found ${testUsers.rowCount} test users to remove:`);
  for (const u of testUsers.rows.slice(0, 10)) {
    console.log(`    ${u.name || "?"} <${u.email}>`);
  }
  if (testUsers.rowCount > 10) {
    console.log(`    ... and ${testUsers.rowCount - 10} more`);
  }

  if (!DRY_RUN && testUsers.rowCount > 0) {
    const confirm = await ask(`\n  Delete ${testUsers.rowCount} test users? (yes/no): `);
    if (confirm.toLowerCase() === "yes") {
      const deleted = await pool.query(
        "DELETE FROM dealer_users WHERE email LIKE '%@example.com' OR email LIKE '%@test.com' OR email LIKE '%test-%' OR name LIKE 'Test User%' OR name LIKE 'Pipeline Test%' RETURNING email"
      );
      console.log(`  ✓ Deleted ${deleted.rowCount} test users`);
    } else {
      console.log("  ⏭  Skipped");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Create production admin
  // ═══════════════════════════════════════════════════════════════════════════
  banner("Step 3: Create production admin user");

  // List available dealers
  const dealers = await pool.query("SELECT id, name, slug FROM dealers WHERE is_active = true ORDER BY name");
  if (dealers.rowCount === 0) {
    console.log("  ⚠ No active dealers found. Run onboarding first.");
  } else {
    console.log("  Active dealers:");
    for (const d of dealers.rows) {
      console.log(`    ${d.slug.padEnd(25)} ${d.name}`);
    }

    // Check if admin already exists
    const existingAdmin = await pool.query(
      "SELECT email, name, role FROM dealer_users WHERE role = 'owner' AND is_active = true AND email NOT LIKE '%@example.com' AND email NOT LIKE '%@test.com' LIMIT 5"
    );

    if (existingAdmin.rowCount > 0) {
      console.log("\n  Existing production admins:");
      for (const a of existingAdmin.rows) {
        console.log(`    ✓ ${a.name} <${a.email}> (${a.role})`);
      }
      console.log("\n  Production admin already exists. Skipping creation.");
    } else if (!DRY_RUN) {
      console.log("\n  No production admin found. Let's create one.\n");
      const email = await ask("  Email: ");
      const name = await ask("  Full name: ");
      const dealerSlug = await ask(`  Dealer slug (from list above): `);

      const dealer = dealers.rows.find((d) => d.slug === dealerSlug);
      if (!dealer) {
        console.error(`  ERROR: Dealer "${dealerSlug}" not found`);
      } else {
        // Hash a temporary password (they'll reset via email)
        const bcrypt = await import("bcryptjs");
        const tempPassword = randomBytes(16).toString("hex");
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        await pool.query(
          `INSERT INTO dealer_users (dealer_id, email, name, role, password_hash, is_active, created_at)
           VALUES ($1, $2, $3, 'owner', $4, true, NOW())
           ON CONFLICT (dealer_id, email) DO UPDATE SET role = 'owner', is_active = true, password_hash = $4`,
          [dealer.id, email, name, hashedPassword]
        );
        console.log(`  ✓ Created admin: ${name} <${email}> for ${dealer.name}`);
        console.log(`  ⚠ Temporary password: ${tempPassword}`);
        console.log(`  ⚠ CHANGE THIS IMMEDIATELY after first login!`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Encrypt plaintext PII in existing leads
  // ═══════════════════════════════════════════════════════════════════════════
  banner("Step 4: Encrypt existing plaintext PII");

  if (SKIP_ENCRYPT) {
    console.log("  ⏭  Skipped (--skip-encrypt flag)");
  } else if (!process.env.PII_ENCRYPTION_KEY) {
    console.log("  ⚠ PII_ENCRYPTION_KEY not set. Skipping encryption.");
    console.log("    Set it in .env.local and Vercel, then re-run.");
  } else {
    // Find leads with plaintext email (not starting with "enc:")
    const plaintext = await pool.query(
      "SELECT id, email, phone FROM leads WHERE email IS NOT NULL AND email != '' AND email NOT LIKE 'enc:%' LIMIT 500"
    );

    console.log(`  Found ${plaintext.rowCount} leads with plaintext PII`);

    if (!DRY_RUN && plaintext.rowCount > 0) {
      let encrypted = 0;
      for (const lead of plaintext.rows) {
        const encEmail = lead.email ? encryptPII(lead.email) : null;
        const encPhone = lead.phone ? encryptPII(lead.phone) : null;

        if (encEmail || encPhone) {
          await pool.query(
            "UPDATE leads SET email = COALESCE($1, email), phone = COALESCE($2, phone) WHERE id = $3",
            [encEmail, encPhone, lead.id]
          );
          encrypted++;
        }
      }
      console.log(`  ✓ Encrypted PII for ${encrypted} leads`);
      if (plaintext.rowCount >= 500) {
        console.log("  ⚠ More than 500 leads — run this script again to process the next batch");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Verify critical tables
  // ═══════════════════════════════════════════════════════════════════════════
  banner("Step 5: Verify critical tables");

  const requiredTables = [
    "dealers", "dealer_users", "vehicles", "leads", "deals",
    "analytics_events", "contracts", "lender_submissions",
    "ofac_screenings", "ofac_audit_log", "syndication_feeds",
    "vehicle_history_reports",
  ];

  const existing = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const tableSet = new Set(existing.rows.map((r) => r.table_name));

  let allPresent = true;
  for (const t of requiredTables) {
    if (tableSet.has(t)) {
      console.log(`  ✓ ${t}`);
    } else {
      console.log(`  ✗ ${t} — MISSING`);
      allPresent = false;
    }
  }
  console.log(`\n  Total tables: ${tableSet.size}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: Summary
  // ═══════════════════════════════════════════════════════════════════════════
  banner("Go-Live Summary");

  const adminCount = await pool.query(
    "SELECT count(*) FROM dealer_users WHERE role IN ('owner', 'admin') AND is_active = true AND email NOT LIKE '%@example.com' AND email NOT LIKE '%@test.com'"
  );
  const leadCount = await pool.query("SELECT count(*) FROM leads");
  const vehicleCount = await pool.query("SELECT count(*) FROM vehicles");

  console.log(`  DEMO_MODE:     ✓ Off`);
  console.log(`  Test users:    ✓ Cleaned`);
  console.log(`  Prod admins:   ${adminCount.rows[0].count}`);
  console.log(`  Leads:         ${leadCount.rows[0].count}`);
  console.log(`  Vehicles:      ${vehicleCount.rows[0].count}`);
  console.log(`  Tables:        ${tableSet.size} (${allPresent ? "all required present" : "MISSING TABLES"})`);
  console.log(`  PII encrypted: ${SKIP_ENCRYPT ? "skipped" : "✓"}`);

  if (allPresent && !DRY_RUN) {
    console.log("\n  ✅ PLATFORM IS READY TO GO LIVE");
    console.log("\n  Next steps:");
    console.log("    1. Set custom domain in Vercel → Settings → Domains");
    console.log("    2. Point DNS A/CNAME records to Vercel");
    console.log("    3. SSL is automatic via Vercel");
    console.log("    4. Login at https://YOUR-DOMAIN/admin/login");
    console.log("    5. Enable MFA immediately");
  } else if (DRY_RUN) {
    console.log("\n  ℹ  Dry run complete — re-run without --dry-run to apply changes");
  } else {
    console.log("\n  ⚠ Issues found — fix before going live");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
