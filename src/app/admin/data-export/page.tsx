"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ExportJob {
  id: string;
  config: {
    target: string;
    table: string;
    format: string;
    destination: string;
  };
  status: string;
  rowCount: number;
  sizeBytes: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    running: "bg-brand-100 text-brand-900",
    pending: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DataExportPage() {
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Form state
  const [target, setTarget] = useState("s3");
  const [table, setTable] = useState("analytics_events");
  const [format, setFormat] = useState("csv");
  const [destination, setDestination] = useState("s3://dealer-exports/");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/data-export");
      if (res.ok) {
        const data = await res.json();
        setExports(data.exports ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/data-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, table, format, destination }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Export completed: ${data.export.rowCount.toLocaleString()} rows exported` });
        fetchHistory();
      } else {
        setMessage({ type: "error", text: data.error ?? "Export failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Warehouse Export</h1>
        <p className="mt-1 text-sm text-gray-500">
          Export your analytics, leads, and inventory data to Snowflake, Databricks, S3, or download locally.
        </p>
      </div>

      {/* Export form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">New Export</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Target</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="s3">Amazon S3</option>
              <option value="snowflake">Snowflake</option>
              <option value="databricks">Databricks</option>
              <option value="local">Local Download</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Table</label>
            <select
              value={table}
              onChange={(e) => setTable(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="analytics_events">Analytics Events</option>
              <option value="leads">Leads</option>
              <option value="inventory">Inventory</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="parquet">Parquet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Destination</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="s3://bucket/path/"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export Now"}
          </button>
          {message && (
            <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>

      {/* Export history */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Export History</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : exports.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No exports yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-6 py-3">Table</th>
                  <th className="px-6 py-3">Target</th>
                  <th className="px-6 py-3">Format</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Rows</th>
                  <th className="px-6 py-3">Size</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {exports.map((exp) => (
                  <tr key={exp.id} className="text-gray-900">
                    <td className="px-6 py-4 font-medium">{exp.config.table}</td>
                    <td className="px-6 py-4">{exp.config.target}</td>
                    <td className="px-6 py-4 uppercase">{exp.config.format}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(exp.status)}`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{exp.rowCount.toLocaleString()}</td>
                    <td className="px-6 py-4">{formatBytes(exp.sizeBytes)}</td>
                    <td className="px-6 py-4">{new Date(exp.startedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
