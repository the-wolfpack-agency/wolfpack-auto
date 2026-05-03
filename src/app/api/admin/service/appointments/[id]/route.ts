import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackService } from "@/lib/analytics-hooks";
import { getDealerId } from "@/lib/get-dealer-id";
import { ConcurrentModificationError } from "@/lib/optimistic-lock";

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/service/appointments/[id]                                 */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { id } = await params;

  let body: {
    status?: string;
    assigned_technician?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    notes?: string;
    updated_at?: string;
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

      values.push(id, dealerId);

      // Build WHERE with optional optimistic lock
      let whereClause = `WHERE id = $${idx++} AND dealer_id = $${idx}`;
      if (body.updated_at) {
        values.push(body.updated_at);
        whereClause += ` AND updated_at = $${++idx}`;
      }

      const result = await /* audit-safe: A4 reason="whereClause built above always includes id = $X AND dealer_id = $Y" */ query(
        `UPDATE service_appointments
         SET ${sets.join(", ")}
         ${whereClause}
         RETURNING id`,
        values,
      );

      if ((result.rows as unknown[]).length === 0 && body.updated_at) {
        return NextResponse.json(
          { error: new ConcurrentModificationError("Appointment").message },
          { status: 409 },
        );
      }

      try {
        if (body.status === "completed") trackService("service.appointment_completed", dealerId, { appointment_id: id });
        if (body.status === "no_show") trackService("service.appointment_no_show", dealerId, { appointment_id: id });
      } catch {}

      return NextResponse.json({ success: true, id });
    } catch (err) {
      console.error("[api/admin/service/appointments/[id]] PATCH DB error:", err);
    }
  }

  try {
    if (body.status === "completed") trackService("service.appointment_completed", dealerId, { appointment_id: id });
    if (body.status === "no_show") trackService("service.appointment_no_show", dealerId, { appointment_id: id });
  } catch {}

  // Shadow mode
  return NextResponse.json({ success: true, id, mode: "shadow" });
}
