/**
 * POST /api/admin/mfa/setup
 *
 * Requires authentication. Generates a new TOTP secret + QR code for the
 * authenticated user and stores the encrypted secret in the DB (NOT yet
 * enabled). Returns { qrDataUrl, secret, backupCodes } for display.
 *
 * The backup codes returned here are the plaintext versions — shown to the
 * user once. The hashed versions are stored only after the user confirms
 * via /api/admin/mfa/enable.
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { generateTOTPSecret, generateBackupCodes } from "@/lib/mfa";
import { encryptPII } from "@/lib/crypto";
import { query } from "@/lib/db";
import { trackSecurity } from "@/lib/analytics-hooks";

export async function POST(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      qrDataUrl: "data:image/png;base64,shadow-mode-placeholder",
      secret: "SHADOW_MODE_SECRET",
      backupCodes: ["SHAD-0001", "SHAD-0002", "SHAD-0003", "SHAD-0004", "SHAD-0005"],
    });
  }

  const { user } = authResult;

  try {
    const { secret, qrDataUrl } = await generateTOTPSecret(user.email);
    const backupCodes = generateBackupCodes();

    // Encrypt the raw TOTP secret before storing. The backup codes are NOT
    // stored yet — they are persisted (hashed) only when the user confirms
    // their authenticator app via /api/admin/mfa/enable.
    const encryptedSecret = encryptPII(secret);

    await query(
      `UPDATE dealer_users
          SET mfa_secret = $1,
              mfa_enabled = false,
              mfa_backup_codes = NULL
        WHERE id = $2`,
      [encryptedSecret, user.id],
    );

    try { trackSecurity("security.mfa_setup", authResult?.user?.dealer_id ?? "system", { action: "mfa_setup_initiated" }); } catch {}
    return NextResponse.json({ qrDataUrl, secret, backupCodes });
  } catch (err) {
    console.error("[mfa/setup] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate MFA setup. Please try again." },
      { status: 500 },
    );
  }
}
