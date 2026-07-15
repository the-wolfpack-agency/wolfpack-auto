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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkHashAgreement } = require("./lib/hash-agreement.cjs");

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

/**
 * FAIL CLOSED when the key is missing.
 *
 * This is not hypothetical. Running this against production without the key
 * wrote 446 plain-SHA-256 hashes that the app — which HAS the key and computes
 * HMAC — can never match, silently breaking dedup for every one of those rows.
 * `vercel env pull` returned PII_ENCRYPTION_KEY="" even though the runtime has
 * a real value, so "the dry run said plain SHA-256" is NOT sufficient evidence
 * that plaintext hashing is correct here.
 *
 * If PII encryption is genuinely disabled in the target environment, pass
 * --allow-unkeyed deliberately.
 */
const ALLOW_UNKEYED = process.argv.includes("--allow-unkeyed");
/** Opt out of the app-agreement preflight when there is no reference row yet. */
const ALLOW_UNVERIFIED = process.argv.includes("--allow-unverified");
if (!process.env.PII_ENCRYPTION_KEY && !ALLOW_UNKEYED) {
  console.error(
    "ERROR: PII_ENCRYPTION_KEY is not set. Hashes written now would be plain\n" +
      "SHA-256 and would NOT match an app that has the key (it computes HMAC).\n" +
      "Note: `vercel env pull` can return an EMPTY value for this variable even\n" +
      "when the deployment has a real one — check the runtime, not the pull.\n" +
      "Re-run with the real key, or pass --allow-unkeyed if encryption really is\n" +
      "disabled for this environment.",
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

interface LeadRow {
  id: string;
  email: string | null;
  phone: string | null;
}

/**
 * Prove this process hashes the way the APP hashes, using a row the app wrote.
 *
 * Env vars are NOT evidence: `vercel env pull` handed back an empty
 * PII_ENCRYPTION_KEY while the deployment had a real one, and the resulting
 * backfill wrote 446 unmatchable hashes without a single error. Only a row the
 * app itself hashed can settle it.
 */
async function preflightHashAgreement(): Promise<void> {
  const { rows } = await pool.query<{ id: string; email: string; email_hash: string }>(
    `SELECT id::text AS id, email, email_hash
       FROM leads
      WHERE email_hash IS NOT NULL AND email IS NOT NULL
      LIMIT 5`,
  );

  const result = checkHashAgreement({
    referenceRows: rows,
    decrypt: decryptPII,
    hash: hashPII,
    normalize: normalizeEmail,
  });

  if (result.ok) {
    console.log(`[backfill] preflight OK — hashes agree with the app (${result.checked} row(s) checked)`);
    return;
  }

  if (result.reason === "mismatch") {
    console.error(
      "[backfill] ABORT: this process computes a DIFFERENT hash than the app.\n" +
        `  Reference row ${result.id} was hashed by the app, and recomputing it here\n` +
        "  does not match. Your PII_ENCRYPTION_KEY differs from the deployment's.\n" +
        "  Writing now would produce hashes the app can never match — dedup and CCPA\n" +
        "  erasure would silently stop matching every row touched.",
    );
    process.exit(1);
  }

  // no_reference
  if (ALLOW_UNVERIFIED) {
    console.warn(
      "[backfill] WARNING: no app-written hash to verify against; proceeding on --allow-unverified.",
    );
    return;
  }
  console.error(
    "[backfill] ABORT: cannot verify key agreement — no row has an app-written\n" +
      "  email_hash to compare against, so there is no evidence this process hashes\n" +
      "  the way the app does. Writing blind is what produced 446 unmatchable hashes.\n" +
      "  Fix: let the app write ONE lead (its insert sets email_hash), then re-run.\n" +
      "  Or pass --allow-unverified if you accept the risk deliberately.",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`[backfill] ${DRY_RUN ? "DRY RUN — no writes" : "LIVE"}`);
  console.log(
    `[backfill] PII_ENCRYPTION_KEY ${process.env.PII_ENCRYPTION_KEY ? "IS set (HMAC)" : "NOT set (plain SHA-256)"}`,
  );

  // Runs for dry-run too: a dry run that cannot prove agreement is not a
  // rehearsal of anything, and its reassuring output is exactly what misled me.
  await preflightHashAgreement();

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
