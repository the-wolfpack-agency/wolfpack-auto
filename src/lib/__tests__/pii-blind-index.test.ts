/**
 * Regression tests for the PII blind index (migration 087).
 *
 * THE BUG: encryptPII uses a random IV per call, so the same email encrypts to
 * different ciphertext every time. Lead dedup and CCPA erasure both matched a
 * plaintext address against that encrypted column, so once PII_ENCRYPTION_KEY
 * was set they matched nothing — silently. Dedup passed every duplicate through;
 * erasure anonymized zero rows while reporting status='completed'.
 *
 * It was invisible in dev because getKey() returns null without the env var and
 * encryptPII degrades to an identity function. So every test here that matters
 * runs WITH A KEY SET — that is the condition under which the old code broke.
 */

const KEY_HEX = "a".repeat(64); // 32 bytes hex-encoded
const OTHER_KEY_HEX = "b".repeat(64);

/** crypto.ts reads process.env at call time, so re-require per key state. */
async function loadCrypto(keyHex: string | undefined) {
  jest.resetModules();
  if (keyHex === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = keyHex;
  return import("@/lib/crypto");
}

const ORIGINAL_KEY = process.env.PII_ENCRYPTION_KEY;
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("hashPII — deterministic blind index", () => {
  it("is stable across calls, unlike encryptPII", async () => {
    const { hashPII, encryptPII } = await loadCrypto(KEY_HEX);

    // This is the whole point: encryptPII is NOT stable, hashPII is.
    expect(encryptPII("a@b.com")).not.toBe(encryptPII("a@b.com"));
    expect(hashPII("a@b.com")).toBe(hashPII("a@b.com"));
  });

  it("reproduces the original bug: a plaintext = ciphertext match never fires", async () => {
    const { encryptPII } = await loadCrypto(KEY_HEX);
    const stored = encryptPII("a@b.com"); // what the DB column holds

    // The old dedup did `WHERE email = $1` with the plaintext. That comparison,
    // in SQL or here, is always false. This is the defect, pinned.
    expect(stored).not.toBe("a@b.com");
  });

  it("distinguishes different inputs", async () => {
    const { hashPII } = await loadCrypto(KEY_HEX);
    expect(hashPII("a@b.com")).not.toBe(hashPII("c@d.com"));
  });

  it("is keyed: the same address hashes differently under a different key", async () => {
    const { hashPII: h1 } = await loadCrypto(KEY_HEX);
    const a = h1("a@b.com");
    const { hashPII: h2 } = await loadCrypto(OTHER_KEY_HEX);
    // Guards the documented key-rotation contract: rotating invalidates hashes.
    expect(h2("a@b.com")).not.toBe(a);
  });

  it("is not a bare unkeyed digest of the address when a key is set", async () => {
    const { createHash } = await import("crypto");
    const bare = createHash("sha256").update("a@b.com", "utf8").digest("hex");
    const { hashPII } = await loadCrypto(KEY_HEX);
    // If this ever equals the bare digest, the index became rainbow-tableable.
    expect(hashPII("a@b.com")).not.toBe(bare);
  });

  it("stays deterministic with no key configured (dev parity)", async () => {
    const { hashPII } = await loadCrypto(undefined);
    expect(hashPII("a@b.com")).toBe(hashPII("a@b.com"));
    expect(hashPII("a@b.com")).toHaveLength(64);
  });

  it("round-trips: decrypt(stored) re-hashes to the stored hash", async () => {
    const { encryptPII, decryptPII, hashPII } = await loadCrypto(KEY_HEX);
    // This is exactly what the backfill script does to legacy rows.
    const stored = encryptPII("a@b.com");
    expect(hashPII(decryptPII(stored))).toBe(hashPII("a@b.com"));
  });
});

describe("hashPII + normalization — the dedup contract", () => {
  it("matches addresses that differ only by case/whitespace", async () => {
    const { hashPII } = await loadCrypto(KEY_HEX);
    const { normalizeEmail } = await import("@/lib/leads/intake");
    // Callers MUST normalize first; these must collapse to one hash or dedup
    // leaks duplicates that differ only in presentation.
    expect(hashPII(normalizeEmail("  A@B.com "))).toBe(hashPII(normalizeEmail("a@b.com")));
  });

  it("matches US phone numbers that differ only by formatting", async () => {
    const { hashPII } = await loadCrypto(KEY_HEX);
    const { normalizePhone } = await import("@/lib/leads/intake");
    const a = normalizePhone("+1 (555) 123-4567");
    const b = normalizePhone("5551234567");
    expect(a).toBe(b); // the normalizer drops the country code
    expect(hashPII(a as string)).toBe(hashPII(b as string));
  });
});
