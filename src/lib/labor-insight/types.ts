/**
 * Labor Insight — shared types for the cross-tool labor-efficiency surface.
 *
 * This module ports two ALREADY-LIVE deterministic modules into one dealer-facing
 * insight surface:
 *   - General Ledger  (src/lib/general-ledger.ts)   — labor-cost postings + margin
 *   - Payroll         (src/lib/payroll-integration.ts) — billed hours, overtime,
 *                                                        commission concentration
 *
 * Structure mirrors src/lib/market-intel/ (the canonical insight module):
 *   - types.ts           this file
 *   - signal-generator.ts  pure fn: GL + payroll inputs => LaborInsight[]
 *   - persistence.ts     snapshot upsert + triple-write + analytics + audit
 *   - index.ts           composes generator + persistence for the route/page
 *
 * The insight shape is compatible with `BehavioralInsight` from
 * src/lib/analytics-engine.ts (insight / category / confidence / sample_size /
 * generated_at / data) so downstream RAG + dashboards can consume it uniformly.
 */

/** Which cross-tool insight a row represents. Mirrors the migration 086 CHECK. */
export type LaborInsightKind =
  | "commission_concentration"
  | "labor_cost_vs_margin";

/** How loudly the surface should present the insight. */
export type LaborInsightSeverity = "info" | "watch" | "action";

/**
 * Per-person labor stat, sourced from Payroll's `PayPeriodSummary`.
 * `billedHours` = regular_hours + overtime_hours; `overtimePay` is in dollars.
 */
export interface LaborPersonStat {
  employeeId: string;
  employeeName: string;
  department: string;
  billedHours: number;
  overtimeHours: number;
  overtimePay: number;
  grossPay: number;
}

/**
 * Ledger-side summary for the labor-vs-margin insight. All money in dollars.
 * `grossProfit` is the margin denominator (revenue - COGS from the GL P&L).
 * `laborCost` is the sum of `payroll_expense` GL account postings for the period.
 * `overtimeCost` is the OT dollars from payroll (crosses payroll -> GL).
 * Prior-period fields are nullable so the generator degrades gracefully when
 * there is nothing to compare against.
 */
export interface LaborLedgerSummary {
  grossProfit: number;
  laborCost: number;
  overtimeCost: number;
  headcount: number;
  priorLaborPct: number | null;
  priorHeadcount: number | null;
}

/** Everything the pure generator needs. No I/O — deterministic + testable. */
export interface LaborInsightInput {
  dealerId: string;
  periodStart: string;
  periodEnd: string;
  people: LaborPersonStat[];
  ledger: LaborLedgerSummary;
}

/** A single derived labor insight, BehavioralInsight-compatible. */
export interface LaborInsight {
  id: string;
  dealerId: string;
  kind: LaborInsightKind;
  /** Human-readable, dealership-language text. Never developer jargon. */
  insight: string;
  /** Fixed "labor" so the analytics brain can group cross-tool insights. */
  category: string;
  /** 0..1 trust signal for the dashboard chip. */
  confidence: number;
  /** Number of underlying records (people) that fed the insight. */
  sample_size: number;
  severity: LaborInsightSeverity;
  generated_at: string;
  /** Raw aggregation data — safe numeric fields only, no PII beyond names. */
  data: Record<string, unknown>;
}

/** The full report the route + page render. `isDemo` flags the shadow fixture. */
export interface LaborInsightReport {
  dealerId: string;
  periodStart: string;
  periodEnd: string;
  headcount: number;
  insights: LaborInsight[];
  ledger: LaborLedgerSummary;
  isDemo: boolean;
  generatedAt: string;
}
