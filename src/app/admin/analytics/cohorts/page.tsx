"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RetentionCell {
  periodOffset: number;
  returnedCount: number;
  retentionPercent: number;
}

interface RetentionRow {
  cohortLabel: string;
  cohortSize: number;
  cells: RetentionCell[];
}

interface RetentionMatrix {
  periodType: string;
  rows: RetentionRow[];
  totalVisitors: number;
  averageRetention: number[];
}

interface ChurnRisk {
  cohortLabel: string;
  dropOffPercent: number;
  periodOffset: number;
  severity: "low" | "medium" | "high";
  message: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function retentionColor(percent: number): string {
  if (percent >= 80) return "bg-green-600 text-white";
  if (percent >= 60) return "bg-green-400 text-white";
  if (percent >= 40) return "bg-yellow-400 text-gray-900";
  if (percent >= 20) return "bg-orange-400 text-white";
  return "bg-red-400 text-white";
}

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    low: "bg-yellow-100 text-yellow-800",
    medium: "bg-orange-100 text-orange-800",
    high: "bg-red-100 text-red-800",
  };
  return colors[severity] ?? "bg-gray-100 text-gray-800";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CohortAnalysisPage() {
  const [matrix, setMatrix] = useState<RetentionMatrix | null>(null);
  const [churnRisks, setChurnRisks] = useState<ChurnRisk[]>([]);
  const [periodType, setPeriodType] = useState<"week" | "month">("month");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/cohorts?period=${periodType}`);
      if (res.ok) {
        const data = await res.json();
        setMatrix(data.matrix);
        setChurnRisks(data.churnRisks ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, [periodType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retention Cohort Analysis</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track how well you retain visitors over time. Each row is a cohort of visitors who first visited in that period.
          </p>
        </div>
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as "week" | "month")}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="month">Monthly</option>
          <option value="week">Weekly</option>
        </select>
      </div>

      {/* Summary cards */}
      {matrix && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Total Visitors</p>
            <p className="text-2xl font-bold text-gray-900">{matrix.totalVisitors.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Cohorts</p>
            <p className="text-2xl font-bold text-gray-900">{matrix.rows.length}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Avg Period 1 Retention</p>
            <p className="text-2xl font-bold text-gray-900">
              {matrix.averageRetention.length > 1 ? `${matrix.averageRetention[1]}%` : "N/A"}
            </p>
          </div>
        </div>
      )}

      {/* Churn risk alerts */}
      {churnRisks.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <h3 className="text-sm font-semibold text-orange-800">Churn Risk Alerts</h3>
          <ul className="mt-2 space-y-1">
            {churnRisks.map((risk, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-orange-700">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge(risk.severity)}`}>
                  {risk.severity}
                </span>
                {risk.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Retention matrix grid */}
      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          Loading retention data...
        </div>
      ) : matrix ? (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Cohort</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Size</th>
                {matrix.averageRetention.map((_, i) => (
                  <th key={i} className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    {i === 0 ? `${periodType === "month" ? "Month" : "Week"} 0` : `+${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {matrix.rows.map((row) => (
                <tr key={row.cohortLabel}>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.cohortLabel}</td>
                  <td className="px-4 py-3 text-gray-600">{row.cohortSize.toLocaleString()}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.periodOffset} className="px-2 py-2 text-center">
                      <span className={`inline-block min-w-[3rem] rounded px-2 py-1 text-xs font-semibold ${retentionColor(cell.retentionPercent)}`}>
                        {cell.retentionPercent}%
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              {/* Average row */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-700">Average</td>
                <td className="px-4 py-3 text-gray-500">-</td>
                {matrix.averageRetention.map((avg, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    <span className="inline-block min-w-[3rem] rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
                      {avg}%
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          No retention data available
        </div>
      )}
    </div>
  );
}
