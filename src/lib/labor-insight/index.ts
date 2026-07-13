/**
 * Labor Insight — public surface.
 *
 * Composes the two live modules (General Ledger + Payroll) into one dealer-facing
 * insight report:
 *   - gatherPeople()  -> Payroll `getPayPeriodSummary` -> per-person billed hours
 *   - gatherLedger()  -> GL labor-cost postings crossed against margin + priors
 *   - generateLaborInsights() (pure)
 *   - refreshLaborInsights() persists: snapshot upsert + triple-write + analytics
 *     + audit. computeLaborInsights() is the read-only path the page uses.
 *
 * Never throws to the caller — degrades to an empty (or demo) report so the
 * route/page can render an explicit empty state. NEVER fabricates numbers on
 * the real-data path; the demo fixture is separate and flagged `isDemo`.
 */

import { getPayPeriodSummary } from "@/lib/payroll-integration";
import {
  auditGenerate,
  emitGenerateAnalytics,
  emitViewAnalytics,
  persistLaborInsights,
  tripleWriteLaborInsights,
} from "@/lib/labor-insight/persistence";
import { generateLaborInsights } from "@/lib/labor-insight/signal-generator";
import type {
  LaborInsightInput,
  LaborInsightReport,
  LaborLedgerSummary,
  LaborPersonStat,
} from "@/lib/labor-insight/types";

export * from "@/lib/labor-insight/types";
export { generateLaborInsights } from "@/lib/labor-insight/signal-generator";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/*  Period resolution                                                  */
/* ------------------------------------------------------------------ */

export interface LaborPeriod {
  periodStart: string;
  periodEnd: string;
  priorStart: string;
  priorEnd: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Default period is the current calendar month to date; prior period is the
 * full previous calendar month. Explicit start/end (validated ISO) override the
 * current period; the prior period is always the calendar month before start.
 */
export function resolvePeriod(
  startParam?: string | null,
  endParam?: string | null,
  now: Date = new Date(),
): LaborPeriod {
  const validStart = startParam && ISO_DATE.test(startParam) ? startParam : null;
  const validEnd = endParam && ISO_DATE.test(endParam) ? endParam : null;

  const periodStart = validStart ?? iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = validEnd ?? iso(now);

  const startDate = new Date(`${periodStart}T00:00:00Z`);
  const priorEndDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 0));
  const priorStartDate = new Date(Date.UTC(priorEndDate.getUTCFullYear(), priorEndDate.getUTCMonth(), 1));

  return {
    periodStart,
    periodEnd,
    priorStart: iso(priorStartDate),
    priorEnd: iso(priorEndDate),
  };
}

/* ------------------------------------------------------------------ */
/*  Payroll side                                                       */
/* ------------------------------------------------------------------ */

