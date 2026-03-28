"use client";

import { useEffect, useState, useCallback } from "react";
import type { FunnelHealthMetrics } from "@/lib/funnel-health";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatHours(hours: number): string {
  if (hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "text-green-600";
    case "B": return "text-emerald-600";
    case "C": return "text-yellow-600";
    case "D": return "text-orange-600";
    default: return "text-red-600";
  }
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-green-100 text-green-800";
  if (score >= 80) return "bg-emerald-100 text-emerald-800";
  if (score >= 70) return "bg-yellow-100 text-yellow-800";
  if (score >= 60) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading funnel health data">
      <div className="h-10 w-64 rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-gray-200" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <p className="font-semibold text-red-800">Unable to load funnel health data</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
    </div>
  );
}

function AlertBanner({ alerts }: { alerts: FunnelHealthMetrics["alerts"] }) {
  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {criticals.map((alert, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
          role="alert"
        >
          <span className="shrink-0 text-sm font-bold uppercase tracking-wide text-red-700">Critical</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{alert.message}</p>
            <p className="mt-0.5 text-xs text-red-600">{alert.action}</p>
          </div>
        </div>
      ))}
      {warnings.map((alert, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
          role="alert"
        >
          <span className="shrink-0 text-sm font-bold uppercase tracking-wide text-yellow-700">Warning</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">{alert.message}</p>
            <p className="mt-0.5 text-xs text-yellow-600">{alert.action}</p>
          </div>
        </div>
      ))}
      {infos.map((alert, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
          role="status"
        >
          <span className="shrink-0 text-sm font-bold uppercase tracking-wide text-blue-600">Info</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">{alert.message}</p>
            <p className="mt-0.5 text-xs text-blue-600">{alert.action}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-2 flex items-end gap-1.5">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {trend === "up" && (
          <span className="mb-0.5 text-sm font-medium text-green-600" aria-label="trending up">
            ↑
          </span>
        )}
        {trend === "down" && (
          <span className="mb-0.5 text-sm font-medium text-red-500" aria-label="trending down">
            ↓
          </span>
        )}
        {trend === "flat" && (
          <span className="mb-0.5 text-sm font-medium text-gray-400" aria-label="flat trend">
            →
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

const FUNNEL_STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  appointment_set: "Appt. Set",
  sold: "Sold",
};

function FunnelViz({ stages }: { stages: FunnelHealthMetrics["funnelStages"] }) {
  const ordered: Array<keyof typeof stages> = [
    "new",
    "contacted",
    "qualified",
    "appointment_set",
    "sold",
  ];
  const maxCount = Math.max(...ordered.map((s) => stages[s]), 1);
  const total = Object.values(stages).reduce((a, b) => a + b, 0);

  const barColors: Record<string, string> = {
    new: "bg-blue-400",
    contacted: "bg-indigo-400",
    qualified: "bg-violet-400",
    appointment_set: "bg-purple-500",
    sold: "bg-green-500",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-800">Conversion Funnel</h2>
      <div className="space-y-3">
        {ordered.map((stage) => {
          const count = stages[stage];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barWidth = Math.round((count / maxCount) * 100);
          return (
            <div key={stage} className="grid grid-cols-[100px_1fr_48px] items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                {FUNNEL_STAGE_LABELS[stage]}
              </span>
              <div className="h-5 overflow-hidden rounded bg-gray-100">
                <div
                  className={`h-full rounded transition-all duration-500 ${barColors[stage]}`}
                  style={{ width: `${barWidth}%` }}
                  role="progressbar"
                  aria-valuenow={count}
                  aria-valuemin={0}
                  aria-valuemax={maxCount}
                />
              </div>
              <div className="flex items-center gap-1 text-right">
                <span className="text-sm font-semibold text-gray-900">{count}</span>
                <span className="text-xs text-gray-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
      {stages.lost > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          + {stages.lost} lost lead{stages.lost !== 1 ? "s" : ""} not shown in funnel
        </p>
      )}
    </div>
  );
}

function SourceTable({ sources }: { sources: FunnelHealthMetrics["sourceBreakdown"] }) {
  if (sources.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-800">Lead Source Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3 text-right">Leads</th>
              <th className="px-5 py-3 text-right">Conversion Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sources.map((row) => (
              <tr key={row.source} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-800">
                  {row.source.replace(/_/g, " ")}
                </td>
                <td className="px-5 py-3 text-right text-gray-700">{row.count}</td>
                <td className="px-5 py-3 text-right">
                  <span
                    className={`font-semibold ${
                      row.conversionRate >= 10
                        ? "text-green-600"
                        : row.conversionRate >= 5
                        ? "text-yellow-600"
                        : "text-gray-700"
                    }`}
                  >
                    {row.conversionRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function FunnelHealthPage() {
  const [data, setData] = useState<FunnelHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadData = useCallback(() => {
    fetch("/api/admin/funnel-health")
      .then((res) => {
        if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<FunnelHealthMetrics>;
      })
      .then((json) => {
        if (!json) return;
        setData(json);
        setLastRefreshed(new Date());
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) return <LoadingSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Funnel Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time view of your lead pipeline — volume, response SLA, and conversion.
          </p>
          {lastRefreshed && (
            <p className="mt-0.5 text-xs text-gray-400">
              Last refreshed: {lastRefreshed.toLocaleTimeString()} · auto-refreshes every 5 min
            </p>
          )}
        </div>

        {/* Health score badge */}
        <div
          className={`flex flex-col items-center rounded-2xl px-6 py-3 ${scoreBg(data.healthScore)}`}
          aria-label={`Health score ${data.healthScore} out of 100, grade ${data.healthGrade}`}
        >
          <span className="text-4xl font-black">{data.healthScore}</span>
          <span className={`text-2xl font-bold ${gradeColor(data.healthGrade)}`}>
            {data.healthGrade}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide opacity-70">Health Score</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Alert banners                                                       */}
      {/* ------------------------------------------------------------------ */}
      {data.alerts.length > 0 && <AlertBanner alerts={data.alerts} />}

      {/* ------------------------------------------------------------------ */}
      {/* Overdue leads CTA                                                   */}
      {/* ------------------------------------------------------------------ */}
      {data.overdueLeads > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-red-800">
              {data.overdueLeads} lead{data.overdueLeads !== 1 ? "s" : ""} need immediate attention
            </p>
            <p className="text-sm text-red-600">
              These leads have been sitting as "New" for over 24 hours with no contact.
            </p>
          </div>
          <a
            href="/admin/leads?status=new"
            className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            View Leads →
          </a>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* KPI cards                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="New Leads (24h)"
          value={data.leadsLast24h}
          sub={`${data.leadsLast7d} this week · ${data.leadsLast30d} this month`}
          trend={data.leadsTrend}
        />
        <KpiCard
          label="SLA Compliance"
          value={`${data.slaCompliance24h}%`}
          sub={`${data.slaCompliance1h}% within 1h (hot lead standard)`}
        />
        <KpiCard
          label="Avg Response"
          value={formatHours(data.avgResponseTimeHours)}
          sub="Time from lead creation to first status change"
        />
        <KpiCard
          label="Conversion Rate"
          value={`${data.conversionRate}%`}
          sub={`${data.qualificationRate}% qualification rate`}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Funnel visualization                                                */}
      {/* ------------------------------------------------------------------ */}
      <FunnelViz stages={data.funnelStages} />

      {/* ------------------------------------------------------------------ */}
      {/* Source breakdown                                                    */}
      {/* ------------------------------------------------------------------ */}
      <SourceTable sources={data.sourceBreakdown} />
    </div>
  );
}
