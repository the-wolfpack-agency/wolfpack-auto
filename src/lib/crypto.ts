/**
 * PII encryption utilities using AES-256-GCM.
 *
 * Encrypts personally identifiable information before database storage.
 * Graceful degradation: if no encryption key is configured, values pass
 * through unencrypted so local development works without extra setup.
 *
 * Key: PII_ENCRYPTION_KEY env var — 32 bytes, hex-encoded (64 hex chars).
 * Output format: base64( IV[12] || ciphertext || authTag[16] )
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

/**
 * Resolve the encryption key from environment.
 * Returns null when no key is configured (dev/fallback mode).
 */
function getKey(): Buffer | null {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) return null;

  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    console.error(
      `[crypto] PII_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${buf.length} bytes. Encryption disabled.`,
    );
    return null;
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @returns base64-encoded string containing IV + ciphertext + auth tag,
 *          or the original plaintext if no encryption key is configured.
 */
export function encryptPII(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack as: IV || ciphertext || authTag
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString("base64");
}

/**
 * Deterministic blind index for equality lookups on an encrypted column.
 *
 * WHY THIS EXISTS: `encryptPII` uses a random IV per call, so encrypting the
 * same email twice yields different ciphertext. Any `WHERE email = $1` lookup
 * against an encrypted column therefore matches nothing, always. That is not a
 * theoretical concern — it silently broke lead dedup and CCPA erasure, and it
 * was invisible in dev because `getKey()` returns null without
 * PII_ENCRYPTION_KEY and `encryptPII` degrades to an identity function.
 *
 * `hashPII` is stable for the same input, so it can be indexed and matched with
 * `=`. Store it beside the ciphertext; match on the hash, display the plaintext.
 *
 * Keyed with HMAC-SHA256 when PII_ENCRYPTION_KEY is set, so the index is not a
 * plain rainbow-table-able digest of an email address. Falls back to unkeyed
 * SHA-256 when no key is configured, purely so local dev stays deterministic.
 * Hashes are environment-specific either way: rotating the key invalidates
 * every stored hash and requires a re-hash backfill.
 *
 * Callers MUST pass an ALREADY-NORMALIZED value (see `normalizeEmail` /
 * `normalizePhone` in `src/lib/leads/intake.ts`) — this function hashes exactly
 * the bytes it is given and does no normalization of its own.
 */
export function hashPII(normalized: string): string {
  const key = getKey();
  return key
    ? createHmac("sha256", key).update(normalized, "utf8").digest("hex")
    : createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 *
 * @returns the original plaintext, or the input unchanged if no encryption
 *          key is configured (assumes value was stored unencrypted).
 */
export function decryptPII(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext;

  // If it doesn't look like base64 (e.g., a plain email), return as-is
  // This handles the migration case where old data is unencrypted.
  try {
    const packed = Buffer.from(ciphertext, "base64");

    // Minimum length: IV + 1 byte ciphertext + authTag
    if (packed.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) {
      return ciphertext;
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // If decryption fails, the value was likely stored unencrypted
    return ciphertext;
  }
}
