/**
 * Unit tests for src/lib/mfa.ts
 *
 * Tests TOTP generation/verification, backup code generation,
 * hashing, verification, and edge-case handling.
 *
 * Run with: npx jest src/lib/__tests__/mfa.test.ts
 */

import * as OTPAuth from "otpauth";
import {
  generateTOTPSecret,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "../mfa";

/* -------------------------------------------------------------------------- */
/* TOTP generation                                                            */
/* -------------------------------------------------------------------------- */

describe("generateTOTPSecret", () => {
  it("returns a base32 secret, otpauth URL, and QR data URL", async () => {
    const result = await generateTOTPSecret("test@example.com");

    expect(result.secret).toBeDefined();
    expect(result.secret.length).toBeGreaterThan(0);
    // Base32 charset only
    expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);

    expect(result.otpauthUrl).toMatch(
      /^otpauth:\/\/totp\/WolfpackAuto:test%40example\.com/,
    );
    expect(result.otpauthUrl).toContain("issuer=WolfpackAuto");
    expect(result.otpauthUrl).toContain("algorithm=SHA1");
    expect(result.otpauthUrl).toContain("digits=6");
    expect(result.otpauthUrl).toContain("period=30");

    expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("generates unique secrets for each call", async () => {
    const a = await generateTOTPSecret("user@example.com");
    const b = await generateTOTPSecret("user@example.com");
    expect(a.secret).not.toBe(b.secret);
  });

  it("encodes the email label in the otpauth URL", async () => {
    const result = await generateTOTPSecret("admin+test@wolfpack.com");
    expect(result.otpauthUrl).toContain("admin");
  });
});

/* -------------------------------------------------------------------------- */
/* TOTP verification                                                          */
/* -------------------------------------------------------------------------- */

describe("verifyTOTP", () => {
  function makeCurrentToken(secret: string): string {
    const totp = new OTPAuth.TOTP({
      issuer: "WolfpackAuto",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    return totp.generate();
  }

  it("accepts a valid current token", async () => {
    const { secret } = await generateTOTPSecret("user@example.com");
    const token = makeCurrentToken(secret);
    expect(verifyTOTP(secret, token)).toBe(true);
  });

  it("rejects a clearly wrong token", async () => {
    const { secret } = await generateTOTPSecret("user@example.com");
    expect(verifyTOTP(secret, "000000")).toBe(false);
  });

  it("rejects an empty token string", async () => {
    const { secret } = await generateTOTPSecret("user@example.com");
    expect(verifyTOTP(secret, "")).toBe(false);
  });

  it("rejects a token with the wrong secret", async () => {
    const { secret: secretA } = await generateTOTPSecret("a@example.com");
    const { secret: secretB } = await generateTOTPSecret("b@example.com");
    const tokenForA = makeCurrentToken(secretA);
    expect(verifyTOTP(secretB, tokenForA)).toBe(false);
  });

  it("rejects a completely invalid (non-numeric) token", () => {
    expect(verifyTOTP("JBSWY3DPEHPK3PXP", "abcdef")).toBe(false);
  });

  it("returns false for an invalid base32 secret", () => {
    // Should not throw — just return false
    expect(verifyTOTP("!!!invalid!!!", "123456")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Backup code generation                                                     */
/* -------------------------------------------------------------------------- */

describe("generateBackupCodes", () => {
  it("generates exactly 8 codes", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
  });

  it("each code is 8 characters long", () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      expect(code).toHaveLength(8);
    }
  });

  it("codes use only unambiguous alphanumeric characters", () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      // Allowed: A-Z (no I, O) and 2-9 (no 0, 1) — per implementation
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it("generates unique codes across calls", () => {
    const a = new Set(generateBackupCodes());
    const b = new Set(generateBackupCodes());
    // Statistically impossible to be identical
    const intersection = new Set([...a].filter((x) => b.has(x)));
    expect(intersection.size).toBeLessThan(8);
  });

  it("codes are unique within a single batch", () => {
    const codes = generateBackupCodes();
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});

/* -------------------------------------------------------------------------- */
/* Backup code hashing                                                        */
/* -------------------------------------------------------------------------- */

describe("hashBackupCode", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashBackupCode("ABCD1234");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashBackupCode("TESTCODE")).toBe(hashBackupCode("TESTCODE"));
  });

  it("normalizes to uppercase before hashing", () => {
    expect(hashBackupCode("abcd1234")).toBe(hashBackupCode("ABCD1234"));
  });

  it("produces different hashes for different codes", () => {
    expect(hashBackupCode("AAAAAAAA")).not.toBe(hashBackupCode("BBBBBBBB"));
  });
});

/* -------------------------------------------------------------------------- */
/* Backup code verification                                                   */
/* -------------------------------------------------------------------------- */

describe("verifyBackupCode", () => {
  function makeHashedSet(codes: string[]): string[] {
    return codes.map(hashBackupCode);
  }

  it("returns true when the submitted code matches a stored hash", () => {
    const codes = ["ABCDEFGH", "JKLMNPQR"];
    const hashed = makeHashedSet(codes);
    expect(verifyBackupCode("ABCDEFGH", hashed)).toBe(true);
    expect(verifyBackupCode("JKLMNPQR", hashed)).toBe(true);
  });

  it("returns false when the code does not match any stored hash", () => {
    const hashed = makeHashedSet(["ABCDEFGH"]);
    expect(verifyBackupCode("ZZZZZZZZ", hashed)).toBe(false);
  });

  it("returns false for an empty code", () => {
    const hashed = makeHashedSet(["ABCDEFGH"]);
    expect(verifyBackupCode("", hashed)).toBe(false);
  });

  it("returns false when hashedCodes is empty", () => {
    expect(verifyBackupCode("ABCDEFGH", [])).toBe(false);
  });

  it("is case-insensitive (normalises submitted code to uppercase)", () => {
    const hashed = makeHashedSet(["ABCDEFGH"]);
    expect(verifyBackupCode("abcdefgh", hashed)).toBe(true);
  });

  it("does not return true for a partially matching code", () => {
    const hashed = makeHashedSet(["ABCDEFGH"]);
    expect(verifyBackupCode("ABCDEFG", hashed)).toBe(false);
    expect(verifyBackupCode("ABCDEFGHX", hashed)).toBe(false);
  });

  it("still checks all codes even when a match is found (no early exit timing leak)", () => {
    // We can't directly test constant-time behaviour, but we verify the
    // function returns the correct result when the match is in various positions.
    const codes = generateBackupCodes();
    const hashed = makeHashedSet(codes);

    // Match at the first position
    expect(verifyBackupCode(codes[0], hashed)).toBe(true);
    // Match at the last position
    expect(verifyBackupCode(codes[codes.length - 1], hashed)).toBe(true);
  });
});
