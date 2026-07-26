"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FrictionHotspot {
  page: string;
  rage_clicks: number;
  dead_clicks: number;
  form_abandonments: number;
  total_friction_events: number;
  severity: "critical" | "high" | "medium" | "low";
}

interface FeatureAdoption {
  feature: string;
  path: string;
  unique_sessions: number;
  total_visits: number;
  avg_time_seconds: number;
  adoption_pct: number;
}

interface FormHealth {
  form_name: string;
  page: string;
  starts: number;
  completions: number;
  completion_rate: number;
  top_abandon_field: string | null;
}

interface PageEngagement {
  page: string;
  views: number;
  avg_time_seconds: number;
  avg_scroll_depth: number;
  bounce_rate: number;
}

interface Report {
  period: string;
  generated_at: string;
  summary: {
    total_sessions: number;
    avg_session_duration_seconds: number;
    avg_pages_per_session: number;
    overall_bounce_rate: number;
    total_friction_events: number;
    friction_trend: "improving" | "stable" | "worsening";
    active_features: number;
    total_features: number;
  };
  friction_hotspots: FrictionHotspot[];
  feature_adoption: FeatureAdoption[];
  form_health: FormHealth[];
  page_engagement: PageEngagement[];
  recommendations: string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-green-100 text-green-800",
};

const TREND_LABEL: Record<string, { text: string; color: string; icon: string }> = {
  improving: { text: "Improving", color: "text-green-600", icon: "↓" },
  stable: { text: "Stable", color: "text-gray-500", icon: "→" },
  worsening: { text: "Worsening", color: "text-red-600", icon: "↑" },
};

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PlatformHealthPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics/platform-health");
      if (res.ok) {
        const data = await res.json();
        setReport(data.report ?? null);
      }
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Platform Health</h1>
        <p className="text-gray-400">Analyzing platform signals...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Platform Health</h1>
        <p className="text-gray-500">No data available yet. Platform health metrics will appear once users start interacting with the system.</p>
      </div>
    );
  }

  const { summary } = report;
  const trend = TREND_LABEL[summary.friction_trend] ?? TREND_LABEL.stable;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Health</h1>
        <p className="mt-1 text-sm text-gray-500">
          Self-improving analytics — friction detection, feature adoption, and automated recommendations.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Sessions (7d)" value={String(summary.total_sessions)} />
        <StatCard label="Avg Duration" value={fmtTime(summary.avg_session_duration_seconds)} />
        <StatCard label="Pages/Session" value={summary.avg_pages_per_session.toFixed(1)} />
        <StatCard label="Bounce Rate" value={fmtPct(summary.overall_bounce_rate)} color={summary.overall_bounce_rate > 0.3 ? "text-red-600" : "text-green-600"} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Friction Events</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-900">{summary.total_friction_events}</p>
            <span className={`text-sm font-medium ${trend.color}`}>{trend.icon} {trend.text}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Feature Adoption</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{summary.active_features}/{summary.total_features}</p>
          <p className="text-xs text-gray-400">{Math.round((summary.active_features / summary.total_features) * 100)}% of features used</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Health Score</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{computeHealthScore(summary)}/100</p>
          <p className="text-xs text-gray-400">Based on friction, adoption, bounce rate</p>
        </div>
      </div>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
          <h2 className="text-sm font-semibold text-brand-900">Automated Recommendations</h2>
          <ul className="mt-3 space-y-2">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-2 text-sm text-brand-800">
                <span className="shrink-0 mt-0.5">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Friction Hotspots */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Friction Hotspots</h2>
        {report.friction_hotspots.length === 0 ? (
          <p className="text-sm text-gray-500">No friction events detected. Great UX health!</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">Page</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Rage Clicks</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Dead Clicks</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Form Abandons</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase text-gray-500">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.friction_hotspots.map((h) => (
                  <tr key={h.page} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{h.page}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{h.rage_clicks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{h.dead_clicks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{h.form_abandonments}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[h.severity]}`}>
                        {h.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Feature Adoption */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Feature Adoption</h2>
        <div className="space-y-2">
          {report.feature_adoption.map((f) => (
            <div key={f.path} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{f.feature}</span>
                  {f.unique_sessions === 0 && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Unused</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{f.total_visits} visits · {fmtTime(f.avg_time_seconds)} avg</span>
              </div>
              <div className="w-32 shrink-0">
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${f.adoption_pct > 50 ? "bg-green-500" : f.adoption_pct > 20 ? "bg-yellow-500" : "bg-gray-300"}`}
                    style={{ width: `${Math.min(100, f.adoption_pct)}%` }}
                  />
                </div>
              </div>
              <span className="w-10 text-right text-xs font-medium text-gray-600 tabular-nums">{f.adoption_pct}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Form Health */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Form Completion Rates</h2>
        {report.form_health.length === 0 ? (
          <p className="text-sm text-gray-500">No form interaction data yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {report.form_health.map((f) => (
              <div key={f.page + f.form_name} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{f.form_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{f.page}</p>
                  </div>
                  <span className={`text-lg font-bold ${f.completion_rate >= 70 ? "text-green-600" : f.completion_rate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                    {f.completion_rate}%
                  </span>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-gray-500">
                  <span>{f.starts} started</span>
                  <span>{f.completions} completed</span>
                </div>
                {f.top_abandon_field && (
                  <p className="mt-2 text-xs text-orange-600">
                    Top abandon field: <span className="font-medium">{f.top_abandon_field}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Page Engagement */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Page Engagement</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">Page</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Views</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Avg Time</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Scroll Depth</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">Bounce Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.page_engagement.map((p) => (
                <tr key={p.page} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{p.page}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.views}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtTime(p.avg_time_seconds)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.avg_scroll_depth}%</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={p.bounce_rate > 0.3 ? "text-red-600 font-medium" : "text-gray-600"}>
                      {fmtPct(p.bounce_rate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <p className="text-xs text-gray-400">
        Report generated {new Date(report.generated_at).toLocaleString()} · Period: last {report.period}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function computeHealthScore(summary: Report["summary"]): number {
  let score = 100;

  // Friction penalty (each event -1, max -30)
  score -= Math.min(30, summary.total_friction_events);

  // Bounce rate penalty (>20% starts penalizing, max -20)
  if (summary.overall_bounce_rate > 0.2) {
    score -= Math.min(20, Math.round((summary.overall_bounce_rate - 0.2) * 100));
  }

  // Adoption bonus (each unused feature -2, max -20)
  const unused = summary.total_features - summary.active_features;
  score -= Math.min(20, unused * 2);

  // Session depth bonus
  if (summary.avg_pages_per_session >= 5) score += 5;
  if (summary.avg_session_duration_seconds >= 300) score += 5;

  // Trend adjustment
  if (summary.friction_trend === "improving") score += 5;
  if (summary.friction_trend === "worsening") score -= 10;

  return Math.max(0, Math.min(100, score));
}
