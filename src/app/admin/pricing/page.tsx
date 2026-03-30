"use client";

import { useState, useEffect, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types (mirrored from pricing-engine — avoids server import in client page) */
/* -------------------------------------------------------------------------- */

interface VehiclePricingRow {
  vehicleId?: string;
  vehicle_id?: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  condition: string;
  currentPrice?: number;
  current_price?: number | string;
  recommendedPrice?: number;
  recommended_price?: number | string;
  priceAdjustment?: number;
  adjustmentPercent?: number;
  marketPosition?: string;
  market_position?: string;
  daysOnLot?: number;
  turnScore?: number;
  action: string;
  actionReason?: string;
  reason?: string;
  urgency: string;
}

interface PricingReportResponse {
  cached: boolean;
  generatedAt: string | Date;
  totalVehicles: number;
  immediateAction: VehiclePricingRow[];
  soonAction: VehiclePricingRow[];
  monitorAction: VehiclePricingRow[];
  projectedRevenueImpact: number;
  avgDaysOnLot: number;
  stalledVehicles: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getVehicleId(row: VehiclePricingRow): string {
  return row.vehicleId ?? row.vehicle_id ?? "";
}

function getCurrentPrice(row: VehiclePricingRow): number {
  return Number(row.currentPrice ?? row.current_price ?? 0);
}

function getRecommendedPrice(row: VehiclePricingRow): number {
  return Number(row.recommendedPrice ?? row.recommended_price ?? 0);
}

function getAdjustmentPercent(row: VehiclePricingRow): number {
  if (row.adjustmentPercent !== undefined) return row.adjustmentPercent;
  const cur = getCurrentPrice(row);
  const rec = getRecommendedPrice(row);
  if (!cur) return 0;
  return Math.round(((rec - cur) / cur) * 1000) / 10;
}

function getActionReason(row: VehiclePricingRow): string {
  return row.actionReason ?? row.reason ?? "";
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function UrgencyBadge({ urgency }: { urgency: string }) {
  const classes: Record<string, string> = {
    immediate:
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700",
    soon: "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-orange-100 text-orange-700",
    monitor:
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600",
    none: "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    immediate: "Act Now",
    soon: "Review Soon",
    monitor: "Monitoring",
    none: "Healthy",
  };
  return (
    <span className={classes[urgency] ?? classes.none}>
      {labels[urgency] ?? urgency}
    </span>
  );
}

function AdjustmentChip({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-gray-400 text-sm">No change</span>;
  const color = pct < 0 ? "text-red-600" : "text-green-600";
  return (
    <span className={`font-semibold text-sm ${color}`}>{fmtPercent(pct)}</span>
  );
}

interface VehicleRowProps {
  row: VehiclePricingRow;
  onApply: (vehicleId: string, newPrice: number) => Promise<void>;
  onDismiss: (vehicleId: string) => Promise<void>;
  busy: boolean;
}

function VehicleRow({ row, onApply, onDismiss, busy }: VehicleRowProps) {
  const vid = getVehicleId(row);
  const cur = getCurrentPrice(row);
  const rec = getRecommendedPrice(row);
  const pct = getAdjustmentPercent(row);

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Thumbnail placeholder */}
      <td className="px-4 py-3">
        <div
          className="h-10 w-14 rounded bg-gray-200 flex items-center justify-center text-gray-400 shrink-0"
          aria-hidden="true"
        >
          <CarMiniIcon />
        </div>
      </td>

      {/* Vehicle */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">
          {row.year} {row.make} {row.model}
          {row.trim ? ` ${row.trim}` : ""}
        </p>
        <p className="text-xs text-gray-500 font-mono">{row.vin}</p>
        <p className="text-xs text-gray-400 capitalize">{row.condition}</p>
      </td>

      {/* Current price */}
      <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
        {fmtCurrency(cur)}
      </td>

      {/* Recommended price */}
      <td className="hidden sm:table-cell px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">
        {fmtCurrency(rec)}
      </td>

      {/* Adjustment % */}
      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap">
        <AdjustmentChip pct={pct} />
      </td>

      {/* Days on lot */}
      <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
        {row.daysOnLot ?? "—"} days
      </td>

      {/* Urgency */}
      <td className="px-4 py-3">
        <UrgencyBadge urgency={row.urgency} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => onApply(vid, rec)}
            disabled={busy || !vid || rec <= 0}
            className="rounded px-2.5 py-1 text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={`Apply recommended price ${fmtCurrency(rec)}`}
          >
            Apply
          </button>
          <button
            onClick={() => onDismiss(vid)}
            disabled={busy || !vid}
            className="rounded px-2.5 py-1 text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Dismiss recommendation"
          >
            Dismiss
          </button>
        </div>
      </td>
    </tr>
  );
}

interface SectionTableProps {
  title: string;
  rows: VehiclePricingRow[];
  emptyMessage: string;
  headerClass: string;
  onApply: (vehicleId: string, newPrice: number) => Promise<void>;
  onDismiss: (vehicleId: string) => Promise<void>;
  busyIds: Set<string>;
}

function SectionTable({
  title,
  rows,
  emptyMessage,
  headerClass,
  onApply,
  onDismiss,
  busyIds,
}: SectionTableProps) {
  return (
    <section className="mt-6">
      <h2 className={`mb-3 text-base font-semibold ${headerClass}`}>{title}</h2>
      <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">Photo</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Vehicle</th>
                <th scope="col" className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Current</th>
                <th scope="col" className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Recommended</th>
                <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Adj %</th>
                <th scope="col" className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Days on Lot</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Urgency</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <VehicleRow
                    key={getVehicleId(row) || row.vin}
                    row={row}
                    onApply={onApply}
                    onDismiss={onDismiss}
                    busy={busyIds.has(getVehicleId(row))}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary cards                                                              */
/* -------------------------------------------------------------------------- */

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "red" | "orange" | "green" | "default";
}) {
  const accentClass =
    accent === "red"
      ? "text-red-600"
      : accent === "orange"
      ? "text-orange-500"
      : accent === "green"
      ? "text-green-600"
      : "text-gray-900";

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accentClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

type ActiveTab = "immediate" | "soon" | "monitor";

export default function PricingIntelligencePage() {
  const [report, setReport] = useState<PricingReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("immediate");

  // Auto-select the first tab that has items when report loads/changes
  useEffect(() => {
    if (!report) return;
    if (report.immediateAction.length > 0) setActiveTab("immediate");
    else if (report.soonAction.length > 0) setActiveTab("soon");
    else if (report.monitorAction.length > 0) setActiveTab("monitor");
  }, [report]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing");
        if (res.status === 401 || res.status === 403) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load pricing report");
    } finally {
      setLoading(false);
    }
  }, []);

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing", { method: "POST" });
        if (res.status === 401 || res.status === 403) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
      showToast("Pricing report regenerated successfully");
    } catch (err: any) {
      setError(err.message ?? "Failed to generate pricing report");
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async (vehicleId: string, newPrice: number) => {
    if (!vehicleId) return;
    setBusyIds((prev) => new Set(prev).add(vehicleId));
    try {
      const res = await fetch(`/api/admin/pricing/${vehicleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", new_price: newPrice }),
      });
        if (res.status === 401 || res.status === 403) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      showToast(`Price updated to ${fmtCurrency(newPrice)}`);
      // Remove from local state
      removeVehicle(vehicleId);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(vehicleId);
        return next;
      });
    }
  };

  const handleDismiss = async (vehicleId: string) => {
    if (!vehicleId) return;
    setBusyIds((prev) => new Set(prev).add(vehicleId));
    try {
      const res = await fetch(`/api/admin/pricing/${vehicleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
        if (res.status === 401 || res.status === 403) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      showToast("Recommendation dismissed");
      removeVehicle(vehicleId);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(vehicleId);
        return next;
      });
    }
  };

  const removeVehicle = (vehicleId: string) => {
    setReport((prev) => {
      if (!prev) return prev;
      const filter = (rows: VehiclePricingRow[]) =>
        rows.filter((r) => getVehicleId(r) !== vehicleId);
      return {
        ...prev,
        immediateAction: filter(prev.immediateAction),
        soonAction: filter(prev.soonAction),
        monitorAction: filter(prev.monitorAction),
      };
    });
  };

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  const tabs: { id: ActiveTab; label: string; count: number }[] = report
    ? [
        { id: "immediate", label: "Act Now", count: report.immediateAction.length },
        { id: "soon", label: "Review Soon", count: report.soonAction.length },
        { id: "monitor", label: "Monitoring", count: report.monitorAction.length },
      ]
    : [];

  const activeRows =
    !report
      ? []
      : activeTab === "immediate"
      ? report.immediateAction
      : activeTab === "soon"
      ? report.soonAction
      : report.monitorAction;

  const sectionMeta: Record<
    ActiveTab,
    { title: string; emptyMessage: string; headerClass: string }
  > = {
    immediate: {
      title: "Act Now — Immediate Price Action Required",
      emptyMessage: "No vehicles require immediate action.",
      headerClass: "text-red-600",
    },
    soon: {
      title: "Review Soon — Action Recommended Within 7 Days",
      emptyMessage: "No vehicles need review right now.",
      headerClass: "text-orange-500",
    },
    monitor: {
      title: "Monitoring — Vehicles in Healthy Range",
      emptyMessage: "No vehicles in the monitoring group.",
      headerClass: "text-gray-700",
    },
  };

  return (
    <>
      {/* Toast */}
      {toastMsg && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Intelligence</h1>
          <p className="mt-1 text-sm text-gray-500">
            AI-driven pricing recommendations based on days on lot and market position.
          </p>
        </div>
        <button
          onClick={generateReport}
          disabled={generating || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          {generating ? (
            <>
              <SpinnerIcon />
              Generating…
            </>
          ) : (
            <>
              <RefreshIcon />
              Generate Report
            </>
          )}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !report && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse rounded-card bg-gray-100"
            />
          ))}
        </div>
      )}

      {/* Report content */}
      {report && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Total Vehicles"
              value={String(report.totalVehicles)}
              sub="available inventory"
            />
            <SummaryCard
              label="Immediate Actions"
              value={String(report.immediateAction.length)}
              sub="need price change now"
              accent={report.immediateAction.length > 0 ? "red" : "default"}
            />
            <SummaryCard
              label="Avg Days on Lot"
              value={report.avgDaysOnLot > 0 ? `${report.avgDaysOnLot}d` : "—"}
              sub={`${report.stalledVehicles} stalled (>60d)`}
              accent={report.avgDaysOnLot > 45 ? "orange" : "default"}
            />
            <SummaryCard
              label="Revenue at Risk"
              value={fmtCurrency(report.projectedRevenueImpact)}
              sub="est. savings if all applied"
              accent={report.projectedRevenueImpact > 0 ? "green" : "default"}
            />
          </div>

          {/* Cached notice */}
          {report.cached && (
            <p className="mt-4 text-xs text-gray-400">
              Showing cached report from{" "}
              {new Date(report.generatedAt).toLocaleString()}. Click
              &ldquo;Generate Report&rdquo; to refresh.
            </p>
          )}

          {/* Tabs */}
          <div className="mt-6 border-b border-surface-border">
            <nav className="-mb-px flex gap-6" aria-label="Pricing sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "whitespace-nowrap pb-3 text-sm font-medium transition-colors border-b-2",
                    activeTab === tab.id
                      ? "border-brand-600 text-brand-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                  ].join(" ")}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={[
                        "ml-2 rounded-full px-2 py-0.5 text-xs font-semibold",
                        tab.id === "immediate"
                          ? "bg-red-100 text-red-700"
                          : tab.id === "soon"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-600",
                      ].join(" ")}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Active section table */}
          <SectionTable
            title={sectionMeta[activeTab].title}
            rows={activeRows}
            emptyMessage={sectionMeta[activeTab].emptyMessage}
            headerClass={sectionMeta[activeTab].headerClass}
            onApply={handleApply}
            onDismiss={handleDismiss}
            busyIds={busyIds}
          />
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline icons                                                               */
/* -------------------------------------------------------------------------- */

function RefreshIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}

function CarMiniIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
      />
    </svg>
  );
}
