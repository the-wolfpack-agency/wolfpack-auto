/**
 * GET /api/admin/vehicles/backgrounds/insights — Background performance analytics
 *
 * Returns engagement data for all background types (presets + custom + composites)
 * sorted by engagement score. Combines DB data with in-memory fallback.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import {
  getBackgroundInsights,
  getPresetById,
  calculateEngagementScore,
  calculateCTR,
  calculateLeadRate,
  type BackgroundInsight,
} from "@/lib/background-generator";

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;
  let insights: BackgroundInsight[] = [];

  // Try DB first for real data
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Aggregate from assignments
      const { rows } = await query(
        `SELECT
           vba.background_type,
           vba.preset_id,
           vba.custom_bg_id,
           COALESCE(cb.name, vba.preset_id, 'Unknown') AS name,
           SUM(vba.views) AS total_views,
           CASE WHEN SUM(vba.views) > 0
             THEN ROUND(SUM(vba.avg_dwell_ms::numeric * vba.views) / SUM(vba.views))
             ELSE 0
           END AS avg_dwell_ms,
           SUM(vba.clicks) AS total_clicks,
           SUM(vba.leads_generated) AS total_leads,
           COUNT(*) AS sample_size
         FROM vehicle_background_assignments vba
         LEFT JOIN custom_backgrounds cb ON cb.id = vba.custom_bg_id
         WHERE vba.dealer_id = $1 AND vba.is_active = true
         GROUP BY vba.background_type, vba.preset_id, vba.custom_bg_id, cb.name
         ORDER BY SUM(vba.views) DESC`,
        [dealerId],
      );

      insights = rows.map((r: Record<string, unknown>) => {
        const views = Number(r.total_views) || 0;
        const clicks = Number(r.total_clicks) || 0;
        const leads = Number(r.total_leads) || 0;
        const dwellMs = Number(r.avg_dwell_ms) || 0;
        const presetId = r.preset_id as string | null;

        let name = r.name as string;
        if (presetId) {
          const preset = getPresetById(presetId);
          if (preset) name = preset.name;
        }

        return {
          background_type: r.background_type as BackgroundInsight["background_type"],
          preset_id: presetId,
          custom_bg_id: r.custom_bg_id as string | null,
          name,
          total_views: views,
          avg_dwell_ms: dwellMs,
          total_clicks: clicks,
          total_leads: leads,
          ctr: calculateCTR(views, clicks),
          lead_rate: calculateLeadRate(views, leads),
          engagement_score: calculateEngagementScore({
            views,
            avg_dwell_ms: dwellMs,
            clicks,
            leads_generated: leads,
          }),
          sample_size: Number(r.sample_size) || 0,
        };
      });

      insights.sort((a, b) => b.engagement_score - a.engagement_score);
    } catch (err) {
      console.error("[api/insights] DB error:", err);
    }
  }

  // Fall back to in-memory store if DB returned nothing
  if (insights.length === 0) {
    insights = getBackgroundInsights();
  }

  trackBackground("background.insights_viewed", dealerId, {
    insight_count: insights.length,
  });

  return NextResponse.json({
    insights,
    count: insights.length,
    source: insights.length > 0 && process.env.DATABASE_URL ? "database" : "memory",
  });
}
