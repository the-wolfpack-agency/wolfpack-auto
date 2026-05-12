/**
 * Trim-velocity analytics engine — server entrypoint.
 *
 * Pure types + formatters live in `./trim-velocity-shared` and are safe
 * to import from client components. This file adds the db-touching query
 * functions and re-exports the shared surface for back-compat.
 */

import {
  type TrimVelocityRow,
  type TrimVelocityResult,
  type TrimVelocityOptions,
  type TrimVelocityDrillDown,
  type TrimVelocityDrillDownRow,
  rankTrimRows,
  formatSummaryHeadline,
  getDemoTrimVelocity,
} from "./trim-velocity-shared";

export * from "./trim-velocity-shared";

/* -------------------------------------------------------------------------- */
/*  DB-backed read path                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Load trim-velocity from Postgres view, scoped to one dealer.
 *
 * Throws if dealerId is empty/falsy — we never query the view unscoped.
 */
export async function getTrimVelocity(
  dealerId: string,
  opts: TrimVelocityOptions = {},
): Promise<TrimVelocityResult> {
  if (!dealerId) {
    throw new Error("[trim-velocity] dealerId is required");
  }

  if (!process.env.DATABASE_URL) {
    return getDemoTrimVelocity(dealerId);
  }

  const { query } = await import("@/lib/db");
  const result = await query<TrimVelocityRow>(
    `SELECT dealer_id, make, model, trim, year,
            listed_count, funded_count,
            avg_days_to_sell, median_days_to_sell,
            avg_gross_profit, avg_current_days_on_lot
       FROM v_trim_velocity
      WHERE dealer_id = $1::uuid`,
    [dealerId],
  );

  const rawRows = result.rows.map((r) => ({
    ...r,
    listed_count: Number(r.listed_count ?? 0),
    funded_count: Number(r.funded_count ?? 0),
    avg_days_to_sell: r.avg_days_to_sell !== null ? Number(r.avg_days_to_sell) : null,
    median_days_to_sell: r.median_days_to_sell !== null ? Number(r.median_days_to_sell) : null,
    avg_gross_profit: r.avg_gross_profit !== null ? Number(r.avg_gross_profit) : null,
    avg_current_days_on_lot:
      r.avg_current_days_on_lot !== null ? Number(r.avg_current_days_on_lot) : null,
  }));

  const ranked = rankTrimRows(rawRows, opts);
  const fastest = ranked[0] ?? null;
  const slowest = ranked[ranked.length - 1] ?? null;

  return {
    rows: ranked,
    totalRows: rawRows.length,
    fastest,
    slowest,
    headline: formatSummaryHeadline(fastest, slowest),
    isEmpty: rawRows.length === 0,
  };
}

/**
 * Drill into one trim group: list the actual funded VINs + days-to-sell.
 *
 * Tenant filter is required AND validated at every layer.
 */
export async function getTrimVelocityDrillDown(
  dealerId: string,
  args: { make: string; model: string; trim: string; year: number },
): Promise<TrimVelocityDrillDown> {
  if (!dealerId) {
    throw new Error("[trim-velocity] dealerId is required");
  }

  if (!process.env.DATABASE_URL) {
    return {
      ...args,
      rows: [
        { vin: "JTMRF4FV0NJ123456", stock_number: "T1001", funded_at: "2026-04-30T14:22:00Z", days_to_sell: 9, gross: 2700 },
        { vin: "JTMRF4FV0NJ123457", stock_number: "T1002", funded_at: "2026-05-02T11:10:00Z", days_to_sell: 12, gross: 2980 },
      ],
    };
  }

  const { query } = await import("@/lib/db");
  const result = await query<{
    vin: string;
    stock_number: string;
    funded_at: string;
    days_to_sell: string;
    gross: string | null;
  }>(
    `SELECT v.vin,
            v.stock_number,
            dw.funded_at,
            EXTRACT(EPOCH FROM (dw.funded_at - v.created_at)) / 86400.0 AS days_to_sell,
            dw.total_gross AS gross
       FROM vehicles v
       JOIN deal_worksheets dw
         ON dw.vehicle_vin = v.vin
        AND dw.dealer_id   = v.dealer_id::text
      WHERE v.dealer_id = $1::uuid
        AND v.make  = $2
        AND v.model = $3
        AND v.trim  = $4
        AND v.year  = $5
        AND dw.status = 'funded'
        AND dw.funded_at IS NOT NULL
      ORDER BY dw.funded_at DESC
      LIMIT 100`,
    [dealerId, args.make, args.model, args.trim, args.year],
  );

  return {
    ...args,
    rows: result.rows.map((r) => ({
      vin: r.vin,
      stock_number: r.stock_number ?? "",
      funded_at: String(r.funded_at),
      days_to_sell: Math.round(Number(r.days_to_sell ?? 0) * 100) / 100,
      gross: r.gross !== null ? Number(r.gross) : null,
    })),
  };
}
