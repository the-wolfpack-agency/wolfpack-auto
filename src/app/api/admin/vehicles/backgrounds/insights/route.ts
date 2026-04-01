/**
 * GET /api/admin/vehicles/backgrounds/insights — Background performance analytics
 *
 * Returns aggregated engagement data showing which background presets
 * drive the most views, dwell time, clicks, and lead conversions.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import { getBackgroundInsights } from "@/lib/background-generator";

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const insights = getBackgroundInsights();

  trackSystem("system.analytics_queried", "server", {
    action: "background.insights_viewed",
    preset_count: insights.length,
    module: "backgrounds",
  });

  return NextResponse.json({
    insights,
    count: insights.length,
    note: insights.length === 0
      ? "No engagement data yet. Apply backgrounds to vehicles and let shoppers interact to start collecting data."
      : undefined,
  });
}
