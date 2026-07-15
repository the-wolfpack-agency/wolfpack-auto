/**
 * Preflight: does THIS process compute the same hash the APP computes?
 *
 * WHY THIS EXISTS. The backfill derives email_hash from PII_ENCRYPTION_KEY. The
 * deployed app derives it from ITS PII_ENCRYPTION_KEY. If those differ — or if
 * one side has no key and silently falls back to unkeyed SHA-256 — the backfill
 * writes hashes the app can never match. Nothing errors. Dedup and CCPA erasure
 * just quietly stop matching those rows.
 *
 * That is not hypothetical: `vercel env pull` returned PII_ENCRYPTION_KEY=""
 * while the deployment had a real value, so a backfill ran unkeyed and wrote 446
 * plain-SHA-256 hashes against an app computing HMAC. The dry run looked fine.
 * Every number it printed was correct. The result was still garbage.
 *
 * The only trustworthy evidence is a row the APP itself hashed. Recompute that
 * row's hash locally and compare. Agreement proves the keys match. Disagreement
 * proves they do not, BEFORE anything is written.
 *
 * Pure and dependency-injected so it is testable without a database.
 */

/**
 * @param {object} opts
 * @param {Array<{id: string, email: string, email_hash: string}>} opts.referenceRows
 *   Rows the APP wrote (email_hash NOT NULL). Pass a small sample.
 * @param {(cipherOrPlain: string) => string} opts.decrypt   the app's decryptPII
 * @param {(normalized: string) => string} opts.hash         the app's hashPII
 * @param {(raw: string) => string} opts.normalize           the app's normalizeEmail
 * @returns {{ok: true, checked: number} |
 *           {ok: false, reason: "no_reference"} |
 *           {ok: false, reason: "mismatch", id: string}}
 */
function checkHashAgreement({ referenceRows, decrypt, hash, normalize }) {
  if (!referenceRows || referenceRows.length === 0) {
    // Cannot prove agreement. Refuse rather than assume — assuming is the bug.
    return { ok: false, reason: "no_reference" };
  }

  for (const row of referenceRows) {
    const plain = decrypt(row.email);
    // An anonymized row is not an address and cannot validate anything.
    if (!plain || plain.startsWith("deleted-")) continue;
    if (hash(normalize(plain)) !== row.email_hash) {
      return { ok: false, reason: "mismatch", id: row.id };
    }
  }

  const usable = referenceRows.filter(
    (r) => r.email && !decrypt(r.email).startsWith("deleted-"),
  ).length;
  if (usable === 0) return { ok: false, reason: "no_reference" };
  return { ok: true, checked: usable };
}

module.exports = { checkHashAgreement };
