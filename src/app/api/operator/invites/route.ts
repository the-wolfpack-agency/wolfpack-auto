/**
 * GET  /api/operator/invites — list pending invites
 * POST /api/operator/invites — issue a new invite to a Wolfpack staff member
 *
 * Admin role required to issue invites. Operator+ can list.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { sanitizeForLog } from "@/lib/log-sanitize";

const INVITE_TTL_DAYS = 7;

interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  invited_by_staff_id: string | null;
  inviter_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ invites: [] });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<InviteRow>(
      `SELECT i.id, i.email, i.role, i.invited_by_staff_id,
              s.full_name AS inviter_name,
              i.expires_at, i.accepted_at, i.created_at
         FROM wolfpack_staff_invites i
    LEFT JOIN wolfpack_staff s ON s.id = i.invited_by_staff_id
        WHERE i.accepted_at IS NULL
          AND i.expires_at > NOW()
        ORDER BY i.created_at DESC`,
    );
    return NextResponse.json({ invites: result.rows });
  } catch (err) {
    console.error("[operator/invites] GET error:", err);
    return NextResponse.json({ invites: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "admin");
  if (!isWolfpackStaff(auth)) return auth;

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "viewer";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!["admin", "operator", "viewer"].includes(role)) {
    return NextResponse.json({ error: "role must be admin, operator, or viewer" }, { status: 400 });
  }

  // Generate token + hash (we only store the hash).
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000);

  if (!process.env.DATABASE_URL) {
    await logStaffAction({
      staffId: auth.staff.id,
      action: "operator.invite_issued",
      targetType: "wolfpack_staff_invite",
      targetId: null,
      metadata: { email, role },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    // Surface the token to the caller in dev/test only — production runs
    // with DATABASE_URL set and sends the token via email instead.
    return NextResponse.json(
      {
        ok: true,
        email,
        role,
        token,
        accept_url: buildAcceptUrl(request, token),
        expires_at: expiresAt.toISOString(),
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // Reject if there's already a non-expired pending invite for this email.
    const existing = await query(
      `SELECT id FROM wolfpack_staff_invites
        WHERE email = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [email],
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "An active invite already exists for this email" },
        { status: 409 },
      );
    }

    // Reject if a staff row already exists for this email.
    const existingStaff = await query(
      `SELECT id FROM wolfpack_staff WHERE email = $1`,
      [email],
    );
    if (existingStaff.rows.length > 0) {
      return NextResponse.json(
        { error: "A staff member with this email already exists" },
        { status: 409 },
      );
    }

    const result = await query<{ id: string }>(
      `INSERT INTO wolfpack_staff_invites
         (email, role, token_hash, invited_by_staff_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, role, tokenHash, auth.staff.id, expiresAt.toISOString()],
    );

    await logStaffAction({
      staffId: auth.staff.id,
      action: "operator.invite_issued",
      targetType: "wolfpack_staff_invite",
      targetId: result.rows[0]?.id ?? null,
      metadata: { email, role },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    // Send invite email. We fire and forget — the audit row + token URL
    // are the contract; email is the delivery mechanism.
    const acceptUrl = buildAcceptUrl(request, token);
    void sendStaffInviteEmail(email, role, auth.staff.name, acceptUrl).catch((err) => {
      console.error("[operator/invites] send invite email failed:", err);
    });

    // Production responses do NOT echo the raw token. Dev/test responses
    // do, so the E2E suite can complete the accept step without intercepting
    // an SMTP socket.
    const echoToken = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        ok: true,
        id: result.rows[0]?.id,
        email,
        role,
        expires_at: expiresAt.toISOString(),
        ...(echoToken ? { token, accept_url: acceptUrl } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[operator/invites] POST error:", err);
    return NextResponse.json({ error: "Failed to issue invite" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function buildAcceptUrl(request: NextRequest, token: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(request.url).origin);
  return `${baseUrl}/operator/accept-invite?token=${token}`;
}

async function sendStaffInviteEmail(
  email: string,
  role: string,
  inviter: string,
  acceptUrl: string,
): Promise<void> {
  // Reuse the project's Resend wrapper. If RESEND_API_KEY is absent, the
  // module logs to stdout — that's fine for dev/test.
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
    if (!RESEND_API_KEY) {
      console.log(`[operator/invites] (no Resend key) invite for ${sanitizeForLog(email)} as ${sanitizeForLog(role)} — accept at ${sanitizeForLog(acceptUrl)}`);
      return;
    }
    const { Resend } = await import("resend");
    const client = new Resend(RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL ?? "Wolfpack Operations <ops@wolfpackauto.com>";
    await client.emails.send({
      from,
      to: [email],
      subject: `You're invited to the Wolfpack operator console (${role})`,
      html: staffInviteHTML({ email, role, inviter, acceptUrl }),
    });
  } catch (err) {
    console.error("[operator/invites] sendStaffInviteEmail error:", err);
  }
}

function staffInviteHTML(p: { email: string; role: string; inviter: string; acceptUrl: string }): string {
  return `<!doctype html>
<html><body style="font-family: Inter, system-ui, sans-serif; line-height: 1.5; color: #1f2937; max-width: 540px; margin: 0 auto; padding: 32px;">
  <h2 style="color: #0070c7; margin: 0 0 8px;">Welcome to the Wolfpack operator console</h2>
  <p>${escapeHtml(p.inviter)} invited you (${escapeHtml(p.email)}) as a <strong>${escapeHtml(p.role)}</strong>.</p>
  <p>Click below to set your password and activate your account. The link expires in 7 days.</p>
  <p style="margin: 24px 0;">
    <a href="${p.acceptUrl}" style="background: #0070c7; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">Accept invitation</a>
  </p>
  <p style="font-size: 12px; color: #6b7280;">If the button doesn't work, copy this URL: ${p.acceptUrl}</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c] ?? c);
}
