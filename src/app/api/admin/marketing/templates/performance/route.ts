import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getTemplatePerformance } from "@/lib/canva-integration";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/marketing/templates/performance                              */
/* Template performance analytics.                                             */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const performance = getTemplatePerformance();

  const totalUses = performance.reduce((sum, p) => sum + p.total_uses, 0);
  const topPerformers = performance.filter((p) => p.top_performer);

  return NextResponse.json({
    performance,
    summary: {
      total_templates: performance.length,
      total_uses: totalUses,
      top_performers: topPerformers.length,
      avg_engagement_rate:
        performance.length > 0
          ? Math.round(
              (performance.reduce((s, p) => s + p.avg_engagement_rate, 0) /
                performance.length) *
                10,
            ) / 10
          : 0,
    },
  });
}
