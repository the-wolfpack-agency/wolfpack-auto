#!/usr/bin/env tsx
/**
 * backfill-lead-pii-hashes.ts
 *
 * Populates leads.email_hash / leads.phone_hash for rows written before
 * migration 087. Without this, dedup and CCPA erasure cannot find legacy rows:
 * the only matchable copy of the address is AES-GCM ciphertext with a random IV
 * per call, so `WHERE email = $1` never matches.
 *
 * Reads each row, decrypts the address if it is encrypted (decryptPII returns
 * non-ciphertext unchanged, so mixed plaintext/ciphertext rows both work),
 * normalizes it, hashes it, writes the hash back.
 *
 * Idempotent: only touches rows whose hash is NULL. Safe to re-run and safe to
 * run while traffic is live.
 *
 * MUST be re-run after any PII_ENCRYPTION_KEY rotation — hashes derive from that
 * key, so rotating invalidates them. Rotate, NULL the hash columns, run this.
 *
 * Deliberately TypeScript, not .mjs: it imports the REAL hashPII / decryptPII /
 * normalizeEmail / normalizePhone. A hand-copied hash implementation that drifts
 * from the app's would silently produce hashes nothing ever matches, which is a
 * quieter version of the very bug this backfills.
 *
 * Usage:
 *   npm run backfill:lead-hashes -- --dry-run
 *   npm run backfill:lead-hashes
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { decryptPII, hashPII } from "../src/lib/crypto";
import { normalizeEmail, normalizePhone } from "../src/lib/leads/intake";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local — same shape as scripts/run-migration.mjs.
try {
  const envContent = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.+)"$/);
    if (match) process.env[match[1]] ??= match[2];
  }
} catch {
  /* no .env.local */
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

interface LeadRow {
  id: string;
  email: string | null;
  phone: string | null;
}

async function main(): Promise<void> {
  console.log(`[backfill] ${DRY_RUN ? "DRY RUN — no writes" : "LIVE"}`);
  console.log(
    `[backfill] PII_ENCRYPTION_KEY ${process.env.PII_ENCRYPTION_KEY ? "IS set (HMAC)" : "NOT set (plain SHA-256)"}`,
  );

  const { rows } = await pool.query<LeadRow>(
    `SELECT id::text AS id, email, phone
       FROM leads
      WHERE email_hash IS NULL OR (phone IS NOT NULL AND phone_hash IS NULL)`,
  );
  console.log(`[backfill] ${rows.length} row(s) need hashing`);
  if (rows.length === 0) return;

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = typeof row.email === "string" ? decryptPII(row.email) : null;
    const phone = typeof row.phone === "string" ? decryptPII(row.phone) : null;

    // An already-anonymized row ("deleted-<id>") is not an address. Hashing it
    // would rebuild a match key for someone who exercised erasure.
    if (!email || email.startsWith("deleted-")) {
      skipped++;
      continue;
    }

    const emailHash = hashPII(normalizeEmail(email));
    const normalizedPhone = normalizePhone(phone);
    const phoneHash = normalizedPhone ? hashPII(normalizedPhone) : null;

    if (!DRY_RUN) {
      await pool.query(`UPDATE leads SET email_hash = $1, phone_hash = $2 WHERE id = $3::uuid`, [
        emailHash,
        phoneHash,
        row.id,
      ]);
    }
    updated++;
  }

  console.log(
    `[backfill] ${DRY_RUN ? "would update" : "updated"} ${updated} row(s), skipped ${skipped}`,
  );
}

main()
  .catch((e: unknown) => {
    console.error("[backfill] FAILED:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
