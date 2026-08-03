/**
 * DELETE /api/admin/mfa/disable
 *
 * Requires authentication with role=admin. Disables MFA for the authenticated
 * user (or a target user specified by `userId` in the request body, admin only).
 *
 * Request body (optional): { userId?: string }
 *   - If omitted, disables MFA for the calling user (admin only).
 *   - If provided, an admin can disable MFA for any user in the same dealership.
 */

import { NextResponse } from "next/server";
import { requireRole, isAuthenticated } from "@/lib/auth-guard";
import { query } from "@/lib/db";
import { trackSecurity } from "@/lib/analytics-hooks";

interface DisableRequestBody {
  userId?: string;
}

export async function DELETE(request: Request): Promise<NextResponse> {
  /* owner is included deliberately. The gate used to be ["admin"] alone,
     which locked out the highest-privilege role: an owner could not disable
     MFA for anybody. requireRole is a flat includes() with no hierarchy, so
     every gate has to name owner explicitly. */
  const authResult = await requireRole(["owner", "admin"]);
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ success: true, message: "MFA disabled (shadow mode)" });
  }

  const { user } = authResult;

  let targetUserId = user.id;

  try {
    const body = (await request.json().catch(() => ({}))) as DisableRequestBody;
    if (body.userId && typeof body.userId === "string") {
      targetUserId = body.userId;
    }
  } catch {
    // No body — default to self
  }

  try {
    // Ensure the target user belongs to the same dealership (RLS-style check)
    const check = await query<{ id: string }>(
      `SELECT id FROM dealer_users WHERE id = $1 AND dealer_id = $2 LIMIT 1`,
      [targetUserId, user.dealer_id],
    );

    if (!check.rows[0]) {
      return NextResponse.json(
        { error: "User not found or access denied." },
        { status: 404 },
      );
    }

    await query(
      `UPDATE dealer_users
          SET mfa_enabled = false,
              mfa_secret = NULL,
              mfa_backup_codes = NULL
        WHERE id = $1 AND dealer_id = $2`,
      [targetUserId, user.dealer_id],
    );

    try { trackSecurity("security.mfa_disabled", authResult?.user?.dealer_id ?? "system", { action: "mfa_disabled", target_user: targetUserId }); } catch {}
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[mfa/disable] Error:", err);
    return NextResponse.json(
      { error: "Failed to disable MFA. Please try again." },
      { status: 500 },
    );
  }
}
