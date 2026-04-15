import { NextRequest, NextResponse } from "next/server";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * POST /api/admin/accept-invite
 *
 * Accepts a team invitation by setting the user's password.
 * Body: { token: string, password: string }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, password } = body as { token?: string; password?: string };

  if (!token || !password) {
    return NextResponse.json(
      { error: "token and password are required" },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    // Demo mode: accept any token
    return NextResponse.json({ message: "Invitation accepted" });
  }

  try {
    const { hash } = await import("bcryptjs");
    const { query } = await import("@/lib/db");

    // Find user by invite token that hasn't expired
    const result = await query(
      `SELECT id, dealer_id, email, name, role
       FROM dealer_users
       WHERE invite_token = $1
         AND invite_expires_at > NOW()
         AND is_active = false
       LIMIT 1`,
      [token],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 },
      );
    }

    const user = result.rows[0];
    const passwordHash = await hash(password, 12);

    // Activate the user and clear the invite token
    await query(
      `UPDATE dealer_users
       SET password_hash = $1,
           is_active = true,
           invite_token = NULL,
           invite_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id],
    );

    try {
      trackSystem("team.invite_accepted", user.dealer_id, {
        email: user.email,
        role: user.role,
      });
      trackSystem("system.team_invite_accepted", user.dealer_id, {
        email: user.email,
        role: user.role,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({
      message: "Invitation accepted",
      user: { email: user.email, name: user.name, role: user.role },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If invite_token column doesn't exist, migration 039 hasn't run
    if (msg.includes("invite_token") || msg.includes("42703")) {
      return NextResponse.json(
        { error: "Invite system not yet configured. Run migration 039." },
        { status: 400 },
      );
    }
    console.error("[accept-invite] Error:", err);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 },
    );
  }
}
