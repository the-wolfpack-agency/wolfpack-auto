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

  // Load existing results + subdashboard status on mount
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
        <h1 className="text-2xl font-bold text-white mb-4">Analytics Verification</h1>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics Verification</h1>
          <p className="text-gray-400 text-sm mt-1">
            Fires a test event through every analytics module and verifies it persists.
          </p>
        </div>
        <button
          onClick={runVerification}
          disabled={running}
          className="px-5 py-2.5 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-500 disabled:opacity-50 transition-colors"
          data-testid="run-verification-btn"
        >
          {running ? "Running..." : "Run Verification"}
        </button>
      </div>

      {/* ---- Score Card ---- */}
      {verification && (
        <div className="mb-6 p-5 bg-brand-950 border border-brand-800 rounded-xl">
          <div className="flex items-center gap-6">
            <div
              className={`text-5xl font-extrabold ${
                verification.score >= 90
                  ? "text-green-400"
                  : verification.score >= 70
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {verification.score}%
            </div>
            <div>
              <div className="text-white font-semibold text-lg">
                {verification.passed}/{verification.total_modules} modules firing
              </div>
              <div className="text-gray-400 text-sm">
                Last run: {new Date(verification.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Data Stores ---- */}
      {verification && (
        <div className="grid grid-cols-3 gap-4 mb-6">
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
              className={`p-4 rounded-lg border ${
                store.ok
                  ? "border-green-800 bg-green-950/30"
                  : "border-red-800 bg-red-950/30"
              }`}
              data-testid={`store-${store.name.toLowerCase()}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    store.ok ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className="text-white font-medium text-sm">{store.name}</span>
              </div>
              <div className="text-gray-400 text-xs mt-1">{store.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Module Results ---- */}
      {verification && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Module Results</h2>
          <div className="border border-brand-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm" data-testid="module-results-table">
              <thead>
                <tr className="bg-brand-950 text-gray-400 text-left">
                  <th className="px-4 py-2.5 font-medium">Module</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium text-center">Fired</th>
                  <th className="px-4 py-2.5 font-medium text-center">Persisted</th>
                  <th className="px-4 py-2.5 font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody>
                {verification.modules.map((m) => (
                  <tr
                    key={m.module}
                    className="border-t border-brand-800 hover:bg-brand-950/50"
                  >
                    <td className="px-4 py-2 text-white font-medium">{m.module}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                      {m.event}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {m.fired ? (
                        <span className="text-green-400">Pass</span>
                      ) : (
                        <span className="text-red-400" title={m.error}>
                          Fail
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {m.persisted ? (
                        <span className="text-green-400">Yes</span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400">
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
          <h2 className="text-lg font-semibold text-white mb-3">
            Sub-Dashboard Health
            <span className="text-gray-400 font-normal text-sm ml-2">
              {subdashboards.summary.healthy}/{subdashboards.summary.total} healthy
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {subdashboards.subdashboards.map((sub) => (
              <a
                key={sub.path}
                href={sub.path}
                className={`block p-4 rounded-lg border transition-colors hover:border-brand-600 ${
                  sub.healthy
                    ? "border-brand-800 bg-brand-950/50"
                    : "border-red-800 bg-red-950/20"
                }`}
                data-testid={`subdashboard-${sub.name.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      sub.healthy ? "bg-green-400" : "bg-red-400"
                    }`}
                  />
                  <span className="text-white font-medium text-sm">{sub.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">{sub.category}</span>
                </div>
                <p className="text-gray-500 text-xs">{sub.description}</p>
                {Object.keys(sub.key_metrics).length > 0 && (
                  <div className="flex gap-3 mt-2">
                    {Object.entries(sub.key_metrics)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-gray-500">
                            {k.replace(/_/g, " ")}:
                          </span>{" "}
                          <span className="text-white font-medium">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
                {sub.error && (
                  <div className="text-red-400 text-xs mt-1">{sub.error}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---- Empty State ---- */}
      {!verification && !subdashboards && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No verification results yet</p>
          <p className="text-sm">Click "Run Verification" to test all analytics modules</p>
        </div>
      )}
    </div>
  );
}
