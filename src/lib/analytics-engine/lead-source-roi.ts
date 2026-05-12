/**
 * Lead-source ROI analytics engine — server entrypoint.
 *
 * Pure types + formatters live in `./lead-source-roi-shared` and are safe
 * to import from client components. This file adds the db-touching query
 * functions and re-exports the shared surface for back-compat.
 */

import {
  type LeadSourceRoiRow,
  type LeadSourceRoiResult,
  type LeadSourceRoiOptions,
  type LeadSourceDrillDown,
  enrichWithCost,
  rankSourceRows,
  formatSummaryHeadline,
} from "./lead-source-roi-shared";

export * from "./lead-source-roi-shared";


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
