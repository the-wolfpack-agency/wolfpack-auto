/**
 * Service Tech Utilization analytics engine.
 *
 * Reads from view `v_tech_utilization` (migration 072). Computes hours billed
 * vs hours available per technician per bay per week. The view defaults
 * `hours_available` to 40h/week; this module documents that explicitly and
 * provides an override hook for when a `tech_schedule` table lands.
 *
 * Tenant isolation is enforced at the lib layer (WHERE dealer_id = $1) and at
 * the table layer via the RLS policies that gate `repair_orders` and friends.
 */

import { query } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TechUtilizationCell {
  tech_id: string;
  tech_name: string;
  bay_id: string | null;
  week_start: string; // ISO date e.g. "2026-05-04"
  hours_billed: number;
  hours_available: number;
  utilization: number; // 0..N (uncapped — over-100% is a real signal)
  ro_count: number;
  labor_revenue: number;
}

export interface TechUtilizationFilters {
  /** ISO date inclusive lower bound on week_start. */
  weekFrom?: string;
  /** ISO date inclusive upper bound on week_start. */
  weekTo?: string;
  /** Restrict to a specific tech. */
  techId?: string;
  /** Restrict to a specific bay. */
  bayId?: string;
}

export interface TechUtilizationResult {
  cells: TechUtilizationCell[];
  headline: string;
  techs: { id: string; name: string }[];
  bays: (string | null)[];
  weeks: string[];
  generatedAt: string;
  /**
   * When true, hours_available came from a 40h/week constant fallback. When a
   * tech_schedule table lands and the view is upgraded, this flag flips false.
   */
  hoursAvailableFromConstant: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Query builders (unit-tested in isolation)                                  */
/* -------------------------------------------------------------------------- */

export function buildUtilizationQuery(
  dealerId: string,
  filters: TechUtilizationFilters,
): { sql: string; values: (string | number)[] } {
  const values: (string | number)[] = [dealerId];
  const conds: string[] = ["v.dealer_id = $1"];

  if (filters.weekFrom) {
    values.push(filters.weekFrom);
    conds.push(`v.week_start >= $${values.length}::date`);
  }
  if (filters.weekTo) {
    values.push(filters.weekTo);
    conds.push(`v.week_start <= $${values.length}::date`);
  }
  if (filters.techId) {
    values.push(filters.techId);
    // tech_id is a UUID in the view; cast input.
    conds.push(`v.tech_id = $${values.length}::uuid`);
  }
  if (filters.bayId) {
    values.push(filters.bayId);
    conds.push(`v.bay_id = $${values.length}`);
  }

  const sql = `
    SELECT
      COALESCE(v.tech_id::text, '')   AS tech_id,
      COALESCE(v.tech_name, '')       AS tech_name,
      v.bay_id                        AS bay_id,
      to_char(v.week_start, 'YYYY-MM-DD') AS week_start,
      COALESCE(v.hours_billed, 0)::float    AS hours_billed,
      COALESCE(v.hours_available, 40)::float AS hours_available,
      COALESCE(v.utilization, 0)::float     AS utilization,
      v.ro_count::int                  AS ro_count,
      COALESCE(v.labor_revenue, 0)::float AS labor_revenue
    FROM v_tech_utilization v
    WHERE ${conds.join(" AND ")}
    ORDER BY v.week_start DESC, v.tech_name, v.bay_id NULLS LAST
    LIMIT 5000
  `;
  return { sql, values };
}

/* -------------------------------------------------------------------------- */
/*  Ranking + plain-English headline                                           */
/* -------------------------------------------------------------------------- */

/** Format utilization as percent string. Allows >100% display ("117%"). */
export function formatUtilization(u: number): string {
  if (!Number.isFinite(u) || u < 0) return "0%";
  return `${Math.round(u * 100)}%`;
}

/** Format hours with one decimal. */
export function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0h";
  return `${h.toFixed(1)}h`;
}

/** Format a week_start ISO date as "week of May 4". */
export function weekLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (mo < 1 || mo > 12) return iso;
  return `week of ${names[mo - 1]} ${day}`;
}

