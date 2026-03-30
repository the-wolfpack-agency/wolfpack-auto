import { NextRequest, NextResponse } from "next/server";
import { trackSystem } from "@/lib/analytics-hooks";
import { sendPasswordReset } from "@/lib/notifications";

/**
 * POST /api/admin/reset-password
 *
 * Request a password reset email.
 * Body: { email: string }
 *
 * Always returns 200 to avoid email enumeration — even if the user is not found.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = body as { email?: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    // Demo mode: pretend we sent
    return NextResponse.json({ message: "Reset email sent" });
  }

  try {
    const { randomBytes } = await import("crypto");
    const { query } = await import("@/lib/db");

    // Look up active user by email
    const result = await query(
      `SELECT id, dealer_id, email, name
       FROM dealer_users
       WHERE LOWER(email) = LOWER($1)
         AND is_active = true
       LIMIT 1`,
      [email.trim()],
    );

    if (result.rows.length === 0) {
      // Return success anyway to prevent email enumeration
      return NextResponse.json({ message: "Reset email sent" });
    }

    const user = result.rows[0];
    const resetToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      `UPDATE dealer_users
       SET reset_token = $1,
           reset_token_expires_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [resetToken, expiresAt.toISOString(), user.id],
    );

    // Fetch dealer name for the email template
    let dealerName = "Your Dealership";
    try {
      const dealerResult = await query(
        `SELECT name FROM dealers WHERE id = $1 LIMIT 1`,
        [user.dealer_id],
      );
      if (dealerResult.rows.length > 0) {
        dealerName = dealerResult.rows[0].name;
      }
    } catch { /* fallback to default */ }

    await sendPasswordReset({
      email: user.email,
      name: user.name,
      resetToken,
      dealerName,
    });

    try {
      trackSystem("team.password_reset_requested", user.dealer_id, {
        email: user.email,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ message: "Reset email sent" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If reset_token column doesn't exist, migration 040 hasn't run
    if (msg.includes("reset_token") || msg.includes("42703")) {
      return NextResponse.json(
        { error: "Password reset not yet configured. Run migration 040." },
        { status: 400 },
      );
    }
    console.error("[reset-password] POST error:", err);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/reset-password
 *
 * Complete a password reset by setting a new password.
 * Body: { token: string, password: string }
 */
export async function PUT(request: NextRequest) {
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
    return NextResponse.json({ message: "Password reset" });
  }

  try {
    const { hash } = await import("bcryptjs");
    const { query } = await import("@/lib/db");

    // Find user by reset token that hasn't expired
    const result = await query(
      `SELECT id, dealer_id, email, name, role
       FROM dealer_users
       WHERE reset_token = $1
         AND reset_token_expires_at > NOW()
       LIMIT 1`,
      [token],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 },
      );
    }

    const user = result.rows[0];
    const passwordHash = await hash(password, 12);

    // Update password, activate user (in case they were deactivated), clear token
    await query(
      `UPDATE dealer_users
       SET password_hash = $1,
           is_active = true,
           reset_token = NULL,
           reset_token_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id],
    );

    try {
      trackSystem("team.password_reset", user.dealer_id, {
        email: user.email,
        role: user.role,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({
      message: "Password reset",
      user: { email: user.email, name: user.name },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("reset_token") || msg.includes("42703")) {
      return NextResponse.json(
        { error: "Password reset not yet configured. Run migration 040." },
        { status: 400 },
      );
    }
    console.error("[reset-password] PUT error:", err);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 },
    );
  }
}
