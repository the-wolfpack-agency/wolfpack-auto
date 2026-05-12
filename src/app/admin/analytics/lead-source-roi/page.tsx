"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AnalyticsDataTable,
  type AnalyticsTableColumn,
} from "@/components/admin/analytics/AnalyticsDataTable";
import {
  sourceLabel,
  formatSourceHeadline,
  type LeadSourceRoiRow,
  type LeadSourceRoiResult,
  type LeadSourceDrillDown,
} from "@/lib/analytics-engine/lead-source-roi-shared";

type SortKey = "gross" | "conversion" | "leads" | "time-to-close";

export default function LeadSourceRoiPage() {
  const [data, setData] = useState<LeadSourceRoiResult | null>(null);
  const [drill, setDrill] = useState<LeadSourceDrillDown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("gross");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics/lead-source-roi?sortBy=${sortBy}`);
      if (res.status === 401 || res.status === 403) {
        setError("You need to sign in to view this page.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as LeadSourceRoiResult;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRowClick = useCallback(async (row: LeadSourceRoiRow) => {
    setDrill(null);
    try {
      const res = await fetch(
        `/api/admin/analytics/lead-source-roi?drill=1&source=${encodeURIComponent(row.source)}`,
      );
      if (!res.ok) return;
      const payload = (await res.json()) as LeadSourceDrillDown;
      setDrill(payload);
    } catch {
      /* ignore */
    }
  }, []);

  const columns: AnalyticsTableColumn<LeadSourceRoiRow>[] = [
    {
      key: "source",
      header: "Source",
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">{sourceLabel(r.source)}</div>
          <div className="text-xs text-gray-500">{formatSourceHeadline(r)}</div>
        </div>
      ),
    },
    {
      key: "leads",
      header: "Leads",
      align: "right",
      render: (r) => <span className="text-gray-900">{r.total_leads}</span>,
    },
    {
      key: "funded",
      header: "Funded",
      align: "right",
      render: (r) => <span className="text-gray-900">{r.funded_deals}</span>,
    },
    {
      key: "conversion",
      header: "Conversion",
      align: "right",
      render: (r) => <span className="text-gray-900">{r.conversion_rate_pct}%</span>,
    },
    {
      key: "gross",
      header: "Gross profit",
      align: "right",
      render: (r) => (
        <span className="text-gray-900">
          ${Math.round(r.total_gross_profit).toLocaleString()}
        </span>
      ),
    },
    {
      key: "ttc",
      header: "Avg time to close",
      align: "right",
      render: (r) => (
        <span className="text-gray-600">
          {r.avg_days_to_close !== null ? `${Math.round(r.avg_days_to_close)} days` : "—"}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost per lead",
      align: "right",
      render: (r) => (
        <span className="text-gray-400">
          {r.cost_per_lead !== null ? `$${r.cost_per_lead.toFixed(2)}` : "Not configured"}
        </span>
      ),
    },
  ];

  return (
    <div
      data-testid="lead-source-roi-page"
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead source ROI</h1>
          <p
            data-testid="lead-source-roi-headline"
            className="mt-1 text-sm text-gray-600"
          >
            {data?.headline ?? "Loading lead-source performance..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="sortBy">
            Sort
          </label>
          <select
            id="sortBy"
            data-testid="lead-source-roi-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="gross">Gross profit</option>
            <option value="conversion">Conversion rate</option>
            <option value="leads">Total leads</option>
            <option value="time-to-close">Time to close</option>
          </select>
        </div>
      </div>

      {data?.costNotConfigured && (
        <div
          data-testid="lead-source-roi-cost-banner"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          Cost per lead is not yet configured for any source. Once you add per-source
          monthly spend, ROI will appear here.
        </div>
      )}

      {error && (
        <div
          data-testid="lead-source-roi-error"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <AnalyticsDataTable
        rows={data?.rows ?? []}
        columns={columns}
        loading={loading}
        emptyMessage="No lead data yet."
        emptyHint="Once leads start arriving from your sources, you'll see conversion and gross profit per source here."
        onRowClick={handleRowClick}
        testId="lead-source-roi-table"
        rowKey={(r) => r.source}
      />

      {drill && (
        <section
          data-testid="lead-source-roi-drill"
          className="rounded-lg border border-blue-200 bg-blue-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">
              {sourceLabel(drill.source)}: individual leads
            </h2>
            <button
              type="button"
              onClick={() => setDrill(null)}
              className="text-xs text-blue-700 hover:underline"
            >
              Close
            </button>
          </div>
          {drill.rows.length === 0 ? (
            <p className="text-sm text-blue-800">No leads in this source yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {drill.rows.slice(0, 25).map((r) => (
                <li key={r.lead_id} className="flex justify-between text-blue-900">
                  <span>{r.first_name} {r.last_name}</span>
                  <span>{r.funded ? "Funded" : "Open"}{r.gross !== null ? ` · $${Math.round(r.gross).toLocaleString()}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
