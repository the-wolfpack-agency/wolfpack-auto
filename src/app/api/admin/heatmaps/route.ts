import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import type { HeatmapType } from "@/lib/heatmap";

/* -------------------------------------------------------------------------- */
/*  Demo data (shadow mode — no DATABASE_URL)                                  */
/* -------------------------------------------------------------------------- */

const DEMO_CLICK_DATA = [
  // Navigation area cluster
  { x: 120, y: 35, count: 342, intensity: 1.0 },
  { x: 240, y: 35, count: 287, intensity: 0.84 },
  { x: 360, y: 35, count: 198, intensity: 0.58 },
  { x: 480, y: 35, count: 156, intensity: 0.46 },
  // Hero CTA cluster
  { x: 400, y: 320, count: 524, intensity: 1.0 },
  { x: 420, y: 340, count: 489, intensity: 0.93 },
  // Vehicle card clusters
  { x: 200, y: 580, count: 312, intensity: 0.60 },
  { x: 400, y: 580, count: 278, intensity: 0.53 },
  { x: 600, y: 580, count: 245, intensity: 0.47 },
  // Secondary CTA
  { x: 400, y: 850, count: 189, intensity: 0.36 },
  // Footer links
  { x: 150, y: 1200, count: 67, intensity: 0.13 },
  { x: 300, y: 1200, count: 45, intensity: 0.09 },
];

const DEMO_SCROLL_DATA = {
  scrollBands: [
    { label: "0-25%", minPercent: 0, maxPercent: 25, visitorCount: 8320, visitorPercent: 100 },
    { label: "25-50%", minPercent: 25, maxPercent: 50, visitorCount: 7072, visitorPercent: 85 },
    { label: "50-75%", minPercent: 50, maxPercent: 75, visitorCount: 5410, visitorPercent: 65 },
    { label: "75-100%", minPercent: 75, maxPercent: 100, visitorCount: 3162, visitorPercent: 38 },
  ],
  totalVisitors: 8320,
  avgScrollDepth: 62,
};

