/**
 * Trim-velocity analytics engine.
 *
 * Surfaces per-trim days-to-sell so dealers can spot fast movers vs. stale
 * SKUs. Source-of-truth view is `v_trim_velocity` (migration 071).
 *
 * Tenant safety: every public function MUST be called with a real dealerId
 * from the authenticated session. The view itself can't enforce RLS, so we
 * filter by dealer_id in every query AND assert in tests.
 *
 * Surfaces:
 *   - getTrimVelocity(dealerId, opts?)     — sorted rows + headline copy
 *   - getTrimVelocityDrillDown(dealerId, …) — single trim's funded deals
 *   - getDemoTrimVelocity()                 — shadow-mode demo data
 *   - formatHeadline(row)                   — plain-English dashboard copy
 *
 * No `any`. All shapes typed. All formatting helpers are pure so they're
 * cheap to unit test.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** One row of the trim-velocity view — output of `v_trim_velocity`. */
export interface TrimVelocityRow {
  dealer_id: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  listed_count: number;
  funded_count: number;
  /** Average days from listing to funding for funded deals. `null` if no sales yet. */
  avg_days_to_sell: number | null;
  /** Median days-to-sell — robust to outliers. */
  median_days_to_sell: number | null;
  /** Average gross profit per funded deal in this trim group. */
  avg_gross_profit: number | null;
  /** Avg days-on-lot of currently-listed (unsold) units in this trim. */
  avg_current_days_on_lot: number | null;
}

export interface TrimVelocityOptions {
  /** Min funded count required to surface a row (default 1; filters noise). */
  minFundedCount?: number;
  /** Result limit (default 100). */
  limit?: number;
  /** Sort order: 'fastest' (asc days), 'slowest' (desc), 'most-sold' (desc funded). */
  sortBy?: "fastest" | "slowest" | "most-sold";
}

export interface TrimVelocityResult {
  rows: TrimVelocityRow[];
  totalRows: number;
  fastest: TrimVelocityRow | null;
  slowest: TrimVelocityRow | null;
  /** Dealer-language summary line for the dashboard header. */
  headline: string;
  /** True when no data exists — UI should show empty state. */
  isEmpty: boolean;
}

export interface TrimVelocityDrillDownRow {
  vin: string;
  stock_number: string;
  funded_at: string;
  days_to_sell: number;
  gross: number | null;
}

export interface TrimVelocityDrillDown {
  make: string;
  model: string;
  trim: string;
  year: number;
  rows: TrimVelocityDrillDownRow[];
}

/* -------------------------------------------------------------------------- */
/*  Formatting (pure, easily unit-tested)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Plain-English row label for a trim. Drives every dashboard cell.
 *
 *   { make:"Toyota", model:"RAV4", trim:"XLE Hybrid", year:2026 }
 *   →  "2026 Toyota RAV4 XLE Hybrid"
 */
export function trimLabel(row: Pick<TrimVelocityRow, "make" | "model" | "trim" | "year">): string {
  const parts = [String(row.year), row.make, row.model, row.trim].filter((p) => p && p !== "");
  return parts.join(" ").trim();
}

/**
 * Dealer-facing headline for one trim row. Built per the no-jargon rule:
 *
 *   "Your 2026 RAV4 XLE Hybrid sells in 11 days."
 *   "Your 2024 Camry SE has 4 units sitting an average of 62 days."
 */
export function formatHeadline(row: TrimVelocityRow): string {
  const label = trimLabel(row);
  if (row.funded_count > 0 && row.avg_days_to_sell !== null) {
    const days = Math.round(row.avg_days_to_sell);
    const noun = days === 1 ? "day" : "days";
    return `Your ${label} sells in ${days} ${noun}.`;
  }
  if (row.listed_count > 0 && row.avg_current_days_on_lot !== null) {
    const days = Math.round(row.avg_current_days_on_lot);
    const unitNoun = row.listed_count === 1 ? "unit" : "units";
    return `Your ${label} has ${row.listed_count} ${unitNoun} sitting an average of ${days} days.`;
  }
  return `Your ${label}: not enough data yet.`;
}

