/**
 * POST /api/admin/mfa/enable
 *
 * Requires authentication. The client sends { token, backupCodes } where
 * `token` is the current 6-digit TOTP from the authenticator app and
 * `backupCodes` are the plaintext codes from the setup step.
 *
 * On success: sets mfa_enabled = true and persists hashed backup codes.
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { verifyTOTP, hashBackupCode } from "@/lib/mfa";
import { decryptPII } from "@/lib/crypto";
import { query } from "@/lib/db";
import { trackSecurity } from "@/lib/analytics-hooks";

interface EnableRequestBody {
  token: string;
  backupCodes: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ success: true, message: "MFA enabled (shadow mode)" });
  }

  const { user } = authResult;

  let body: EnableRequestBody;
  try {
    body = (await request.json()) as EnableRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token, backupCodes } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "TOTP token is required." },
      { status: 400 },
    );
  }

  if (!Array.isArray(backupCodes) || backupCodes.length === 0) {
    return NextResponse.json(
      { error: "Backup codes are required." },
      { status: 400 },
    );
  }

  try {
    // Fetch the pending (not-yet-enabled) MFA secret for this user
    const result = await query<{
      mfa_secret: string | null;
      mfa_enabled: boolean;
    }>(
      `SELECT mfa_secret, mfa_enabled FROM dealer_users WHERE id = $1 LIMIT 1`,
      [user.id],
    );

    const row = result.rows[0];
    if (!row?.mfa_secret) {
      return NextResponse.json(
        { error: "MFA setup not initiated. Call /api/admin/mfa/setup first." },
        { status: 400 },
      );
    }

    const plaintextSecret = decryptPII(row.mfa_secret);

    if (!verifyTOTP(plaintextSecret, token)) {
      return NextResponse.json(
        { error: "Invalid TOTP token. Please check your authenticator app and try again." },
        { status: 400 },
      );
    }

    // Hash all backup codes before storage
    const hashedCodes = backupCodes.map((c) => hashBackupCode(c));

    await query(
      `UPDATE dealer_users
          SET mfa_enabled = true,
              mfa_backup_codes = $1
        WHERE id = $2`,
      [hashedCodes, user.id],
    );

    try { trackSecurity("security.mfa_enabled", authResult?.user?.dealer_id ?? "system", { action: "mfa_enabled" }); } catch {}
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[mfa/enable] Error:", err);
    return NextResponse.json(
      { error: "Failed to enable MFA. Please try again." },
      { status: 500 },
    );
  }
}
