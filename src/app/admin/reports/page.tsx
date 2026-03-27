"use client";

import { useCallback, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AnalyticsSummary {
  period: string;
  generated_at: string;
  visitors: { today: number; this_week: number; this_month: number };
  leads: { total: number; hot: number; warm: number; cool: number; cold: number };
  conversion_rate: number;
  avg_session_duration: string;
  top_pages: { page: string; views: number }[];
  top_vehicles: { name: string; views: number }[];
  lead_sources: { source: string; percentage: number }[];
  device_split: { desktop: number; mobile: number; tablet: number };
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "sold", label: "Sold" },
  { value: "lost", label: "Lost" },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReportsPage() {
  // Leads export state
  const [leadDateFrom, setLeadDateFrom] = useState("");
  const [leadDateTo, setLeadDateTo] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [leadExporting, setLeadExporting] = useState(false);

  // Analytics report state
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Scheduled reports state
  const [weeklyEmail, setWeeklyEmail] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* Leads CSV export                                                       */
  /* ---------------------------------------------------------------------- */

  const handleLeadExport = useCallback(async () => {
    setLeadExporting(true);
    try {
      const params = new URLSearchParams();
      if (leadStatus) params.set("status", leadStatus);
      if (leadDateFrom) params.set("date_from", leadDateFrom);
      if (leadDateTo) params.set("date_to", leadDateTo);

      const res = await fetch(`/api/admin/export/leads?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? "leads-export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Lead export failed:", err);
    } finally {
      setLeadExporting(false);
    }
  }, [leadStatus, leadDateFrom, leadDateTo]);

  /* ---------------------------------------------------------------------- */
  /* Analytics report generation                                            */
  /* ---------------------------------------------------------------------- */

  const handleGenerateAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch("/api/admin/export/analytics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnalyticsSummary = await res.json();
      setAnalyticsData(data);
    } catch (err: any) {
      setAnalyticsError(err.message ?? "Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 40px;
            background: #fff;
            color: #111;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Export data, generate analytics summaries, and schedule recurring reports.
        </p>
      </div>

      <div className="no-print space-y-8">
        {/* ---------------------------------------------------------------- */}
        {/* Export Leads                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Export Leads</h2>
          <p className="mb-4 text-sm text-gray-500">
            Download a CSV file of your leads, optionally filtered by date range and status.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="lead-date-from"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                From
              </label>
              <input
                id="lead-date-from"
                type="date"
                value={leadDateFrom}
                onChange={(e) => setLeadDateFrom(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ fontSize: 16 }}
              />
            </div>

            <div>
              <label
                htmlFor="lead-date-to"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                To
              </label>
              <input
                id="lead-date-to"
                type="date"
                value={leadDateTo}
                onChange={(e) => setLeadDateTo(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ fontSize: 16 }}
              />
            </div>

            <div>
              <label
                htmlFor="lead-status-filter"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id="lead-status-filter"
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ fontSize: 16 }}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleLeadExport}
                disabled={leadExporting}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {leadExporting ? "Exporting..." : "Download CSV"}
              </button>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Analytics Report                                                 */}
        {/* ---------------------------------------------------------------- */}
        <section className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Analytics Report</h2>
          <p className="mb-4 text-sm text-gray-500">
            Generate a printable analytics summary for the current period.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerateAnalytics}
              disabled={analyticsLoading}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {analyticsLoading ? "Generating..." : "Generate Report"}
            </button>

            {analyticsData && (
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-surface-muted"
              >
                Print / Save as PDF
              </button>
            )}
          </div>

          {analyticsError && (
            <p className="mt-3 text-sm text-red-600">{analyticsError}</p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Scheduled Reports                                                */}
        {/* ---------------------------------------------------------------- */}
        <section className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Scheduled Reports</h2>
          <p className="mb-4 text-sm text-gray-500">
            Automatically receive report summaries by email.
          </p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={weeklyEmail}
              onClick={() => setWeeklyEmail((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                weeklyEmail ? "bg-brand-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  weeklyEmail ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Weekly Email Summary
              </p>
              <p className="text-xs text-gray-500">
                Receive a leads and analytics summary every Monday at 8 AM.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Printable Analytics Report                                         */}
      {/* ------------------------------------------------------------------ */}
      {analyticsData && (
        <div
          id="printable-report"
          className="mt-8 rounded-card border border-surface-border bg-white p-8 shadow-card"
        >
          <div className="mb-6 border-b border-gray-200 pb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Wolfpack Auto -- Analytics Report
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Period: {analyticsData.period} | Generated:{" "}
              {new Date(analyticsData.generated_at).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          {/* Key Metrics */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <ReportMetric
              label="Visitors (Month)"
              value={analyticsData.visitors.this_month.toLocaleString()}
            />
            <ReportMetric
              label="Total Leads"
              value={analyticsData.leads.total.toLocaleString()}
            />
            <ReportMetric
              label="Conversion Rate"
              value={`${analyticsData.conversion_rate}%`}
            />
            <ReportMetric
              label="Avg Session"
              value={analyticsData.avg_session_duration}
            />
          </div>

          {/* Lead Temperature */}
          <div className="mb-6">
            <h3 className="mb-2 text-base font-semibold text-gray-900">
              Lead Temperature Breakdown
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <ReportMetric label="Hot" value={analyticsData.leads.hot} color="text-red-600" />
              <ReportMetric label="Warm" value={analyticsData.leads.warm} color="text-orange-600" />
              <ReportMetric label="Cool" value={analyticsData.leads.cool} color="text-blue-600" />
              <ReportMetric label="Cold" value={analyticsData.leads.cold} color="text-gray-500" />
            </div>
          </div>

          {/* Two-column: Top Pages + Top Vehicles */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-base font-semibold text-gray-900">Top Pages</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-1 text-left font-medium text-gray-500">Page</th>
                    <th className="pb-1 text-right font-medium text-gray-500">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analyticsData.top_pages.map((p) => (
                    <tr key={p.page}>
                      <td className="py-1.5 text-gray-700">{p.page}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">
                        {p.views.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-gray-900">Top Vehicles</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-1 text-left font-medium text-gray-500">Vehicle</th>
                    <th className="pb-1 text-right font-medium text-gray-500">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analyticsData.top_vehicles.map((v) => (
                    <tr key={v.name}>
                      <td className="py-1.5 text-gray-700">{v.name}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900">
                        {v.views.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Two-column: Lead Sources + Device Split */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-base font-semibold text-gray-900">Traffic Sources</h3>
              <div className="space-y-2">
                {analyticsData.lead_sources.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{s.source}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${s.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {s.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-gray-900">Device Split</h3>
              <div className="space-y-2">
                {(["desktop", "mobile", "tablet"] as const).map((device) => (
                  <div key={device} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-gray-700">{device}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${analyticsData.device_split[device]}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {analyticsData.device_split[device]}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function ReportMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
