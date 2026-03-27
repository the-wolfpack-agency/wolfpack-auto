/**
 * Funnel Health Metrics Engine
 *
 * Computes lead pipeline health metrics for the Network-wide Lead Funnel
 * Health Dashboard. Queries PostgreSQL when DATABASE_URL is set; falls back
 * to realistic sample data derived from the existing SAMPLE_LEADS dataset so
 * the dashboard renders immediately without infrastructure.
 */

import { query } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface FunnelHealthMetrics {
  // Lead volume
  leadsLast24h: number;
  leadsLast7d: number;
  leadsLast30d: number;
  leadsTrend: "up" | "down" | "flat"; // compare 7d vs prior 7d

  // Response SLA
  slaCompliance24h: number; // % leads responded to within 24h (0-100)
  slaCompliance1h: number; // % leads responded to within 1h (hot leads standard)
  avgResponseTimeHours: number;
  overdueLeads: number; // new leads > 24h old with no status change

  // Conversion funnel
  funnelStages: {
    new: number;
    contacted: number;
    qualified: number;
    appointment_set: number;
    sold: number;
    lost: number;
  };
  conversionRate: number; // (sold / total) * 100
  qualificationRate: number; // (qualified + above / contacted) * 100

  // Source breakdown
  sourceBreakdown: Array<{
    source: string;
    count: number;
    conversionRate: number;
  }>;

  // Health score
  healthScore: number; // 0-100 composite
  healthGrade: "A" | "B" | "C" | "D" | "F";
  alerts: Array<{
    severity: "critical" | "warning" | "info";
    message: string;
    action: string;
  }>;
}

/* -------------------------------------------------------------------------- */
/* Health score + grade helpers                                                */
/* -------------------------------------------------------------------------- */

function computeHealthScore(metrics: Omit<FunnelHealthMetrics, "healthScore" | "healthGrade" | "alerts">): number {
  // SLA compliance (40 pts): slaCompliance24h * 0.4
  const slaPoints = metrics.slaCompliance24h * 0.4;

  // Lead volume trend (20 pts): up=20, flat=10, down=0
  const trendPoints = metrics.leadsTrend === "up" ? 20 : metrics.leadsTrend === "flat" ? 10 : 0;

  // Conversion rate (25 pts): conversionRate * 2.5 (capped at 25)
  const conversionPoints = Math.min(25, metrics.conversionRate * 2.5);

  // Response speed (15 pts)
  let responsePoints = 0;
  if (metrics.avgResponseTimeHours < 1) responsePoints = 15;
  else if (metrics.avgResponseTimeHours < 4) responsePoints = 10;
  else if (metrics.avgResponseTimeHours < 24) responsePoints = 5;

  return Math.round(slaPoints + trendPoints + conversionPoints + responsePoints);
}

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/* -------------------------------------------------------------------------- */
/* Alert generator                                                             */
/* -------------------------------------------------------------------------- */

function buildAlerts(
  metrics: Omit<FunnelHealthMetrics, "healthScore" | "healthGrade" | "alerts">,
): FunnelHealthMetrics["alerts"] {
  const alerts: FunnelHealthMetrics["alerts"] = [];

  if (metrics.overdueLeads > 5) {
    alerts.push({
      severity: "critical",
      message: `${metrics.overdueLeads} leads have not been contacted in 24+ hours`,
      action: "Assign and contact these leads immediately to avoid losing them",
    });
  }

  if (metrics.slaCompliance24h < 50) {
    alerts.push({
      severity: "critical",
      message: "Response time SLA is critically low",
      action: "Review staffing and lead routing — buyers expect contact within hours",
    });
  }

  if (metrics.leadsLast24h === 0 && metrics.leadsLast7d > 0) {
    alerts.push({
      severity: "warning",
      message: "No new leads today — check your form and listings",
      action: "Verify contact forms, third-party listings, and ad campaigns are active",
    });
  }

  if (metrics.conversionRate < 5) {
    alerts.push({
      severity: "warning",
      message: "Conversion rate below industry average of 5-10%",
      action: "Review follow-up cadence and qualification process",
    });
  }

  if (metrics.leadsTrend === "down") {
    alerts.push({
      severity: "info",
      message: "Lead volume down vs last week",
      action: "Check marketing spend and listing quality to reverse the trend",
    });
  }

  return alerts;
}

