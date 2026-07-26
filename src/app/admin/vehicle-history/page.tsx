"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface HistoryEntry {
  date: string;
  description: string;
  mileage: number;
  source: string;
  category: "service" | "sale" | "accident" | "title" | "recall" | "inspection";
}

interface ReportSummary {
  title_status: "clean" | "salvage" | "rebuilt" | "flood" | "lemon";
  owners: number;
  accidents: number;
  service_records: number;
  open_recalls: number;
  odometer_status: "ok" | "rollback" | "discrepancy";
  structural_damage: boolean;
  airbag_deployed: boolean;
  theft_reported: boolean;
}

interface ValueImpact {
  score: number;
  factors_positive: string[];
  factors_negative: string[];
}

interface VehicleHistoryReport {
  id: string;
  dealer_id: string;
  vin: string;
  provider: string;
  vehicle_description: string;
  pulled_at: string;
  expires_at: string;
  report_url: string;
  summary: ReportSummary;
  history_entries: HistoryEntry[];
  value_impact: ValueImpact;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TITLE_BADGE: Record<string, string> = {
  clean: "bg-green-50 text-green-700 ring-green-600/20",
  salvage: "bg-red-50 text-red-700 ring-red-600/20",
  rebuilt: "bg-orange-50 text-orange-700 ring-orange-600/20",
  flood: "bg-red-50 text-red-700 ring-red-600/20",
  lemon: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

const TITLE_LABEL: Record<string, string> = {
  clean: "Clean",
  salvage: "Salvage",
  rebuilt: "Rebuilt",
  flood: "Flood",
  lemon: "Lemon",
};

const CATEGORY_ICON: Record<string, string> = {
  service: "wrench",
  sale: "tag",
  accident: "exclamation-triangle",
  title: "document",
  recall: "bell",
  inspection: "clipboard-check",
};

const CATEGORY_COLOR: Record<string, string> = {
  service: "text-brand-600",
  sale: "text-purple-500",
  accident: "text-red-500",
  title: "text-gray-500",
  recall: "text-orange-500",
  inspection: "text-green-500",
};

const PROVIDER_OPTIONS = [
  { value: "", label: "All Providers" },
  { value: "carfax", label: "Carfax" },
  { value: "autocheck", label: "AutoCheck" },
];

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtMileage(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function VehicleHistoryPage() {
  const [reports, setReports] = useState<VehicleHistoryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [providerFilter, setProviderFilter] = useState("");
  const [vinSearch, setVinSearch] = useState("");

  /* Pull Report modal */
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullVin, setPullVin] = useState("");
  const [pullProvider, setPullProvider] = useState("carfax");
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);

  /* Detail view */
  const [selectedReport, setSelectedReport] = useState<VehicleHistoryReport | null>(null);

  /* Fetch reports */
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (providerFilter) params.set("provider", providerFilter);
      if (vinSearch && isValidVin(vinSearch)) params.set("vin", vinSearch.toUpperCase());

      const res = await fetch(`/api/admin/vehicle-history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports ?? []);
      } else {
        setError("Failed to load reports. Please try again.");
      }
    } catch (err) {
      console.error("Failed to fetch vehicle history:", err);
      setError("Failed to load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [providerFilter, vinSearch]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  /* Stats */
  const stats = useMemo(() => {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const pulledThisMonth = reports.filter(
      (r) => new Date(r.pulled_at) >= thisMonth,
    ).length;
    const cleanTitles = reports.filter(
      (r) => r.summary.title_status === "clean",
    ).length;
    const issuesFound = reports.filter(
      (r) =>
        r.summary.accidents > 0 ||
        r.summary.structural_damage ||
        r.summary.airbag_deployed ||
        r.summary.theft_reported ||
        r.summary.title_status !== "clean",
    ).length;
    const avgScore =
      reports.length > 0
        ? Math.round(
            reports.reduce((s, r) => s + r.value_impact.score, 0) /
              reports.length,
          )
        : 0;

    return { pulledThisMonth, cleanTitles, issuesFound, avgScore };
  }, [reports]);

  /* Pull new report */
  const handlePullReport = async () => {
    const cleanVin = pullVin.toUpperCase().trim();
    if (!isValidVin(cleanVin)) {
      setPullError("VIN must be exactly 17 characters (A-Z, 0-9, excluding I, O, Q).");
      return;
    }
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch("/api/admin/vehicle-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: cleanVin, provider: pullProvider }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowPullModal(false);
        setPullVin("");
        setPullProvider("carfax");
        if (data.report) {
          setSelectedReport(data.report);
        }
        fetchReports();
      } else {
        const data = await res.json().catch(() => ({}));
        setPullError(data.error || "Failed to pull report. Please try again.");
      }
    } catch (err) {
      console.error("Pull report failed:", err);
      setPullError("Network error. Please try again.");
    } finally {
      setPulling(false);
    }
  };

  /* Quick VIN search from top bar */
  const handleQuickSearch = async () => {
    const cleanVin = vinSearch.toUpperCase().trim();
    if (!isValidVin(cleanVin)) return;

    try {
      const res = await fetch(`/api/admin/vehicle-history/${cleanVin}`);
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setSelectedReport(data.report);
          return;
        }
      }
      // No cached report — prompt to pull
      setPullVin(cleanVin);
      setShowPullModal(true);
    } catch {
      setPullVin(cleanVin);
      setShowPullModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vehicle History Reports</h1>
            <p className="mt-1 text-sm text-gray-500">
              Pull and manage vehicle history reports for your inventory
            </p>
          </div>
          <button
            onClick={() => setShowPullModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Pull Report
          </button>
        </div>

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Reports Pulled" value={String(stats.pulledThisMonth)} sub="this month" color="brand" />
          <StatCard label="Clean Titles" value={String(stats.cleanTitles)} sub="of total reports" color="green" />
          <StatCard label="Issues Found" value={String(stats.issuesFound)} sub="reports with flags" color="red" />
          <StatCard label="Avg Value Score" value={String(stats.avgScore)} sub="out of 100" color="purple" />
        </div>

        {/* VIN search bar */}
        <div className="mt-6 rounded-card border border-surface-border bg-white p-4 shadow-card">
          <label className="block text-sm font-medium text-gray-700">Quick VIN Lookup</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <input
                type="text"
                value={vinSearch}
                onChange={(e) => setVinSearch(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ""))}
                maxLength={17}
                placeholder="Enter a 17-character VIN..."
                className="block w-full rounded-md border border-surface-border px-3 py-2.5 font-mono text-sm uppercase tracking-wider focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={handleQuickSearch}
              disabled={!isValidVin(vinSearch)}
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Look Up
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            {vinSearch.length > 0 && vinSearch.length < 17
              ? `${17 - vinSearch.length} more characters needed`
              : vinSearch.length === 17 && !isValidVin(vinSearch)
                ? "Invalid VIN characters detected"
                : "Search existing reports or pull a new one"}
          </p>
        </div>

        {/* Filter bar */}
        <div className="mt-4 flex flex-col gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">Provider</label>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-4 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Reports table */}
        <div className="mt-6 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    VIN / Vehicle
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Title
                  </th>
                  <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Owners
                  </th>
                  <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Accidents
                  </th>
                  <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Score
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Pulled
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      Loading reports...
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      No reports found. Use the VIN lookup above or click &quot;Pull Report&quot; to get started.
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr key={report.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedReport(report)}
                          className="block text-left"
                        >
                          <p className="font-mono text-sm font-medium text-gray-900 hover:text-brand-600">
                            {report.vin}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {report.vehicle_description}
                          </p>
                        </button>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-xs font-medium capitalize text-gray-600">
                          {report.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TITLE_BADGE[report.summary.title_status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
                        >
                          {TITLE_LABEL[report.summary.title_status] || report.summary.title_status}
                        </span>
                        {isExpired(report.expires_at) && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-inset ring-gray-400/20">
                            Expired
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-center text-sm text-gray-600 sm:table-cell">
                        {report.summary.owners}
                      </td>
                      <td className="hidden px-4 py-3 text-center text-sm sm:table-cell">
                        <span className={report.summary.accidents > 0 ? "font-medium text-red-600" : "text-gray-600"}>
                          {report.summary.accidents}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-center lg:table-cell">
                        <ScoreBadge score={report.value_impact.score} />
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-400 lg:table-cell">
                        {fmtDate(report.pulled_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedReport(report)}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pull Report Modal */}
      {showPullModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-card max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Pull Vehicle History Report</h2>
              <button
                onClick={() => { setShowPullModal(false); setPullError(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">VIN *</label>
                <input
                  type="text"
                  value={pullVin}
                  onChange={(e) => setPullVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ""))}
                  maxLength={17}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 font-mono text-sm uppercase tracking-wider focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="4T1G11AK5RU123456"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {pullVin.length}/17 characters
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Provider</label>
                <select
                  value={pullProvider}
                  onChange={(e) => setPullProvider(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="carfax">Carfax</option>
                  <option value="autocheck">AutoCheck</option>
                  <option value="both">Both (Carfax + AutoCheck)</option>
                </select>
              </div>

              {pullError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {pullError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowPullModal(false); setPullError(null); }}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handlePullReport}
                disabled={pulling || !isValidVin(pullVin)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pulling ? "Pulling..." : "Pull Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-start sm:p-4 sm:pt-12">
          <div className="w-full max-w-3xl rounded-t-2xl bg-white shadow-xl sm:rounded-card max-h-[95dvh] overflow-y-auto">
            {/* Detail header */}
            <div className="sticky top-0 z-10 rounded-t-2xl border-b border-surface-border bg-white px-6 py-4 sm:rounded-t-card">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedReport.vehicle_description}
                  </h2>
                  <p className="mt-0.5 font-mono text-sm text-gray-500">
                    {selectedReport.vin}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Action buttons */}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={selectedReport.report_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-surface-subtle"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Full Report
                </a>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-surface-subtle"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                  </svg>
                  Print
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.386-3.04a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.25 8.497" />
                  </svg>
                  Attach to Deal
                </button>
                {isExpired(selectedReport.expires_at) && (
                  <span className="inline-flex items-center rounded-lg bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-yellow-600/20">
                    Expired — re-pull recommended
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-6 px-6 py-5">
              {/* Summary flags */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Report Summary</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryFlag
                    label="Title Status"
                    value={TITLE_LABEL[selectedReport.summary.title_status] || selectedReport.summary.title_status}
                    ok={selectedReport.summary.title_status === "clean"}
                  />
                  <SummaryFlag
                    label="Owners"
                    value={String(selectedReport.summary.owners)}
                    ok={selectedReport.summary.owners <= 1}
                  />
                  <SummaryFlag
                    label="Accidents"
                    value={String(selectedReport.summary.accidents)}
                    ok={selectedReport.summary.accidents === 0}
                  />
                  <SummaryFlag
                    label="Service Records"
                    value={String(selectedReport.summary.service_records)}
                    ok={selectedReport.summary.service_records > 0}
                  />
                  <SummaryFlag
                    label="Open Recalls"
                    value={String(selectedReport.summary.open_recalls)}
                    ok={selectedReport.summary.open_recalls === 0}
                  />
                  <SummaryFlag
                    label="Odometer"
                    value={selectedReport.summary.odometer_status === "ok" ? "OK" : selectedReport.summary.odometer_status}
                    ok={selectedReport.summary.odometer_status === "ok"}
                  />
                  <SummaryFlag
                    label="Structural Damage"
                    value={selectedReport.summary.structural_damage ? "Yes" : "None"}
                    ok={!selectedReport.summary.structural_damage}
                  />
                  <SummaryFlag
                    label="Theft Reported"
                    value={selectedReport.summary.theft_reported ? "Yes" : "None"}
                    ok={!selectedReport.summary.theft_reported}
                  />
                </div>
              </div>

              {/* Value impact */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Value Impact</h3>
                <div className="mt-3 rounded-lg border border-surface-border p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <ScoreBadge score={selectedReport.value_impact.score} size="lg" />
                    </div>
                    <div className="flex-1">
                      <div className="h-2.5 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            selectedReport.value_impact.score >= 85
                              ? "bg-green-500"
                              : selectedReport.value_impact.score >= 70
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${selectedReport.value_impact.score}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {selectedReport.value_impact.factors_positive.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-green-700">Positive Factors</p>
                      <ul className="mt-1 space-y-0.5">
                        {selectedReport.value_impact.factors_positive.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                            <svg className="mt-0.5 h-3 w-3 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedReport.value_impact.factors_negative.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-red-700">Negative Factors</p>
                      <ul className="mt-1 space-y-0.5">
                        {selectedReport.value_impact.factors_negative.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                            <svg className="mt-0.5 h-3 w-3 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* History timeline */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Vehicle History Timeline ({selectedReport.history_entries.length} entries)
                </h3>
                <div className="mt-3">
                  {selectedReport.history_entries.length === 0 ? (
                    <p className="text-sm text-gray-400">No history entries available.</p>
                  ) : (
                    <div className="relative ml-3 border-l-2 border-surface-border pl-6">
                      {selectedReport.history_entries.map((entry, i) => (
                        <div key={i} className="relative mb-4 last:mb-0">
                          {/* Timeline dot */}
                          <div
                            className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${
                              entry.category === "accident"
                                ? "bg-red-500"
                                : entry.category === "service"
                                  ? "bg-brand-600"
                                  : entry.category === "sale"
                                    ? "bg-purple-500"
                                    : entry.category === "recall"
                                      ? "bg-orange-500"
                                      : entry.category === "inspection"
                                        ? "bg-green-500"
                                        : "bg-gray-400"
                            }`}
                          />
                          <div className="rounded-lg border border-surface-border bg-surface-subtle p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium capitalize ${CATEGORY_COLOR[entry.category] || "text-gray-500"}`}>
                                  {entry.category}
                                </span>
                                <span className="text-xs text-gray-400">{fmtShortDate(entry.date)}</span>
                              </div>
                              {entry.mileage > 0 && (
                                <span className="text-xs text-gray-400">
                                  {fmtMileage(entry.mileage)} mi
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-700">{entry.description}</p>
                            <p className="mt-0.5 text-xs text-gray-400">{entry.source}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div className="border-t border-surface-border pt-4">
                <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                  <span>Provider: <span className="capitalize text-gray-600">{selectedReport.provider}</span></span>
                  <span>Pulled: {fmtDate(selectedReport.pulled_at)}</span>
                  <span>Expires: {fmtDate(selectedReport.expires_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat card subcomponent                                                     */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: "border-l-brand-500",
    green: "border-l-green-500",
    purple: "border-l-purple-500",
    red: "border-l-red-500",
    accent: "border-l-accent-500",
  };

  return (
    <div
      className={`rounded-card border border-surface-border border-l-4 bg-white p-4 shadow-card ${colorMap[color] || colorMap.brand}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary flag subcomponent                                                  */
/* -------------------------------------------------------------------------- */

function SummaryFlag({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {ok ? (
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        )}
        <span className={`text-sm font-semibold ${ok ? "text-green-700" : "text-red-700"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Score badge subcomponent                                                   */
/* -------------------------------------------------------------------------- */

function ScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const colorClass =
    score >= 85
      ? "bg-green-50 text-green-700 ring-green-600/20"
      : score >= 70
        ? "bg-yellow-50 text-yellow-700 ring-yellow-600/20"
        : "bg-red-50 text-red-700 ring-red-600/20";

  const sizeClass = size === "lg" ? "px-3 py-1.5 text-lg font-bold" : "px-2 py-0.5 text-xs font-medium";

  return (
    <span className={`inline-flex items-center rounded-full ring-1 ring-inset ${colorClass} ${sizeClass}`}>
      {score}
    </span>
  );
}
