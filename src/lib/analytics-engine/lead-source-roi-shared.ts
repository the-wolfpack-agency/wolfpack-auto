/**
 * Lead-source ROI analytics engine.
 *
 * Per-source rollup: cost per lead (when configured), conversion rate,
 * gross profit per source, time-to-close. Source-of-truth view is
 * `v_lead_source_roi` (migration 071).
 *
 * Cost-per-lead is currently `null` everywhere — there is no `cost` column
 * on `leads`. The UI surfaces "cost not configured" explicitly. When a
 * future migration adds it, only `enrichWithCost()` needs to change.
 *
 * Tenant safety: every public function REQUIRES dealerId. Lib filters by
 * dealer_id on every read — the view itself can't enforce RLS.
 *
 * No `any`. All shapes typed. Ranking/formatting pure for unit-testability.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Raw row from v_lead_source_roi. */
export interface LeadSourceRoiRow {
  dealer_id: string;
  source: string;
  total_leads: number;
  funded_deals: number;
  conversion_rate_pct: number;
  total_gross_profit: number;
  avg_gross_per_deal: number | null;
  avg_days_to_close: number | null;
  /** Cost per lead. `null` means "not configured" (no cost column yet). */
  cost_per_lead: number | null;
  /** ROI = totalGross / (totalLeads * costPerLead). `null` when cost not configured. */
  roi_ratio: number | null;
}

export interface LeadSourceRoiOptions {
  /** Min total leads required to surface a source (default 1; filters noise). */
  minLeads?: number;
  /** Result limit (default 50). */
  limit?: number;
  /** Sort order. */
  sortBy?: "gross" | "conversion" | "leads" | "time-to-close";
}

export interface LeadSourceRoiResult {
  rows: LeadSourceRoiRow[];
  totalRows: number;
  topByGross: LeadSourceRoiRow | null;
  topByConversion: LeadSourceRoiRow | null;
  /** Dealer-facing summary headline for the dashboard. */
  headline: string;
  /** True if no rows — UI shows empty state. */
  isEmpty: boolean;
  /** True when no cost data was found anywhere. UI displays banner. */
  costNotConfigured: boolean;
}

export interface LeadSourceDrillDownRow {
  lead_id: string;
  first_name: string;
  last_name: string;
  email: string;
  lead_created_at: string;
  funded: boolean;
  funded_at: string | null;
  gross: number | null;
}

export interface LeadSourceDrillDown {
  source: string;
  rows: LeadSourceDrillDownRow[];
}

/* -------------------------------------------------------------------------- */
/*  Formatting (pure, easily unit-tested)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Human-readable label for a lead-source string. Maps known internal IDs
 * to dealer-friendly names.
 */
export function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    website_form: "Website form",
    walk_in: "Walk-in",
    referral: "Customer referral",
    phone_call: "Phone call",
    autotrader: "AutoTrader",
    cars_com: "Cars.com",
    cargurus: "CarGurus",
    facebook: "Facebook",
    instagram: "Instagram",
    google_ads: "Google Ads",
    bing_ads: "Bing Ads",
    email_campaign: "Email campaign",
    sms_campaign: "SMS campaign",
    unknown: "Unknown",
  };
  return map[source] ?? source.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Plain-English headline for one source row.
 *   "AutoTrader: 23 leads, 6 funded (26%). Average close time 18 days."
 */
export function formatSourceHeadline(row: LeadSourceRoiRow): string {
  const label = sourceLabel(row.source);
  const closeNote = row.avg_days_to_close !== null
    ? ` Average close time ${Math.round(row.avg_days_to_close)} days.`
    : "";
  return `${label}: ${row.total_leads} leads, ${row.funded_deals} funded (${row.conversion_rate_pct}%).${closeNote}`;
}

export function formatSummaryHeadline(top: LeadSourceRoiRow | null): string {
  if (!top) return "Not enough lead data yet — give it a few weeks of activity.";
  if (top.total_gross_profit > 0) {
    return `Your top source last period was ${sourceLabel(top.source)} — $${Math.round(top.total_gross_profit).toLocaleString()} in gross from ${top.funded_deals} funded deals.`;
  }
  return `Your busiest source is ${sourceLabel(top.source)} with ${top.total_leads} leads — but no funded deals yet.`;
}

/* -------------------------------------------------------------------------- */
/*  Pure ranking — independent of DB                                           */
/* -------------------------------------------------------------------------- */

export function rankSourceRows(
  rows: LeadSourceRoiRow[],
  opts: LeadSourceRoiOptions = {},
): LeadSourceRoiRow[] {
  const minLeads = opts.minLeads ?? 1;
  const limit = opts.limit ?? 50;
  const sortBy = opts.sortBy ?? "gross";

  const filtered = rows.filter((r) => r.total_leads >= minLeads);

  const sorted = filtered.slice().sort((a, b) => {
    if (sortBy === "conversion") return b.conversion_rate_pct - a.conversion_rate_pct;
    if (sortBy === "leads") return b.total_leads - a.total_leads;
    if (sortBy === "time-to-close") {
      const aT = a.avg_days_to_close ?? Number.POSITIVE_INFINITY;
      const bT = b.avg_days_to_close ?? Number.POSITIVE_INFINITY;
      return aT - bT;
    }
    return b.total_gross_profit - a.total_gross_profit;
  });

  return sorted.slice(0, Math.max(0, limit));
}

/**
 * Enrich a base row with cost-per-lead and ROI ratio.
 *
 * Currently always returns `cost_per_lead: null`. When a future migration
 * adds a `lead_source_costs` table or a `leads.cost` column, swap this
 * out — no callers change.
 */
export function enrichWithCost(
  row: Omit<LeadSourceRoiRow, "cost_per_lead" | "roi_ratio">,
): LeadSourceRoiRow {
  return {
    ...row,
    cost_per_lead: null,
    roi_ratio: null,
  };
}
