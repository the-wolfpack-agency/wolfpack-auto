/**
 * Recalls + TSBs panel.
 *
 * Surfaces open NHTSA recalls and applicable manufacturer TSBs for a specific
 * vehicle. Designed to live on the service write-up screen (above the line
 * items, where the writer can't miss it) and on the vehicle detail page.
 *
 * Visual grammar:
 *   - Critical recall  → red banner, bold "Critical safety recall" label
 *   - Moderate recall  → yellow banner
 *   - Minor recall     → yellow banner with softer copy
 *   - TSB              → blue informational banner, labeled "Service bulletin"
 *
 * Every action ("Mark resolved", "Customer declined") fires a PATCH against
 * /api/admin/vehicles/[id]/recalls/[recallId] and removes the item from the
 * open list. Mobile-responsive (stacked card layout below sm, two-column row
 * above sm).
 *
 * Mock TSBs are clearly labeled "Synthetic example — not from manufacturer"
 * per the honesty rule in CLAUDE.md: we never present mock data as
 * authoritative.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types — match the API contract                                     */
/* ------------------------------------------------------------------ */

type Severity = "minor" | "moderate" | "critical";
type Status = "open" | "resolved" | "dismissed_by_owner";

interface OpenRecall {
  id: string;
  nhtsa_campaign_id: string;
  make: string;
  model: string;
  year_from: number;
  year_to: number;
  description: string;
  severity: Severity;
  remedy_summary: string;
  announced_at: string | null;
  fetched_at: string;
  status: Status;
  resolved_at: string | null;
}

interface TSB {
  id: string;
  manufacturer: string;
  bulletin_id: string;
  year_from: number;
  year_to: number;
  models: string[];
  description: string;
  recommended_action: string;
  published_at: string | null;
  fetched_at: string;
}

interface RecallReport {
  vehicle: { id: string; make: string; model: string; year: number };
  open_recalls: OpenRecall[];
  tsbs: TSB[];
  recall_count: number;
  tsb_count: number;
  checked_at: string;
}

interface Props {
  /** Vehicle UUID or VIN. */
  vehicleId: string;
  /** Optional title override. */
  title?: string;
}

/* ------------------------------------------------------------------ */
/*  Severity styles                                                    */
/* ------------------------------------------------------------------ */

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; label: string; text: string }> = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-300",
    label: "Critical safety recall",
    text: "text-red-900",
  },
  moderate: {
    bg: "bg-yellow-50",
    border: "border-yellow-300",
    label: "Open recall",
    text: "text-yellow-900",
  },
  minor: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    label: "Owner notification recall",
    text: "text-yellow-900",
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RecallsPanel({ vehicleId, title }: Props) {
  const [report, setReport] = useState<RecallReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/vehicles/${encodeURIComponent(vehicleId)}/recalls`,
      );
      if (res.status === 404) {
        setReport(null);
        setError("Vehicle not found");
        return;
      }
      if (!res.ok) {
        setError(`Failed to load recalls (HTTP ${res.status})`);
        return;
      }
      const data: RecallReport = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recalls");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    if (vehicleId) void load();
  }, [load, vehicleId]);

  async function updateStatus(
    recallId: string,
    status: "resolved" | "dismissed_by_owner",
  ) {
    setPendingId(recallId);
    try {
      const res = await fetch(
        `/api/admin/vehicles/${encodeURIComponent(vehicleId)}/recalls/${encodeURIComponent(recallId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (res.ok) {
        await load();
      }
    } finally {
      setPendingId(null);
    }
  }

  /* ----- Render states ----- */

  if (loading) {
    return (
      <section
        data-testid="recalls-panel-loading"
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <h3 className="text-base font-semibold text-gray-900">
          {title ?? "Recalls and TSBs"}
        </h3>
        <p className="mt-2 text-sm text-gray-500">Checking NHTSA...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        data-testid="recalls-panel-error"
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <h3 className="text-base font-semibold text-gray-900">
          {title ?? "Recalls and TSBs"}
        </h3>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </section>
    );
  }

  if (!report) return null;

  const openRecalls = report.open_recalls.filter((r) => r.status === "open");

  if (openRecalls.length === 0 && report.tsbs.length === 0) {
    return (
      <section
        data-testid="recalls-panel-empty"
        className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
            OK
          </span>
          <div>
            <h3 className="text-base font-semibold text-green-900">
              {title ?? "Recalls and TSBs"}
            </h3>
            <p className="mt-1 text-sm text-green-800">
              No open recalls or applicable service bulletins for this vehicle.
            </p>
            <p className="mt-1 text-xs text-green-700">
              Checked {new Date(report.checked_at).toLocaleString()}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="recalls-panel"
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          {title ?? "Recalls and TSBs"}
        </h3>
        <p className="text-xs text-gray-500">
          {openRecalls.length} open recall{openRecalls.length === 1 ? "" : "s"},{" "}
          {report.tsbs.length} bulletin{report.tsbs.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Recalls */}
      <div className="space-y-2" data-testid="recalls-list">
        {openRecalls.map((r) => {
          const styles = SEVERITY_STYLES[r.severity];
          return (
            <div
              key={r.id}
              data-testid={`recall-${r.id}`}
              data-severity={r.severity}
              className={`rounded-lg border ${styles.border} ${styles.bg} p-3 sm:p-4`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${styles.text}`}>
                    {styles.label}
                  </p>
                  <p className={`mt-0.5 text-xs ${styles.text} opacity-80`}>
                    NHTSA campaign {r.nhtsa_campaign_id}
                  </p>
                  <p className={`mt-2 text-sm ${styles.text} break-words`}>
                    {r.description}
                  </p>
                  {r.remedy_summary && (
                    <p className={`mt-2 text-xs ${styles.text} opacity-90`}>
                      <span className="font-medium">What to do:</span>{" "}
                      {r.remedy_summary}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:w-44">
                  <button
                    data-testid={`recall-resolve-${r.id}`}
                    onClick={() => updateStatus(r.id, "resolved")}
                    disabled={pendingId === r.id}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pendingId === r.id ? "Saving..." : "Mark resolved"}
                  </button>
                  <button
                    data-testid={`recall-dismiss-${r.id}`}
                    onClick={() => updateStatus(r.id, "dismissed_by_owner")}
                    disabled={pendingId === r.id}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Customer declined
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TSBs */}
      {report.tsbs.length > 0 && (
        <div className="space-y-2" data-testid="tsbs-list">
          {report.tsbs.map((t) => {
            const isMock = t.bulletin_id?.includes("MOCK");
            return (
              <div
                key={t.id}
                data-testid={`tsb-${t.id}`}
                className="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-blue-900">
                      Service bulletin
                    </p>
                    <p className="mt-0.5 text-xs text-blue-800">
                      {t.manufacturer} {t.bulletin_id}
                    </p>
                    {isMock && (
                      <p className="mt-1 text-xs italic text-blue-700">
                        Synthetic example — not from manufacturer
                      </p>
                    )}
                    <p className="mt-2 text-sm text-blue-900 break-words">
                      {t.description}
                    </p>
                    {t.recommended_action && (
                      <p className="mt-2 text-xs text-blue-800">
                        <span className="font-medium">Recommended:</span>{" "}
                        {t.recommended_action}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Checked {new Date(report.checked_at).toLocaleString()}. Source: NHTSA
        recalls API.
      </p>
    </section>
  );
}
