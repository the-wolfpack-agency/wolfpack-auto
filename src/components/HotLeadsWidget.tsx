"use client";

import { useEffect, useState, useCallback } from "react";
import { pollWhileVisible } from "@/lib/poll-while-visible";
import type { EngagementAlert, AlertPriority } from "@/lib/engagement-alerts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function priorityDot(priority: AlertPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-500 animate-ping";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-blue-400";
  }
}

function priorityDotStatic(priority: AlertPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-blue-400";
  }
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    hot_return: "Hot Return",
    price_serious: "Pricing Buyer",
    comparison_ready: "Comparing",
    repeat_viewer: "Repeat Viewer",
    budget_revealed: "Budget Revealed",
    video_engaged: "Video Engaged",
    about_to_leave: "Leaving",
    competitor_risk: "At Risk",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/* -------------------------------------------------------------------------- */
/* Widget                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compact "Hot Leads" widget for the main admin dashboard.
 * Shows top 3 critical/high alerts with quick action buttons.
 * Polls every 30 seconds for real-time updates.
 */
export function HotLeadsWidget() {
  const [alerts, setAlerts] = useState<EngagementAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/alerts")
      .then((res) => {
        if (!res.ok) return;
        return res.json() as Promise<{ alerts: EngagementAlert[] }>;
      })
      .then((json) => {
        if (json?.alerts) {
          // Only show critical + high, max 3
          setAlerts(
            json.alerts
              .filter((a: EngagementAlert) => a.priority === "critical" || a.priority === "high")
              .slice(0, 3),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = pollWhileVisible(load, 120 * 1000); // 2 min, only while tab is visible (Neon egress)
    return () => clearInterval(interval);
  }, [load]);

  const handleAction = useCallback(
    (alertId: string) => {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, action: "contacted" }),
      }).catch(() => {});
    },
    [],
  );

  if (loading) {
    return (
      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card animate-pulse">
        <div className="h-6 w-32 rounded bg-gray-200" />
        <div className="mt-4 space-y-3">
          <div className="h-16 rounded bg-gray-200" />
          <div className="h-16 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-surface-border bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">Hot Leads</h2>
        <a
          href="/admin/alerts"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          View All
        </a>
      </div>

      {alerts.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-500">No urgent alerts right now</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3 px-5 py-3">
              {/* Priority dot */}
              <div className="relative mt-1.5 flex-shrink-0">
                <span className={`block h-2.5 w-2.5 rounded-full ${priorityDotStatic(alert.priority)}`} />
                {alert.priority === "critical" && (
                  <span className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${priorityDot(alert.priority)}`} />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">
                    {alert.customer_name ?? "Visitor"}
                  </span>
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {timeAgo(alert.created_at)}
                  </span>
                </div>
                <p className="truncate text-xs text-gray-600">
                  {typeLabel(alert.type)}
                  {alert.vehicle_interest ? ` · ${alert.vehicle_interest}` : ""}
                </p>
              </div>

              {/* Quick action */}
              <button
                onClick={() => handleAction(alert.id)}
                className="flex-shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
              >
                Call
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
