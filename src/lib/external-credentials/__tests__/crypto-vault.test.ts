/**
 * Unit tests for crypto-vault: AES-256-GCM round-trips, tamper detection,
 * key-rotation drift, and clean failure modes when the key is missing /
 * malformed.
 */

import {
  CredentialVaultError,
  decryptCredential,
  encryptCredential,
  generateTestKey,
  loadVaultKey,
  VAULT_ALGORITHM_ID,
} from "@/lib/external-credentials/crypto-vault";

const ORIGINAL_KEY = process.env.EXTERNAL_CREDENTIAL_KEY;

afterEach(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = ORIGINAL_KEY;
});

describe("crypto-vault: key loading", () => {
  it("throws when EXTERNAL_CREDENTIAL_KEY is unset", () => {
    delete process.env.EXTERNAL_CREDENTIAL_KEY;
    expect(() => loadVaultKey()).toThrow(CredentialVaultError);
    expect(() => loadVaultKey()).toThrow(/not configured/i);
  });

  it("throws when key is not 32 bytes", () => {
    process.env.EXTERNAL_CREDENTIAL_KEY = "00ff";
    expect(() => loadVaultKey()).toThrow(/32 bytes/);
  });

  it("returns a 32-byte buffer when key is valid", () => {
    process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
    const k = loadVaultKey();
    expect(k.length).toBe(32);
  });
});

describe("crypto-vault: round-trip", () => {
  beforeEach(() => {
    process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
  });

  it("encryptCredential → decryptCredential returns the original plaintext", () => {
    const plaintext = "carfax_api_key_xyz123";
    const blob = encryptCredential(plaintext);
    expect(blob.algorithm).toBe(VAULT_ALGORITHM_ID);
    expect(Buffer.isBuffer(blob.ciphertext)).toBe(true);
    expect(Buffer.isBuffer(blob.iv)).toBe(true);
    expect(blob.iv.length).toBe(12);
    expect(blob.ciphertext.length).toBeGreaterThan(16); // includes auth tag

    const recovered = decryptCredential(blob);
    expect(recovered).toBe(plaintext);
  });

  it("round-trips JSON envelopes (Carfax-shape credentials)", () => {
    const cred = JSON.stringify({ apiKey: "abc", dealerCode: "D-12345" });
    const blob = encryptCredential(cred);
    expect(JSON.parse(decryptCredential(blob))).toEqual({
      apiKey: "abc",
      dealerCode: "D-12345",
    });
  });

  it("produces different ciphertexts for the same plaintext (IV is random)", () => {
    const plaintext = "same_value";
    const a = encryptCredential(plaintext);
    const b = encryptCredential(plaintext);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(decryptCredential(a)).toBe(decryptCredential(b));
  });
});

describe("crypto-vault: tamper detection", () => {
  beforeEach(() => {
    process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
  });

  it("throws CredentialVaultError when ciphertext is mutated", () => {
    const blob = encryptCredential("real-secret");
    // Flip a byte in the middle of the ciphertext.
    const mutated = Buffer.from(blob.ciphertext);
    mutated[3] = mutated[3] ^ 0xff;
    expect(() => decryptCredential({ ciphertext: mutated, iv: blob.iv })).toThrow(
      CredentialVaultError,
    );
  });

  it("throws when IV is the wrong length", () => {
    const blob = encryptCredential("real-secret");
    expect(() =>
      decryptCredential({ ciphertext: blob.ciphertext, iv: Buffer.alloc(8) }),
    ).toThrow(/iv must be/i);
  });

  it("throws when decrypting with a different key (rotation drift)", () => {
    const blob = encryptCredential("real-secret");
    process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
    expect(() => decryptCredential(blob)).toThrow(CredentialVaultError);
  });

  it("rejects empty plaintext", () => {
    expect(() => encryptCredential("")).toThrow(/non-empty/i);
  });
});
