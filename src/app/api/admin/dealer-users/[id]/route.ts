import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * PATCH  /api/admin/dealer-users/[id] — update user (name, role, active toggle)
 * DELETE /api/admin/dealer-users/[id] — soft-delete (deactivate) user
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, role, is_active } = body as {
    name?: string;
    role?: string;
    is_active?: boolean;
  };

  const validRoles = ["owner", "admin", "manager", "staff"];

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("team.user_updated", authResult.user.dealer_id, { user_id: id, role: role ?? "unchanged" });
    } catch { /* analytics never blocks */ }
    return NextResponse.json({
      user: { id, name: name ?? "Updated User", role: role ?? "admin", is_active: is_active ?? true },
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Build dynamic SET clause
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      values.push(name);
    }
    if (role !== undefined && validRoles.includes(role)) {
      sets.push(`role = $${paramIdx++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      sets.push(`is_active = $${paramIdx++}`);
      values.push(is_active);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);
    values.push(authResult.user.dealer_id);

    const result = await query(
      `UPDATE dealer_users SET ${sets.join(", ")}
       WHERE id = $${paramIdx++} AND dealer_id = $${paramIdx}
       RETURNING id, dealer_id, email, name, role, is_active, last_login, created_at`,
      values,
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      trackSystem("team.user_updated", authResult.user.dealer_id, { user_id: id });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ user: result.rows[0] });
  } catch (err) {
    console.error("[dealer-users] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("team.user_deactivated", authResult.user.dealer_id, { user_id: id });
    } catch { /* analytics never blocks */ }
    return NextResponse.json({ success: true, id });
  }

  try {
    const { query } = await import("@/lib/db");

    // Soft delete: deactivate the user
    const result = await query(
      `UPDATE dealer_users SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND dealer_id = $2
       RETURNING id`,
      [id, authResult.user.dealer_id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      trackSystem("team.user_deactivated", authResult.user.dealer_id, { user_id: id });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[dealer-users] DELETE error:", err);
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 });
  }
}
