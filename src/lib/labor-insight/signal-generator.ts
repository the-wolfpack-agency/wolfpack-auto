/**
 * Labor Insight Signal Generator — pure function that maps GL + payroll inputs
 * into dealer-language `LaborInsight[]`.
 *
 * Pure: no I/O, no DB, no cache. Deterministic for testability. The composer
 * (index.ts) gathers the real GL + payroll data and feeds it here.
 *
 * Two insights, each emitted ONLY when the data supports it (otherwise the
 * generator returns fewer — or zero — insights; it NEVER fabricates numbers):
 *
 *  1. commission_concentration — "3 of your 12 people carry 60% of billed hours
 *     and drove $X in overtime last period." Requires >= 3 people with billed
 *     hours. When work is spread evenly it says so instead of inventing a skew.
 *
 *  2. labor_cost_vs_margin — "Labor is 22% of gross profit, up 4 points; the
 *     extra came from overtime, not headcount." Requires gross profit > 0 and
 *     labor cost > 0. The "up N points" clause and its driver are emitted ONLY
 *     when a prior period exists; otherwise it degrades to the current level.
 *
 * Copy is plain dealership language per `.ai/client-context.md` (speak
 * dealership language) — no raw signals, no developer jargon.
 */

import type {
  LaborInsight,
  LaborInsightInput,
  LaborInsightSeverity,
  LaborPersonStat,
} from "@/lib/labor-insight/types";

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Whole-dollar USD, e.g. 12345.6 -> "$12,346". */
function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(1, +n.toFixed(3)));
}

/**
 * Smallest group of top people whose cumulative billed hours cross the majority
 * threshold (>= 50% of total). Returns the group size + the exact cumulative %.
 */
function majorityCarriers(
  people: LaborPersonStat[],
  totalHours: number,
): { topCount: number; carryPct: number } {
  const sorted = [...people].sort((a, b) => b.billedHours - a.billedHours);
  let cum = 0;
  let topCount = 0;
  for (const p of sorted) {
    cum += p.billedHours;
    topCount++;
    if (cum / totalHours >= 0.5) break;
  }
  return { topCount, carryPct: Math.round((cum / totalHours) * 100) };
}

/**
 * Insight 1: uneven shifts / commission concentration.
 * Returns null when there aren't enough people (< 3) or no billed hours.
 */
function concentrationInsight(input: LaborInsightInput): LaborInsight | null {
  const people = input.people.filter((p) => p.billedHours > 0);
  const headcount = people.length;
  if (headcount < 3) return null;

  const totalHours = round2(people.reduce((s, p) => s + p.billedHours, 0));
  if (totalHours <= 0) return null;

  const { topCount, carryPct } = majorityCarriers(people, totalHours);
  const overtimeDollars = round2(people.reduce((s, p) => s + p.overtimePay, 0));

  // A genuine minority (<= 40% of headcount) carrying a majority of the hours.
  const minorityThreshold = Math.max(1, Math.ceil(headcount * 0.4));
  const concentrated =
    topCount <= minorityThreshold && carryPct >= 50 && topCount < headcount;

  let text: string;
  let severity: LaborInsightSeverity;
  if (concentrated) {
    const otClause =
      overtimeDollars > 0
        ? ` and drove ${formatUsd(overtimeDollars)} in overtime last period.`
        : " last period.";
    text = `${topCount} of your ${headcount} people carry ${carryPct}% of billed hours${otClause}`;
    // Heavily concentrated (top quarter carries the majority) => act.
    severity =
      topCount <= Math.max(1, Math.ceil(headcount * 0.25)) ? "action" : "watch";
  } else {
    const otClause =
      overtimeDollars > 0
        ? `, though overtime still cost ${formatUsd(overtimeDollars)} last period.`
        : ".";
    text = `Billed hours are spread evenly across your ${headcount} people — no small group is carrying the load${otClause}`;
    severity = "info";
  }

  const confidence = clampConfidence(
    0.6 + (concentrated ? 0.2 : 0) + Math.min(0.15, (headcount - 3) * 0.03),
  );

  const topPeople = [...people]
    .sort((a, b) => b.billedHours - a.billedHours)
    .slice(0, topCount)
    .map((p) => ({
      name: p.employeeName,
      department: p.department,
      billed_hours: round2(p.billedHours),
      overtime_hours: round2(p.overtimeHours),
    }));

  return {
    id: `labor_concentration_${input.dealerId}_${input.periodEnd}`,
    dealerId: input.dealerId,
    kind: "commission_concentration",
    insight: text,
    category: "labor",
    confidence,
    sample_size: headcount,
    severity,
    generated_at: new Date().toISOString(),
    data: {
      headcount,
      top_count: topCount,
      carry_pct: carryPct,
      total_billed_hours: totalHours,
      overtime_dollars: overtimeDollars,
      concentrated,
      top_people: topPeople,
    },
  };
}

