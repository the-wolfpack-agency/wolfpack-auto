/**
 * GET /api/admin/heatmaps
 *
 * Returns real click / scroll / attention heatmap data aggregated from
 * `analytics_events`. The endpoint NEVER returns synthetic fallbacks —
 * if no events exist, it returns the empty contract `{ noData: true,
 * points: [] | scrollBands: [] | attentionZones: [], topPages: [] }`
 * so the UI can render an honest "No interactions tracked yet" state.
 *
 * Click events:   event_type='click', metadata.x / metadata.y / metadata.text.
 * Scroll events:  event_type='scroll', action='scroll_25|50|75|90|100', metadata.depth.
 * Attention:      event_type='cursor_heatmap', action='linger', metadata.x / .y / .duration_ms.
 *
 * Top pages: derived from analytics_events page-view counts via
 * `getTopPages` in src/lib/heatmap.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackHeatmap } from "@/lib/analytics-hooks";
import {
  getTopPages,
  type HeatmapType,
  type HeatmapPoint,
  type ScrollBand,
  type AttentionZone,
} from "@/lib/heatmap";

interface Stats {
  totalClicks: number;
  avgScrollDepth: number;
  hottestElement: string;
}

const EMPTY_STATS: Stats = {
  totalClicks: 0,
  avgScrollDepth: 0,
  hottestElement: "",
};

/* When the resolved dealer is the canonical default, also include
   pre-fix events whose dealer_id is null. Multi-dealer deployments
   keep strict isolation — only the canonical dealer "absorbs"
   orphan events. */
const CANONICAL_DEALER_ID = "00000000-0000-4000-a000-000000000001";
function dealerFilterClause(paramIdx: number): string {
  return `(metadata->>'dealer_id' = $${paramIdx} OR (metadata->>'dealer_id' IS NULL AND $${paramIdx} = '${CANONICAL_DEALER_ID}'))`;
}

