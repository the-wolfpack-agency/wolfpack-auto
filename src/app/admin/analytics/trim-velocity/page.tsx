"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AnalyticsDataTable,
  type AnalyticsTableColumn,
} from "@/components/admin/analytics/AnalyticsDataTable";
import {
  trimLabel,
  formatHeadline,
  type TrimVelocityRow,
  type TrimVelocityResult,
  type TrimVelocityDrillDown,
} from "@/lib/analytics-engine/trim-velocity-shared";

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

type SortKey = "fastest" | "slowest" | "most-sold";

export default function TrimVelocityPage() {
  const [data, setData] = useState<TrimVelocityResult | null>(null);
  const [drill, setDrill] = useState<TrimVelocityDrillDown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("fastest");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics/trim-velocity?sortBy=${sortBy}`);
      if (res.status === 401 || res.status === 403) {
        setError("You need to sign in to view this page.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as TrimVelocityResult;
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

  const handleRowClick = useCallback(async (row: TrimVelocityRow) => {
    setDrill(null);
    try {
      const params = new URLSearchParams({
        drill: "1",
        make: row.make,
        model: row.model,
        trim: row.trim,
        year: String(row.year),
      });
      const res = await fetch(`/api/admin/analytics/trim-velocity?${params}`);
      if (!res.ok) return;
      const payload = (await res.json()) as TrimVelocityDrillDown;
      setDrill(payload);
    } catch {
      /* ignore */
    }
  }, []);

  const columns: AnalyticsTableColumn<TrimVelocityRow>[] = [
    {
      key: "label",
      header: "Trim",
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">{trimLabel(r)}</div>
          <div className="text-xs text-gray-500">{formatHeadline(r)}</div>
        </div>
      ),
    },
    {
      key: "funded",
      header: "Funded",
      align: "right",
      render: (r) => (
        <span className="font-medium text-gray-900">{r.funded_count}</span>
      ),
    },
    {
      key: "listed",
      header: "Listed",
      align: "right",
      render: (r) => <span className="text-gray-600">{r.listed_count}</span>,
    },
    {
      key: "days",
      header: "Avg days to sell",
      align: "right",
      render: (r) => (
        <span className="text-gray-900">
          {r.avg_days_to_sell !== null ? `${Math.round(r.avg_days_to_sell)} days` : "—"}
        </span>
      ),
    },
    {
      key: "gross",
      header: "Avg gross",
      align: "right",
      render: (r) => (
        <span className="text-gray-900">
          {r.avg_gross_profit !== null ? `$${Math.round(r.avg_gross_profit).toLocaleString()}` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div
      data-testid="trim-velocity-page"
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trim velocity</h1>
          <p
            data-testid="trim-velocity-headline"
            className="mt-1 text-sm text-gray-600"
          >
            {data?.headline ?? "Loading your inventory's selling speed by trim..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="sortBy">
            Sort
          </label>
          <select
            id="sortBy"
            data-testid="trim-velocity-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-600 focus:outline-none"
          >
            <option value="fastest">Fastest sellers</option>
            <option value="slowest">Slowest sellers</option>
            <option value="most-sold">Most sold</option>
          </select>
        </div>
      </div>

      {error && (
        <div
          data-testid="trim-velocity-error"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <AnalyticsDataTable
        rows={data?.rows ?? []}
        columns={columns}
        loading={loading}
        emptyMessage="No funded deals to compare yet."
        emptyHint="Once you fund a few deals, we'll show your fastest and slowest moving trims here."
        onRowClick={handleRowClick}
        testId="trim-velocity-table"
        rowKey={(r) => `${r.make}-${r.model}-${r.trim}-${r.year}`}
      />

      {drill && (
        <section
          data-testid="trim-velocity-drill"
          className="rounded-lg border border-brand-200 bg-brand-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-950">
              {trimLabel({ make: drill.make, model: drill.model, trim: drill.trim, year: drill.year })}: funded deals
            </h2>
            <button
              type="button"
              onClick={() => setDrill(null)}
              className="text-xs text-brand-800 hover:underline"
            >
              Close
            </button>
          </div>
          {drill.rows.length === 0 ? (
            <p className="text-sm text-brand-900">No funded VINs for this trim yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {drill.rows.map((r) => (
                <li key={r.vin} className="flex justify-between text-brand-950">
                  <span className="font-mono">{r.vin}</span>
                  <span>{Math.round(r.days_to_sell)} days {r.gross !== null ? `· $${Math.round(r.gross).toLocaleString()}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