/**
 * Plain-English headline. Picks the most-recent week's leader by utilization
 * (ties broken by hours_billed). Excludes zero-utilization rows.
 */
export function buildUtilizationHeadline(cells: TechUtilizationCell[]): string {
  if (!Array.isArray(cells) || cells.length === 0) {
    return "No repair orders billed in the selected window.";
  }
  const positive = cells.filter((c) => c.hours_billed > 0 && c.tech_name);
  if (positive.length === 0) {
    return "Techs were on the clock but no labor hours were billed this period.";
  }
  const sorted = [...positive].sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
  const latestWeek = sorted[0].week_start;
  const thisWeek = sorted.filter((c) => c.week_start === latestWeek);
  const top = thisWeek.reduce((best, c) => {
    if (c.utilization > best.utilization) return c;
    if (c.utilization === best.utilization && c.hours_billed > best.hours_billed) return c;
    return best;
  }, thisWeek[0]);
  const bayClause = top.bay_id ? ` in bay ${top.bay_id}` : "";
  return `${top.tech_name} billed ${formatHours(top.hours_billed)} (${formatUtilization(top.utilization)}) ${weekLabel(top.week_start)}${bayClause}.`;
}

/* -------------------------------------------------------------------------- */
/*  Public entrypoint                                                          */
/* -------------------------------------------------------------------------- */

export async function getTechUtilization(
  dealerId: string,
  filters: TechUtilizationFilters = {},
): Promise<TechUtilizationResult> {
  const { sql, values } = buildUtilizationQuery(dealerId, filters);
  const r = await query(sql, values);
  const cells: TechUtilizationCell[] = (r.rows ?? []).map((row: Record<string, unknown>) => ({
    tech_id: String(row.tech_id ?? ""),
    tech_name: String(row.tech_name ?? ""),
    bay_id: row.bay_id == null ? null : String(row.bay_id),
    week_start: String(row.week_start ?? ""),
    hours_billed: Number(row.hours_billed ?? 0),
    hours_available: Number(row.hours_available ?? 40),
    utilization: Number(row.utilization ?? 0),
    ro_count: Number(row.ro_count ?? 0),
    labor_revenue: Number(row.labor_revenue ?? 0),
  }));

  const techs = uniqueBy(
    cells.filter((c) => c.tech_name).map((c) => ({ id: c.tech_id, name: c.tech_name })),
    (t) => t.id || t.name,
  );
  const bays = Array.from(new Set(cells.map((c) => c.bay_id)));
  const weeks = Array.from(new Set(cells.map((c) => c.week_start))).sort();

  return {
    cells,
    headline: buildUtilizationHeadline(cells),
    techs,
    bays,
    weeks,
    generatedAt: new Date().toISOString(),
    hoursAvailableFromConstant: true,
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

export function demoUtilization(): TechUtilizationResult {
  const today = new Date();
  const weeks: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    // align to monday
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const techs = [
    { id: "demo-tech-1", name: "Sam Ortiz" },
    { id: "demo-tech-2", name: "Devon Reed" },
    { id: "demo-tech-3", name: "Priya Shah" },
  ];
  const bays = ["A1", "A2", "B1"];
  const cells: TechUtilizationCell[] = [];
  let seed = 7;
  for (const t of techs) {
    for (const b of bays) {
      for (const w of weeks) {
        seed = (seed * 9301 + 49297) % 233280;
        const noise = seed / 233280;
        const hb = 18 + noise * 24; // 18..42 hours
        const util = hb / 40;
        cells.push({
          tech_id: t.id,
          tech_name: t.name,
          bay_id: b,
          week_start: w,
          hours_billed: Number(hb.toFixed(1)),
          hours_available: 40,
          utilization: Number(util.toFixed(4)),
          ro_count: Math.max(1, Math.round(hb / 3)),
          labor_revenue: Math.round(hb * 145),
        });
      }
    }
  }
  return {
    cells,
    headline: buildUtilizationHeadline(cells),
    techs,
    bays,
    weeks,
    generatedAt: new Date().toISOString(),
    hoursAvailableFromConstant: true,
  };
}
