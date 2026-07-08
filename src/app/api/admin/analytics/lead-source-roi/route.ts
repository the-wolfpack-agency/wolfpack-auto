import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackAnalyticsView } from "@/lib/analytics-hooks";
import {
  getLeadSourceRoi,
  getLeadSourceDrillDown,
  type LeadSourceRoiOptions,
} from "@/lib/analytics-engine/lead-source-roi";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/analytics/lead-source-roi                                   */
/*                                                                             */
/*  Modes:                                                                     */
/*   1. Rollup — no `source` query param. Ranked rows + headline.              */
/*   2. Drill  — `?drill=1&source=…`. Lists individual leads.                  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Shadow mode (no DATABASE_URL) is handled inside the analytics-engine
  // library, which returns a representative demo dataset. The route stays
  // uniform so authorization + analytics-event emission run identically
  // online and offline.
  const dealerId = getDealerId(auth);
  const { searchParams } = new URL(request.url);

  // Drill-down mode
  if (searchParams.get("drill") === "1") {
    const source = searchParams.get("source") ?? "";
    if (!source) {
      return NextResponse.json(
        { error: "drill requires source" },
        { status: 400 },
      );
    }

    try {
      const data = await getLeadSourceDrillDown(dealerId, source);
      trackAnalyticsView("analytics.lead_source_roi_drilled", dealerId, {
        source,
        row_count: data.rows.length,
      });
      return NextResponse.json(data);
    } catch (err) {
      console.error("[analytics/lead-source-roi drill] Error:", err);
      return NextResponse.json(
        { error: "Failed to load drill-down" },
        { status: 500 },
      );
    }
  }

  // Rollup mode
  const sortBy =
    (searchParams.get("sortBy") as LeadSourceRoiOptions["sortBy"]) ?? "gross";
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const minLeads = Number.parseInt(searchParams.get("minLeads") ?? "1", 10);

  try {
    const data = await getLeadSourceRoi(dealerId, {
      sortBy: ["gross", "conversion", "leads", "time-to-close"].includes(String(sortBy))
        ? sortBy
        : "gross",
      limit: Number.isFinite(limit) ? limit : 50,
      minLeads: Number.isFinite(minLeads) ? minLeads : 1,
    });

    trackAnalyticsView("analytics.lead_source_roi_viewed", dealerId, {
      sort_by: String(sortBy),
      row_count: data.rows.length,
      total_rows: data.totalRows,
      cost_not_configured: data.costNotConfigured,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("[analytics/lead-source-roi] Error:", err);
    return NextResponse.json(
      { error: "Failed to load lead source ROI" },
      { status: 500 },
    );
  }
}
