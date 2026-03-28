/**
 * GET /api/admin/mfa/status
 *
 * Returns the MFA enablement status for the authenticated user.
 * Used by the MFA settings page to determine which UI state to show.
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { query } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ mfa_enabled: false });
  }

  const { user } = authResult;

  try {
    const result = await query<{ mfa_enabled: boolean }>(
      `SELECT mfa_enabled FROM dealer_users WHERE id = $1 LIMIT 1`,
      [user.id],
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ mfa_enabled: row.mfa_enabled ?? false });
  } catch (err) {
    console.error("[mfa/status] Error:", err);
    return NextResponse.json(
      { error: "Failed to load MFA status." },
      { status: 500 },
    );
  }
}
