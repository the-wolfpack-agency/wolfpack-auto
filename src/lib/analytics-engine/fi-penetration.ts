/**
 * F&I Product Penetration analytics engine.
 *
 * Reads from view `v_fi_penetration` (migration 072), shapes results into a
 * heatmap-friendly structure: F&I manager x product x month with attach rate,
 * gross profit, and deal counts.
 *
 * Tenant isolation is enforced at the lib layer by always WHERE-ing on the
 * caller-supplied `dealerId` (the API layer pulls that from the session, not
 * from the URL). The underlying tables (`deal_desk`, `deal_fi_items`) also
 * carry RLS policies keyed on `app.current_dealer_id`.
 *
 * No PII leaves this module. The plain-English headline is generated from the
 * highest attach-rate (manager x product) row of the most recent month and is
 * dealer-language ("Maria sold 78% attach rate on GAP in March").
 */

import { query } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Categories enum from `deal_fi_items.category` (migration 047). */
export const FI_PRODUCT_TYPES = [
  "warranty",
  "gap",
  "paint_protection",
  "tire_wheel",
  "theft",
  "maintenance",
  "appearance",
  "other",
  /* synthetic bucket meaning "no F&I product attached to this funded deal" */
  "none",
] as const;
export type FIProductType = (typeof FI_PRODUCT_TYPES)[number];

export interface FIPenetrationCell {
  fi_manager_id: string;
  fi_manager_name: string;
  product_type: FIProductType;
  month: string; // ISO month — e.g. "2026-03-01"
  attach_rate: number; // 0..1
  gross_total: number; // dollars
  deals_count: number;
  accepted_items: number;
}

export interface FIPenetrationFilters {
  /** ISO date inclusive lower bound on month bucket. */
  monthFrom?: string;
  /** ISO date inclusive upper bound on month bucket. */
  monthTo?: string;
  /** When set, restrict to this F&I manager. */
  fiManagerId?: string;
  /** When set, restrict to this product type. */
  productType?: FIProductType;
}

