/**
 * GET /api/admin/oem/analytics
 *
 * Returns cross-dealer analytics: network-level KPIs, ranked dealer
 * performance, and network health signals.
 * Shadow mode (no DATABASE_URL): returns rich mock data immediately.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  getOemNetworkStats,
  getOemNetworkDealers,
} from "@/db/queries/oem";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  try {
    const [stats, dealers] = await Promise.all([
      getOemNetworkStats(),
      getOemNetworkDealers(undefined, 100),
    ]);

    // Rank dealers by lead volume
    const ranked = [...dealers].sort((a, b) => b.lead_count - a.lead_count);

    // Network health signals
    const top_performer = ranked[0] ?? null;
    const needs_attention =
      [...dealers]
        .filter((d) => d.enrolled_programs > 0 && d.avg_program_score != null)
        .sort(
          (a, b) => (a.avg_program_score ?? 0) - (b.avg_program_score ?? 0)
        )[0] ?? null;

    return NextResponse.json(
      {
        analytics: {
          stats,
          ranked_dealers: ranked,
          top_performer,
          needs_attention,
          network_health: {
            activation_rate:
              stats.total_dealers > 0
                ? Math.round(
                    (stats.active_dealers / stats.total_dealers) * 100
                  )
                : 0,
            avg_compliance: stats.avg_program_compliance,
            network_close_rate: stats.network_close_rate,
          },
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (err) {
    console.error("[api/admin/oem/analytics] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load OEM analytics" },
      { status: 500 }
    );
  }
}
