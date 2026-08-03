#!/usr/bin/env node
/**
 * Move a user back to the dealer they belong to.
 *
 *   node scripts/reassign-user-dealer.mjs --email a@b.com --dealer wolfpack-motors --role admin
 *   node scripts/reassign-user-dealer.mjs --email a@b.com --dealer wolfpack-motors --role admin --apply
 *
 * Prints the before and after and changes nothing without --apply.
 *
 * WHY THIS EXISTS
 *
 * createDealer upserts the new dealer's admin `ON CONFLICT (email) DO UPDATE
 * SET dealer_id = EXCLUDED.dealer_id`. When the address already belonged to
 * somebody, that moved them to the new dealer and changed their role, so they
 * signed in and landed in an empty tenant. Repairing that by hand needs a
 * database client that is not always installed, at the moment somebody is
 * locked out, so it is a script.
 *
 * The upsert itself is the actual bug and is fixed separately; this exists to
 * repair accounts that were already moved.
 */
import pg from "pg";

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? null : argv[i + 1];
};
const APPLY = argv.includes("--apply");

const email = (flag("email") || "").toLowerCase();
const dealerSlug = flag("dealer");
const role = flag("role");

if (!email || !dealerSlug || !role) {
  console.error(
    "Usage: node scripts/reassign-user-dealer.mjs --email <email> --dealer <slug> --role <role> [--apply]",
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const VALID_ROLES = ["owner", "admin", "manager", "staff", "sub_dealer"];
if (!VALID_ROLES.includes(role)) {
  console.error(`--role must be one of: ${VALID_ROLES.join(", ")}`);
  process.exit(2);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const dealer = await client.query("SELECT id, name FROM dealers WHERE slug = $1", [dealerSlug]);
  if (dealer.rowCount === 0) {
    console.error(`No dealer with slug "${dealerSlug}".`);
    process.exit(1);
  }

  const before = await client.query(
    `SELECT u.email, u.role, u.is_active, (u.password_hash IS NOT NULL) AS has_password,
            (u.invite_token IS NOT NULL) AS has_invite_token, d.slug AS dealer_slug, d.name AS dealer_name
       FROM dealer_users u LEFT JOIN dealers d ON d.id::text = u.dealer_id
      WHERE LOWER(u.email) = $1`,
    [email],
  );
  if (before.rowCount === 0) {
    console.error(`No user with email "${email}".`);
    process.exit(1);
  }
  console.log("BEFORE:", JSON.stringify(before.rows[0], null, 2));

  if (!APPLY) {
    console.log(`\nDRY RUN. Would set dealer=${dealerSlug} (${dealer.rows[0].name}), role=${role},`);
    console.log("is_active=true, and clear any invite token.");
    console.log("Re-run with --apply to make the change.");
    process.exit(0);
  }

  await client.query("BEGIN");
  /* The invite token is cleared too: it was set by the same upsert and would
     otherwise leave a live single-use credential on a working account. */
  await client.query(
    `UPDATE dealer_users
        SET dealer_id = $1, role = $2, is_active = TRUE,
            invite_token = NULL, invite_expires_at = NULL, updated_at = NOW()
      WHERE LOWER(email) = $3`,
    [dealer.rows[0].id, role, email],
  );
  await client.query("COMMIT");

  const after = await client.query(
    `SELECT u.email, u.role, u.is_active, (u.password_hash IS NOT NULL) AS has_password,
            (u.invite_token IS NOT NULL) AS has_invite_token, d.slug AS dealer_slug, d.name AS dealer_name
       FROM dealer_users u LEFT JOIN dealers d ON d.id::text = u.dealer_id
      WHERE LOWER(u.email) = $1`,
    [email],
  );
  console.log("AFTER :", JSON.stringify(after.rows[0], null, 2));
  console.log("\nDone. Sign out fully and sign in again so the session picks up the new dealer.");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
