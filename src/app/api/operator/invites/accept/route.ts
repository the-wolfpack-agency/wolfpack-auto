/**
 * POST /api/operator/invites/accept
 *
 * Accepts a wolfpack_staff_invites token. Creates the wolfpack_staff row
 * with the supplied password, marks the invite accepted, and writes an
 * audit row.
 *
 * This route is intentionally public — the token IS the auth.
 *
 * Body: { token: string, full_name: string, password: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { getRequestIp } from "@/lib/operator-auth";
import { validatePasswordStrength } from "@/lib/password-validation";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  let body: { token?: string; full_name?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.token || typeof body.token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  if (!body.full_name || typeof body.full_name !== "string" || body.full_name.trim().length < 2) {
    return NextResponse.json({ error: "full_name is required (min 2 chars)" }, { status: 400 });
  }
  if (!body.password || typeof body.password !== "string") {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }

  // Enforce the project's strong-password policy.
  const pwResult = validatePasswordStrength(body.password);
  if (!pwResult.valid) {
    return NextResponse.json(
      { error: "Password does not meet strength requirements", errors: pwResult.errors },
      { status: 400 },
    );
  }

  const tokenHash = hashToken(body.token);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    const { query } = await import("@/lib/db");
    const { hash } = await import("bcryptjs");

    const inviteResult = await query<{
      id: string;
      email: string;
      role: "admin" | "operator" | "viewer";
      expires_at: string;
      accepted_at: string | null;
    }>(
      `SELECT id, email, role, expires_at, accepted_at
         FROM wolfpack_staff_invites
        WHERE token_hash = $1
        LIMIT 1`,
      [tokenHash],
    );

    const invite = inviteResult.rows[0];
    if (!invite) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    }
    if (invite.accepted_at) {
      return NextResponse.json({ error: "Invitation already accepted" }, { status: 400 });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
    }

    // Don't double-create if a staff row already exists.
    const existingStaff = await query<{ id: string }>(
      `SELECT id FROM wolfpack_staff WHERE email = $1`,
      [invite.email],
    );
    if (existingStaff.rows.length > 0) {
      return NextResponse.json({ error: "Staff record already exists" }, { status: 409 });
    }

    const passwordHash = await hash(body.password, 12);

    const insertResult = await query<{ id: string }>(
      `INSERT INTO wolfpack_staff (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [invite.email, passwordHash, body.full_name.trim(), invite.role],
    );

    const staffId = insertResult.rows[0].id;

    await query(
      `UPDATE wolfpack_staff_invites SET accepted_at = NOW() WHERE id = $1`,
      [invite.id],
    );

    await logStaffAction({
      staffId,
      action: "operator.invite_accepted",
      targetType: "wolfpack_staff_invite",
      targetId: invite.id,
      metadata: { email: invite.email, role: invite.role },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        staff: {
          id: staffId,
          email: invite.email,
          role: invite.role,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[operator/invites/accept] error:", err);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}

// Helper for the public accept-invite UI to preview which email/role a
// token corresponds to without exposing the hash.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      email: "preview@example.com",
      role: "viewer",
      valid: false,
    });
  }
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ email: string; role: string; expires_at: string; accepted_at: string | null }>(
      `SELECT email, role, expires_at, accepted_at
         FROM wolfpack_staff_invites
        WHERE token_hash = $1`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ valid: false, error: "Unknown token" }, { status: 200 });
    const valid = !row.accepted_at && new Date(row.expires_at).getTime() > Date.now();
    return NextResponse.json({ valid, email: row.email, role: row.role });
  } catch (err) {
    console.error("[operator/invites/accept] GET error:", err);
    return NextResponse.json({ valid: false }, { status: 200 });
  }
}
