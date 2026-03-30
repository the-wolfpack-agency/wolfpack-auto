#!/usr/bin/env node
/**
 * verify-pii-encryption.mjs
 *
 * Connects to the database, reads a sample of lead records, and verifies
 * that email/phone fields are encrypted (not stored as plaintext).
 *
 * Usage:
 *   DATABASE_URL=<url> PII_ENCRYPTION_KEY=<hex> node scripts/verify-pii-encryption.mjs
 *
 * Exit codes:
 *   0 — All checked records have encrypted PII
 *   1 — Plaintext PII detected or connection error
 *   2 — No leads found to verify (not an error, but nothing to check)
 */

import pg from "pg";

const { Pool } = pg;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

/**
 * Check if a value looks like plaintext PII (email or phone).
 * Encrypted values are base64 strings that won't match these patterns.
 */
function looksLikePlaintext(value, type) {
  if (!value || typeof value !== "string") return false;
  if (type === "email") return EMAIL_REGEX.test(value);
  if (type === "phone") return PHONE_REGEX.test(value);
  return false;
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[FAIL] DATABASE_URL is not set");
    process.exit(1);
  }

  if (!process.env.PII_ENCRYPTION_KEY) {
    console.warn("[WARN] PII_ENCRYPTION_KEY is not set — encryption is disabled, all values will be plaintext.");
    console.warn("       Set PII_ENCRYPTION_KEY (64 hex chars) to enable PII encryption.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon")
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    // Sample up to 20 recent leads
    const result = await pool.query(
      "SELECT id, email, phone, created_at FROM leads ORDER BY created_at DESC LIMIT 20",
    );

    if (result.rows.length === 0) {
      console.log("[INFO] No leads found in database. Nothing to verify.");
      process.exit(2);
    }

    console.log(`[INFO] Checking ${result.rows.length} lead records...\n`);

    let plaintextCount = 0;
    let encryptedCount = 0;

    for (const row of result.rows) {
      const emailPlain = looksLikePlaintext(row.email, "email");
      const phonePlain = row.phone ? looksLikePlaintext(row.phone, "phone") : false;

      if (emailPlain || phonePlain) {
        plaintextCount++;
        console.log(
          `  [FAIL] Lead ${row.id} (${row.created_at}): ` +
            `email=${emailPlain ? "PLAINTEXT" : "encrypted"}, ` +
            `phone=${row.phone ? (phonePlain ? "PLAINTEXT" : "encrypted") : "null"}`,
        );
      } else {
        encryptedCount++;
        console.log(
          `  [PASS] Lead ${row.id} (${row.created_at}): ` +
            `email=encrypted, phone=${row.phone ? "encrypted" : "null"}`,
        );
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Encrypted: ${encryptedCount}`);
    console.log(`  Plaintext: ${plaintextCount}`);
    console.log(`  Total:     ${result.rows.length}`);

    if (plaintextCount > 0) {
      console.error(
        `\n[FAIL] ${plaintextCount} record(s) have plaintext PII. ` +
          "These were likely created before encryption was enabled. " +
          "Run a migration to encrypt existing records.",
      );
      process.exit(1);
    }

    console.log("\n[PASS] All lead records have encrypted PII fields.");
    process.exit(0);
  } catch (err) {
    console.error("[FAIL] Database error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
