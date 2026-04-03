/**
 * Retention Cohort Analysis — Group visitors by first-visit period and track
 * return rates over time.
 *
 * Provides retention matrices, churn risk detection, and cohort comparison
 * for understanding long-term visitor engagement trends.
 */

import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type CohortPeriod = "week" | "month";

export interface VisitorEvent {
  visitorId: string;
  timestamp: string; // ISO 8601
}

export interface Cohort {
  /** Label for the cohort (e.g. "2026-W14" or "2026-03") */
  label: string;
  /** Start date of the cohort period */
  periodStart: string;
  /** Number of visitors who first visited in this period */
  size: number;
  /** Visitor IDs in this cohort */
  visitors: Set<string>;
}

export interface RetentionCell {
  /** Period offset from the cohort start (0 = same period, 1 = next period, etc.) */
  periodOffset: number;
  /** Number of visitors who returned */
  returnedCount: number;
  /** Percentage of cohort that returned (0-100) */
  retentionPercent: number;
}

export interface RetentionRow {
  cohortLabel: string;
  cohortSize: number;
  cells: RetentionCell[];
}

export interface RetentionMatrix {
  periodType: CohortPeriod;
  rows: RetentionRow[];
  /** Total unique visitors across all cohorts */
  totalVisitors: number;
  /** Average retention at each period offset */
  averageRetention: number[];
}

