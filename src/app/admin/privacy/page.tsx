"use client";

import { useCallback, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DeletionRecord {
  id: string;
  status: string;
  completed_at: string | null;
  data_categories_deleted: string[];
}

/* -------------------------------------------------------------------------- */
/* Privacy Admin Page                                                          */
/* -------------------------------------------------------------------------- */

export default function PrivacyAdminPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deletionResult, setDeletionResult] = useState<DeletionRecord | null>(null);
  const [exportData, setExportData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletionHistory, setDeletionHistory] = useState<DeletionRecord[]>([]);

  /* ---------------------------------------------------------------------- */
  /* Delete customer data                                                    */
  /* ---------------------------------------------------------------------- */

  const handleDelete = useCallback(async () => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    const confirmed = window.confirm(
      `This will permanently delete all data for ${email}. This action cannot be undone. Continue?`,
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    setDeletionResult(null);

    try {
      const res = await fetch("/api/privacy/delete-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to delete customer data");
        return;
      }

      setDeletionResult(data.deletion);
      setDeletionHistory((prev) => [data.deletion, ...prev]);
      setEmail("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  /* ---------------------------------------------------------------------- */
  /* Export customer data                                                     */
  /* ---------------------------------------------------------------------- */

  const handleExport = useCallback(async () => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setExportLoading(true);
    setError(null);
    setExportData(null);

    try {
      const res = await fetch("/api/privacy/export-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to export customer data");
        return;
      }

      setExportData(data.export);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setExportLoading(false);
    }
  }, [email]);

  /* ---------------------------------------------------------------------- */
  /* Download export as JSON file                                             */
  /* ---------------------------------------------------------------------- */

  const downloadExport = useCallback(() => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-data-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportData]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                   */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Privacy & CCPA Compliance</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage customer data deletion requests and data exports for CCPA compliance.
        </p>
      </div>

      {/* CCPA Compliance Status */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <h2 className="font-semibold text-green-800">CCPA Compliance Active</h2>
        </div>
        <p className="mt-1 text-sm text-green-700">
          Data deletion and export capabilities are enabled. All actions are logged for audit.
        </p>
      </div>

      {/* Email input */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Customer Data Lookup</h2>
        <div className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="customer@example.com"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleExport}
            disabled={exportLoading || !email}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {exportLoading ? "Exporting..." : "Export Data"}
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || !email}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Delete Data"}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Deletion result */}
      {deletionResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <h3 className="font-semibold text-green-800">Deletion Complete</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Request ID</dt>
              <dd className="font-mono text-gray-900">{deletionResult.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Status</dt>
              <dd className="font-medium text-green-700">{deletionResult.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Completed</dt>
              <dd className="text-gray-900">
                {deletionResult.completed_at
                  ? new Date(deletionResult.completed_at).toLocaleString()
                  : "Pending"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Categories deleted</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {deletionResult.data_categories_deleted.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                  >
                    {cat}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Export data preview */}
      {exportData && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-800">Customer Data Export</h3>
            <button
              onClick={downloadExport}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Download JSON
            </button>
          </div>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-white p-4 text-xs text-gray-800">
            {JSON.stringify(exportData, null, 2)}
          </pre>
        </div>
      )}

      {/* Deletion history */}
      {deletionHistory.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Recent Deletion Requests
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="pb-2 pr-4 font-medium">Request ID</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Completed</th>
                  <th className="pb-2 font-medium">Categories</th>
                </tr>
              </thead>
              <tbody>
                {deletionHistory.map((record) => (
                  <tr key={record.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{record.id}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {record.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {record.completed_at
                        ? new Date(record.completed_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2 text-gray-600">
                      {record.data_categories_deleted.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
