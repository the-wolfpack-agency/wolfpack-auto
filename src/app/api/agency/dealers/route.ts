import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DealerSummary {
  id: string;
  name: string;
  slug: string;
  leads_count: number;
  deals_count: number;
  inventory_count: number;
  revenue_mtd: number;
  status: "active" | "onboarding" | "suspended";
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow mode sample data                                                    */
/* -------------------------------------------------------------------------- */

const SAMPLE_DEALERS: DealerSummary[] = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Wolfpack Auto",
    slug: "wolfpack-auto",
    leads_count: 147,
    deals_count: 23,
    inventory_count: 89,
    revenue_mtd: 412500,
    status: "active",
    created_at: "2025-06-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    name: "Summit Auto Group",
    slug: "summit-auto",
    leads_count: 92,
    deals_count: 14,
    inventory_count: 56,
    revenue_mtd: 287000,
    status: "active",
    created_at: "2025-09-15T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-a000-000000000003",
    name: "Mile High Motors",
    slug: "mile-high-motors",
    leads_count: 34,
    deals_count: 5,
    inventory_count: 31,
    revenue_mtd: 98000,
    status: "onboarding",
    created_at: "2026-02-20T00:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/agency/dealers — list all dealers with summary stats              */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // In production, check for agency-level role
  // For now, admin role is sufficient
  if (authResult.user.role !== "admin") {
    return NextResponse.json(
      { error: "Agency-level access required" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ dealers: SAMPLE_DEALERS });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT
        d.id,
        d.name,
        d.slug,
        d.status,
        d.created_at,
        COALESCE(l.cnt, 0) AS leads_count,
        COALESCE(dl.cnt, 0) AS deals_count,
        COALESCE(v.cnt, 0) AS inventory_count,
        COALESCE(r.total, 0) AS revenue_mtd
       FROM dealers d
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt FROM leads WHERE dealer_id = d.id AND deleted_at IS NULL
       ) l ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt FROM deals WHERE dealer_id = d.id
       ) dl ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt FROM vehicles WHERE dealer_id = d.id AND deleted_at IS NULL
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM deals
         WHERE dealer_id = d.id
           AND created_at >= date_trunc('month', CURRENT_DATE)
       ) r ON true
       ORDER BY d.name`,
    );
    return NextResponse.json({ dealers: result.rows });
  } catch (err) {
    console.error("[api/agency/dealers] DB error:", err);
    return NextResponse.json({ dealers: SAMPLE_DEALERS });
  }
}
