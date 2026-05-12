/**
 * GET /api/admin/analytics/tech-utilization
 *
 * Read-only operator surface. Returns the weekly utilization grid from
 * `v_tech_utilization` (migration 072). 200 with cells + headline + axes; 401
 * if unauthenticated. Filters honored: weekFrom, weekTo, techId, bayId,
 * drilled. Shadow mode returns demo fixture data.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackAnalyticsView } from "@/lib/analytics-hooks";
import type { TechUtilizationFilters } from "@/lib/analytics-engine/tech-utilization";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const sp = new URL(request.url).searchParams;
  const filters: TechUtilizationFilters = {};

  const weekFrom = sp.get("weekFrom");
  const weekTo = sp.get("weekTo");
  if (weekFrom && ISO_DATE.test(weekFrom)) filters.weekFrom = weekFrom;
  if (weekTo && ISO_DATE.test(weekTo)) filters.weekTo = weekTo;

  const techId = sp.get("techId");
  if (techId) filters.techId = techId;

  const bayId = sp.get("bayId");
  if (bayId) filters.bayId = bayId;

  const drilled = sp.get("drilled") === "true";

  if (!process.env.DATABASE_URL) {
    const { demoUtilization } = await import(
      "@/lib/analytics-engine/tech-utilization"
    );
    const result = demoUtilization();
    trackAnalyticsView("analytics.tech_utilization_viewed", dealerId, {
      shadow: true,
      filter_count: Object.keys(filters).length,
    });
    if (drilled) {
      trackAnalyticsView("analytics.tech_utilization_drilled", dealerId, {
        shadow: true,
      });
    }
    return NextResponse.json({ ...result, shadow: true, dealerId });
  }

  const { getTechUtilization } = await import(
    "@/lib/analytics-engine/tech-utilization"
  );
  const result = await getTechUtilization(dealerId, filters);

  trackAnalyticsView("analytics.tech_utilization_viewed", dealerId, {
    filter_count: Object.keys(filters).length,
    cell_count: result.cells.length,
  });
  if (drilled) {
    trackAnalyticsView("analytics.tech_utilization_drilled", dealerId, {
      filter_count: Object.keys(filters).length,
      tech: filters.techId ?? "",
      bay: filters.bayId ?? "",
    });
  }
  return NextResponse.json({ ...result, dealerId });
}
