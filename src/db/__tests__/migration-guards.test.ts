/* eslint-disable @typescript-eslint/no-require-imports */
export {}; // module marker: keeps top-level test consts out of global scope
/**
 * Guards for the two silent failures that half-applied migration 087 to
 * production and reported success.
 *
 *  1. The splitter dropped any chunk starting with "--", so the header comment
 *     every migration opens with swallowed the first statement. (split-sql)
 *  2. A real error was counted as "skipped (already exist)" and the script
 *     exited 0, so four syntax errors printed as success. (migration-errors)
 *
 * Both are pure functions precisely so they can be pinned here.
 */

const { isBenignMigrationError, isFatalMigrationError } = require("../../../scripts/lib/migration-errors.cjs");
const { checkHashAgreement } = require("../../../scripts/lib/hash-agreement.cjs");

describe("isBenignMigrationError — only 'already in desired state' is benign", () => {
  it.each([
    'column "email_hash" of relation "leads" already exists',
    'relation "idx_leads_dealer_email_hash" already exists',
    "duplicate column name: email_hash",
  ])("treats %s as benign", (msg) => {
    expect(isBenignMigrationError(msg)).toBe(true);
  });

  it.each([
    // The four that actually happened while the script printed success.
    'syntax error at or near "erasure"',
    'unterminated quoted string at or near "\'Deterministic HMAC-SHA256"',
    'column "email_hash" does not exist',
    'column "email_hash" of relation "leads" does not exist',
    // And the one the old `msg.includes("duplicate")` check wrongly swallowed:
    // a genuine data conflict, not a no-op.
    'duplicate key value violates unique constraint "leads_pkey"',
    'relation "leads" does not exist',
    "permission denied for table leads",
  ])("treats %s as FATAL", (msg) => {
    expect(isBenignMigrationError(msg)).toBe(false);
    expect(isFatalMigrationError(msg)).toBe(true);
  });

  it("treats an unrecognised message as fatal, never benign", () => {
    // Conservative by design: misreading a real error as benign is what caused
    // the half-apply. Misreading benign as fatal only costs a re-run.
    expect(isBenignMigrationError("something nobody has seen before")).toBe(false);
    expect(isBenignMigrationError("")).toBe(false);
    expect(isBenignMigrationError(undefined)).toBe(false);
  });
});

describe("checkHashAgreement — proves this process hashes like the app", () => {
  const identity = (s: string) => s;
  const normalize = (s: string) => s.trim().toLowerCase();

  it("passes when the local hash matches the app-written hash", () => {
    const hash = (s: string) => `H(${s})`;
    const res = checkHashAgreement({
      referenceRows: [{ id: "1", email: "a@b.com", email_hash: "H(a@b.com)" }],
      decrypt: identity,
      hash,
      normalize,
    });
    expect(res).toEqual({ ok: true, checked: 1 });
  });

  it("FAILS when the keys disagree — the 446-wrong-hashes scenario", () => {
    // App wrote an HMAC; this process computes unkeyed SHA-256. No error would
    // surface anywhere else. This check is the only thing that catches it.
    const wrongHash = (s: string) => `SHA256(${s})`;
    const res = checkHashAgreement({
      referenceRows: [{ id: "lead-9", email: "a@b.com", email_hash: "HMAC(a@b.com)" }],
      decrypt: identity,
      hash: wrongHash,
      normalize,
    });
    expect(res).toEqual({ ok: false, reason: "mismatch", id: "lead-9" });
  });

  it("refuses when there is NO app-written row to verify against", () => {
    // Refusing beats assuming. Assuming is the bug.
    expect(
      checkHashAgreement({ referenceRows: [], decrypt: identity, hash: identity, normalize }),
    ).toEqual({ ok: false, reason: "no_reference" });
  });

  it("does not treat an anonymized row as a valid reference", () => {
    // 'deleted-<id>' is not an address; hashing it proves nothing.
    const res = checkHashAgreement({
      referenceRows: [{ id: "1", email: "deleted-1", email_hash: "whatever" }],
      decrypt: identity,
      hash: identity,
      normalize,
    });
    expect(res).toEqual({ ok: false, reason: "no_reference" });
  });

  it("normalizes before hashing, matching the app's write path", () => {
    const hash = (s: string) => `H(${s})`;
    const res = checkHashAgreement({
      referenceRows: [{ id: "1", email: "  A@B.com ", email_hash: "H(a@b.com)" }],
      decrypt: identity,
      hash,
      normalize,
    });
    expect(res.ok).toBe(true);
  });

  it("decrypts before hashing, so ciphertext rows validate too", () => {
    const decrypt = (s: string) => (s === "CIPHER" ? "a@b.com" : s);
    const hash = (s: string) => `H(${s})`;
    const res = checkHashAgreement({
      referenceRows: [{ id: "1", email: "CIPHER", email_hash: "H(a@b.com)" }],
      decrypt,
      hash,
      normalize,
    });
    expect(res.ok).toBe(true);
  });

  it("fails on the first mismatch in a sample of several", () => {
    const hash = (s: string) => `H(${s})`;
    const res = checkHashAgreement({
      referenceRows: [
        { id: "ok-1", email: "a@b.com", email_hash: "H(a@b.com)" },
        { id: "bad-2", email: "c@d.com", email_hash: "WRONG" },
      ],
      decrypt: identity,
      hash,
      normalize,
    });
    expect(res).toEqual({ ok: false, reason: "mismatch", id: "bad-2" });
  });
});