/* -------------------------------------------------------------------------- */
/* Empty/error default                                                         */
/* -------------------------------------------------------------------------- */

function emptyMetrics(dealerId: string): FunnelHealthMetrics {
  return {
    leadsLast24h: 0,
    leadsLast7d: 0,
    leadsLast30d: 0,
    leadsTrend: "flat",
    slaCompliance24h: 0,
    slaCompliance1h: 0,
    avgResponseTimeHours: 0,
    overdueLeads: 0,
    funnelStages: {
      new: 0,
      contacted: 0,
      qualified: 0,
      appointment_set: 0,
      sold: 0,
      lost: 0,
    },
    conversionRate: 0,
    qualificationRate: 0,
    sourceBreakdown: [],
    healthScore: 0,
    healthGrade: "F",
    alerts: [
      {
        severity: "critical",
        message: "Lead data is unavailable — database connection failed",
        action: "Check DATABASE_URL and ensure the database is reachable",
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Sample data fallback (mirrors the SAMPLE_LEADS in the leads route)         */
/* -------------------------------------------------------------------------- */

function sampleMetrics(): FunnelHealthMetrics {
  // Derived from the 10 sample leads in api/admin/leads/route.ts
  // new: lead-001, lead-007, lead-009  (3)
  // contacted: lead-002, lead-008      (2)
  // qualified: lead-003, lead-010      (2)
  // appointment_set: lead-004          (1)
  // sold: lead-005                     (1)
  // lost: lead-006                     (1)
  const total = 10;
  const sold = 1;
  const contacted = 2;
  const qualified = 2;
  const appointmentSet = 1;

  // Overdue: new leads older than 24h — lead-001 (2026-03-24) qualifies
  const overdueLeads = 1;

  // SLA: 8 of 10 leads were responded to (all except the two "new" older ones)
  const slaCompliance24h = 80;
  const slaCompliance1h = 60;
  const avgResponseTimeHours = 2.4;

  // Volume: 2 new leads today (lead-007 2026-03-25, lead-009 2026-03-25)
  const leadsLast24h = 2;
  const leadsLast7d = 8; // most within the past week
  const leadsLast30d = 10;

  const conversionRate = (sold / total) * 100; // 10%
  const qualificationRate =
    contacted > 0 ? ((qualified + appointmentSet + sold) / contacted) * 100 : 0; // 200% — intentionally > 100 possible in sample; cap below in real query

  const funnelStages = {
    new: 3,
    contacted: 2,
    qualified: 2,
    appointment_set: 1,
    sold: 1,
    lost: 1,
  };

  const sourceBreakdown = [
    { source: "website_form", count: 3, conversionRate: 0 },
    { source: "vdp_inquiry", count: 2, conversionRate: 0 },
    { source: "chat", count: 2, conversionRate: 50 },
    { source: "third_party", count: 1, conversionRate: 0 },
    { source: "phone", count: 1, conversionRate: 0 },
    { source: "walk_in", count: 1, conversionRate: 100 },
  ];

  const partial: Omit<FunnelHealthMetrics, "healthScore" | "healthGrade" | "alerts"> = {
    leadsLast24h,
    leadsLast7d,
    leadsLast30d,
    leadsTrend: "up",
    slaCompliance24h,
    slaCompliance1h,
    avgResponseTimeHours,
    overdueLeads,
    funnelStages,
    conversionRate,
    qualificationRate: Math.min(100, qualificationRate),
    sourceBreakdown,
  };

  const healthScore = computeHealthScore(partial);
  const healthGrade = gradeFromScore(healthScore);
  const alerts = buildAlerts(partial);

  return { ...partial, healthScore, healthGrade, alerts };
}

/* -------------------------------------------------------------------------- */
/* Main export                                                                 */
/* -------------------------------------------------------------------------- */

export async function getFunnelHealthMetrics(dealerId: string): Promise<FunnelHealthMetrics> {
  if (!process.env.DATABASE_URL) {
    return sampleMetrics();
  }

  try {
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const h1Ago = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const d14Ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const d30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries for performance
    const [
      volumeResult,
      prior7dResult,
      stageResult,
      overdueResult,
      sla24hResult,
      sla1hResult,
      avgResponseResult,
      sourceResult,
    ] = await Promise.all([
      // Volume — last 24h, 7d, 30d
      query<{ period: string; cnt: string }>(
        `SELECT
           CASE
             WHEN created_at >= $2 THEN '24h'
             WHEN created_at >= $3 THEN '7d'
             ELSE '30d'
           END AS period,
           COUNT(*)::text AS cnt
         FROM leads
         WHERE dealer_id = $1 AND created_at >= $4
         GROUP BY 1`,
        [dealerId, h24Ago, d7Ago, d30Ago],
      ),

      // Prior 7d volume (for trend)
      query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM leads
         WHERE dealer_id = $1 AND created_at >= $2 AND created_at < $3`,
        [dealerId, d14Ago, d7Ago],
      ),

      // Funnel stages — all time counts (pipeline health)
      query<{ status: string; cnt: string }>(
        `SELECT status, COUNT(*)::text AS cnt FROM leads
         WHERE dealer_id = $1
         GROUP BY status`,
        [dealerId],
      ),

      // Overdue: status='new' AND created_at < 24h ago
      query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM leads
         WHERE dealer_id = $1 AND status = 'new' AND created_at < $2`,
        [dealerId, h24Ago],
      ),

      // SLA 24h: leads created in last 7d — what % moved from 'new' within 24h
      // Proxy: leads with updated_at - created_at < 24h AND status != 'new'
      query<{ total: string; within_sla: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (
             WHERE status != 'new'
               AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 <= 24
           )::text AS within_sla
         FROM leads
         WHERE dealer_id = $1 AND created_at >= $2`,
        [dealerId, d7Ago],
      ),

      // SLA 1h: same but within 1h
      query<{ total: string; within_sla: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (
             WHERE status != 'new'
               AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 <= 1
           )::text AS within_sla
         FROM leads
         WHERE dealer_id = $1 AND created_at >= $2`,
        [dealerId, d7Ago],
      ),

      // Average response time (hours) for leads that have been contacted
      query<{ avg_hours: string }>(
        `SELECT
           AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::text AS avg_hours
         FROM leads
         WHERE dealer_id = $1 AND status != 'new' AND created_at >= $2`,
        [dealerId, d30Ago],
      ),

      // Source breakdown with conversion rate
      query<{ source: string; cnt: string; sold_cnt: string }>(
        `SELECT
           source,
           COUNT(*)::text AS cnt,
           COUNT(*) FILTER (WHERE status = 'sold')::text AS sold_cnt
         FROM leads
         WHERE dealer_id = $1
         GROUP BY source
         ORDER BY COUNT(*) DESC`,
        [dealerId],
      ),
    ]);

    // --- Volume ---
    let leadsLast24h = 0;
    let leadsLast7d = 0;
    let leadsLast30d = 0;
    for (const row of volumeResult.rows as Array<{ period: string; cnt: string }>) {
      const cnt = parseInt(row.cnt, 10);
      if (row.period === "24h") { leadsLast24h = cnt; leadsLast7d += cnt; leadsLast30d += cnt; }
      else if (row.period === "7d") { leadsLast7d += cnt; leadsLast30d += cnt; }
      else { leadsLast30d += cnt; }
    }

    const prior7d = parseInt((prior7dResult.rows as Array<{ cnt: string }>)[0]?.cnt ?? "0", 10);
    const leadsTrend: "up" | "down" | "flat" =
      leadsLast7d > prior7d + 1 ? "up" : leadsLast7d < prior7d - 1 ? "down" : "flat";

    // --- Funnel stages ---
    const stageMap: Record<string, number> = {};
    for (const row of stageResult.rows as Array<{ status: string; cnt: string }>) {
      stageMap[row.status] = parseInt(row.cnt, 10);
    }
    const funnelStages = {
      new: stageMap["new"] ?? 0,
      contacted: stageMap["contacted"] ?? 0,
      qualified: stageMap["qualified"] ?? 0,
      appointment_set: stageMap["appointment_set"] ?? 0,
      sold: stageMap["sold"] ?? 0,
      lost: stageMap["lost"] ?? 0,
    };

    const totalLeads = Object.values(funnelStages).reduce((a, b) => a + b, 0);
    const conversionRate = totalLeads > 0 ? (funnelStages.sold / totalLeads) * 100 : 0;
    const qualificationBase = funnelStages.contacted + funnelStages.qualified + funnelStages.appointment_set + funnelStages.sold;
    const qualificationRate =
      qualificationBase > 0
        ? ((funnelStages.qualified + funnelStages.appointment_set + funnelStages.sold) / qualificationBase) * 100
        : 0;

    // --- Overdue ---
    const overdueLeads = parseInt((overdueResult.rows as Array<{ cnt: string }>)[0]?.cnt ?? "0", 10);

    // --- SLA ---
    const sla24hRow = (sla24hResult.rows as Array<{ total: string; within_sla: string }>)[0];
    const sla24hTotal = parseInt(sla24hRow?.total ?? "0", 10);
    const slaCompliance24h = sla24hTotal > 0
      ? Math.round((parseInt(sla24hRow.within_sla, 10) / sla24hTotal) * 100)
      : 100;

    const sla1hRow = (sla1hResult.rows as Array<{ total: string; within_sla: string }>)[0];
    const sla1hTotal = parseInt(sla1hRow?.total ?? "0", 10);
    const slaCompliance1h = sla1hTotal > 0
      ? Math.round((parseInt(sla1hRow.within_sla, 10) / sla1hTotal) * 100)
      : 100;

    const avgResponseTimeHours = parseFloat(
      (avgResponseResult.rows as Array<{ avg_hours: string }>)[0]?.avg_hours ?? "0",
    ) || 0;

    // --- Source breakdown ---
    const sourceBreakdown = (sourceResult.rows as Array<{ source: string; cnt: string; sold_cnt: string }>).map(
      (row) => {
        const count = parseInt(row.cnt, 10);
        const soldCnt = parseInt(row.sold_cnt, 10);
        return {
          source: row.source,
          count,
          conversionRate: count > 0 ? Math.round((soldCnt / count) * 100) : 0,
        };
      },
    );

    const partial: Omit<FunnelHealthMetrics, "healthScore" | "healthGrade" | "alerts"> = {
      leadsLast24h,
      leadsLast7d,
      leadsLast30d,
      leadsTrend,
      slaCompliance24h,
      slaCompliance1h,
      avgResponseTimeHours,
      overdueLeads,
      funnelStages,
      conversionRate: Math.round(conversionRate * 10) / 10,
      qualificationRate: Math.round(qualificationRate * 10) / 10,
      sourceBreakdown,
    };

    const healthScore = computeHealthScore(partial);
    const healthGrade = gradeFromScore(healthScore);
    const alerts = buildAlerts(partial);

    return { ...partial, healthScore, healthGrade, alerts };
  } catch (err) {
    console.error("[funnel-health] DB query failed:", err);
    return emptyMetrics(dealerId);
  }
}