async function gatherPeople(
  dealerId: string,
  periodStart: string,
  periodEnd: string,
): Promise<LaborPersonStat[]> {
  try {
    const summaries = await getPayPeriodSummary(dealerId, periodStart, periodEnd);
    return summaries.map((s) => ({
      employeeId: s.employee_id,
      employeeName: s.employee_name,
      department: s.department,
      billedHours: round2(s.regular_hours + s.overtime_hours),
      overtimeHours: round2(s.overtime_hours),
      overtimePay: round2(s.overtime_pay),
      grossPay: round2(s.gross_pay),
    }));
  } catch (err) {
    console.error("[labor-insight] gatherPeople failed:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  General Ledger side                                                */
/* ------------------------------------------------------------------ */

/**
 * Sum posted GL activity for a date range into gross profit (revenue - COGS)
 * and labor cost (all `payroll_expense` sub-type accounts). Returns null when
 * there's no DB — the caller then degrades.
 */
async function glPeriodSummary(
  dealerId: string,
  start: string,
  end: string,
): Promise<{ grossProfit: number; laborCost: number } | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const { rows } = await query(
      /* audit-safe: A4 reason="dealer_id from session/tenant context, never request body" */
      `SELECT coa.account_type AS account_type,
              coa.sub_type     AS sub_type,
              COALESCE(SUM(jel.debit - jel.credit), 0) AS net
         FROM journal_entry_lines jel
         JOIN journal_entries je
           ON je.id = jel.journal_entry_id AND je.dealer_id = jel.dealer_id
         JOIN chart_of_accounts coa
           ON coa.id = jel.account_id AND coa.dealer_id = jel.dealer_id
        WHERE jel.dealer_id = $1
          AND je.status = 'posted'
          AND je.entry_date >= $2
          AND je.entry_date <= $3
        GROUP BY coa.account_type, coa.sub_type`,
      [dealerId, start, end],
    );

    let revenue = 0;
    let cogs = 0;
    let labor = 0;
    for (const r of rows as Array<Record<string, unknown>>) {
      const net = Number(r.net) || 0;
      const type = String(r.account_type);
      // Revenue accounts are credit-normal: a credit balance is positive revenue.
      if (type === "revenue") revenue += -net;
      else if (type === "cogs") cogs += net;
      // Labor cost = all payroll_expense postings (debit-normal expense).
      if (String(r.sub_type) === "payroll_expense") labor += net;
    }
    return { grossProfit: round2(revenue - cogs), laborCost: round2(labor) };
  } catch (err) {
    console.error("[labor-insight] glPeriodSummary failed:", err);
    return null;
  }
}

/** Distinct employees with time entries in a range — for the "not headcount" driver. */
async function activeHeadcount(
  dealerId: string,
  start: string,
  end: string,
): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const { rows } = await query(
      /* audit-safe: A4 reason="dealer_id from session/tenant context, never request body" */
      `SELECT COUNT(DISTINCT employee_id) AS n
         FROM time_entries
        WHERE dealer_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
      [dealerId, start, end],
    );
    const n = Number((rows as Array<Record<string, unknown>>)[0]?.n);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.error("[labor-insight] activeHeadcount failed:", err);
    return null;
  }
}

async function gatherLedger(
  dealerId: string,
  period: LaborPeriod,
  people: LaborPersonStat[],
): Promise<LaborLedgerSummary> {
  const overtimeCost = round2(people.reduce((s, p) => s + p.overtimePay, 0));
  const headcount = people.length;

  const current = await glPeriodSummary(dealerId, period.periodStart, period.periodEnd);
  const prior = await glPeriodSummary(dealerId, period.priorStart, period.priorEnd);
  const priorHeadcount = await activeHeadcount(dealerId, period.priorStart, period.priorEnd);

  const priorLaborPct =
    prior && prior.grossProfit > 0 && prior.laborCost > 0
      ? round2((prior.laborCost / prior.grossProfit) * 100)
      : null;

  return {
    grossProfit: current?.grossProfit ?? 0,
    laborCost: current?.laborCost ?? 0,
    overtimeCost,
    headcount,
    priorLaborPct,
    priorHeadcount,
  };
}

/* ------------------------------------------------------------------ */
/*  Compose                                                            */
/* ------------------------------------------------------------------ */

/**
 * Read-only: gather live GL + payroll data and generate the report WITHOUT
 * persisting. This is what the admin page renders. Emits a view analytics event.
 */
export async function computeLaborInsights(
  dealerId: string,
  period: LaborPeriod = resolvePeriod(),
): Promise<LaborInsightReport> {
  if (!process.env.DATABASE_URL) {
    const report = demoLaborInsights(dealerId, period);
    emitViewAnalytics(report);
    return report;
  }

  const people = await gatherPeople(dealerId, period.periodStart, period.periodEnd);
  const ledger = await gatherLedger(dealerId, period, people);
  const input: LaborInsightInput = {
    dealerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    people,
    ledger,
  };
  const report: LaborInsightReport = {
    dealerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    headcount: people.length,
    insights: generateLaborInsights(input),
    ledger,
    isDemo: false,
    generatedAt: new Date().toISOString(),
  };
  emitViewAnalytics(report);
  return report;
}

export interface RefreshOptions {
  via: "api" | "cron";
  userId?: string;
  period?: LaborPeriod;
}

/**
 * Full refresh: compute, then persist (snapshot upsert + triple-write fan-out +
 * generate analytics + audit). Used by the API route (and any cron). In shadow
 * mode (no DB) it returns the demo report and skips persistence.
 */
export async function refreshLaborInsights(
  dealerId: string,
  opts: RefreshOptions,
): Promise<LaborInsightReport> {
  const period = opts.period ?? resolvePeriod();

  if (!process.env.DATABASE_URL) {
    const report = demoLaborInsights(dealerId, period);
    emitGenerateAnalytics(report);
    return report;
  }

  const people = await gatherPeople(dealerId, period.periodStart, period.periodEnd);
  const ledger = await gatherLedger(dealerId, period, people);
  const input: LaborInsightInput = {
    dealerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    people,
    ledger,
  };
  const report: LaborInsightReport = {
    dealerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    headcount: people.length,
    insights: generateLaborInsights(input),
    ledger,
    isDemo: false,
    generatedAt: new Date().toISOString(),
  };

  // Postgres first (source of truth), then best-effort fan-out.
  await persistLaborInsights(report);
  tripleWriteLaborInsights(report).catch(() => {});
  emitGenerateAnalytics(report);
  auditGenerate(report, opts.userId, opts.via).catch(() => {});

  return report;
}

/* ------------------------------------------------------------------ */
/*  Demo fixture (shadow mode only, flagged isDemo)                    */
/* ------------------------------------------------------------------ */

/**
 * Representative demo inputs run through the SAME pure generator, so demo copy
 * matches the real formula exactly (DRY). Used only when there is no database
 * so the pilot surface still shows its value in a shadow/demo deploy.
 */
export function demoLaborInsights(
  dealerId: string,
  period: LaborPeriod = resolvePeriod(),
): LaborInsightReport {
  const names = [
    "Jordan Blake", "Casey Rivera", "Morgan Reid", "Taylor Nguyen",
    "Sam Ellis", "Alex Cho", "Riley Dawson", "Jamie Ford",
    "Drew Patel", "Quinn Alvarez", "Avery Sims", "Robin Hale",
  ];
  // Three people carry most of the billed hours; the rest are light.
  const hours = [60, 52, 44, 18, 16, 14, 12, 11, 10, 9, 8, 6];
  const ot = [240, 200, 150, 20, 0, 0, 0, 0, 0, 0, 0, 0];
  const people: LaborPersonStat[] = names.map((name, i) => ({
    employeeId: `demo-${i + 1}`,
    employeeName: name,
    department: i < 4 ? "service" : i < 8 ? "sales" : "parts",
    billedHours: hours[i],
    overtimeHours: ot[i] > 0 ? round2(ot[i] / 30) : 0,
    overtimePay: ot[i],
    grossPay: hours[i] * 30 + ot[i],
  }));

  const ledger: LaborLedgerSummary = {
    grossProfit: 420_000,
    laborCost: 92_400, // 22% of gross profit
    overtimeCost: round2(people.reduce((s, p) => s + p.overtimePay, 0)),
    headcount: people.length,
    priorLaborPct: 18, // up 4 points this period
    priorHeadcount: people.length, // headcount flat -> "the extra came from overtime, not headcount"
  };

  const input: LaborInsightInput = {
    dealerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    people,
    ledger,
  };

  return {
    dealerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    headcount: people.length,
    insights: generateLaborInsights(input),
    ledger,
    isDemo: true,
    generatedAt: new Date().toISOString(),
  };
}
