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

/* -------------------------------------------------------------------------- */
/*  Demo data — shadow-mode fallback                                           */
/* -------------------------------------------------------------------------- */

export function getDemoLeadSourceRoi(dealerId: string): LeadSourceRoiResult {
  const base: Array<Omit<LeadSourceRoiRow, "cost_per_lead" | "roi_ratio">> = [
    { dealer_id: dealerId, source: "autotrader",   total_leads: 32, funded_deals: 6, conversion_rate_pct: 18.75, total_gross_profit: 17800, avg_gross_per_deal: 2966.67, avg_days_to_close: 18.4 },
    { dealer_id: dealerId, source: "cars_com",     total_leads: 27, funded_deals: 4, conversion_rate_pct: 14.81, total_gross_profit: 11200, avg_gross_per_deal: 2800.00, avg_days_to_close: 22.1 },
    { dealer_id: dealerId, source: "facebook",     total_leads: 41, funded_deals: 3, conversion_rate_pct: 7.32,  total_gross_profit: 8400,  avg_gross_per_deal: 2800.00, avg_days_to_close: 31.5 },
    { dealer_id: dealerId, source: "website_form", total_leads: 58, funded_deals: 9, conversion_rate_pct: 15.52, total_gross_profit: 24300, avg_gross_per_deal: 2700.00, avg_days_to_close: 9.8 },
    { dealer_id: dealerId, source: "referral",     total_leads: 14, funded_deals: 7, conversion_rate_pct: 50.0,  total_gross_profit: 21500, avg_gross_per_deal: 3071.43, avg_days_to_close: 6.2 },
    { dealer_id: dealerId, source: "walk_in",      total_leads: 19, funded_deals: 0, conversion_rate_pct: 0,     total_gross_profit: 0,     avg_gross_per_deal: null,    avg_days_to_close: null },
  ];
  const rows = base.map(enrichWithCost);
  const ranked = rankSourceRows(rows);
  const topByGross = ranked[0] ?? null;
  const topByConversion =
    [...rows].sort((a, b) => b.conversion_rate_pct - a.conversion_rate_pct)[0] ?? null;

  return {
    rows: ranked,
    totalRows: rows.length,
    topByGross,
    topByConversion,
    headline: formatSummaryHeadline(topByGross),
    isEmpty: false,
    costNotConfigured: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  DB-backed read path                                                        */
/* -------------------------------------------------------------------------- */

export async function getLeadSourceRoi(
  dealerId: string,
  opts: LeadSourceRoiOptions = {},
): Promise<LeadSourceRoiResult> {
  if (!dealerId) {
    throw new Error("[lead-source-roi] dealerId is required");
  }

  if (!process.env.DATABASE_URL) {
    return getDemoLeadSourceRoi(dealerId);
  }

  const { query } = await import("@/lib/db");
  const result = await query<Omit<LeadSourceRoiRow, "cost_per_lead" | "roi_ratio">>(
    `SELECT dealer_id, source,
            total_leads, funded_deals,
            conversion_rate_pct,
            total_gross_profit,
            avg_gross_per_deal,
            avg_days_to_close
       FROM v_lead_source_roi
      WHERE dealer_id = $1::uuid`,
    [dealerId],
  );

  const rawRows = result.rows.map((r) => enrichWithCost({
    dealer_id: r.dealer_id,
    source: r.source,
    total_leads: Number(r.total_leads ?? 0),
    funded_deals: Number(r.funded_deals ?? 0),
    conversion_rate_pct: Number(r.conversion_rate_pct ?? 0),
    total_gross_profit: Number(r.total_gross_profit ?? 0),
    avg_gross_per_deal:
      r.avg_gross_per_deal !== null ? Number(r.avg_gross_per_deal) : null,
    avg_days_to_close:
      r.avg_days_to_close !== null ? Number(r.avg_days_to_close) : null,
  }));

  const ranked = rankSourceRows(rawRows, opts);
  const topByGross = ranked[0] ?? null;
  const topByConversion =
    [...rawRows].sort((a, b) => b.conversion_rate_pct - a.conversion_rate_pct)[0] ?? null;

  return {
    rows: ranked,
    totalRows: rawRows.length,
    topByGross,
    topByConversion,
    headline: formatSummaryHeadline(topByGross),
    isEmpty: rawRows.length === 0,
    costNotConfigured: rawRows.every((r) => r.cost_per_lead === null),
  };
}

/**
 * Drill into one source: list individual leads + funding status.
 */
export async function getLeadSourceDrillDown(
  dealerId: string,
  source: string,
): Promise<LeadSourceDrillDown> {
  if (!dealerId) {
    throw new Error("[lead-source-roi] dealerId is required");
  }
  if (!source) {
    throw new Error("[lead-source-roi] source is required");
  }

  if (!process.env.DATABASE_URL) {
    return {
      source,
      rows: [
        { lead_id: "demo-1", first_name: "Alex", last_name: "Reyes", email: "alex@example.com", lead_created_at: "2026-04-10T09:00:00Z", funded: true, funded_at: "2026-04-28T15:30:00Z", gross: 2840 },
        { lead_id: "demo-2", first_name: "Jamie", last_name: "Carter", email: "jamie@example.com", lead_created_at: "2026-04-15T13:20:00Z", funded: false, funded_at: null, gross: null },
      ],
    };
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    lead_id: string;
    first_name: string;
    last_name: string;
    email: string;
    lead_created_at: string;
    funded_status: string | null;
    funded_at: string | null;
    gross: string | null;
  }>(
    `SELECT l.id::text AS lead_id,
            l.first_name,
            l.last_name,
            l.email,
            l.created_at AS lead_created_at,
            dw.status    AS funded_status,
            dw.funded_at,
            dw.total_gross AS gross
       FROM leads l
       LEFT JOIN deal_worksheets dw
         ON dw.lead_id   = l.id::text
        AND dw.dealer_id = l.dealer_id::text
      WHERE l.dealer_id = $1::uuid
        AND COALESCE(NULLIF(l.source, ''), 'unknown') = $2
      ORDER BY l.created_at DESC
      LIMIT 200`,
    [dealerId, source],
  );

  return {
    source,
    rows: result.rows.map((r) => ({
      lead_id: String(r.lead_id),
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      lead_created_at: String(r.lead_created_at),
      funded: r.funded_status === "funded",
      funded_at: r.funded_at ? String(r.funded_at) : null,
      gross: r.gross !== null && r.gross !== undefined ? Number(r.gross) : null,
    })),
  };
}
