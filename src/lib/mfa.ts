/**
 * TOTP MFA utilities for WolfpackAuto admin users.
 *
 * Uses the `otpauth` package for RFC-6238 TOTP and `qrcode` for QR generation.
 * Backup codes are hashed with SHA-256 and compared in constant time.
 */

import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ISSUER = "WolfpackAuto";
const ALGORITHM = "SHA1";
const DIGITS = 6;
const PERIOD = 30; // seconds
/** Allow ±1 window (30 s drift) on each side. */
const WINDOW = 1;

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous alphanum (no 0/O, 1/I)

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export interface TOTPSetupResult {
  /** Base32-encoded secret to store (encrypt before persisting). */
  secret: string;
  /** otpauth:// URI for authenticator apps. */
  otpauthUrl: string;
  /** Data-URL PNG of the QR code, ready for <img src="...">. */
  qrDataUrl: string;
}

/* -------------------------------------------------------------------------- */
/* TOTP                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Generate a new TOTP secret for `email` and return the setup payload.
 * The returned `secret` should be encrypted with `encryptPII` before storage.
 */
export async function generateTOTPSecret(
  email: string,
): Promise<TOTPSetupResult> {
  const otpSecret = new OTPAuth.Secret({ size: 20 }); // 160-bit — standard

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: otpSecret,
  });

  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret: otpSecret.base32,
    otpauthUrl,
    qrDataUrl,
  };
}

/**
 * Verify a 6-digit TOTP `token` against the stored `secret` (base32).
 * Accepts ±WINDOW * PERIOD seconds of clock drift.
 */
export function verifyTOTP(secret: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token, window: WINDOW });
    return delta !== null;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Backup codes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Generate `BACKUP_CODE_COUNT` cryptographically random backup codes.
 * Returns plaintext codes — show to user once; store only the hashed versions.
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  const charCount = BACKUP_CODE_CHARS.length;

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH);
    let code = "";
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      code += BACKUP_CODE_CHARS[bytes[j] % charCount];
    }
    codes.push(code);
  }

  return codes;
}

/**
 * Hash a backup code with SHA-256 for safe storage.
 */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

/**
 * Verify a submitted backup code against the stored hashed codes.
 * Uses constant-time comparison to prevent timing attacks.
 * Returns `true` if a match is found.
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string[],
): boolean {
  if (!code || !hashedCodes.length) return false;

  const submittedHash = hashBackupCode(code);
  const submittedBuf = Buffer.from(submittedHash, "hex");

  let matched = false;
  for (const stored of hashedCodes) {
    const storedBuf = Buffer.from(stored, "hex");
    if (
      submittedBuf.length === storedBuf.length &&
      timingSafeEqual(submittedBuf, storedBuf)
    ) {
      matched = true;
      // Do NOT break early — iterate all codes to avoid timing leakage.
    }
  }

  return matched;
}
