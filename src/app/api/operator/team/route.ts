/**
 * GET /api/operator/team — list all Wolfpack staff members.
 *
 * Operator+ can view. Disabled staff are included with disabled_at set.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWolfpackStaff, isWolfpackStaff } from "@/lib/operator-auth";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      staff: [
        {
          id: "00000000-0000-4000-c000-000000000001",
          email: "ops@wolfpackauto.com",
          full_name: "Operations Demo",
          role: "admin",
          mfa_enabled: false,
          last_login_at: null,
          created_at: new Date().toISOString(),
          disabled_at: null,
        },
      ],
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT id, email, full_name, role, mfa_enabled, last_login_at, created_at, disabled_at
         FROM wolfpack_staff
        ORDER BY full_name, email`,
    );
    return NextResponse.json({ staff: result.rows });
  } catch (err) {
    console.error("[operator/team] GET error:", err);
    return NextResponse.json({ staff: [] });
  }
}