/**
 * Insight 2: labor cost vs margin.
 * Returns null when gross profit <= 0 or labor cost <= 0 (nothing to cross).
 */
function marginInsight(input: LaborInsightInput): LaborInsight | null {
  const { grossProfit, laborCost, overtimeCost, headcount, priorLaborPct, priorHeadcount } =
    input.ledger;
  if (grossProfit <= 0 || laborCost <= 0) return null;

  const laborPct = round1((laborCost / grossProfit) * 100);

  let text: string;
  let confidence: number;
  let severity: LaborInsightSeverity;
  let deltaPoints: number | null = null;

  if (priorLaborPct != null) {
    deltaPoints = round1(laborPct - priorLaborPct);
    const magnitude = Math.abs(deltaPoints);
    const headcountGrew = priorHeadcount != null && headcount > priorHeadcount;

    if (magnitude < 0.1) {
      text = `Labor is holding at ${laborPct}% of your gross profit, flat versus last period.`;
      severity = laborPct >= 25 ? "watch" : "info";
    } else {
      const dir = deltaPoints > 0 ? "up" : "down";
      const pointWord = magnitude === 1 ? "point" : "points";
      let driver = ".";
      if (deltaPoints > 0) {
        if (overtimeCost > 0 && !headcountGrew) {
          driver = "; the extra came from overtime, not headcount.";
        } else if (headcountGrew) {
          driver = "; the extra came from added headcount.";
        }
      }
      text = `Labor is ${laborPct}% of your gross profit, ${dir} ${magnitude} ${pointWord}${driver}`;
      severity = deltaPoints >= 3 || laborPct >= 25 ? "action" : deltaPoints > 0 ? "watch" : "info";
    }
    confidence = 0.85;
  } else {
    text = `Labor is running at ${laborPct}% of your gross profit this period. Once there's a prior period to compare, we'll flag whether that's climbing.`;
    severity = laborPct >= 25 ? "watch" : "info";
    confidence = 0.55;
  }

  return {
    id: `labor_margin_${input.dealerId}_${input.periodEnd}`,
    dealerId: input.dealerId,
    kind: "labor_cost_vs_margin",
    insight: text,
    category: "labor",
    confidence: clampConfidence(confidence),
    sample_size: Math.max(headcount, 1),
    severity,
    generated_at: new Date().toISOString(),
    data: {
      labor_pct: laborPct,
      labor_cost: round2(laborCost),
      gross_profit: round2(grossProfit),
      overtime_cost: round2(overtimeCost),
      headcount,
      prior_labor_pct: priorLaborPct,
      prior_headcount: priorHeadcount,
      delta_points: deltaPoints,
    },
  };
}

/**
 * Pure generator. Returns the insights the data supports, most-actionable
 * kinds first. Returns [] when neither insight has enough data — the caller
 * renders an explicit empty state (never a fabricated number).
 */
export function generateLaborInsights(input: LaborInsightInput): LaborInsight[] {
  const insights: LaborInsight[] = [];
  const margin = marginInsight(input);
  if (margin) insights.push(margin);
  const concentration = concentrationInsight(input);
  if (concentration) insights.push(concentration);
  return insights;
}