export interface ChurnRisk {
  cohortLabel: string;
  dropOffPercent: number;
  periodOffset: number;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface CohortComparison {
  cohortA: string;
  cohortB: string;
  retentionDiff: number[]; // positive = A is better
  overallDiffPercent: number;
  winner: "A" | "B" | "tie";
}

/* -------------------------------------------------------------------------- */
/*  Period helpers                                                             */
/* -------------------------------------------------------------------------- */

function getPeriodKey(date: Date, periodType: CohortPeriod): string {
  if (periodType === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  // ISO week
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400_000 + yearStart.getDay() + 1) / 7,
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function periodIndex(key: string, allPeriods: string[]): number {
  return allPeriods.indexOf(key);
}

/* -------------------------------------------------------------------------- */
/*  Core functions                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Group visitors into cohorts by their first visit period.
 */
export function buildCohorts(
  events: VisitorEvent[],
  periodType: CohortPeriod,
): Cohort[] {
  if (events.length === 0) return [];

  // Find each visitor's first event
  const firstVisit = new Map<string, Date>();
  for (const event of events) {
    const ts = new Date(event.timestamp);
    const existing = firstVisit.get(event.visitorId);
    if (!existing || ts < existing) {
      firstVisit.set(event.visitorId, ts);
    }
  }

  // Group by period
  const cohortMap = new Map<string, Set<string>>();
  for (const [visitorId, date] of firstVisit) {
    const key = getPeriodKey(date, periodType);
    if (!cohortMap.has(key)) cohortMap.set(key, new Set());
    cohortMap.get(key)!.add(visitorId);
  }

  // Sort by period key and build cohorts
  const sortedKeys = Array.from(cohortMap.keys()).sort();
  return sortedKeys.map((key) => {
    const visitors = cohortMap.get(key)!;
    return {
      label: key,
      periodStart: key,
      size: visitors.size,
      visitors,
    };
  });
}

/**
 * Calculate retention for a single cohort across subsequent periods.
 */
export function calculateRetention(
  cohort: Cohort,
  allEvents: VisitorEvent[],
  periodType: CohortPeriod,
  maxPeriods: number,
): RetentionCell[] {
  if (cohort.size === 0) return [];

  // Group all events by visitor + period
  const visitorPeriods = new Map<string, Set<string>>();
  for (const event of allEvents) {
    if (!cohort.visitors.has(event.visitorId)) continue;
    const key = getPeriodKey(new Date(event.timestamp), periodType);
    if (!visitorPeriods.has(event.visitorId))
      visitorPeriods.set(event.visitorId, new Set());
    visitorPeriods.get(event.visitorId)!.add(key);
  }

  // Collect all unique periods and sort
  const allPeriods = new Set<string>();
  for (const periods of visitorPeriods.values()) {
    for (const p of periods) allPeriods.add(p);
  }
  const sortedPeriods = Array.from(allPeriods).sort();

  const cohortPeriodIdx = periodIndex(cohort.label, sortedPeriods);
  if (cohortPeriodIdx === -1) return [];

  const cells: RetentionCell[] = [];
  const periodsToCheck = Math.min(maxPeriods, sortedPeriods.length - cohortPeriodIdx);

  for (let offset = 0; offset < periodsToCheck; offset++) {
    const targetPeriod = sortedPeriods[cohortPeriodIdx + offset];
    if (!targetPeriod) break;

    let returnedCount = 0;
    for (const [, periods] of visitorPeriods) {
      if (periods.has(targetPeriod)) returnedCount++;
    }

    cells.push({
      periodOffset: offset,
      returnedCount,
      retentionPercent: Math.round((returnedCount / cohort.size) * 100),
    });
  }

  return cells;
}

/**
 * Build a full retention matrix from visitor events.
 */
export function buildRetentionMatrix(
  events: VisitorEvent[],
  periodType: CohortPeriod,
  maxPeriods = 8,
): RetentionMatrix {
  const cohorts = buildCohorts(events, periodType);
  const rows: RetentionRow[] = cohorts.map((cohort) => ({
    cohortLabel: cohort.label,
    cohortSize: cohort.size,
    cells: calculateRetention(cohort, events, periodType, maxPeriods),
  }));

  // Calculate average retention at each offset
  const averageRetention: number[] = [];
  for (let offset = 0; offset < maxPeriods; offset++) {
    const values = rows
      .map((r) => r.cells.find((c) => c.periodOffset === offset))
      .filter(Boolean)
      .map((c) => c!.retentionPercent);
    averageRetention.push(
      values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0,
    );
  }

  const totalVisitors = cohorts.reduce((sum, c) => sum + c.size, 0);

  return { periodType, rows, totalVisitors, averageRetention };
}

/* -------------------------------------------------------------------------- */
/*  Churn risk detection                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Identify cohorts with steeper-than-average retention drop-off.
 */
export function identifyChurnRisk(matrix: RetentionMatrix): ChurnRisk[] {
  const risks: ChurnRisk[] = [];

  for (const row of matrix.rows) {
    for (let i = 1; i < row.cells.length; i++) {
      const prev = row.cells[i - 1];
      const curr = row.cells[i];
      if (!prev || !curr) continue;

      const dropOff = prev.retentionPercent - curr.retentionPercent;
      const avgDropOff =
        i < matrix.averageRetention.length
          ? (matrix.averageRetention[i - 1] ?? 0) - (matrix.averageRetention[i] ?? 0)
          : 0;

      // Flag if drop-off is significantly worse than average
      if (dropOff > avgDropOff + 15) {
        const severity =
          dropOff > avgDropOff + 30 ? "high" : dropOff > avgDropOff + 20 ? "medium" : "low";

        risks.push({
          cohortLabel: row.cohortLabel,
          dropOffPercent: dropOff,
          periodOffset: i,
          severity,
          message: `Cohort ${row.cohortLabel} dropped ${dropOff}% at period ${i} (avg: ${avgDropOff}%)`,
        });
      }
    }
  }

  return risks;
}

/* -------------------------------------------------------------------------- */
/*  Cohort comparison                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Compare retention between two cohorts.
 */
export function compareCohorts(
  matrix: RetentionMatrix,
  cohortLabelA: string,
  cohortLabelB: string,
): CohortComparison {
  const rowA = matrix.rows.find((r) => r.cohortLabel === cohortLabelA);
  const rowB = matrix.rows.find((r) => r.cohortLabel === cohortLabelB);

  if (!rowA || !rowB) {
    return {
      cohortA: cohortLabelA,
      cohortB: cohortLabelB,
      retentionDiff: [],
      overallDiffPercent: 0,
      winner: "tie",
    };
  }

  const maxLen = Math.max(rowA.cells.length, rowB.cells.length);
  const diffs: number[] = [];

  for (let i = 0; i < maxLen; i++) {
    const aVal = rowA.cells[i]?.retentionPercent ?? 0;
    const bVal = rowB.cells[i]?.retentionPercent ?? 0;
    diffs.push(aVal - bVal);
  }

  const overallDiff =
    diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;

  return {
    cohortA: cohortLabelA,
    cohortB: cohortLabelB,
    retentionDiff: diffs,
    overallDiffPercent: overallDiff,
    winner: overallDiff > 0 ? "A" : overallDiff < 0 ? "B" : "tie",
  };
}

/**
 * Get a demo retention matrix for shadow mode.
 */
export function getDemoRetentionMatrix(): RetentionMatrix {
  const rows: RetentionRow[] = [
    {
      cohortLabel: "2026-01",
      cohortSize: 1240,
      cells: [
        { periodOffset: 0, returnedCount: 1240, retentionPercent: 100 },
        { periodOffset: 1, returnedCount: 682, retentionPercent: 55 },
        { periodOffset: 2, returnedCount: 521, retentionPercent: 42 },
        { periodOffset: 3, returnedCount: 409, retentionPercent: 33 },
      ],
    },
    {
      cohortLabel: "2026-02",
      cohortSize: 1380,
      cells: [
        { periodOffset: 0, returnedCount: 1380, retentionPercent: 100 },
        { periodOffset: 1, returnedCount: 814, retentionPercent: 59 },
        { periodOffset: 2, returnedCount: 580, retentionPercent: 42 },
      ],
    },
    {
      cohortLabel: "2026-03",
      cohortSize: 1520,
      cells: [
        { periodOffset: 0, returnedCount: 1520, retentionPercent: 100 },
        { periodOffset: 1, returnedCount: 912, retentionPercent: 60 },
      ],
    },
    {
      cohortLabel: "2026-04",
      cohortSize: 1650,
      cells: [
        { periodOffset: 0, returnedCount: 1650, retentionPercent: 100 },
      ],
    },
  ];

  return {
    periodType: "month",
    rows,
    totalVisitors: 5790,
    averageRetention: [100, 58, 42, 33],
  };
}
