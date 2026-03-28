"use client";

import { useEffect, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface HealthData {
  status: "healthy" | "degraded" | "critical";
  timestamp: string;
  responseTimeMs: number;
  database: {
    connected: boolean;
    circuitBreakerState: "CLOSED" | "OPEN" | "HALF_OPEN";
    circuitBreakerFailures: number;
    cooldownRemainingMs: number;
    queryLatencyMs: number;
    error?: string;
  };
  redis: {
    connected: boolean;
    latencyMs: number;
    error?: string;
  };
  externalServices: {
    name: string;
    configured: boolean;
    status: "ok" | "not_configured" | "error";
  }[];
  analytics: {
    eventsFlowing: boolean;
    eventsLastHour: number;
    learningActive: boolean;
  };
  deployment: {
    commitHash: string;
    deployedAt: string;
    environment: string;
  };
  uptime: {
    seconds: number;
    formatted: string;
  };
}

/* -------------------------------------------------------------------------- */
/* Status helpers                                                              */
/* -------------------------------------------------------------------------- */

function statusColor(status: "healthy" | "degraded" | "critical" | boolean | string): string {
  if (status === true || status === "healthy" || status === "ok" || status === "CLOSED") {
    return "bg-green-500";
  }
  if (status === "degraded" || status === "HALF_OPEN" || status === "not_configured") {
    return "bg-yellow-500";
  }
  return "bg-red-500";
}

function statusLabel(status: "healthy" | "degraded" | "critical"): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system/health");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">Health Check Failed</h2>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <button
          onClick={fetchHealth}
          className="mt-4 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Last checked: {new Date(data.timestamp).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (15s)
          </label>
          <button
            onClick={fetchHealth}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div
        className={`mb-6 rounded-lg p-4 ${
          data.status === "healthy"
            ? "bg-green-50 border border-green-200"
            : data.status === "degraded"
              ? "bg-yellow-50 border border-yellow-200"
              : "bg-red-50 border border-red-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`inline-block h-4 w-4 rounded-full ${statusColor(data.status)}`} />
          <span className="text-lg font-semibold">
            System Status: {statusLabel(data.status)}
          </span>
          <span className="ml-auto text-sm text-gray-500">
            Response: {data.responseTimeMs}ms
          </span>
        </div>
      </div>

      {/* Status Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Database */}
        <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="status-card-database">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Database</h3>
            <span className={`inline-block h-3 w-3 rounded-full ${statusColor(data.database.connected)}`} />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Connected</span>
              <span className={data.database.connected ? "text-green-700" : "text-red-700"}>
                {data.database.connected ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Query Latency</span>
              <span>{data.database.queryLatencyMs}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Circuit Breaker</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  data.database.circuitBreakerState === "CLOSED"
                    ? "bg-green-100 text-green-800"
                    : data.database.circuitBreakerState === "HALF_OPEN"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                }`}
                data-testid="circuit-breaker-state"
              >
                {data.database.circuitBreakerState}
              </span>
            </div>
            {data.database.circuitBreakerFailures > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Consecutive Failures</span>
                <span className="text-red-600">{data.database.circuitBreakerFailures}</span>
              </div>
            )}
            {data.database.error && (
              <p className="mt-1 text-xs text-red-600">{data.database.error}</p>
            )}
          </div>
        </div>

        {/* Redis */}
        <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="status-card-redis">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Redis</h3>
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                data.redis.connected ? "bg-green-500" : data.redis.error?.includes("not configured") ? "bg-yellow-500" : "bg-red-500"
              }`}
            />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Connected</span>
              <span>{data.redis.connected ? "Yes" : "No"}</span>
            </div>
            {data.redis.error && (
              <p className="mt-1 text-xs text-gray-500">{data.redis.error}</p>
            )}
          </div>
        </div>

        {/* Analytics Pipeline */}
        <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="status-card-analytics">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Analytics</h3>
            <span className={`inline-block h-3 w-3 rounded-full ${statusColor(data.analytics.eventsFlowing)}`} />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Events Flowing</span>
              <span>{data.analytics.eventsFlowing ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Events (last hour)</span>
              <span>{data.analytics.eventsLastHour}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Learning Active</span>
              <span>{data.analytics.learningActive ? "Yes" : "No"}</span>
            </div>
          </div>
        </div>

        {/* External Services */}
        {data.externalServices.map((svc) => (
          <div
            key={svc.name}
            className="rounded-lg border bg-white p-5 shadow-sm"
            data-testid={`status-card-${svc.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{svc.name}</h3>
              <span className={`inline-block h-3 w-3 rounded-full ${statusColor(svc.status)}`} />
            </div>
            <div className="mt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span
                  className={
                    svc.status === "ok"
                      ? "text-green-700"
                      : svc.status === "not_configured"
                        ? "text-yellow-600"
                        : "text-red-700"
                  }
                >
                  {svc.status === "ok" ? "Configured" : svc.status === "not_configured" ? "Not Configured" : "Error"}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Deployment Info */}
        <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="status-card-deployment">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Deployment</h3>
            <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Environment</span>
              <span>{data.deployment.environment}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Commit</span>
              <span className="font-mono text-xs">
                {data.deployment.commitHash.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>

        {/* Uptime */}
        <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="status-card-uptime">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Uptime</h3>
            <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
          </div>
          <div className="mt-3 text-sm">
            <span className="text-2xl font-bold text-gray-900">{data.uptime.formatted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
