/**
 * POST /api/admin/mfa/verify
 *
 * Public (called during login flow). Verifies a TOTP token or backup code
 * for a user who has MFA enabled.
 *
 * Request body: { userId: string, token: string }
 * Response:     { valid: boolean }
 *
 * Token type is auto-detected from format (6-digit numeric -> TOTP,
 * 8-char alphanumeric -> backup code). The previous `isBackupCode` flag
 * was removed because it was user-controlled and CodeQL flagged it as a
 * bypass vector (js/user-controlled-bypass).
 *
 * If a backup code is used successfully, it is consumed (removed) to
 * prevent reuse.
 */

import { NextResponse } from "next/server";
import { verifyTOTP, verifyBackupCode, hashBackupCode } from "@/lib/mfa";
import { decryptPII } from "@/lib/crypto";
import { query } from "@/lib/db";
import { trackSecurity } from "@/lib/analytics-hooks";

interface VerifyRequestBody {
  userId: string;
  token: string;
}

const TOTP_REGEX = /^\d{6}$/;
const BACKUP_CODE_REGEX = /^[A-Z0-9]{8}$/;

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) {
    // No DB configured -> we cannot verify MFA. Refuse rather than auto-pass.
    // (Previously returned `valid: true`, which CodeQL flagged as a bypass.)
    return NextResponse.json(
      { error: "MFA service unavailable: database not configured" },
      { status: 503 },
    );
  }

  let body: VerifyRequestBody;
  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { userId, token } = body;

  if (!userId || !token) {
    return NextResponse.json({ error: "userId and token are required." }, { status: 400 });
  }

  // Server-side classification of token type — replaces the user-controlled
  // `isBackupCode` flag that previously let the caller pick the validation
  // path. (js/user-controlled-bypass)
  const normalizedToken = token.trim().toUpperCase();
  let tokenKind: "totp" | "backup" | "unknown" = "unknown";
  if (TOTP_REGEX.test(token.trim())) tokenKind = "totp";
  else if (BACKUP_CODE_REGEX.test(normalizedToken)) tokenKind = "backup";

  if (tokenKind === "unknown") {
    return NextResponse.json({ valid: false });
  }

  try {
    const result = await query<{
      mfa_secret: string | null;
      mfa_enabled: boolean;
      mfa_backup_codes: string[] | null;
    }>(
      `SELECT mfa_secret, mfa_enabled, mfa_backup_codes
         FROM dealer_users
        WHERE id = $1
        LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];

    if (!row || !row.mfa_enabled || !row.mfa_secret) {
      // MFA not enabled or user not found — treat as invalid
      return NextResponse.json({ valid: false });
    }

    const plaintextSecret = decryptPII(row.mfa_secret);

    if (tokenKind === "backup") {
      const hashedCodes = row.mfa_backup_codes ?? [];
      const valid = verifyBackupCode(normalizedToken, hashedCodes);

      if (valid) {
        // Consume the used backup code — remove it from the stored list
        const usedHash = hashBackupCode(normalizedToken);
        const remaining = hashedCodes.filter((h) => h !== usedHash);

        await query(
          `UPDATE dealer_users SET mfa_backup_codes = $1 WHERE id = $2`,
          [remaining, userId],
        );
      }

      try { trackSecurity("security.mfa_verified", "system", { action: "mfa_verified", valid, user_id: userId, kind: "backup" }); } catch {}
      return NextResponse.json({ valid });
    }

    // Standard TOTP verification
    const valid = verifyTOTP(plaintextSecret, token.trim());
    try { trackSecurity("security.mfa_verified", "system", { action: "mfa_verified", valid, user_id: userId, kind: "totp" }); } catch {}
    return NextResponse.json({ valid });
  } catch (err) {
    console.error("[mfa/verify] Error:", err);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }
}
