/**
 * SEO metrics query functions — parameterized SQL only.
 */

import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SEOPageMetric {
  page_path: string;
  title_tag: string;
  meta_description: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_position: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Track page metrics (upsert)
// ---------------------------------------------------------------------------

/**
 * Upsert page-level SEO metrics for a dealer.
 *
 * Impressions and clicks are accumulated (added to existing values).
 * Position is replaced with the latest value.
 */
export async function trackPageMetrics(
  dealerId: string,
  pagePath: string,
  impressions: number,
  clicks: number,
  position: number,
): Promise<void> {
  await query(
    `INSERT INTO seo_metrics (dealer_id, page_path, impressions, clicks, avg_position, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (dealer_id, page_path)
     DO UPDATE SET
       impressions  = seo_metrics.impressions + EXCLUDED.impressions,
       clicks       = seo_metrics.clicks + EXCLUDED.clicks,
       avg_position = EXCLUDED.avg_position,
       updated_at   = now()`,
    [dealerId, pagePath, impressions, clicks, position],
  );
}

// ---------------------------------------------------------------------------
// Top performing pages
// ---------------------------------------------------------------------------

/**
 * Get the top performing pages by click count.
 */
export async function getTopPages(
  dealerId: string,
  limit = 20,
): Promise<SEOPageMetric[]> {
  const result = await query(
    `SELECT
       page_path,
       title_tag,
       meta_description,
       impressions,
       clicks,
       CASE WHEN impressions > 0
         THEN ROUND((clicks::numeric / impressions) * 100, 2)
         ELSE 0
       END AS ctr,
       avg_position,
       updated_at
     FROM seo_metrics
     WHERE dealer_id = $1
     ORDER BY clicks DESC
     LIMIT $2`,
    [dealerId, limit],
  );

  return result.rows as any[];
}

// ---------------------------------------------------------------------------
// Underperforming pages (high impressions, low CTR)
// ---------------------------------------------------------------------------

/**
 * Find pages with high impressions but low click-through rate.
 *
 * These are prime candidates for title/description optimisation.
 * Threshold: pages with >= 100 impressions and CTR < 2%.
 */
export async function getUnderperformingPages(
  dealerId: string,
  minImpressions = 100,
  maxCtrPercent = 2.0,
): Promise<SEOPageMetric[]> {
  const result = await query(
    `SELECT
       page_path,
       title_tag,
       meta_description,
       impressions,
       clicks,
       CASE WHEN impressions > 0
         THEN ROUND((clicks::numeric / impressions) * 100, 2)
         ELSE 0
       END AS ctr,
       avg_position,
       updated_at
     FROM seo_metrics
     WHERE dealer_id = $1
       AND impressions >= $2
       AND CASE WHEN impressions > 0
             THEN (clicks::numeric / impressions) * 100
             ELSE 0
           END < $3
     ORDER BY impressions DESC`,
    [dealerId, minImpressions, maxCtrPercent],
  );

  return result.rows as any[];
}
