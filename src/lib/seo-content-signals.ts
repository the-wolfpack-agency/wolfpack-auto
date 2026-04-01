/**
 * SEO Content Signals — Inventory Filter Combo Tracker
 *
 * Tracks which inventory filter combinations are most popular and which
 * result in engagement (vehicle clicks, not just searches). Surfaces:
 *  - Top filter combos ranked by engagement rate
 *  - Zero-result filter combos (stock gap signals)
 *  - Content gap analysis for SEO landing page generation
 *
 * All data is aggregated in-memory per session and can be persisted
 * via the analytics hooks to Postgres for cross-session analysis.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FilterComboEntry {
  /** Canonical key for this filter combination (sorted, deterministic) */
  key: string;
  /** The actual filter values */
  filters: Record<string, string>;
  /** Number of times this combo was searched */
  search_count: number;
  /** Number of times a vehicle was clicked from results of this combo */
  engagement_count: number;
  /** engagement_count / search_count */
  engagement_rate: number;
  /** Whether this combo has ever returned zero results */
  has_zero_results: boolean;
  /** Last time this combo was used */
  last_used: string;
}

export interface FilterComboEvent {
  filters: Record<string, string>;
  result_count: number;
  engaged: boolean;
}

export interface ContentGap {
  filters: Record<string, string>;
  search_count: number;
  zero_result: boolean;
  suggested_page_title?: string;
}

/* ------------------------------------------------------------------ */
/*  Filter key normalization                                           */
/* ------------------------------------------------------------------ */

/**
 * Create a deterministic key from a filter object.
 * Sorts keys alphabetically and joins as "key=value" pairs.
 * Filters out empty/undefined values.
 */
export function canonicalFilterKey(filters: Record<string, string | undefined>): string {
  const entries = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return entries.join("&");
}

/**
 * Generate a human-readable page title suggestion from filters.
 * Used for SEO landing page content generation.
 */
export function suggestPageTitle(filters: Record<string, string>): string {
  const parts: string[] = [];

  if (filters.condition) {
    parts.push(filters.condition.charAt(0).toUpperCase() + filters.condition.slice(1));
  } else {
    parts.push("Used");
  }

  if (filters.color) parts.push(filters.color);
  if (filters.make) parts.push(filters.make);
  if (filters.model) parts.push(filters.model);
  if (filters.body_style || filters.body_type) {
    parts.push((filters.body_style || filters.body_type)!);
  } else if (!filters.make) {
    parts.push("Vehicles");
  }

  const suffix: string[] = [];
  if (filters.price_max || filters.max_price) {
    const price = filters.price_max || filters.max_price;
    suffix.push(`Under $${Number(price).toLocaleString()}`);
  }
  if (filters.year_min) {
    suffix.push(`${filters.year_min} and Newer`);
  }

  let title = parts.join(" ");
  if (suffix.length > 0) title += " " + suffix.join(" ");
  return title;
}

/* ------------------------------------------------------------------ */
/*  In-memory store                                                    */
/* ------------------------------------------------------------------ */

const filterCombos = new Map<string, FilterComboEntry>();

/**
 * Record a filter combination search event.
 */
export function trackFilterCombo(
  filters: Record<string, string>,
  resultCount: number,
): void {
  const key = canonicalFilterKey(filters);
  if (!key) return; // Skip empty filter sets

  const existing = filterCombos.get(key);
  if (existing) {
    existing.search_count++;
    existing.last_used = new Date().toISOString();
    if (resultCount === 0) existing.has_zero_results = true;
    existing.engagement_rate =
      existing.search_count > 0
        ? existing.engagement_count / existing.search_count
        : 0;
  } else {
    filterCombos.set(key, {
      key,
      filters: { ...filters },
      search_count: 1,
      engagement_count: 0,
      engagement_rate: 0,
      has_zero_results: resultCount === 0,
      last_used: new Date().toISOString(),
    });
  }
}

/**
 * Record engagement (vehicle click) for a filter combination.
 */
export function trackFilterEngagement(
  filters: Record<string, string>,
): void {
  const key = canonicalFilterKey(filters);
  if (!key) return;

  const existing = filterCombos.get(key);
  if (existing) {
    existing.engagement_count++;
    existing.engagement_rate =
      existing.search_count > 0
        ? existing.engagement_count / existing.search_count
        : 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Query API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Get the top filter combinations ranked by engagement count,
 * with engagement rate as a secondary sort.
 */
export function getTopFilterCombos(limit: number = 20): FilterComboEntry[] {
  const entries = Array.from(filterCombos.values());
  return entries
    .sort((a, b) => {
      // Primary: engagement count descending
      if (b.engagement_count !== a.engagement_count) {
        return b.engagement_count - a.engagement_count;
      }
      // Secondary: search count descending
      return b.search_count - a.search_count;
    })
    .slice(0, limit);
}

/**
 * Get filter combinations that produced zero results.
 * These represent either inventory gaps or content opportunities.
 */
export function getZeroResultGaps(): ContentGap[] {
  const entries = Array.from(filterCombos.values()).filter(
    (e) => e.has_zero_results,
  );

  return entries
    .sort((a, b) => b.search_count - a.search_count)
    .map((e) => ({
      filters: e.filters,
      search_count: e.search_count,
      zero_result: true,
      suggested_page_title: suggestPageTitle(e.filters),
    }));
}

/**
 * Get all tracked filter combos (for export or analytics brain).
 */
export function getAllFilterCombos(): FilterComboEntry[] {
  return Array.from(filterCombos.values());
}

/**
 * Get filter combos with high search count but low engagement
 * (potential UX or inventory issues).
 */
export function getLowEngagementCombos(
  minSearches: number = 5,
  maxEngagementRate: number = 0.1,
): FilterComboEntry[] {
  return Array.from(filterCombos.values())
    .filter(
      (e) =>
        e.search_count >= minSearches &&
        e.engagement_rate <= maxEngagementRate,
    )
    .sort((a, b) => b.search_count - a.search_count);
}

/**
 * Build analytics event payloads for the top combos.
 * Used for periodic flushing to the analytics system.
 */
export function buildPopularComboEvents(
  limit: number = 10,
): Array<{ filters: Record<string, string>; search_count: number; rank: number }> {
  const top = getTopFilterCombos(limit);
  return top.map((entry, index) => ({
    filters: entry.filters,
    search_count: entry.search_count,
    rank: index + 1,
  }));
}

/** Clear all stored combos (useful for testing). */
export function clearFilterCombos(): void {
  filterCombos.clear();
}
