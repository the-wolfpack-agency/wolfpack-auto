#!/usr/bin/env tsx
/**
 * bootstrap-wolfpack-staff.ts
 *
 * Idempotent CLI to seed the first Wolfpack operator admin. Required
 * once per environment after migration 064 lands.
 *
 * Usage:
 *   BOOTSTRAP_EMAIL=ops@thewolfpack.agency \
 *   BOOTSTRAP_PASSWORD='YourStrongPasswordHere!2026' \
 *   npx tsx scripts/bootstrap-wolfpack-staff.ts
 *
 * Optional:
 *   BOOTSTRAP_NAME="Ops Bootstrap"
 *
 * Behavior:
 *   - If a wolfpack_staff row with this email exists, exits 0 (no-op).
 *   - Otherwise inserts a new row with role=admin and the given password
 *     (bcrypt-hashed, cost 12).
 *
 * The script never PRINTS the password to stdout. It echoes the inserted
 * staff id + role on success so the operator can confirm.
 */

import { hash } from "bcryptjs";
import { pool, query } from "../src/lib/db";
import { validatePasswordStrength } from "../src/lib/password-validation";

async function main() {
  const email = (process.env.BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_PASSWORD ?? "";
  const name = process.env.BOOTSTRAP_NAME?.trim() || "Wolfpack Bootstrap Admin";

  if (!email || !password) {
    console.error(
      "[bootstrap-wolfpack-staff] BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD must be set.",
    );
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.error("[bootstrap-wolfpack-staff] DATABASE_URL is required.");
    process.exit(2);
  }

  const pwOk = validatePasswordStrength(password);
  if (!pwOk.valid) {
    console.error("[bootstrap-wolfpack-staff] Password rejected by validator:");
    for (const e of pwOk.errors) console.error(`  - ${e}`);
    process.exit(2);
  }

  const existing = await query<{ id: string; role: string }>(
    `SELECT id, role FROM wolfpack_staff WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (existing.rows.length > 0) {
    console.log(
      `[bootstrap-wolfpack-staff] No-op — staff exists (id=${existing.rows[0].id}, role=${existing.rows[0].role}).`,
    );
    await pool.end();
    return;
  }

  const passwordHash = await hash(password, 12);
  const result = await query<{ id: string }>(
    `INSERT INTO wolfpack_staff (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id`,
    [email, passwordHash, name],
  );

  console.log(
    `[bootstrap-wolfpack-staff] Inserted admin (id=${result.rows[0].id}, email=${email}).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[bootstrap-wolfpack-staff] Failed:", err);
  process.exit(1);
});
