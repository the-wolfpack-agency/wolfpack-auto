import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * GET  /api/admin/dealer-users — list users for the current dealer
 * POST /api/admin/dealer-users — create a new dealer user
 */

const SHADOW_USERS = [
  {
    id: "usr-001",
    dealer_id: "demo-dealer",
    email: "owner@wolfpackmotors.com",
    name: "Sarah Johnson",
    role: "owner",
    is_active: true,
    last_login: "2026-03-27T14:30:00Z",
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "usr-002",
    dealer_id: "demo-dealer",
    email: "mike@wolfpackmotors.com",
    name: "Mike Rodriguez",
    role: "admin",
    is_active: true,
    last_login: "2026-03-27T09:15:00Z",
    created_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "usr-003",
    dealer_id: "demo-dealer",
    email: "jen@wolfpackmotors.com",
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

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "email, name, and password are required" },
      { status: 400 },
    );
  }

  const validRoles = ["owner", "admin", "manager", "staff"];
  const cleanRole = validRoles.includes(role ?? "") ? role! : "admin";
  const dealerId = authResult.user.dealer_id;

  if (!process.env.DATABASE_URL) {
    const id = `usr-${Date.now().toString(36)}`;
    try {
      trackSystem("team.user_created", dealerId, { email, role: cleanRole });
    } catch { /* analytics never blocks */ }
    return NextResponse.json(
      {
        user: {
          id,
          dealer_id: dealerId,
          email,
          name,
          role: cleanRole,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  }

  try {
    const { hash } = await import("bcryptjs");
    const { query } = await import("@/lib/db");

    // Check for duplicate email
    const existing = await query(`SELECT id FROM dealer_users WHERE email = $1`, [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    const result = await query(
      `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, dealer_id, email, name, role, is_active, created_at`,
      [dealerId, email.toLowerCase(), name, passwordHash, cleanRole],
    );

    try {
      trackSystem("team.user_created", dealerId, { email, role: cleanRole });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[dealer-users] POST error:", err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
