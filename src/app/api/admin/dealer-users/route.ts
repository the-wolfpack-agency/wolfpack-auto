import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import { sendTeamInvite } from "@/lib/notifications";

/**
 * GET  /api/admin/dealer-users — list users for the current dealer
 * POST /api/admin/dealer-users — create a new dealer user
 */

const SHADOW_USERS = [
  {
    id: "usr-001",
    dealer_id: "demo-dealer",
    email: "owner@demo-dealer.example.com",
    name: "Sarah Johnson",
    role: "owner",
    is_active: true,
    last_login: "2026-03-27T14:30:00Z",
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "usr-002",
    dealer_id: "demo-dealer",
    email: "mike@demo-dealer.example.com",
    name: "Mike Rodriguez",
    role: "admin",
    is_active: true,
    last_login: "2026-03-27T09:15:00Z",
    created_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "usr-003",
    dealer_id: "demo-dealer",
    email: "jen@demo-dealer.example.com",
    name: "Jennifer Chen",
    role: "staff",
    is_active: true,
    last_login: "2026-03-26T16:45:00Z",
    created_at: "2026-03-01T00:00:00Z",
  },
];

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      users: SHADOW_USERS.filter((u) => u.dealer_id === dealerId || dealerId === "demo-dealer"),
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT id, dealer_id, email, name, role, is_active, last_login, created_at
       FROM dealer_users
       WHERE dealer_id = $1
       ORDER BY created_at`,
      [dealerId],
    );
    return NextResponse.json({ users: result.rows });
  } catch (err) {
    console.error("[dealer-users] GET error:", err);
    return NextResponse.json({ users: SHADOW_USERS });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, password, role } = body as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  };

  if (!email || !name) {
    return NextResponse.json(
      { error: "email and name are required" },
      { status: 400 },
    );
  }

  const validRoles = ["owner", "admin", "manager", "staff"];
  const cleanRole = validRoles.includes(role ?? "") ? role! : "admin";
  const dealerId = authResult.user.dealer_id;
  const inviteToken = randomBytes(32).toString("hex");

  if (!process.env.DATABASE_URL) {
    const id = `usr-${Date.now().toString(36)}`;
    try {
      trackSystem("team.user_invited", dealerId, { email, role: cleanRole });
    } catch { /* analytics never blocks */ }

    // Fire invite email (non-blocking)
    void sendTeamInvite({
      inviteeEmail: email,
      inviteeName: name,
      role: cleanRole,
      inviterName: authResult.user.name ?? "Your teammate",
      dealerName: "Demo Dealership",
      inviteToken,
    });

    return NextResponse.json(
      {
        user: {
          id,
          dealer_id: dealerId,
          email,
          name,
          role: cleanRole,
          is_active: false,
          invite_pending: true,
          created_at: new Date().toISOString(),
        },
        message: "Invitation sent",
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // Check for duplicate email
    const existing = await query( /* audit-safe: A4 reason="globally-unique email pre-create dedupe across platform" */`SELECT id FROM dealer_users WHERE email = $1`, [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    // If password provided, create active user immediately; otherwise invite flow
    let passwordHash: string | null = null;
    if (password) {
      const { hash } = await import("bcryptjs");
      passwordHash = await hash(password, 12);
    }

    // Try with invite columns first; fall back to basic insert if migration 039 hasn't run
    let result;
    try {
      result = await query(
        `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active, invite_token, invite_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id, dealer_id, email, name, role, is_active, created_at`,
        [
          dealerId,
          email.toLowerCase(),
          name,
          passwordHash,
          cleanRole,
          !!password,
          password ? null : inviteToken,
          password ? null : new Date(Date.now() + 7 * 86400000),
        ],
      );
    } catch (insertErr: unknown) {
      // Column doesn't exist yet — fall back to basic insert (pre-migration 039)
      const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (msg.includes("invite_token") || msg.includes("42703")) {
        // Pre-migration 039: no invite columns, password_hash is NOT NULL
        // Use empty string placeholder — user must be re-invited after migration
        result = await query(
          `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING id, dealer_id, email, name, role, is_active, created_at`,
          [dealerId, email.toLowerCase(), name, passwordHash ?? "", cleanRole, !!password],
        );
      } else {
        throw insertErr;
      }
    }

    try {
      trackSystem(password ? "team.user_created" : "team.user_invited", dealerId, { email, role: cleanRole });
    } catch { /* analytics never blocks */ }

    // Send invite email if no password was provided
    if (!password) {
      // Look up dealer name for the email
      let dealerName = "Your Dealership";
      try {
        const dealerResult = await query( /* audit-safe: A4 reason="dealer PK lookup, dealerId pulled from session" */`SELECT name FROM dealers WHERE id = $1 LIMIT 1`, [dealerId]);
        dealerName = dealerResult.rows[0]?.name ?? dealerName;
      } catch { /* non-critical */ }

      void sendTeamInvite({
        inviteeEmail: email.toLowerCase(),
        inviteeName: name,
        role: cleanRole,
        inviterName: authResult.user.name ?? "Your teammate",
        dealerName,
        inviteToken,
      });
    }

    return NextResponse.json(
      {
        user: result.rows[0],
        message: password ? "User created" : "Invitation sent",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[dealer-users] POST error:", err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
