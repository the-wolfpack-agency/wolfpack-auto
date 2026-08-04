/**
 * GET /api/operator/stats — operator dashboard summary.
 *
 * Returns:
 *   total_dealers, dealers_active, dealers_in_onboarding,
 *   dealers_active_7d, recent_actions
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWolfpackStaff, isWolfpackStaff } from "@/lib/operator-auth";

interface OperatorStats {
  total_dealers: number;
  dealers_active: number;
  dealers_suspended: number;
  dealers_in_onboarding: number;
  dealers_active_7d: number;
  recent_actions: Array<{
    id: number;
    staff_name: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    created_at: string;
  }>;
}

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    const stats: OperatorStats = {
      total_dealers: 1,
      dealers_active: 1,
      dealers_suspended: 0,
      dealers_in_onboarding: 0,
      dealers_active_7d: 1,
      recent_actions: [],
    };
    return NextResponse.json(stats);
  }

  try {
    const { query } = await import("@/lib/db");

    const totalsResult = await query<{
      total_dealers: number;
      dealers_active: number;
      dealers_suspended: number;
      dealers_active_7d: number;
    }>(
      `SELECT
         COUNT(*)::int AS total_dealers,
         COUNT(*) FILTER (WHERE is_active)::int AS dealers_active,
         COUNT(*) FILTER (WHERE NOT is_active)::int AS dealers_suspended,
         (SELECT COUNT(DISTINCT dealer_id)::int FROM dealer_users WHERE last_login > NOW() - INTERVAL '7 days') AS dealers_active_7d
       FROM dealers`,
    );

    // "In onboarding" = active dealer + no leads + no inventory yet (best-effort heuristic).
    let onboarding = 0;
    try {
      const onb = await query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
           FROM dealers d
          WHERE d.is_active
            AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.dealer_id = d.id)
            AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.dealer_id = d.id)`,
      );
      onboarding = Number(onb.rows[0]?.cnt ?? 0);
    } catch { /* tables may not exist on a fresh DB */ }

    let recent: OperatorStats["recent_actions"] = [];
    try {
      const recentResult = await query<{
        id: number;
        staff_name: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        created_at: string;
      }>(
        `SELECT a.id, s.full_name AS staff_name, a.action, a.target_type, a.target_id, a.created_at
           FROM wolfpack_staff_audit_log a
      LEFT JOIN wolfpack_staff s ON s.id = a.staff_id
          ORDER BY a.created_at DESC
          LIMIT 12`,
      );
      recent = recentResult.rows;
    } catch { /* table may not exist on pre-migration deploys */ }

    const stats: OperatorStats = {
      total_dealers: Number(totalsResult.rows[0]?.total_dealers ?? 0),
      dealers_active: Number(totalsResult.rows[0]?.dealers_active ?? 0),
      dealers_suspended: Number(totalsResult.rows[0]?.dealers_suspended ?? 0),
      dealers_in_onboarding: onboarding,
      dealers_active_7d: Number(totalsResult.rows[0]?.dealers_active_7d ?? 0),
      recent_actions: recent,
    };
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[operator/stats] GET error:", err);
    return NextResponse.json({
      total_dealers: 0,
      dealers_active: 0,
      dealers_suspended: 0,
      dealers_in_onboarding: 0,
      dealers_active_7d: 0,
      recent_actions: [],
    });
  }
}
