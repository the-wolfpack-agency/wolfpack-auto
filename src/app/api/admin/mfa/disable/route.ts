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

interface DisableRequestBody {
  userId?: string;
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const authResult = await requireRole(["admin"]);
  if (!isAuthenticated(authResult)) return authResult;

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
        WHERE id = $1`,
      [targetUserId],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[mfa/disable] Error:", err);
    return NextResponse.json(
      { error: "Failed to disable MFA. Please try again." },
      { status: 500 },
    );
  }
}