export interface FIPenetrationResult {
  cells: FIPenetrationCell[];
  headline: string;
  managers: { id: string; name: string }[];
  products: FIProductType[];
  months: string[];
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Query builders (unit-tested in isolation)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the parameterized SQL + values for v_fi_penetration with the requested
 * filters. Always pins dealer_id as the first parameter.
 */
export function buildPenetrationQuery(
  dealerId: string,
  filters: FIPenetrationFilters,
): { sql: string; values: (string | number)[] } {
  const values: (string | number)[] = [dealerId];
  const conds: string[] = ["v.dealer_id = $1"];

  if (filters.monthFrom) {
    values.push(filters.monthFrom);
    conds.push(`v.month >= $${values.length}::date`);
  }
  if (filters.monthTo) {
    values.push(filters.monthTo);
    conds.push(`v.month <= $${values.length}::date`);
  }
  if (filters.fiManagerId) {
    values.push(filters.fiManagerId);
    conds.push(`v.fi_manager_id = $${values.length}::uuid`);
  }
  if (filters.productType) {
    values.push(filters.productType);
    conds.push(`v.product_type = $${values.length}`);
  }

  const sql = `
    SELECT
      v.fi_manager_id::text          AS fi_manager_id,
      COALESCE(NULLIF(u.name, ''), 'Unknown') AS fi_manager_name,
      v.product_type::text           AS product_type,
      to_char(v.month, 'YYYY-MM-DD') AS month,
      COALESCE(v.attach_rate, 0)::float AS attach_rate,
      COALESCE(v.gross_total, 0)::float AS gross_total,
      v.deals_count::int             AS deals_count,
      v.accepted_items::int          AS accepted_items
    FROM v_fi_penetration v
    LEFT JOIN dealer_users u
      ON u.id = v.fi_manager_id::uuid
      AND u.dealer_id = v.dealer_id
    WHERE ${conds.join(" AND ")}
    ORDER BY v.month DESC, v.fi_manager_id, v.product_type
    LIMIT 5000
  `;
  return { sql, values };
}

/* -------------------------------------------------------------------------- */
/*  Ranking + plain-English headline                                           */
/* -------------------------------------------------------------------------- */

/**
 * Format an attach rate (0..1) as a percent string with no decimals.
 * Internal helper kept pure for unit testing.
 */
export function formatAttachRate(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return "0%";
  return `${Math.round(rate * 100)}%`;
}

/** Format dollars with no decimals + thousands separator. */
export function formatGross(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "$0";
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

const PRODUCT_LABELS: Record<FIProductType, string> = {
  warranty: "Extended Warranty",
  gap: "GAP",
  paint_protection: "Paint & Fabric Protection",
  tire_wheel: "Tire & Wheel",
  theft: "Theft Protection",
  maintenance: "Prepaid Maintenance",
  appearance: "Appearance Package",
  other: "Other Product",
  none: "(No F&I attached)",
};

/** Display label for a product type — dealership language, not enum value. */
export function productLabel(p: FIProductType): string {
  return PRODUCT_LABELS[p] ?? p;
}

/** Display label for a month bucket — "March 2026", not "2026-03-01". */
export function monthLabel(iso: string): string {
  // Parse YYYY-MM-DD safely without timezone drift.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const yr = Number(m[1]);
  const mo = Number(m[2]);
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (mo < 1 || mo > 12) return iso;
  return `${names[mo - 1]} ${yr}`;
}

/**
 * Pick the strongest (manager x real-product) row of the most-recent month and
 * render the plain-English headline. Excludes the synthetic `none` bucket so
 * we surface a positive achievement, not the absence of sales.
 */
export function buildHeadline(cells: FIPenetrationCell[]): string {
  if (!Array.isArray(cells) || cells.length === 0) {
    return "No F&I activity in the selected window yet.";
  }
  const real = cells.filter((c) => c.product_type !== "none");
  if (real.length === 0) {
    return "No F&I products were attached to funded deals in this window.";
  }
  // Find the most-recent month, then within that, the highest attach_rate cell
  // with at least 3 deals so a single anomaly does not headline.
  const sorted = [...real].sort((a, b) => (a.month < b.month ? 1 : -1));
  const latestMonth = sorted[0].month;
  const thisMonth = sorted.filter((c) => c.month === latestMonth && c.deals_count >= 3);
  const pool = thisMonth.length > 0 ? thisMonth : sorted.slice(0, 50);
  const top = pool.reduce((best, c) => (c.attach_rate > best.attach_rate ? c : best), pool[0]);
  const ratePct = formatAttachRate(top.attach_rate);
  const product = productLabel(top.product_type);
  const month = monthLabel(top.month);
  return `${top.fi_manager_name} hit ${ratePct} attach rate on ${product} in ${month}.`;
}

/* -------------------------------------------------------------------------- */
/*  Public entrypoint                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Run the penetration query and return the heatmap-shaped result.
 * Always tenant-scoped on `dealerId`.
 */
export async function getFIPenetration(
  dealerId: string,
  filters: FIPenetrationFilters = {},
): Promise<FIPenetrationResult> {
  const { sql, values } = buildPenetrationQuery(dealerId, filters);
  const r = await query(sql, values);
  const cells: FIPenetrationCell[] = (r.rows ?? []).map((row: Record<string, unknown>) => ({
    fi_manager_id: String(row.fi_manager_id ?? ""),
    fi_manager_name: String(row.fi_manager_name ?? "Unknown"),
    product_type: (row.product_type as FIProductType) ?? "other",
    month: String(row.month ?? ""),
    attach_rate: Number(row.attach_rate ?? 0),
    gross_total: Number(row.gross_total ?? 0),
    deals_count: Number(row.deals_count ?? 0),
    accepted_items: Number(row.accepted_items ?? 0),
  }));

  const managers = uniqueBy(
    cells.map((c) => ({ id: c.fi_manager_id, name: c.fi_manager_name })),
    (m) => m.id,
  );
  const products = Array.from(new Set(cells.map((c) => c.product_type))).sort();
  const months = Array.from(new Set(cells.map((c) => c.month))).sort();

  return {
    cells,
    headline: buildHeadline(cells),
    managers,
    products,
    months,
    generatedAt: new Date().toISOString(),
  };
}

function uniqueBy<T, K>(arr: T[], key: (t: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Demo / shadow-mode fixture                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Honest demo data for shadow mode (no DATABASE_URL). The PRODUCTS_DEMO and
 * MANAGERS_DEMO arrays use generic placeholder names per CLAUDE.md (no client
 * names allowed) and the demo months walk the prior six months.
 */
export function demoPenetration(): FIPenetrationResult {
  const today = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 10));
  }
  const managers = [
    { id: "demo-mgr-1", name: "Maria Alvarez" },
    { id: "demo-mgr-2", name: "Tom Becker" },
  ];
  const productMix: FIProductType[] = ["warranty", "gap", "paint_protection", "tire_wheel"];
  const cells: FIPenetrationCell[] = [];
  let seed = 1;
  for (const m of managers) {
    for (const p of productMix) {
      for (const month of months) {
        seed = (seed * 9301 + 49297) % 233280;
        const noise = seed / 233280;
        const base = p === "gap" ? 0.62 : p === "warranty" ? 0.55 : 0.32;
        const rate = Math.min(0.95, base + (noise - 0.5) * 0.25);
        const deals = 18 + Math.floor(noise * 10);
        cells.push({
          fi_manager_id: m.id,
          fi_manager_name: m.name,
          product_type: p,
          month,
          attach_rate: Number(rate.toFixed(4)),
          gross_total: Math.round(rate * deals * 480),
          deals_count: deals,
          accepted_items: Math.round(rate * deals),
        });
      }
    }
  }
  return {
    cells,
    headline: buildHeadline(cells),
    managers,
    products: productMix,
    months,
    generatedAt: new Date().toISOString(),
  };
}
