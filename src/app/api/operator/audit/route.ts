/**
 * GET /api/operator/audit — list recent staff actions.
 *
 * Operator+ visibility. Pagination via ?limit + ?offset (defaults 50 / 0).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWolfpackStaff, isWolfpackStaff } from "@/lib/operator-auth";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ events: [], total: 0, pagination: { limit, offset } });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT a.id, a.staff_id, s.full_name AS staff_name, s.email AS staff_email,
              a.action, a.target_type, a.target_id, a.metadata, a.ip_address,
              a.created_at
         FROM wolfpack_staff_audit_log a
    LEFT JOIN wolfpack_staff s ON s.id = a.staff_id
        ORDER BY a.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return NextResponse.json({
      events: result.rows,
      total: result.rows.length, // we accept the inexpensive shorthand here; UI is paginated
      pagination: { limit, offset },
    });
  } catch (err) {
    console.error("[operator/audit] GET error:", err);
    return NextResponse.json({ events: [], total: 0, pagination: { limit, offset } });
  }
}