const DEMO_ATTENTION_DATA = {
  attentionZones: [
    { y: 0, height: 100, dwellMs: 4200, intensity: 0.58 },
    { y: 100, height: 200, dwellMs: 7200, intensity: 1.0 },
    { y: 300, height: 200, dwellMs: 6100, intensity: 0.85 },
    { y: 500, height: 200, dwellMs: 5800, intensity: 0.81 },
    { y: 700, height: 200, dwellMs: 3200, intensity: 0.44 },
    { y: 900, height: 200, dwellMs: 2100, intensity: 0.29 },
    { y: 1100, height: 200, dwellMs: 1400, intensity: 0.19 },
  ],
};

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/heatmaps                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "/";
  const type = (searchParams.get("type") ?? "click") as HeatmapType;
  const days = parseInt(searchParams.get("days") ?? "7", 10);
  const isCompare = searchParams.get("compare") === "true";
  const compareDays = parseInt(searchParams.get("compareDays") ?? "7", 10);

  // Shadow mode — return demo data
  if (!process.env.DATABASE_URL) {
    if (type === "click") {
      const response: Record<string, unknown> = {
        type: "click",
        pageUrl: page,
        totalEvents: DEMO_CLICK_DATA.reduce((s, p) => s + p.count, 0),
        dateRange: {
          start: new Date(Date.now() - days * 86400000).toISOString(),
          end: new Date().toISOString(),
        },
        points: DEMO_CLICK_DATA,
        stats: {
          totalClicks: DEMO_CLICK_DATA.reduce((s, p) => s + p.count, 0),
          avgScrollDepth: 62,
          hottestElement: "Hero CTA Button",
        },
        topPages: [
          { url: "/", pageviews: 12450, uniqueVisitors: 8320 },
          { url: "/inventory", pageviews: 9870, uniqueVisitors: 6540 },
          { url: "/inventory/2024-ford-f150", pageviews: 3210, uniqueVisitors: 2890 },
          { url: "/financing", pageviews: 2780, uniqueVisitors: 2100 },
          { url: "/trade-in", pageviews: 1950, uniqueVisitors: 1620 },
        ],
      };

      // Side-by-side comparison mode
      if (isCompare) {
        const compareData = DEMO_CLICK_DATA.map((p) => ({
          ...p,
          count: Math.round(p.count * (0.7 + Math.random() * 0.6)),
          intensity: Math.min(1, p.intensity * (0.7 + Math.random() * 0.6)),
        }));
        response.points = compareData;
        response.diff = {
          increased: DEMO_CLICK_DATA.filter((_, i) => i % 2 === 0).map((p) => ({
            x: p.x, y: p.y, count: Math.round(p.count * 0.2), intensity: 0.6,
          })),
          decreased: DEMO_CLICK_DATA.filter((_, i) => i % 2 === 1).map((p) => ({
            x: p.x, y: p.y, count: Math.round(p.count * 0.15), intensity: 0.4,
          })),
          netChangePercent: 12,
        };
      }

      return NextResponse.json(response);
    }

    if (type === "scroll") {
      return NextResponse.json({
        type: "scroll",
        pageUrl: page,
        totalEvents: DEMO_SCROLL_DATA.totalVisitors,
        dateRange: {
          start: new Date(Date.now() - days * 86400000).toISOString(),
          end: new Date().toISOString(),
        },
        scrollBands: DEMO_SCROLL_DATA.scrollBands,
        stats: {
          totalClicks: 2832,
          avgScrollDepth: DEMO_SCROLL_DATA.avgScrollDepth,
          hottestElement: "Vehicle Cards Section",
        },
        topPages: [
          { url: "/", pageviews: 12450, uniqueVisitors: 8320 },
          { url: "/inventory", pageviews: 9870, uniqueVisitors: 6540 },
        ],
      });
    }

    // attention
    return NextResponse.json({
      type: "attention",
      pageUrl: page,
      totalEvents: 8320,
      dateRange: {
        start: new Date(Date.now() - days * 86400000).toISOString(),
        end: new Date().toISOString(),
      },
      attentionZones: DEMO_ATTENTION_DATA.attentionZones,
      stats: {
        totalClicks: 2832,
        avgScrollDepth: 62,
        hottestElement: "Hero Section (100-300px)",
      },
      topPages: [
        { url: "/", pageviews: 12450, uniqueVisitors: 8320 },
        { url: "/inventory", pageviews: 9870, uniqueVisitors: 6540 },
      ],
    });
  }

  // Production — query from analytics_events
  const { query } = await import("@/lib/db");
  const since = new Date(Date.now() - days * 86400000).toISOString();

  if (type === "click") {
    const result = await query(
      `SELECT metadata->>'x' AS x, metadata->>'y' AS y, COUNT(*) AS count
       FROM analytics_events
       WHERE action = 'click'
         AND page = $1
         AND metadata->>'dealer_id' = $2
         AND timestamp >= $3
       GROUP BY metadata->>'x', metadata->>'y'
       ORDER BY count DESC
       LIMIT 500`,
      [page, dealerId, since],
    );

    const points = result.rows.map((r: Record<string, unknown>) => ({
      x: Number(r.x),
      y: Number(r.y),
      count: Number(r.count),
      intensity: 0, // will be normalized client-side
    }));

    const maxCount = Math.max(...points.map((p: { count: number }) => p.count), 1);
    for (const p of points) {
      p.intensity = p.count / maxCount;
    }

    return NextResponse.json({
      type: "click",
      pageUrl: page,
      totalEvents: points.reduce((s: number, p: { count: number }) => s + p.count, 0),
      dateRange: { start: since, end: new Date().toISOString() },
      points,
    });
  }

  // Scroll and attention follow similar patterns
  return NextResponse.json({
    type,
    pageUrl: page,
    totalEvents: 0,
    dateRange: { start: since, end: new Date().toISOString() },
  });
}
