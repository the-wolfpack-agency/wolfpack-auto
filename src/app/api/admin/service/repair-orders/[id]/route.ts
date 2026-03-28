import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/service/repair-orders/[id]                                */
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
    technician?: string;
    line_items?: Array<{
      id: string;
      description: string;
      labor_hours: number;
      labor_rate: number;
      parts_cost: number;
      line_total: number;
    }>;
    labor_total?: number;
    parts_total?: number;
    tax?: number;
    grand_total?: number;
    diagnosis?: string;
    recommendations?: string;
    promised_date?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const VALID_STATUSES = [
    "open", "in_progress", "waiting_parts", "waiting_approval",
    "completed", "invoiced", "closed",
  ];

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
      if (body.technician !== undefined) {
        sets.push(`technician = $${idx++}`);
        values.push(body.technician);
      }
      if (body.line_items) {
        sets.push(`line_items = $${idx++}`);
        values.push(JSON.stringify(body.line_items));
      }
      if (body.labor_total !== undefined) {
        sets.push(`labor_total = $${idx++}`);
        values.push(body.labor_total);
      }
      if (body.parts_total !== undefined) {
        sets.push(`parts_total = $${idx++}`);
        values.push(body.parts_total);
      }
      if (body.tax !== undefined) {
        sets.push(`tax = $${idx++}`);
        values.push(body.tax);
      }
      if (body.grand_total !== undefined) {
        sets.push(`grand_total = $${idx++}`);
        values.push(body.grand_total);
      }
      if (body.diagnosis !== undefined) {
        sets.push(`diagnosis = $${idx++}`);
        values.push(body.diagnosis);
      }
      if (body.recommendations !== undefined) {
        sets.push(`recommendations = $${idx++}`);
        values.push(body.recommendations);
      }
      if (body.promised_date !== undefined) {
        sets.push(`promised_date = $${idx++}`);
        values.push(body.promised_date);
      }

      values.push(id, DEALER_ID);

      await query(
        `UPDATE repair_orders
         SET ${sets.join(", ")}
         WHERE id = $${idx++} AND dealer_id = $${idx}`,
        values,
      );

      return NextResponse.json({ success: true, id });
    } catch (err) {
      console.error("[api/admin/service/repair-orders/[id]] PATCH DB error:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ success: true, id, mode: "shadow" });
}
