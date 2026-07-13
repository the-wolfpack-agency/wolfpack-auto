/**
 * Labor Insight persistence layer.
 *
 * Writes:
 *   - labor_cost_insights (migration 086) — upsert on
 *     (dealer_id, kind, period_start, period_end) so there's always exactly one
 *     current row per kind per period.
 *
 * Learning fan-out (Qdrant + Neo4j) goes through @/lib/triple-write —
 * NEVER writes Qdrant/Neo4j directly. Every refresh also emits:
 *   - typed system.* analytics via @/lib/analytics-hooks trackSystem
 *   - an audit_log row via @/lib/audit-log
 *
 * Every DB write is dealer-scoped and swallows its own errors so a partial
 * failure never breaks the caller (same contract as the market-intel layer).
 */

import type { AnalyticsEvent } from "@/lib/analytics-engine";
import { trackSystem } from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";
import { writeEventsToSecondaryStores } from "@/lib/triple-write";
import type { LaborInsight, LaborInsightReport } from "@/lib/labor-insight/types";

const toCents = (dollars: number): number => Math.round(dollars * 100);

/* ------------------------------------------------------------------ */
/*  Postgres                                                            */
/* ------------------------------------------------------------------ */

/**
 * Upsert one derived insight. The shared ledger cents live on the report so
 * both kinds carry the same period-level money context.
 */
export async function upsertLaborInsight(
  report: LaborInsightReport,
  insight: LaborInsight,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    const laborPct =
      typeof insight.data.labor_pct === "number"
        ? (insight.data.labor_pct as number)
        : null;
    await query(
      /* audit-safe: A4 reason="dealer_id from report built via session/tenant context, never request body" */
      `INSERT INTO labor_cost_insights
         (dealer_id, kind, period_start, period_end, insight_text, category,
          severity, confidence, sample_size, headcount, labor_cost_cents,
          gross_profit_cents, overtime_cost_cents, labor_pct, data, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (dealer_id, kind, period_start, period_end) DO UPDATE SET
         insight_text        = EXCLUDED.insight_text,
         category            = EXCLUDED.category,
         severity            = EXCLUDED.severity,
         confidence          = EXCLUDED.confidence,
         sample_size         = EXCLUDED.sample_size,
         headcount           = EXCLUDED.headcount,
         labor_cost_cents    = EXCLUDED.labor_cost_cents,
         gross_profit_cents  = EXCLUDED.gross_profit_cents,
         overtime_cost_cents = EXCLUDED.overtime_cost_cents,
         labor_pct           = EXCLUDED.labor_pct,
         data                = EXCLUDED.data,
         generated_at        = EXCLUDED.generated_at,
         updated_at          = NOW()`,
      [
        report.dealerId,
        insight.kind,
        report.periodStart,
        report.periodEnd,
        insight.insight,
        insight.category,
        insight.severity,
        insight.confidence,
        insight.sample_size,
        report.headcount,
        toCents(report.ledger.laborCost),
        toCents(report.ledger.grossProfit),
        toCents(report.ledger.overtimeCost),
        laborPct,
        JSON.stringify(insight.data),
        insight.generated_at,
      ],
    );
  } catch (err) {
    console.error("[labor-insight] upsertLaborInsight failed:", err);
  }
}

/** Persist every insight in a report (Postgres, source of truth). */
export async function persistLaborInsights(
  report: LaborInsightReport,
): Promise<void> {
  for (const insight of report.insights) {
    await upsertLaborInsight(report, insight);
  }
}

/* ------------------------------------------------------------------ */
/*  Learning fan-out (Qdrant + Neo4j) via triple-write.ts              */
/* ------------------------------------------------------------------ */

/**
 * Represent each insight as an AnalyticsEvent and fan it out to the secondary
 * stores through the single durable writer. Fire-and-forget; never awaited by
 * the caller for the response path.
 */
export async function tripleWriteLaborInsights(
  report: LaborInsightReport,
): Promise<void> {
  if (report.insights.length === 0) return;
  const events: AnalyticsEvent[] = report.insights.map((insight) => ({
    event_type: "labor_insight",
    action: insight.kind,
    page: "/admin/labor-insights",
    session_id: `${report.dealerId}:${report.periodEnd}`,
    user_fingerprint: report.dealerId,
    timestamp: insight.generated_at,
    metadata: {
      dealer_id: report.dealerId,
      kind: insight.kind,
      severity: insight.severity,
      confidence: insight.confidence,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      insight: insight.insight,
      ...insight.data,
    },
  }));
  try {
    await writeEventsToSecondaryStores(events);
  } catch (err) {
    console.warn("[labor-insight] triple-write fan-out failed (non-blocking):", err);
  }
}

/* ------------------------------------------------------------------ */
/*  Analytics + audit                                                  */
/* ------------------------------------------------------------------ */

/** Emit one typed system.* event per generated insight. Never throws. */
export function emitGenerateAnalytics(report: LaborInsightReport): void {
  try {
    for (const insight of report.insights) {
      trackSystem("system.labor_insight_generated", report.dealerId, {
        kind: insight.kind,
        severity: insight.severity,
        confidence: insight.confidence,
        headcount: report.headcount,
        is_demo: report.isDemo,
      });
    }
  } catch (err) {
    console.error("[labor-insight] emitGenerateAnalytics failed:", err);
  }
}

/** Emit a single view event when the operator opens the surface. */
export function emitViewAnalytics(report: LaborInsightReport): void {
  try {
    trackSystem("system.labor_insight_viewed", report.dealerId, {
      insight_count: report.insights.length,
      headcount: report.headcount,
      is_demo: report.isDemo,
    });
  } catch (err) {
    console.error("[labor-insight] emitViewAnalytics failed:", err);
  }
}

/** Append an audit_log row for the (mutating) refresh. Self-guards on DB. */
export async function auditGenerate(
  report: LaborInsightReport,
  userId: string | undefined,
  via: "api" | "cron",
): Promise<void> {
  await auditLog(
    "labor_insight.generate",
    {
      dealer_id: report.dealerId,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      insight_count: report.insights.length,
      kinds: report.insights.map((i) => i.kind),
      via,
    },
    userId,
    report.dealerId,
  );
}
