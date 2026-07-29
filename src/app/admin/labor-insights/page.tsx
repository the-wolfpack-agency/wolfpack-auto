export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { computeLaborInsights, type LaborInsight } from "@/lib/labor-insight";
import { getServerDealerId } from "@/lib/server-dealer";

export const metadata: Metadata = {
  title: "Labor Insights | Admin",
  description:
    "Cross-tool labor-efficiency insights the dealer can't assemble by hand — General Ledger labor cost crossed against Payroll hours, overtime, and commission concentration.",
};

/* ------------------------------------------------------------------ */
/*  Presentation helpers                                              */
/* ------------------------------------------------------------------ */

function severityCard(severity: string): string {
  switch (severity) {
    case "action": return "border-l-red-500 bg-red-50/60";
    case "watch": return "border-l-amber-500 bg-amber-50/60";
    default: return "border-l-emerald-500 bg-emerald-50/50";
  }
}

function severityBadge(severity: string): string {
  switch (severity) {
    case "action": return "border-red-200 bg-red-100 text-red-700";
    case "watch": return "border-amber-200 bg-amber-100 text-amber-700";
    default: return "border-emerald-200 bg-emerald-100 text-emerald-700";
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "action": return "Act now";
    case "watch": return "Keep an eye on it";
    default: return "For your awareness";
  }
}

function confidenceBar(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-500";
  if (confidence >= 0.5) return "bg-amber-500";
  return "bg-gray-400";
}

function kindTitle(kind: string): string {
  switch (kind) {
    case "commission_concentration": return "Who's carrying the shifts";
    case "labor_cost_vs_margin": return "Labor cost vs. your margin";
    default: return "Labor insight";
  }
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function InsightCard({ insight }: { insight: LaborInsight }) {
  const topPeople = Array.isArray(insight.data.top_people)
    ? (insight.data.top_people as Array<{ name: string; billed_hours: number }>)
    : [];
  return (
    <div className={`rounded-xl border border-l-4 border-gray-200 p-5 shadow-sm ${severityCard(insight.severity)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{kindTitle(insight.kind)}</h3>
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${severityBadge(insight.severity)}`}>
          {severityLabel(insight.severity)}
        </span>
      </div>

      <p className="mt-2 text-base text-gray-800">{insight.insight}</p>

      {topPeople.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topPeople.map((p) => (
            <span
              key={p.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-2.5 py-1 text-xs"
            >
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="text-gray-500">{p.billed_hours} hrs</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${confidenceBar(insight.confidence)}`}
            style={{ width: `${insight.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">
          {insight.confidence >= 0.8 ? "High confidence" : insight.confidence >= 0.5 ? "Medium confidence" : "Low confidence"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default async function LaborInsightsPage() {
  const dealerId = await getServerDealerId();
  const report = await computeLaborInsights(dealerId);

  const laborPctInsight = report.insights.find((i) => i.kind === "labor_cost_vs_margin");
  const laborPct = laborPctInsight?.data.labor_pct as number | undefined;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Labor Insights</h1>
          {report.isDemo && (
            <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
              Sample data
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          What your ledger and payroll tools can&apos;t show you on their own — labor cost against
          your margin, and how evenly the work is spread. Period{" "}
          {new Date(`${report.periodStart}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" – "}
          {new Date(`${report.periodEnd}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">People on payroll</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{report.headcount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Labor % of gross profit</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{laborPct != null ? `${laborPct}%` : "—"}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Overtime this period</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{usd(Math.round(report.ledger.overtimeCost * 100))}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Insights surfaced</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{report.insights.length}</p>
        </div>
      </div>

      {/* Insight cards */}
      {report.insights.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">No labor insights yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            We surface these once there&apos;s enough posted ledger activity and payroll time for the
            period. Post payroll and service labor to the general ledger, then check back here.
          </p>
        </div>
      )}
    </div>
  );
}
