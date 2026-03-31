export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import {
  generateInsights,
  getBufferStats,
  hydrateBufferFromDb,
  type BehavioralInsight,
} from "@/lib/analytics-engine";
import { getCalibrationHistory, type CalibrationResult } from "@/lib/prediction-calibrator";

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

  // Fetch latest model calibration
  const dealerId = process.env.DEALER_ID ?? "demo-dealer";
  let latestCalibration: CalibrationResult | null = null;
  try {
    const history = await getCalibrationHistory(dealerId, 1);
    latestCalibration = history.length > 0 ? history[0] : null;
  } catch { /* calibration is optional — never block the page */ }

  const insights = generateInsights();
  const stats = getBufferStats();

  // Group by category
  const grouped = new Map<string, BehavioralInsight[]>();
  for (const insight of insights) {
    const list = grouped.get(insight.category) ?? [];
    list.push(insight);
    grouped.set(insight.category, list);
  }

  // Extract lead temperatures with friendly labels, deduplicated
  const rawTemperatures = insights
    .filter((i) => i.id.startsWith("lead_temperature_"))
    .map((i) => {
      const signals = i.data.signals as Record<string, number>;
      const tier = i.data.tier as string;
      const converted = i.data.converted as boolean;
      const sessionId = i.data.session_id as string;

      // Generate a friendly visitor label from signals
      let visitorType = "Visitor";
      if (converted) visitorType = "Buyer";
      else if ((signals.vehicle_engagement ?? 0) >= 12) visitorType = "Serious Shopper";
      else if ((signals.search_activity ?? 0) > 0) visitorType = "Searcher";
      else if ((signals.chat_engagement ?? 0) > 0) visitorType = "Chat Lead";
      else if ((signals.session_depth ?? 0) >= 9) visitorType = "Deep Browser";
      else visitorType = "Browser";

      // Parse time from generated_at
      const time = new Date(i.generated_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      return {
        sessionId,
        label: `${visitorType} \u2014 ${time}`,
        temperature: i.data.temperature as number,
        tier,
        signals,
        converted,
      };
    })
    .sort((a, b) => b.temperature - a.temperature);

  // Deduplicate: keep one entry per unique session (highest temp wins)
  const seenSessions = new Set<string>();
  const temperatures = rawTemperatures.filter((t) => {
    if (seenSessions.has(t.sessionId)) return false;
    seenSessions.add(t.sessionId);
    return true;
  });

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

      {/* Model Health — Prediction Calibration */}
      {latestCalibration && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Model Health</h2>
              <p className="mt-1 text-sm text-gray-500">
                How well the lead scoring model predicts actual purchases.
                Last calibrated {new Date(latestCalibration.calibrated_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}.
              </p>
            </div>
            <form action="/api/admin/analytics/calibration" method="POST">
              <button
                type="submit"
                className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50"
                data-track="brain_recalibrate"
              >
                Recalibrate
              </button>
            </form>
          </div>

          {/* Metrics row */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Accuracy</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{(latestCalibration.accuracy * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-400">Correct predictions</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Precision</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{(latestCalibration.precision * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-400">Hot leads that bought</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Recall</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{(latestCalibration.recall * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-400">Buyers we identified</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Sample Size</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{latestCalibration.sample_size}</p>
              <p className="text-xs text-gray-400">Leads analyzed</p>
            </div>
          </div>

          {/* Signals row */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {latestCalibration.top_predictive_signals.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-emerald-700">Best Predictors</p>
                <p className="mt-0.5 text-xs text-gray-500">Signals most strongly linked to actual purchases.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {latestCalibration.top_predictive_signals.slice(0, 3).map((s) => (
                    <span key={s} className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {latestCalibration.top_misleading_signals.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-amber-700">Misleading Signals</p>
                <p className="mt-0.5 text-xs text-gray-500">Look promising but rarely lead to sales.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {latestCalibration.top_misleading_signals.slice(0, 3).map((s) => (
                    <span key={s} className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recommendations */}
          {latestCalibration.recommendations.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {latestCalibration.recommendations.slice(0, 3).map((rec, idx) => (
                <p key={idx} className="text-sm text-gray-600">
                  {rec}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Priority Alerts — clean, actionable language */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Priority Alerts</h2>
          <p className="text-sm text-gray-500">Issues that need immediate attention to avoid losing potential buyers.</p>
          {alerts.map((alert) => {
            const isExitAlert = alert.id.startsWith("hot_lead_exit_");
            const isRageAlert = alert.id.startsWith("frustrated_buyers_");
            const title = isExitAlert
              ? "Engaged visitors are leaving"
              : isRageAlert
                ? "Visitors struggling with your site"
                : "Action needed";
            const description = isExitAlert
              ? "Visitors who showed strong buying intent are leaving without converting. Consider adding chat prompts, special offers, or scheduling CTAs on exit pages."
              : isRageAlert
                ? "Visitors are repeatedly clicking on elements that aren't responding. This usually means a button isn't working or a page is loading too slowly. Check the contact and financing pages."
                : alert.insight.split(".")[0] + ".";
            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-4 ${isRageAlert ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isRageAlert ? "bg-amber-100" : "bg-red-100"}`}>
                    <svg className={`h-5 w-5 ${isRageAlert ? "text-amber-600" : "text-red-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isRageAlert ? "text-amber-900" : "text-red-900"}`}>{title}</p>
                    <p className={`mt-1 text-sm ${isRageAlert ? "text-amber-700" : "text-red-700"}`}>{description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lead Temperature Board — grouped to avoid duplicate-looking cards */}
      {temperatures.length > 0 && (() => {
        // Group visually identical entries (same tier + temperature + visitor type)
        // so 9 identical "Buyer — hot — 81" cards become one card with "×9"
        const signalLabels: Record<string, string> = {
          converted: "Submitted a lead",
          vehicle_engagement: "Viewed vehicles",
          session_depth: "Browsed many pages",
          search_activity: "Searched inventory",
          time_investment: "Spent time on site",
          chat_engagement: "Used live chat",
          form_started: "Started filling a form",
          price_interaction: "Checked pricing",
          return_visitor: "Returning visitor",
          high_intent_chat: "Asked about financing/test drive",
          comparison_shopping: "Comparing vehicles",
          narrowing_behavior: "Narrowing choices",
        };

        type GroupedTemp = typeof temperatures[0] & { count: number; topSignals: string[] };
        const grouped: GroupedTemp[] = [];
        const groupKeys = new Map<string, number>(); // key → index in grouped[]

        for (const t of temperatures) {
          // Build a grouping key from the visual representation
          const topSigs = Object.entries(t.signals)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([k]) => signalLabels[k] ?? k.replace(/_/g, " "));
          const visitorType = t.label.split(" \u2014 ")[0]; // "Buyer", "Serious Shopper", etc.
          const key = `${visitorType}|${t.tier}|${t.temperature}|${topSigs.join(",")}`;

          const existingIdx = groupKeys.get(key);
          if (existingIdx !== undefined) {
            grouped[existingIdx].count++;
          } else {
            groupKeys.set(key, grouped.length);
            grouped.push({ ...t, count: 1, topSignals: topSigs });
          }
        }

        return (
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lead Temperature Board</h2>
            <p className="mt-1 text-sm text-gray-500">
              How engaged your current visitors are — higher scores mean closer to buying.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.slice(0, 9).map((t, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 ${
                    t.tier === "hot" ? "border-red-200 bg-red-50/50" :
                    t.tier === "warm" ? "border-amber-200 bg-amber-50/50" :
                    t.tier === "cool" ? "border-blue-200 bg-blue-50/50" :
                    "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      {t.label}
                      {t.count > 1 && (
                        <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {`\u00d7${t.count}`}
                        </span>
                      )}
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${tierColor(t.tier)}`}>
                      {t.tier}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          t.temperature >= 80 ? "bg-red-500" :
                          t.temperature >= 50 ? "bg-amber-500" :
                          t.temperature >= 25 ? "bg-blue-500" :
                          "bg-gray-400"
                        }`}
                        style={{ width: `${t.temperature}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-700">{t.temperature}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.topSignals.map((s) => (
                      <span key={s} className="rounded-md bg-white/80 px-1.5 py-0.5 text-xs text-gray-600 border border-gray-200">
                        {s}
                      </span>
                    ))}
                  </div>
                  {t.converted && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      Converted
                    </div>
                  )}
                </div>
              ))}
            </div>
            {temperatures.length > grouped.length && (
              <p className="mt-2 text-center text-xs text-gray-400">
                {temperatures.length} visitors grouped into {grouped.length} categories
              </p>
            )}
          </div>
        );
      })()}

      {/* Inventory Intelligence — structured display for non-technical users */}
      {(gapInsight || demandInsight) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Inventory Intelligence</h2>
          <p className="mt-1 text-sm text-gray-500">What your visitors are searching for vs. what you have in stock.</p>

          {/* Zero-result searches as a clean list */}
          {gapInsight && Array.isArray(gapInsight.data.zero_result_queries) && (gapInsight.data.zero_result_queries as { query: string; sessions: number }[]).length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-red-700">Missing from Inventory</p>
              <p className="mt-0.5 text-xs text-gray-500">Searches that returned zero results — these visitors wanted something you don&apos;t have.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(gapInsight.data.zero_result_queries as { query: string; sessions: number }[]).slice(0, 8).map((q) => (
                  <span key={q.query} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm">
                    <span className="font-medium text-red-800">&ldquo;{q.query}&rdquo;</span>
                    <span className="text-xs text-red-500">{q.sessions} {q.sessions === 1 ? "visitor" : "visitors"}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Demand signals as ranked cards */}
          {demandInsight && Array.isArray(demandInsight.data.demand_signals) && (demandInsight.data.demand_signals as { category: string; total_searches: number }[]).length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-violet-800">Top Demand Signals</p>
              <p className="mt-0.5 text-xs text-gray-500">What visitors are searching for most — ranked by volume.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(demandInsight.data.demand_signals as { category: string; total_searches: number; queries: string[] }[]).slice(0, 8).map((signal) => {
                  const [type, value] = signal.category.split(":");
                  const label = type === "price_ceiling" ? `Under $${Number(value).toLocaleString()}`
                    : type === "body_style" ? value.charAt(0).toUpperCase() + value.slice(1)
                    : type === "make" ? value.charAt(0).toUpperCase() + value.slice(1)
                    : type === "drivetrain" ? value.toUpperCase()
                    : value;
                  const typeLabel = type === "price_ceiling" ? "Price"
                    : type === "body_style" ? "Body Style"
                    : type === "make" ? "Make"
                    : type === "drivetrain" ? "Drivetrain"
                    : type.replace(/_/g, " ");
                  return (
                    <div key={signal.category} className="rounded-lg border border-violet-200 bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-violet-500">{typeLabel}</p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900">{label}</p>
                      <p className="mt-1 text-xs text-gray-500">{signal.total_searches} searches</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Photo Engagement — clean card display */}
      {photoInsight && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Photo Performance</h2>
          <p className="mt-1 text-sm text-gray-500">How much time visitors spend looking at your vehicle photos.</p>
          {Array.isArray(photoInsight.data.low_engagement) && (photoInsight.data.low_engagement as { vin: string; score: number; views: number }[]).length > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-amber-700">These vehicles need better photos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(photoInsight.data.low_engagement as { vin: string; score: number; views: number }[])
                  .slice(0, 5)
                  .map((v) => (
                    <span key={v.vin} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm">
                      <span className="font-mono text-xs text-amber-700">{v.vin}</span>
                      <span className="text-xs text-amber-500">{v.views} views</span>
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-blue-700">All vehicle photos are performing well.</p>
          )}
        </div>
      )}

      {/* Page Speed Impact — keep cards, add context */}
      {perfInsight && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Page Speed vs. Conversions</h2>
          <p className="mt-1 text-sm text-gray-500">How your site speed affects whether visitors become leads.</p>
          {Array.isArray(perfInsight.data.buckets) ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {(perfInsight.data.buckets as { range: string; sessions: number; conversion_rate: number; avg_load_ms: number }[]).map((b) => (
                <div key={b.range} className="rounded-lg border border-emerald-200 bg-white p-3 text-center">
                  <p className="text-xs font-medium text-gray-500">{b.range}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{(b.conversion_rate * 100).toFixed(1)}%</p>
                  <p className="text-xs text-gray-400">{b.sessions} visitors</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Top Insights — clean summaries, no raw text dumps */}
      <div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Top Insights</h2>
          <p className="mt-1 text-sm text-gray-500">
            Key findings from visitor behavior across {grouped.size} categories.
          </p>
          {insights.length > 0 && (
            <a
              href="/admin/analytics-brain/all"
              className="mt-3 inline-block rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              data-track="brain_view_all_insights"
            >
              View all {insights.length} insights
            </a>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {categoryOrder
            .filter((cat) => grouped.has(cat))
            .map((cat) => {
              const categoryLabels: Record<string, string> = {
                conversion: "Sales & Conversions",
                ux_friction: "User Experience Issues",
                engagement: "Visitor Engagement",
                search: "Search & Inventory",
                chat: "Chat Activity",
                marketing: "Marketing Performance",
                navigation: "Site Navigation",
              };
              const catInsights = grouped.get(cat)!;
              const seen = new Set<string>();
              const deduped = catInsights
                .sort((a, b) => b.confidence - a.confidence)
                .filter((insight) => {
                  const key = insight.insight.slice(0, 80);
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
              const preview = deduped.slice(0, 3);
              const remaining = deduped.length - preview.length;

              return (
                <div key={cat}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">{categoryLabels[cat] ?? cat.replace(/_/g, " ")}</h3>
                  <div className="space-y-2">
                    {preview.map((insight) => {
                      // Extract the first sentence as a clean summary
                      const firstSentence = insight.insight.split(/\.\s/)[0] + ".";
                      // Truncate if still too long
                      const summary = firstSentence.length > 200
                        ? firstSentence.slice(0, 197) + "..."
                        : firstSentence;

                      return (
                        <div
                          key={insight.id}
                          className={`rounded-lg border-l-4 p-4 ${categoryColor(insight.category)}`}
                        >
                          <p className="text-sm text-gray-700">{summary}</p>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className={`h-full rounded-full ${confidenceBar(insight.confidence)}`}
                                  style={{ width: `${insight.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">
                                {insight.confidence >= 0.8 ? "High confidence" : insight.confidence >= 0.5 ? "Medium confidence" : "Low confidence"}
                              </span>
                            </div>
                            <span className="text-xs text-gray-300">|</span>
                            <span className="text-xs text-gray-400">
                              Based on {insight.sample_size} {insight.sample_size === 1 ? "visitor" : "visitors"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {remaining > 0 && (
                      <a
                        href={`/admin/analytics-brain/all?category=${cat}`}
                        className="block text-center text-xs font-medium text-brand-600 hover:text-brand-700 py-1"
                        data-track="brain_view_category_insights"
                      >
                        +{remaining} more in this category
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
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
