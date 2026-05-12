"use client";

/**
 * Admin -- recent touchpoint scans.
 *
 * Renders the most recent QR / NFC / RFID / iBeacon scans for the
 * current tenant. Year-1 is QR-only in practice; the other types are
 * stubs but the surface is ready.
 *
 * The page is intentionally light -- a simple table + a type filter --
 * because the next layer up (the assistant) is where the conversation
 * lives. This page exists for operators who want to audit "did the
 * scan land?" without leaving the dashboard.
 */

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TouchpointEvent {
  id: string;
  tenant_id: string;
  touchpoint_type: "qr" | "nfc" | "rfid" | "beacon" | "webhook";
  touchpoint_id: string;
  payload: Record<string, unknown> | null;
  customer_id: string | null;
  scanned_at: string;
  action_triggered_slug: string | null;
  outcome:
    | "action_triggered"
    | "no_match"
    | "duplicate_suppressed"
    | "rate_limited"
    | "error"
    | null;
  outcome_detail: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

const TYPE_FILTERS: Array<{ label: string; value: string }> = [
  { label: "All", value: "" },
  { label: "QR", value: "qr" },
  { label: "NFC", value: "nfc" },
  { label: "RFID", value: "rfid" },
  { label: "iBeacon", value: "beacon" },
];

function outcomeColour(outcome: TouchpointEvent["outcome"]): string {
  switch (outcome) {
    case "action_triggered":
      return "bg-green-100 text-green-800";
    case "duplicate_suppressed":
      return "bg-amber-100 text-amber-800";
    case "rate_limited":
      return "bg-orange-100 text-orange-800";
    case "no_match":
      return "bg-slate-100 text-slate-700";
    case "error":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TouchpointsAdminPage() {
  const [events, setEvents] = useState<TouchpointEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        "/api/admin/touchpoints",
        typeof window !== "undefined" ? window.location.origin : "http://localhost",
      );
      if (typeFilter) url.searchParams.set("type", typeFilter);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        setEvents([]);
        return;
      }
      const body = (await res.json()) as { events: TouchpointEvent[] };
      setEvents(body.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Touchpoint scans</h1>
          <p className="mt-1 text-sm text-gray-500">
            Recent physical-world scans for this dealership. Year-1 ships
            QR; NFC / RFID / iBeacon arrive in year-2.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={
                "rounded-md border px-3 py-1.5 text-sm font-medium " +
                (typeFilter === f.value
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")
              }
              data-testid={`touchpoints-filter-${f.value || "all"}`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            data-testid="touchpoints-refresh"
          >
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
        data-testid="touchpoints-table"
      >
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Time</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Type</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Touchpoint</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Action</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Loading scans...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-500"
                  data-testid="touchpoints-empty"
                >
                  No scans yet. Register a QR code and scan it to see events here.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                    {new Date(e.scanned_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 uppercase">{e.touchpoint_type}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.touchpoint_id}</td>
                  <td className="px-4 py-2">{e.action_triggered_slug ?? "--"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                        outcomeColour(e.outcome)
                      }
                    >
                      {e.outcome ?? "--"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
