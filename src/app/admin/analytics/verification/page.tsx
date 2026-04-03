"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ModuleCheck {
  module: string;
  event: string;
  fired: boolean;
  persisted: boolean;
  latency_ms: number;
  error?: string;
}

interface StoreStatus {
  connected: boolean;
  events_total?: number;
}

interface VerificationResult {
  timestamp: string;
  total_modules: number;
  passed: number;
  failed: number;
  score: number;
  modules: ModuleCheck[];
  stores: {
    postgresql: StoreStatus & { events_total: number };
    qdrant: StoreStatus;
    neo4j: StoreStatus;
  };
}

interface SubDashboardStatus {
  name: string;
  path: string;
  category: string;
  description: string;
  healthy: boolean;
  key_metrics: Record<string, number | string | boolean>;
  last_checked: string;
  error?: string;
}

interface SubDashboardSummary {
  subdashboards: SubDashboardStatus[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    categories: Record<string, number>;
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AnalyticsVerificationPage() {
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [subdashboards, setSubdashboards] = useState<SubDashboardSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/analytics/verification").then((r) => {
        if (r.status === 401 || r.status === 403) return null;
        return r.ok ? r.json() : null;
      }),
      fetch("/api/admin/analytics/subdashboards").then((r) => {
        if (r.status === 401 || r.status === 403) return null;
        return r.ok ? r.json() : null;
      }),
    ])
      .then(([verif, subs]) => {
        if (verif?.latest) setVerification(verif.latest);
        if (subs) setSubdashboards(subs);
      })
      .finally(() => setLoading(false));
  }, []);

  const runVerification = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/analytics/verification", {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        setVerification(result);
      }
    } finally {
      setRunning(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics Verification</h1>
        <div className="mt-4 text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Verification</h1>
          <p className="mt-1 text-sm text-gray-500">
            Fires a test event through every analytics module and verifies it persists.
          </p>
        </div>
        <button
          onClick={runVerification}
          disabled={running}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-500 disabled:opacity-50"
          data-testid="run-verification-btn"
        >
          {running ? "Running..." : "Run Verification"}
        </button>
      </div>

      {/* ---- Score Card ---- */}
      {verification && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-6">
            <div
              className={`text-5xl font-extrabold ${
                verification.score >= 90
                  ? "text-green-600"
                  : verification.score >= 70
                    ? "text-yellow-600"
                    : "text-red-600"
              }`}
            >
              {verification.score}%
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {verification.passed}/{verification.total_modules} modules firing
              </div>
              <div className="text-sm text-gray-500">
                Last run: {new Date(verification.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Data Stores ---- */}
      {verification && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              name: "PostgreSQL",
              ok: verification.stores.postgresql.connected,
              detail: `${verification.stores.postgresql.events_total.toLocaleString()} events`,
            },
            {
              name: "Qdrant",
              ok: verification.stores.qdrant.connected,
              detail: "Vector store",
            },
            {
              name: "Neo4j",
              ok: verification.stores.neo4j.connected,
              detail: "Journey graph",
            },
          ].map((store) => (
            <div
              key={store.name}
              className={`rounded-xl border p-4 shadow-sm ${
                store.ok
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
              data-testid={`store-${store.name.toLowerCase()}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    store.ok ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm font-semibold text-gray-900">{store.name}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">{store.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Module Results ---- */}
      {verification && (
        <div>
          <h2 className="mb-3 border-b border-gray-200 pb-2 text-lg font-bold text-gray-900">
            Module Results
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm" data-testid="module-results-table">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Module</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium text-center">Fired</th>
                  <th className="px-4 py-3 font-medium text-center">Persisted</th>
                  <th className="px-4 py-3 font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody>
                {verification.modules.map((m) => (
                  <tr
                    key={m.module}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">{m.module}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {m.event}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {m.fired ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Pass</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={m.error}>Fail</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {m.persisted ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">
                      {m.latency_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Sub-Dashboard Health ---- */}
      {subdashboards && (
        <div>
          <h2 className="mb-3 border-b border-gray-200 pb-2 text-lg font-bold text-gray-900">
            Sub-Dashboard Health
            <span className="ml-2 text-sm font-normal text-gray-500">
              {subdashboards.summary.healthy}/{subdashboards.summary.total} healthy
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {subdashboards.subdashboards.map((sub) => (
              <a
                key={sub.path}
                href={sub.path}
                className={`block rounded-xl border p-4 shadow-sm transition-colors hover:border-brand-400 ${
                  sub.healthy
                    ? "border-gray-200 bg-white"
                    : "border-red-200 bg-red-50"
                }`}
                data-testid={`subdashboard-${sub.name.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      sub.healthy ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm font-semibold text-gray-900">{sub.name}</span>
                  <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {sub.category}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{sub.description}</p>
                {Object.keys(sub.key_metrics).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(sub.key_metrics)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <span key={k} className="text-xs text-gray-500">
                          {k.replace(/_/g, " ")}:{" "}
                          <span className="font-semibold text-gray-700">{String(v)}</span>
                        </span>
                      ))}
                  </div>
                )}
                {sub.error && (
                  <p className="mt-1 text-xs text-red-600">{sub.error}</p>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---- Empty State ---- */}
      {!verification && !subdashboards && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 shadow-sm">
          <p className="text-lg font-semibold text-gray-900">No verification results yet</p>
          <p className="mt-1 text-sm text-gray-500">Click &ldquo;Run Verification&rdquo; to test all analytics modules</p>
        </div>
      )}
    </div>
  );
}
