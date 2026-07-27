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

/**
 * DELETE /api/admin/dealer-users/[id]
 *
 *   default            soft-delete (deactivate) an accepted user, preserving
 *                      the row + history.
 *   ?hard=1 (rescind)  hard-delete a PENDING invite (never accepted) so its
 *                      email is freed and the person can be re-invited.
 *                      Hard delete is refused for accepted/active users
 *                      (last_login set) to protect referential history — those
 *                      fall back to a soft deactivate.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  const dealerId = authResult.user.dealer_id;
  const hard = new URL(request.url).searchParams.get("hard") === "1";

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem(hard ? "team.invite_rescinded" : "team.user_deactivated", dealerId, { user_id: id });
    } catch { /* analytics never blocks */ }
    return NextResponse.json({ success: true, id, removed: hard });
  }

  try {
    const { query } = await import("@/lib/db");

    if (hard) {
      // Only a pending invite (never logged in) may be hard-deleted, so the
      // email frees up for a fresh invite. Accepted users keep their row.
      const existing = await query(
        `SELECT is_active, last_login FROM dealer_users WHERE id = $1 AND dealer_id = $2`,
        [id, dealerId],
      );
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const row = existing.rows[0] as { is_active: boolean; last_login: string | null };
      const isPendingInvite = !row.is_active && row.last_login === null;

      if (isPendingInvite) {
        await query(
          `DELETE FROM dealer_users WHERE id = $1 AND dealer_id = $2`,
          [id, dealerId],
        );
        try {
          trackSystem("team.invite_rescinded", dealerId, { user_id: id });
        } catch { /* analytics never blocks */ }
        return NextResponse.json({ success: true, id, removed: true });
      }
      // Accepted/active user: refuse hard delete, deactivate instead.
      await query(
        `UPDATE dealer_users SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND dealer_id = $2`,
        [id, dealerId],
      );
      try {
        trackSystem("team.user_deactivated", dealerId, { user_id: id });
      } catch { /* analytics never blocks */ }
      return NextResponse.json({
        success: true,
        id,
        removed: false,
        note: "Active user deactivated rather than deleted",
      });
    }

    // Soft delete: deactivate the user
    const result = await query(
      `UPDATE dealer_users SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND dealer_id = $2
       RETURNING id`,
      [id, dealerId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      trackSystem("team.user_deactivated", dealerId, { user_id: id });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ success: true, id, removed: false });
  } catch (err) {
    console.error("[dealer-users] DELETE error:", err);
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }
}
