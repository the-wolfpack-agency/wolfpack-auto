/**
 * Heatmap Visualization — Core logic for click, scroll, and attention heatmaps.
 *
 * Aggregates existing analytics event data into visual density maps
 * that replace the need for external tools like Hotjar.
 */

import { trackHeatmap } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HeatmapType = "click" | "scroll" | "attention";

export interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number; // 0-1 normalized
  count: number;
}

export interface ScrollBand {
  label: string;
  minPercent: number;
  maxPercent: number;
  visitorCount: number;
  visitorPercent: number;
}

export interface AttentionZone {
  y: number;
  height: number;
  dwellMs: number;
  intensity: number; // 0-1 normalized
}

export interface HeatmapData {
  type: HeatmapType;
  pageUrl: string;
  totalEvents: number;
  dateRange: { start: string; end: string };
  points?: HeatmapPoint[];
  scrollBands?: ScrollBand[];
  attentionZones?: AttentionZone[];
}

export interface TopPage {
  url: string;
  pageviews: number;
  uniqueVisitors: number;
}

/* -------------------------------------------------------------------------- */
/*  Click heatmap                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Aggregate click events into a density grid for a given page.
 * Clusters nearby clicks (within gridSize px) into single points.
 */
export function aggregateClickHeatmap(
  clicks: { x: number; y: number }[],
  gridSize = 20,
): HeatmapPoint[] {
  if (clicks.length === 0) return [];

  const grid = new Map<string, { x: number; y: number; count: number }>();

  for (const click of clicks) {
    const gx = Math.floor(click.x / gridSize) * gridSize + gridSize / 2;
    const gy = Math.floor(click.y / gridSize) * gridSize + gridSize / 2;
    const key = `${gx},${gy}`;
    const existing = grid.get(key);
    if (existing) {
      existing.count++;
    } else {
      grid.set(key, { x: gx, y: gy, count: 1 });
    }
  }

  const points = Array.from(grid.values());
  const maxCount = Math.max(...points.map((p) => p.count));

  return points.map((p) => ({
    x: p.x,
    y: p.y,
    count: p.count,
    intensity: maxCount > 0 ? p.count / maxCount : 0,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Scroll heatmap                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Build scroll depth bands from scroll event data.
 * Each band shows what percentage of visitors reached that depth.
 */
export function aggregateScrollHeatmap(
  scrollEvents: { maxDepthPercent: number }[],
  totalVisitors: number,
): ScrollBand[] {
  if (totalVisitors === 0) return [];

  const bands = [
    { label: "0-25%", minPercent: 0, maxPercent: 25 },
    { label: "25-50%", minPercent: 25, maxPercent: 50 },
    { label: "50-75%", minPercent: 50, maxPercent: 75 },
    { label: "75-100%", minPercent: 75, maxPercent: 100 },
  ];

  return bands.map((band) => {
    const count = scrollEvents.filter(
      (e) => e.maxDepthPercent >= band.minPercent,
    ).length;
    return {
      ...band,
      visitorCount: count,
      visitorPercent: Math.round((count / totalVisitors) * 100),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Attention heatmap                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Combine viewport dwell time data into attention zones.
 * Zones with more dwell time get higher intensity.
 */
export function aggregateAttentionHeatmap(
  dwellData: { y: number; height: number; dwellMs: number }[],
): AttentionZone[] {
  if (dwellData.length === 0) return [];

  const maxDwell = Math.max(...dwellData.map((d) => d.dwellMs));

  return dwellData.map((d) => ({
    y: d.y,
    height: d.height,
    dwellMs: d.dwellMs,
    intensity: maxDwell > 0 ? d.dwellMs / maxDwell : 0,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Normalization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Normalize heatmap points to 0-1 intensity values.
 * If maxIntensity is provided, use it as the ceiling; otherwise auto-detect.
 */
export function normalizeHeatmapData(
  points: HeatmapPoint[],
  maxIntensity?: number,
): HeatmapPoint[] {
  if (points.length === 0) return [];

  const ceiling =
    maxIntensity ?? Math.max(...points.map((p) => p.intensity));
  if (ceiling === 0) return points;

  return points.map((p) => ({
    ...p,
    intensity: Math.min(p.intensity / ceiling, 1),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Top pages                                                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Heatmap comparison                                                         */
/* -------------------------------------------------------------------------- */

export interface HeatmapComparison {
  pageUrl: string;
  periodA: { start: string; end: string };
  periodB: { start: string; end: string };
  heatmapA: HeatmapPoint[];
  heatmapB: HeatmapPoint[];
}

export interface HeatmapDiff {
  pageUrl: string;
  /** Points where activity increased (positive intensity = more clicks in B) */
  increased: HeatmapPoint[];
  /** Points where activity decreased (positive intensity = fewer clicks in B) */
  decreased: HeatmapPoint[];
  /** Net change in total events */
  netChangePercent: number;
}

/**
 * Compare two heatmap datasets for the same page across different time periods.
 */
export function compareHeatmaps(
  pageUrl: string,
  heatmapA: HeatmapPoint[],
  periodA: { start: string; end: string },
  heatmapB: HeatmapPoint[],
  periodB: { start: string; end: string },
): HeatmapComparison {
  return { pageUrl, periodA, periodB, heatmapA, heatmapB };
}

/**
 * Compute a difference map between two heatmap datasets.
 * Positive diff = more clicks in B; negative diff = fewer clicks in B.
 */
export function calculateHeatmapDiff(
  pageUrl: string,
  heatmapA: HeatmapPoint[],
  heatmapB: HeatmapPoint[],
): HeatmapDiff {
  // Build lookup maps by position
  const mapA = new Map<string, HeatmapPoint>();
  for (const p of heatmapA) mapA.set(`${p.x},${p.y}`, p);

  const mapB = new Map<string, HeatmapPoint>();
  for (const p of heatmapB) mapB.set(`${p.x},${p.y}`, p);

  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const increased: HeatmapPoint[] = [];
  const decreased: HeatmapPoint[] = [];

  for (const key of allKeys) {
    const a = mapA.get(key);
    const b = mapB.get(key);
    const countA = a?.count ?? 0;
    const countB = b?.count ?? 0;
    const diff = countB - countA;
    const [x, y] = key.split(",").map(Number);

    if (diff > 0) {
      increased.push({ x, y, count: diff, intensity: 0 });
    } else if (diff < 0) {
      decreased.push({ x, y, count: Math.abs(diff), intensity: 0 });
    }
  }

  // Normalize intensities
  const maxInc = Math.max(...increased.map((p) => p.count), 1);
  for (const p of increased) p.intensity = p.count / maxInc;

  const maxDec = Math.max(...decreased.map((p) => p.count), 1);
  for (const p of decreased) p.intensity = p.count / maxDec;

  const totalA = heatmapA.reduce((s, p) => s + p.count, 0);
  const totalB = heatmapB.reduce((s, p) => s + p.count, 0);
  const netChangePercent = totalA > 0 ? Math.round(((totalB - totalA) / totalA) * 100) : 0;

  return { pageUrl, increased, decreased, netChangePercent };
}

/* -------------------------------------------------------------------------- */
/*  Top pages                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Return top pages ranked by traffic for heatmap page selection.
 * In shadow mode (no DB), returns demo data.
 */
export async function getTopPages(
  dealerId: string,
  limit = 10,
): Promise<TopPage[]> {
  trackHeatmap("heatmap.page_analyzed", dealerId, { limit });

  if (!process.env.DATABASE_URL) {
    return [
      { url: "/", pageviews: 12450, uniqueVisitors: 8320 },
      { url: "/inventory", pageviews: 9870, uniqueVisitors: 6540 },
      { url: "/inventory/2024-ford-f150", pageviews: 3210, uniqueVisitors: 2890 },
      { url: "/financing", pageviews: 2780, uniqueVisitors: 2100 },
      { url: "/trade-in", pageviews: 1950, uniqueVisitors: 1620 },
      { url: "/contact", pageviews: 1340, uniqueVisitors: 1180 },
      { url: "/about", pageviews: 890, uniqueVisitors: 720 },
    ].slice(0, limit);
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT page AS url, COUNT(*) AS pageviews, COUNT(DISTINCT user_fingerprint) AS "uniqueVisitors"
     FROM analytics_events
     WHERE metadata->>'dealer_id' = $1
       AND timestamp > NOW() - INTERVAL '30 days'
     GROUP BY page
     ORDER BY pageviews DESC
     LIMIT $2`,
    [dealerId, limit],
  );

  return result.rows.map((r: Record<string, unknown>) => ({
    url: String(r.url),
    pageviews: Number(r.pageviews),
    uniqueVisitors: Number(r.uniqueVisitors),
  }));
}
