import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackAnalyticsView } from "@/lib/analytics-hooks";
import {
  getTrimVelocity,
  getTrimVelocityDrillDown,
  type TrimVelocityOptions,
} from "@/lib/analytics-engine/trim-velocity";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/analytics/trim-velocity                                     */
/*                                                                             */
/*  Modes:                                                                     */
/*   1. List   — no `make` query param. Returns ranked rows + headline.        */
/*   2. Drill  — `?drill=1&make=…&model=…&trim=…&year=…`. Returns funded VINs. */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const { searchParams } = new URL(request.url);

  // Drill-down mode
  if (searchParams.get("drill") === "1") {
    const make = searchParams.get("make") ?? "";
    const model = searchParams.get("model") ?? "";
    const trim = searchParams.get("trim") ?? "";
    const yearRaw = searchParams.get("year");

    if (!make || !model || !trim || !yearRaw) {
      return NextResponse.json(
        { error: "drill requires make, model, trim, and year" },
        { status: 400 },
      );
    }

    const year = Number.parseInt(yearRaw, 10);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      return NextResponse.json(
        { error: "year must be a 4-digit integer" },
        { status: 400 },
      );
    }

    try {
      const data = await getTrimVelocityDrillDown(dealerId, { make, model, trim, year });
      trackAnalyticsView("analytics.trim_velocity_drilled", dealerId, {
        make,
        model,
        trim,
        year,
        row_count: data.rows.length,
      });
      return NextResponse.json(data);
    } catch (err) {
      console.error("[analytics/trim-velocity drill] Error:", err);
      return NextResponse.json(
        { error: "Failed to load drill-down" },
        { status: 500 },
      );
    }
  }

  // List mode
  const sortBy = (searchParams.get("sortBy") as TrimVelocityOptions["sortBy"]) ?? "fastest";
  const limit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const minFunded = Number.parseInt(searchParams.get("minFunded") ?? "1", 10);

  try {
    const data = await getTrimVelocity(dealerId, {
      sortBy: ["fastest", "slowest", "most-sold"].includes(String(sortBy)) ? sortBy : "fastest",
      limit: Number.isFinite(limit) ? limit : 100,
      minFundedCount: Number.isFinite(minFunded) ? minFunded : 1,
    });

    trackAnalyticsView("analytics.trim_velocity_viewed", dealerId, {
      sort_by: data.rows.length > 0 ? String(sortBy) : "none",
      row_count: data.rows.length,
      total_rows: data.totalRows,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("[analytics/trim-velocity] Error:", err);
    return NextResponse.json(
      { error: "Failed to load trim velocity" },
      { status: 500 },
    );
  }
}
