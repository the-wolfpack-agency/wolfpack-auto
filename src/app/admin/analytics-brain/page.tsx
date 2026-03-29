export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import {
  generateInsights,
  getBufferStats,
  hydrateBufferFromDb,
  type BehavioralInsight,
} from "@/lib/analytics-engine";

export const metadata: Metadata = {
  title: "Analytics Brain | Admin",
  description: "Real-time behavioral intelligence dashboard powered by the analytics brain.",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function tierColor(tier: string): string {
  switch (tier) {
    case "hot": return "bg-red-100 text-red-700 border-red-200";
    case "warm": return "bg-amber-100 text-amber-700 border-amber-200";
    case "cool": return "bg-blue-100 text-blue-700 border-blue-200";
    case "cold": return "bg-gray-100 text-gray-600 border-gray-200";
    default: return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function categoryIcon(category: string): string {
  switch (category) {
    case "conversion": return "chart-bar";
    case "engagement": return "cursor-arrow-rays";
    case "search": return "magnifying-glass";
    case "ux_friction": return "exclamation-triangle";
    case "chat": return "chat-bubble-left-right";
    case "marketing": return "megaphone";
    case "navigation": return "arrows-right-left";
    default: return "light-bulb";
  }
}

function categoryColor(category: string): string {
  switch (category) {
    case "conversion": return "border-l-emerald-500 bg-emerald-50/50";
    case "engagement": return "border-l-blue-500 bg-blue-50/50";
    case "search": return "border-l-violet-500 bg-violet-50/50";
    case "ux_friction": return "border-l-red-500 bg-red-50/50";
    case "chat": return "border-l-amber-500 bg-amber-50/50";
    case "marketing": return "border-l-pink-500 bg-pink-50/50";
    case "navigation": return "border-l-cyan-500 bg-cyan-50/50";
    default: return "border-l-gray-500 bg-gray-50/50";
  }
}

function confidenceBar(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-500";
  if (confidence >= 0.5) return "bg-amber-500";
  return "bg-gray-400";
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function AnalyticsBrainPage() {
  // Hydrate from PostgreSQL on cold start (serverless)
  await hydrateBufferFromDb();

  const insights = generateInsights();
  const stats = getBufferStats();

  // Group by category
  const grouped = new Map<string, BehavioralInsight[]>();
  for (const insight of insights) {
    const list = grouped.get(insight.category) ?? [];
    list.push(insight);
    grouped.set(insight.category, list);
  }

  // Extract lead temperatures
  const temperatures = insights
    .filter((i) => i.id.startsWith("lead_temperature_"))
    .map((i) => ({
      session: (i.data.session_id as string)?.slice(0, 12) ?? "unknown",
      temperature: i.data.temperature as number,
      tier: i.data.tier as string,
      signals: i.data.signals as Record<string, number>,
      converted: i.data.converted as boolean,
    }))
    .sort((a, b) => b.temperature - a.temperature);

  // Extract inventory gaps
  const gapInsight = insights.find((i) => i.id.startsWith("inventory_gaps_"));
  const demandInsight = insights.find((i) => i.id.startsWith("inventory_demand_"));

  // Extract photo engagement
  const photoInsight = insights.find((i) => i.id.startsWith("photo_engagement_"));

  // Extract performance correlation
  const perfInsight = insights.find((i) => i.id.startsWith("perf_conversion_"));

  // Priority alerts (hot lead exits, frustrated buyers)
  const alerts = insights.filter(
    (i) => i.id.startsWith("hot_lead_exit_") || i.id.startsWith("frustrated_buyers_"),
  );

  const categoryOrder = ["conversion", "ux_friction", "engagement", "search", "chat", "marketing", "navigation"];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics Brain</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time behavioral intelligence from {stats.active_sessions} active sessions
          and {stats.total_events} buffered events.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Active Sessions</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.active_sessions}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Buffered Events</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.total_events.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Insights Generated</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{insights.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Hot Leads</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{temperatures.filter((t) => t.tier === "hot").length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Alerts</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{alerts.length}</p>
        </div>
      </div>

      {/* Priority Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Priority Alerts</h2>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-red-800">{alert.insight}</p>
                  <p className="mt-1 text-xs text-red-600">
                    Confidence: {(alert.confidence * 100).toFixed(0)}% | Sample: {alert.sample_size} events
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lead Temperature Board */}
      {temperatures.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lead Temperature Board</h2>
          <p className="mt-1 text-sm text-gray-500">Real-time buyer intent scoring across active sessions.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Session</th>
                  <th className="pb-3 pr-4">Score</th>
                  <th className="pb-3 pr-4">Tier</th>
                  <th className="pb-3 pr-4">Top Signals</th>
                  <th className="pb-3">Converted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {temperatures.slice(0, 10).map((t) => (
                  <tr key={t.session} className="text-gray-700">
                    <td className="py-3 pr-4 font-mono text-xs">{t.session}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${t.temperature >= 80 ? "bg-red-500" : t.temperature >= 50 ? "bg-amber-500" : t.temperature >= 25 ? "bg-blue-500" : "bg-gray-400"}`}
                            style={{ width: `${t.temperature}%` }}
                          />
                        </div>
                        <span className="font-semibold">{t.temperature}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tierColor(t.tier)}`}>
                        {t.tier}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {Object.entries(t.signals)
                        .filter(([, v]) => v > 0)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`)
                        .join(", ")}
                    </td>
                    <td className="py-3">
                      {t.converted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventory Gaps */}
      {(gapInsight || demandInsight) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Inventory Intelligence</h2>
          {gapInsight && (
            <div className="mt-3">
              <p className="text-sm font-medium text-violet-800">Zero-Result Searches (Unmet Demand)</p>
              <p className="mt-1 text-sm text-gray-700">{gapInsight.insight}</p>
            </div>
          )}
          {demandInsight && (
            <div className="mt-3">
              <p className="text-sm font-medium text-violet-800">Market Demand Signals</p>
              <p className="mt-1 text-sm text-gray-700">{demandInsight.insight}</p>
            </div>
          )}
        </div>
      )}

      {/* Photo Engagement */}
      {photoInsight && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Photo Engagement Scores</h2>
          <p className="mt-1 text-sm text-gray-700">{photoInsight.insight}</p>
          {Array.isArray(photoInsight.data.low_engagement) && photoInsight.data.low_engagement.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase text-amber-700">Needs Attention</p>
              <p className="mt-1 text-sm text-amber-800">
                {(photoInsight.data.low_engagement as { vin: string; score: number; views: number }[])
                  .slice(0, 5)
                  .map((v) => `${v.vin} (score: ${v.score}, views: ${v.views})`)
                  .join(" | ")}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Performance Correlation */}
      {perfInsight && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Page Speed Impact</h2>
          <p className="mt-1 text-sm text-gray-700">{perfInsight.insight}</p>
          {Array.isArray(perfInsight.data.buckets) ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {(perfInsight.data.buckets as { range: string; sessions: number; conversion_rate: number; avg_load_ms: number }[]).map((b) => (
                <div key={b.range} className="rounded-lg border border-emerald-200 bg-white p-3 text-center">
                  <p className="text-xs font-medium text-gray-500">{b.range}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{(b.conversion_rate * 100).toFixed(1)}%</p>
                  <p className="text-xs text-gray-400">{b.sessions} sessions</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* All Insights by Category */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">All Insights</h2>
        <p className="mt-1 text-sm text-gray-500">{insights.length} insights across {grouped.size} categories.</p>

        <div className="mt-4 space-y-3">
          {categoryOrder
            .filter((cat) => grouped.has(cat))
            .map((cat) => (
              <div key={cat}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">{cat.replace(/_/g, " ")}</h3>
                <div className="space-y-2">
                  {grouped.get(cat)!.map((insight) => (
                    <div
                      key={insight.id}
                      className={`rounded-lg border-l-4 p-4 ${categoryColor(insight.category)}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-sm text-gray-700">{insight.insight}</p>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full ${confidenceBar(insight.confidence)}`}
                              style={{ width: `${insight.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{(insight.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Sample: {insight.sample_size} | Generated: {new Date(insight.generated_at).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Event Type Distribution */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Event Distribution</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(stats.events_by_type)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                <span className="text-xs font-medium text-gray-600">{type.replace(/_/g, " ")}</span>
                <span className="text-xs font-bold text-gray-900">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Empty State */}
      {insights.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">No insights yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            The brain needs at least 3 active sessions to start generating insights.
            As visitors browse the site, behavioral data will flow in and insights will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
