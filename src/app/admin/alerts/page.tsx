"use client";

import { useEffect, useState, useCallback } from "react";
import { pollWhileVisible } from "@/lib/poll-while-visible";
import type {
  EngagementAlert,
  AlertPriority,
  AlertStats,
} from "@/lib/engagement-alerts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function priorityBadge(priority: AlertPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium":
      return "bg-brand-100 text-brand-900 border-brand-200";
  }
}

function priorityLabel(priority: AlertPriority): string {
  switch (priority) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
  }
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    hot_return: "Hot Return",
    price_serious: "Pricing Buyer",
    comparison_ready: "Comparison Shopper",
    repeat_viewer: "Repeat Viewer",
    budget_revealed: "Budget Revealed",
    video_engaged: "Video Engaged",
    about_to_leave: "About to Leave",
    competitor_risk: "Competitor Risk",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading alerts">
      <div className="h-10 w-64 rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <p className="font-semibold text-red-800">Unable to load engagement alerts</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
    </div>
  );
}

function StatsCards({ stats }: { stats: AlertStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Alerts Today
        </p>
        <p className="mt-2 text-3xl font-bold text-gray-900">{stats.alerts_today}</p>
        <p className="mt-1 text-xs text-gray-500">
          {stats.critical_count} critical, {stats.high_count} high
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Actioned
        </p>
        <p className="mt-2 text-3xl font-bold text-gray-900">{stats.actioned_pct}%</p>
        <p className="mt-1 text-xs text-gray-500">of alerts acted on</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Avg Response
        </p>
        <p className="mt-2 text-3xl font-bold text-gray-900">{stats.avg_response_time_minutes}m</p>
        <p className="mt-1 text-xs text-gray-500">time to first action</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Active Now
        </p>
        <p className="mt-2 text-3xl font-bold text-red-600">
          {stats.critical_count + stats.high_count}
        </p>
        <p className="mt-1 text-xs text-gray-500">need attention</p>
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  onAction,
}: {
  alert: EngagementAlert;
  onAction: (alertId: string, action: string) => void;
}) {
  const isCritical = alert.priority === "critical";

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm transition-all ${
        isCritical
          ? "border-red-300 ring-2 ring-red-100 animate-pulse"
          : "border-gray-200"
      }`}
      role="article"
      aria-label={`${priorityLabel(alert.priority)} alert: ${typeLabel(alert.type)}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: Alert info */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${priorityBadge(
                alert.priority,
              )}`}
            >
              {priorityLabel(alert.priority)}
            </span>
            <span className="text-sm font-semibold text-gray-700">
              {typeLabel(alert.type)}
            </span>
            <span className="text-xs text-gray-400">{timeAgo(alert.created_at)}</span>
          </div>

          {/* Customer + vehicle */}
          <div className="space-y-1">
            {alert.customer_name && (
              <p className="text-base font-semibold text-gray-900">
                {alert.customer_name}
              </p>
            )}
            {alert.vehicle_interest && (
              <p className="text-sm text-gray-600">
                Interested in: <span className="font-medium">{alert.vehicle_interest}</span>
              </p>
            )}
          </div>

          {/* Recommended action */}
          <p className="text-sm text-gray-700">{alert.recommended_action}</p>

          {/* Signals */}
          <div className="flex flex-wrap gap-1.5">
            {alert.signals_triggered.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
              >
                {signal.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Action buttons */}
        <div className="flex flex-row gap-2 sm:flex-col sm:items-end">
          <button
            onClick={() => onAction(alert.id, "contacted")}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Call Now
          </button>
          <button
            onClick={() => onAction(alert.id, "contacted")}
            className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            Send Email
          </button>
          <button
            onClick={() => onAction(alert.id, "scheduled")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            Schedule
          </button>
          <button
            onClick={() => onAction(alert.id, "dismiss")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:text-gray-600 focus:outline-none"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function EngagementAlertsPage() {
  const [alerts, setAlerts] = useState<EngagementAlert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadAlerts = useCallback(() => {
    fetch("/api/admin/alerts")
      .then((res) => {
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ alerts: EngagementAlert[]; stats: AlertStats }>;
      })
      .then((json) => {
        if (!json) return;
        setAlerts(json.alerts);
        setStats(json.stats);
        setLastRefreshed(new Date());
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAlerts();

    // Polling every 2 minutes, only while the tab is visible (Neon egress)
    const interval = pollWhileVisible(loadAlerts, 120 * 1000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const handleAction = useCallback(
    (alertId: string, action: string) => {
      // Optimistic removal
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));

      fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, action }),
      }).catch((err) => {
        console.error("[alerts] Failed to action alert:", err);
        // Reload on failure
        loadAlerts();
      });
    },
    [loadAlerts],
  );

  if (loading) return <LoadingSkeleton />;
  if (error && alerts.length === 0) return <ErrorState message={error} />;

  const criticalAlerts = alerts.filter((a) => a.priority === "critical");
  const highAlerts = alerts.filter((a) => a.priority === "high");
  const mediumAlerts = alerts.filter((a) => a.priority === "medium");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engagement Alerts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time buying signals: who should you call right now?
          </p>
          {lastRefreshed && (
            <p className="mt-0.5 text-xs text-gray-400">
              Auto-refreshes every 30s · Last update: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && <StatsCards stats={stats} />}

      {/* Critical alerts */}
      {criticalAlerts.length > 0 && (
        <section aria-labelledby="critical-alerts-heading">
          <h2
            id="critical-alerts-heading"
            className="mb-3 flex items-center gap-2 text-lg font-semibold text-red-700"
          >
            <span className="inline-block h-3 w-3 animate-ping rounded-full bg-red-500" />
            Act Now ({criticalAlerts.length})
          </h2>
          <div className="space-y-4">
            {criticalAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {/* High alerts */}
      {highAlerts.length > 0 && (
        <section aria-labelledby="high-alerts-heading">
          <h2
            id="high-alerts-heading"
            className="mb-3 text-lg font-semibold text-orange-700"
          >
            High Priority ({highAlerts.length})
          </h2>
          <div className="space-y-4">
            {highAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {/* Medium alerts */}
      {mediumAlerts.length > 0 && (
        <section aria-labelledby="medium-alerts-heading">
          <h2
            id="medium-alerts-heading"
            className="mb-3 text-lg font-semibold text-brand-800"
          >
            Opportunities ({mediumAlerts.length})
          </h2>
          <div className="space-y-4">
            {mediumAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {alerts.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-semibold text-gray-700">No active alerts</p>
          <p className="mt-2 text-sm text-gray-500">
            When visitors show high buying intent, alerts will appear here in real time.
          </p>
        </div>
      )}
    </div>
  );
}