/**
 * Top-of-page summary — picks the fastest seller as the lead anecdote.
 */
export function formatSummaryHeadline(
  fastest: TrimVelocityRow | null,
  slowest: TrimVelocityRow | null,
): string {
  if (!fastest && !slowest) return "Listing data not available yet.";
  if (fastest && slowest && fastest !== slowest) {
    const fastDays = fastest.avg_days_to_sell !== null ? Math.round(fastest.avg_days_to_sell) : null;
    const slowDays = slowest.avg_days_to_sell !== null ? Math.round(slowest.avg_days_to_sell) : null;
    if (fastDays !== null && slowDays !== null) {
      return `Your fastest seller is the ${trimLabel(fastest)} at ${fastDays} days. Your slowest is the ${trimLabel(slowest)} at ${slowDays} days.`;
    }
  }
  if (fastest && fastest.avg_days_to_sell !== null) {
    return `Your fastest seller is the ${trimLabel(fastest)} at ${Math.round(fastest.avg_days_to_sell)} days.`;
  }
  return "Working on your first deal data — check back after a few sales.";
}

/* -------------------------------------------------------------------------- */
/*  Pure ranking — pulled out so we can unit-test without a DB                 */
/* -------------------------------------------------------------------------- */

export function rankTrimRows(
  rows: TrimVelocityRow[],
  opts: TrimVelocityOptions = {},
): TrimVelocityRow[] {
  const minFunded = opts.minFundedCount ?? 1;
  const limit = opts.limit ?? 100;
  const sortBy = opts.sortBy ?? "fastest";

  const filtered = rows.filter((r) => r.funded_count >= minFunded);

  const sorted = filtered.slice().sort((a, b) => {
    if (sortBy === "most-sold") {
      return b.funded_count - a.funded_count;
    }
    const aDays = a.avg_days_to_sell ?? Number.POSITIVE_INFINITY;
    const bDays = b.avg_days_to_sell ?? Number.POSITIVE_INFINITY;
    return sortBy === "slowest" ? bDays - aDays : aDays - bDays;
  });

  return sorted.slice(0, Math.max(0, limit));
}

/* -------------------------------------------------------------------------- */
/*  Demo data — shadow mode / no-DB fallback                                   */
/* -------------------------------------------------------------------------- */

export function getDemoTrimVelocity(dealerId: string): TrimVelocityResult {
  const rows: TrimVelocityRow[] = [
    {
      dealer_id: dealerId,
      make: "Toyota",
      model: "RAV4",
      trim: "XLE Hybrid",
      year: 2026,
      listed_count: 6,
      funded_count: 5,
      avg_days_to_sell: 11.4,
      median_days_to_sell: 11.0,
      avg_gross_profit: 2840.55,
      avg_current_days_on_lot: 8.5,
    },
    {
      dealer_id: dealerId,
      make: "Toyota",
      model: "RAV4",
      trim: "XSE Premium",
      year: 2026,
      listed_count: 3,
      funded_count: 2,
      avg_days_to_sell: 47.0,
      median_days_to_sell: 47.0,
      avg_gross_profit: 3120.0,
      avg_current_days_on_lot: 41.0,
    },
    {
      dealer_id: dealerId,
      make: "Honda",
      model: "CR-V",
      trim: "EX-L",
      year: 2025,
      listed_count: 4,
      funded_count: 4,
      avg_days_to_sell: 18.2,
      median_days_to_sell: 16.0,
      avg_gross_profit: 2210.0,
      avg_current_days_on_lot: 12.0,
    },
    {
      dealer_id: dealerId,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      year: 2024,
      listed_count: 4,
      funded_count: 0,
      avg_days_to_sell: null,
      median_days_to_sell: null,
      avg_gross_profit: null,
      avg_current_days_on_lot: 62.0,
    },
  ];
  const ranked = rankTrimRows(rows);
  const fastest = ranked[0] ?? null;
  const slowest = ranked[ranked.length - 1] ?? null;
  return {
    rows: ranked,
    totalRows: rows.length,
    fastest,
    slowest,
    headline: formatSummaryHeadline(fastest, slowest),
    isEmpty: false,
  };
}

