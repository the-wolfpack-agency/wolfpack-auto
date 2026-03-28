import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/service/appointments/[id]                                 */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: {
    status?: string;
    assigned_technician?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const VALID_STATUSES = ["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"];
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const sets: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [];
      let idx = 1;

      if (body.status) {
        sets.push(`status = $${idx++}`);
        values.push(body.status);
      }
      if (body.assigned_technician !== undefined) {
        sets.push(`assigned_technician = $${idx++}`);
        values.push(body.assigned_technician);
      }
      if (body.scheduled_date) {
        sets.push(`scheduled_date = $${idx++}`);
        values.push(body.scheduled_date);
      }
      if (body.scheduled_time) {
        sets.push(`scheduled_time = $${idx++}`);
        values.push(body.scheduled_time);
      }
      if (body.notes !== undefined) {
        sets.push(`notes = $${idx++}`);
        values.push(body.notes);
      }

      values.push(id, DEALER_ID);

      await query(
        `UPDATE service_appointments
         SET ${sets.join(", ")}
         WHERE id = $${idx++} AND dealer_id = $${idx}`,
        values,
      );

      return NextResponse.json({ success: true, id });
    } catch (err) {
      console.error("[api/admin/service/appointments/[id]] PATCH DB error:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ success: true, id, mode: "shadow" });
}
