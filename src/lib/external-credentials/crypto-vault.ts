/**
 * BYO-credential vault — AES-256-GCM encryption of dealer-supplied API keys
 * + access tokens before they hit the database.
 *
 * Algorithm slot: `aes-256-gcm-v1`. Lives alongside the named-algorithm
 * registry in src/lib/crypto/ (see algorithms.ts). The slot is used for
 * data-at-rest encryption rather than signing, so it is intentionally NOT
 * declared in `ALGORITHMS` (that registry is signing-specific). The slot
 * NAME is reserved here so future migrations to a new symmetric cipher can
 * be done by adding `aes-256-gcm-v2`, keeping v1 decryptable, and rotating
 * row-by-row.
 *
 * Key source: `EXTERNAL_CREDENTIAL_KEY` env var — 32 bytes, hex-encoded
 * (64 hex chars). If the key is missing or malformed in a non-test
 * environment, every encrypt/decrypt call throws so we fail loud rather
 * than silently storing plaintext (this is the BYO-credential vault — the
 * graceful-passthrough pattern used in src/lib/crypto.ts for PII would be
 * a credential-theft vector here).
 *
 * Output shape — encryption returns two BYTEA-bound Buffers:
 *   ciphertext = AES-256-GCM( plaintext ) || authTag[16]
 *   iv         = 12-byte random nonce
 *
 * The auth tag is appended to the ciphertext (Node convention) so the row
 * only needs two columns to round-trip. `EXTERNAL_CREDENTIAL_KEY` rotation
 * is supported by the `rotate` route: load → decrypt with old key → encrypt
 * with new key. (We don't multi-key here — a single env var keeps the
 * blast radius tight; rotation requires a brief operator workflow.)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const VAULT_ALGORITHM_ID = "aes-256-gcm-v1" as const;
const NODE_CIPHER = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class CredentialVaultError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CredentialVaultError";
  }
}

/**
 * Resolve the 32-byte AES key from EXTERNAL_CREDENTIAL_KEY.
 *
 * Throws CredentialVaultError when the key is missing or wrong length so
 * the caller's HTTP response is a clean 500 instead of silent plaintext
 * write. Exported for tests + key-rotation tooling.
 */
export function loadVaultKey(): Buffer {
  const hex = process.env.EXTERNAL_CREDENTIAL_KEY;
  if (!hex) {
    throw new CredentialVaultError(
      "EXTERNAL_CREDENTIAL_KEY is not configured. Refusing to store BYO credentials without encryption.",
      "key_missing",
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new CredentialVaultError(
      `EXTERNAL_CREDENTIAL_KEY must be 32 bytes (64 hex chars), got ${buf.length} bytes.`,
      "key_invalid_length",
    );
  }
  return buf;
}

export interface EncryptedBlob {
  /** Ciphertext + appended 16-byte GCM auth tag. */
  ciphertext: Buffer;
  /** 12-byte random IV. */
  iv: Buffer;
  /** Algorithm slot identifier (audit/rotation). */
  algorithm: typeof VAULT_ALGORITHM_ID;
}

/**
 * Encrypt a UTF-8 plaintext credential. Returns the ciphertext (with
 * auth tag appended) + IV. Both values are written directly into the
 * BYTEA columns on `dealer_external_credentials`.
 */
export function encryptCredential(plaintext: string): EncryptedBlob {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new CredentialVaultError(
      "plaintext must be a non-empty string",
      "plaintext_invalid",
    );
  }
  const key = loadVaultKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(NODE_CIPHER, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, authTag]),
    iv,
    algorithm: VAULT_ALGORITHM_ID,
  };
}

/**
 * Decrypt a stored credential blob. Returns the original plaintext.
 * Throws if the auth tag does not verify (tamper detection).
 */
export function decryptCredential(blob: { ciphertext: Buffer; iv: Buffer }): string {
  const key = loadVaultKey();
  const { ciphertext, iv } = blob;

  if (!Buffer.isBuffer(ciphertext) || !Buffer.isBuffer(iv)) {
    throw new CredentialVaultError(
      "ciphertext and iv must be Buffers",
      "blob_invalid",
    );
  }
  if (iv.length !== IV_LENGTH) {
    throw new CredentialVaultError(
      `iv must be ${IV_LENGTH} bytes, got ${iv.length}`,
      "iv_invalid",
    );
  }
  if (ciphertext.length < AUTH_TAG_LENGTH + 1) {
    throw new CredentialVaultError(
      "ciphertext too short to contain auth tag + payload",
      "ciphertext_too_short",
    );
  }

  const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
  const payload = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(NODE_CIPHER, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    throw new CredentialVaultError(
      `decrypt failed: ${(err as Error).message}`,
      "auth_tag_invalid",
    );
  }
}

/**
 * Helper for tests: generate a fresh 32-byte hex key string.
 * Production keys MUST be generated out-of-band and stored in Vercel env.
 */
export function generateTestKey(): string {
  return randomBytes(32).toString("hex");
}
