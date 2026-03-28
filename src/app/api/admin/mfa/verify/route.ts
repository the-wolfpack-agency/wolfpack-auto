/**
 * POST /api/admin/mfa/verify
 *
 * Public (called during login flow). Verifies a TOTP token or backup code
 * for a user who has MFA enabled.
 *
 * Request body: { userId: string, token: string, isBackupCode?: boolean }
 * Response:     { valid: boolean }
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
  isBackupCode?: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ valid: true, message: "MFA verification bypassed (shadow mode)" });
  }

  let body: VerifyRequestBody;
  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { userId, token, isBackupCode = false } = body;

  if (!userId || !token) {
    return NextResponse.json({ error: "userId and token are required." }, { status: 400 });
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

    if (isBackupCode) {
      const hashedCodes = row.mfa_backup_codes ?? [];
      const valid = verifyBackupCode(token, hashedCodes);

      if (valid) {
        // Consume the used backup code — remove it from the stored list
        const usedHash = hashBackupCode(token);
        const remaining = hashedCodes.filter((h) => h !== usedHash);

        await query(
          `UPDATE dealer_users SET mfa_backup_codes = $1 WHERE id = $2`,
          [remaining, userId],
        );
      }

      return NextResponse.json({ valid });
    }

    // Standard TOTP verification
    const valid = verifyTOTP(plaintextSecret, token);
    try { trackSecurity("security.mfa_verified", "system", { action: "mfa_verified", valid, user_id: userId }); } catch {}
    return NextResponse.json({ valid });
  } catch (err) {
    console.error("[mfa/verify] Error:", err);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }
}
