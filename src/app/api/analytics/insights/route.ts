import { NextRequest, NextResponse } from "next/server";
import { queryInsights, generateInsights, getBufferStats } from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  GET /api/analytics/insights — query behavioral insights            */
/*  Used by chat widget, dashboards, and external integrations         */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  const category = request.nextUrl.searchParams.get("category");
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10),
    500,
  );

  // If no query, return current in-memory insights (no vector search needed)
  if (!query) {
    const insights = generateInsights();
    const stats = getBufferStats();

    // Filter by category if specified
    const filtered = category
      ? insights.filter((i) => i.category === category)
      : insights;

    return NextResponse.json({
      insights: filtered.slice(0, limit),
      stats,
    });
  }

  // Vector search for relevant insights
  const filter = category
    ? { must: [{ key: "category", match: { value: category } }] }
    : undefined;

  const results = await queryInsights(query, limit, filter);

  return NextResponse.json({
    query,
    insights: results,
    count: results.length,
  });
}