async function loadClickPoints(
  page: string,
  dealerId: string,
  since: string,
): Promise<HeatmapPoint[]> {
  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT metadata->>'x' AS x,
            metadata->>'y' AS y,
            COUNT(*)::int AS count
       FROM analytics_events
      WHERE event_type = 'click'
        AND page = $1
        AND ${dealerFilterClause(2)}
        AND timestamp >= $3
        AND metadata ? 'x' AND metadata ? 'y'
      GROUP BY metadata->>'x', metadata->>'y'
      ORDER BY count DESC
      LIMIT 500`,
    [page, dealerId, since],
  );
  const points = result.rows
    .map((r: Record<string, unknown>) => ({
      x: Number(r.x),
      y: Number(r.y),
      count: Number(r.count),
      intensity: 0,
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length === 0) return [];
  const maxCount = Math.max(...points.map((p) => p.count), 1);
  for (const p of points) p.intensity = p.count / maxCount;
  return points;
}

async function loadScrollBands(
  page: string,
  dealerId: string,
  since: string,
): Promise<{ bands: ScrollBand[]; totalVisitors: number; avgDepth: number }> {
  const { query } = await import("@/lib/db");
  /* For each session, take the deepest scroll threshold reached.
     scroll_100 wins over scroll_75 wins over scroll_50, etc. We
     extract the integer threshold from the action suffix. */
  const result = await query(
    `WITH per_session AS (
       SELECT session_id,
              MAX((regexp_replace(action, '^scroll_', ''))::int) AS max_depth
         FROM analytics_events
        WHERE event_type = 'scroll'
          AND page = $1
          AND ${dealerFilterClause(2)}
          AND timestamp >= $3
          AND action ~ '^scroll_[0-9]+$'
        GROUP BY session_id
     )
     SELECT max_depth, COUNT(*)::int AS sessions
       FROM per_session
      GROUP BY max_depth`,
    [page, dealerId, since],
  );
  const totalVisitors = result.rows.reduce(
    (s: number, r: Record<string, unknown>) => s + Number(r.sessions),
    0,
  );
  if (totalVisitors === 0) {
    return { bands: [], totalVisitors: 0, avgDepth: 0 };
  }
  /* Visitors at-least-this-deep — descending: 75-100 includes only
     sessions whose max_depth >= 75; 50-75 includes max_depth ∈ [50,75)
     etc. The "0-25%" band is everyone (every session reached 0). */
  const buckets = [
    { label: "0-25%", min: 0, max: 25 },
    { label: "25-50%", min: 25, max: 50 },
    { label: "50-75%", min: 50, max: 75 },
    { label: "75-100%", min: 75, max: 100 },
  ];
  const bands = buckets.map((b) => {
    const count = result.rows
      .filter(
        (r: Record<string, unknown>) => Number(r.max_depth) >= b.min,
      )
      .reduce(
        (s: number, r: Record<string, unknown>) => s + Number(r.sessions),
        0,
      );
    return {
      label: b.label,
      minPercent: b.min,
      maxPercent: b.max,
      visitorCount: count,
      visitorPercent: Math.round((count / totalVisitors) * 100),
    };
  });
  const totalDepth = result.rows.reduce(
    (s: number, r: Record<string, unknown>) =>
      s + Number(r.max_depth) * Number(r.sessions),
    0,
  );
  const avgDepth = Math.round(totalDepth / totalVisitors);
  return { bands, totalVisitors, avgDepth };
}

async function loadAttentionZones(
  page: string,
  dealerId: string,
  since: string,
): Promise<AttentionZone[]> {
  const { query } = await import("@/lib/db");
  /* Bin cursor_heatmap linger events by 100px y-bands. Sum dwell
     duration per band, then normalize by the hottest band so the UI
     gets 0..1 intensity it can render. */
  const result = await query(
    `SELECT (FLOOR((metadata->>'y')::numeric / 100) * 100)::int AS y_band,
            SUM(COALESCE((metadata->>'duration_ms')::int, 0))::int AS dwell_ms
       FROM analytics_events
      WHERE event_type = 'cursor_heatmap'
        AND action IN ('linger', 'position')
        AND page = $1
        AND ${dealerFilterClause(2)}
        AND timestamp >= $3
        AND metadata ? 'y'
      GROUP BY y_band
      ORDER BY y_band ASC
      LIMIT 50`,
    [page, dealerId, since],
  );
  const rows = result.rows.map((r: Record<string, unknown>) => ({
    y: Number(r.y_band),
    height: 100,
    dwellMs: Number(r.dwell_ms) || 0,
  }));
  if (rows.length === 0) return [];
  const maxDwell = Math.max(...rows.map((r) => r.dwellMs), 1);
  return rows.map((r) => ({
    ...r,
    intensity: r.dwellMs / maxDwell,
  }));
}

async function loadStats(
  page: string,
  dealerId: string,
  since: string,
): Promise<Stats> {
  const { query } = await import("@/lib/db");
  const [clicksRow, scrollRow, hottestRow] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total
         FROM analytics_events
        WHERE event_type = 'click'
          AND page = $1
          AND ${dealerFilterClause(2)}
          AND timestamp >= $3`,
      [page, dealerId, since],
    ),
    query(
      `SELECT AVG(d)::numeric AS avg_depth
         FROM (
           SELECT MAX((regexp_replace(action, '^scroll_', ''))::int) AS d
             FROM analytics_events
            WHERE event_type = 'scroll'
              AND page = $1
              AND ${dealerFilterClause(2)}
              AND timestamp >= $3
              AND action ~ '^scroll_[0-9]+$'
            GROUP BY session_id
         ) sub`,
      [page, dealerId, since],
    ),
    query(
      `SELECT COALESCE(metadata->>'text', metadata->>'tag', 'unknown') AS label,
              COUNT(*)::int AS clicks
         FROM analytics_events
        WHERE event_type = 'click'
          AND page = $1
          AND ${dealerFilterClause(2)}
          AND timestamp >= $3
        GROUP BY label
        ORDER BY clicks DESC
        LIMIT 1`,
      [page, dealerId, since],
    ),
  ]);
  const totalClicks = Number(clicksRow.rows[0]?.total ?? 0);
  const avgScrollDepth = Math.round(
    Number(scrollRow.rows[0]?.avg_depth ?? 0),
  );
  const hottestElement = String(hottestRow.rows[0]?.label ?? "");
  return { totalClicks, avgScrollDepth, hottestElement };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  /* Resolve dealer_id the SAME way the ingest endpoint does — by
     calling resolveTenant on the request hostname. The session-based
     getDealerId(auth) falls back to a hardcoded "00000000-..." UUID,
     which doesn't match the dealer_id that ingest stamps onto events
     for the same host. Without this symmetry the query filtered out
     every event the ingest had just persisted (regression observed
     2026-05-02 — 93 events in DB, 0 visible to the heatmap). */
  let dealerId = getDealerId(auth);
  try {
    const hostname =
      request.headers.get("host") ?? new URL(request.url).hostname;
    const { resolveTenant } = await import("@/lib/tenant-resolver");
    const tenant = await resolveTenant(hostname);
    if (tenant?.dealer?.id) dealerId = tenant.dealer.id;
  } catch {
    /* keep the session-derived fallback */
  }
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "/";
  const type = (searchParams.get("type") ?? "click") as HeatmapType;
  const daysRaw = parseInt(searchParams.get("days") ?? "7", 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  /* DATABASE_URL absent → tell the UI honestly. No synthetic data. */
  if (!process.env.DATABASE_URL) {
    trackHeatmap("heatmap.viewed", dealerId, {
      page,
      type,
      days,
      no_database: true,
    });
    return NextResponse.json({
      type,
      pageUrl: page,
      totalEvents: 0,
      dateRange: { start: since, end: new Date().toISOString() },
      points: [],
      scrollBands: [],
      attentionZones: [],
      stats: EMPTY_STATS,
      topPages: [],
      noData: true,
      noDataReason: "database_unavailable",
    });
  }

  try {
    const [topPages, stats] = await Promise.all([
      getTopPages(dealerId, 7),
      loadStats(page, dealerId, since),
    ]);

    if (type === "click") {
      const points = await loadClickPoints(page, dealerId, since);
      const totalEvents = points.reduce((s, p) => s + p.count, 0);
      trackHeatmap("heatmap.viewed", dealerId, {
        page,
        type,
        days,
        point_count: points.length,
      });
      return NextResponse.json({
        type: "click",
        pageUrl: page,
        totalEvents,
        dateRange: { start: since, end: new Date().toISOString() },
        points,
        stats,
        topPages,
        noData: points.length === 0,
        ...(points.length === 0
          ? { noDataReason: "no_click_events_in_window" }
          : {}),
      });
    }

    if (type === "scroll") {
      const { bands, totalVisitors, avgDepth } = await loadScrollBands(
        page,
        dealerId,
        since,
      );
      trackHeatmap("heatmap.viewed", dealerId, {
        page,
        type,
        days,
        visitor_count: totalVisitors,
      });
      return NextResponse.json({
        type: "scroll",
        pageUrl: page,
        totalEvents: totalVisitors,
        dateRange: { start: since, end: new Date().toISOString() },
        scrollBands: bands,
        stats: { ...stats, avgScrollDepth: avgDepth },
        topPages,
        noData: totalVisitors === 0,
        ...(totalVisitors === 0
          ? { noDataReason: "no_scroll_events_in_window" }
          : {}),
      });
    }

    /* attention */
    const zones = await loadAttentionZones(page, dealerId, since);
    const totalEvents = zones.reduce((s, z) => s + z.dwellMs, 0);
    trackHeatmap("heatmap.viewed", dealerId, {
      page,
      type,
      days,
      zone_count: zones.length,
    });
    return NextResponse.json({
      type: "attention",
      pageUrl: page,
      totalEvents,
      dateRange: { start: since, end: new Date().toISOString() },
      attentionZones: zones,
      stats,
      topPages,
      noData: zones.length === 0,
      ...(zones.length === 0
        ? { noDataReason: "no_attention_events_in_window" }
        : {}),
    });
  } catch (err) {
    /* Bubble a real error rather than masking with demo data. */
    return NextResponse.json(
      {
        type,
        pageUrl: page,
        totalEvents: 0,
        dateRange: { start: since, end: new Date().toISOString() },
        points: [],
        scrollBands: [],
        attentionZones: [],
        stats: EMPTY_STATS,
        topPages: [],
        noData: true,
        noDataReason: "query_failed",
        error: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
