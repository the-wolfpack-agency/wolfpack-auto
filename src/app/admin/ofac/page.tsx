"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SDNMatch {
  name: string;
  type: "individual" | "entity";
  program: string;
  remarks: string;
  score: number;
}

interface Screening {
  id: string;
  dealer_id: string;
  deal_id: string | null;
  customer_name: string;
  customer_dob_masked?: string | null;
  status: "clear" | "potential_match" | "confirmed_match" | "override";
  match_score: number;
  matches_found: number;
  matches_detail?: SDNMatch[];
  reference_id: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  override_reason: string | null;
  screened_at: string;
  created_at: string;
  audit_log?: AuditEntry[];
}

interface AuditEntry {
  action: string;
  user: string;
  user_name?: string;
  timestamp: string;
  details: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "clear", label: "Clear" },
  { value: "potential_match", label: "Potential Match" },
  { value: "confirmed_match", label: "Confirmed Match" },
  { value: "override", label: "Override" },
];

const STATUS_BADGE: Record<string, string> = {
  clear: "bg-green-50 text-green-700 ring-green-600/20",
  potential_match: "bg-red-50 text-red-700 ring-red-600/20 animate-pulse",
  confirmed_match: "bg-red-100 text-red-800 ring-red-700/30",
  override: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

const STATUS_LABEL: Record<string, string> = {
  clear: "Clear",
  potential_match: "Potential Match",
  confirmed_match: "Confirmed Match",
  override: "Override",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function OFACCompliancePage() {
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState("");

  /* Screen Customer modal */
  const [showScreenModal, setShowScreenModal] = useState(false);
  const [screenForm, setScreenForm] = useState({
    customer_name: "",
    customer_dob: "",
    customer_address: "",
    deal_id: "",
  });
  const [screening, setScreening] = useState(false);
  const [screenResult, setScreenResult] = useState<{
    status: string;
    match_score: number;
    matches: SDNMatch[];
    reference_id: string;
  } | null>(null);

  /* Detail view */
  const [selectedScreening, setSelectedScreening] = useState<Screening | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  /* ---- Fetch screenings ---- */
  const fetchScreenings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/ofac?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setScreenings(data.screenings ?? []);
      } else {
        setError("Failed to load screening history");
      }
    } catch (err) {
      console.error("Failed to fetch screenings:", err);
      setError("Failed to load screening history");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchScreenings();
  }, [fetchScreenings]);

  /* ---- Stats ---- */
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = screenings.filter(
      (s) => new Date(s.screened_at) >= monthStart,
    );
    const clearCount = thisMonth.filter((s) => s.status === "clear").length;
    const pendingReview = screenings.filter(
      (s) => s.status === "potential_match" && !s.reviewed_by,
    ).length;
    const clearRate =
      thisMonth.length > 0
        ? Math.round((clearCount / thisMonth.length) * 100)
        : 100;

    return {
      monthlyCount: thisMonth.length,
      clearRate,
      pendingReview,
      avgResponseTime: "< 1s",
    };
  }, [screenings]);

  /* ---- Screen customer ---- */
  const handleScreen = async () => {
    if (!screenForm.customer_name.trim()) return;
    setScreening(true);
    setScreenResult(null);
    try {
      const res = await fetch("/api/admin/ofac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: screenForm.customer_name.trim(),
          customer_dob: screenForm.customer_dob || undefined,
          customer_address: screenForm.customer_address || undefined,
          deal_id: screenForm.deal_id || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setScreenResult(data.result);
        fetchScreenings();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Screening failed");
      }
    } catch (err) {
      console.error("Screen failed:", err);
      setError("Screening request failed");
    } finally {
      setScreening(false);
    }
  };

  /* ---- Load screening detail ---- */
  const openDetail = async (s: Screening) => {
    setSelectedScreening(s);
    setOverrideReason("");

    if (s.status !== "clear") {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/admin/ofac/${s.id}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedScreening(data.screening);
        }
      } catch (err) {
        console.error("Failed to load detail:", err);
      } finally {
        setDetailLoading(false);
      }
    }
  };

  /* ---- Override / Escalate / Block ---- */
  const handleAction = async (
    action: "override" | "escalate" | "block",
  ) => {
    if (!selectedScreening) return;
    if (action === "override" && !overrideReason.trim()) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/ofac/${selectedScreening.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          override_reason: action === "override" ? overrideReason.trim() : undefined,
        }),
      });

      if (res.ok) {
        setSelectedScreening(null);
        fetchScreenings();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `${action} failed`);
      }
    } catch (err) {
      console.error(`${action} failed:`, err);
      setError(`${action} request failed`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              OFAC Compliance Screening
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              SDN list screening for every vehicle sale — required by federal law
            </p>
          </div>
          <button
            onClick={() => {
              setShowScreenModal(true);
              setScreenResult(null);
              setScreenForm({
                customer_name: "",
                customer_dob: "",
                customer_address: "",
                deal_id: "",
              });
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            Screen Customer
          </button>
        </div>

        {/* Compliance banner */}
        <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <div className="flex">
            <svg
              className="h-5 w-5 flex-shrink-0 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="ml-3 text-sm font-medium text-yellow-800">
              Federal law requires OFAC screening for all vehicle sales. Every
              customer must be screened before deal completion.
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Screenings"
            value={String(stats.monthlyCount)}
            sub="this month"
            color="brand"
          />
          <StatCard
            label="Clear Rate"
            value={`${stats.clearRate}%`}
            sub="no matches found"
            color="green"
          />
          <StatCard
            label="Pending Review"
            value={String(stats.pendingReview)}
            sub="needs attention"
            color={stats.pendingReview > 0 ? "red" : "green"}
          />
          <StatCard
            label="Avg Response"
            value={stats.avgResponseTime}
            sub="screening time"
            color="accent"
          />
        </div>

        {/* Filter bar */}
        <div className="mt-6 flex flex-col gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Screening table */}
        <div className="mt-6 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Deal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Score
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Screened
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Reviewed By
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-gray-400"
                    >
                      Loading screenings...
                    </td>
                  </tr>
                ) : screenings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-gray-400"
                    >
                      No screenings found. Click &quot;Screen Customer&quot; to
                      run an OFAC check.
                    </td>
                  </tr>
                ) : (
                  screenings.map((s) => (
                    <tr
                      key={s.id}
                      className="transition-colors hover:bg-surface-muted"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {s.customer_name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400 font-mono">
                          {s.reference_id}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className="text-xs text-gray-600">
                          {s.deal_id || "--"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[s.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
                        >
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-center md:table-cell">
                        <span
                          className={`text-sm font-medium ${s.match_score >= 70 ? "text-red-600" : s.match_score >= 50 ? "text-yellow-600" : "text-green-600"}`}
                        >
                          {s.match_score}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-500 md:table-cell">
                        {fmtDate(s.screened_at)}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-500 lg:table-cell">
                        {s.reviewed_by || "--"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openDetail(s)}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          {s.status === "potential_match" && !s.reviewed_by
                            ? "Review"
                            : "View"}
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

      {/* ------------------------------------------------------------------ */}
      {/* Screen Customer Modal                                               */}
      {/* ------------------------------------------------------------------ */}
      {showScreenModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-card bg-white p-6 shadow-xl max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Screen Customer
              </h2>
              <button
                onClick={() => setShowScreenModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={screenForm.customer_name}
                  onChange={(e) =>
                    setScreenForm({
                      ...screenForm,
                      customer_name: e.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Full legal name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Date of Birth (optional)
                </label>
                <input
                  type="date"
                  value={screenForm.customer_dob}
                  onChange={(e) =>
                    setScreenForm({
                      ...screenForm,
                      customer_dob: e.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Only month/year is stored for compliance records
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Address (optional)
                </label>
                <input
                  type="text"
                  value={screenForm.customer_address}
                  onChange={(e) =>
                    setScreenForm({
                      ...screenForm,
                      customer_address: e.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Customer address for disambiguation"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Associated Deal (optional)
                </label>
                <input
                  type="text"
                  value={screenForm.deal_id}
                  onChange={(e) =>
                    setScreenForm({
                      ...screenForm,
                      deal_id: e.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="deal-001"
                />
              </div>
            </div>

            {/* Screen result display */}
            {screenResult && (
              <div
                className={`mt-5 rounded-lg border p-4 ${
                  screenResult.status === "clear"
                    ? "border-green-300 bg-green-50"
                    : screenResult.status === "potential_match"
                      ? "border-red-300 bg-red-50"
                      : "border-red-400 bg-red-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  {screenResult.status === "clear" ? (
                    <svg
                      className="h-5 w-5 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                  )}
                  <p
                    className={`text-sm font-semibold ${screenResult.status === "clear" ? "text-green-800" : "text-red-800"}`}
                  >
                    {screenResult.status === "clear"
                      ? "CLEAR — No matches found"
                      : screenResult.status === "potential_match"
                        ? "POTENTIAL MATCH — Manual review required"
                        : "CONFIRMED MATCH — Deal cannot proceed"}
                  </p>
                </div>
                {screenResult.matches.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {screenResult.matches.map((m, i) => (
                      <div
                        key={i}
                        className="rounded border border-red-200 bg-white p-3"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {m.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {m.type === "individual" ? "Individual" : "Entity"} —{" "}
                          {m.program}
                        </p>
                        <p className="text-xs text-gray-400">{m.remarks}</p>
                        <p className="mt-1 text-xs font-medium text-red-600">
                          Match score: {m.score}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  Reference: {screenResult.reference_id}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowScreenModal(false)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                {screenResult ? "Close" : "Cancel"}
              </button>
              {!screenResult && (
                <button
                  onClick={handleScreen}
                  disabled={screening || !screenForm.customer_name.trim()}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {screening ? "Screening..." : "Run OFAC Screen"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Screening Detail / Review Modal                                     */}
      {/* ------------------------------------------------------------------ */}
      {selectedScreening && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-card bg-white p-6 shadow-xl max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Screening Detail
              </h2>
              <button
                onClick={() => setSelectedScreening(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 text-center text-sm text-gray-400">
                Loading details...
              </div>
            ) : (
              <>
                {/* Customer info + status */}
                <div className="mt-4 rounded-lg border border-surface-border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedScreening.customer_name}
                      </p>
                      {selectedScreening.customer_dob_masked && (
                        <p className="text-xs text-gray-500">
                          DOB: {selectedScreening.customer_dob_masked}
                        </p>
                      )}
                      {selectedScreening.deal_id && (
                        <p className="text-xs text-gray-500">
                          Deal: {selectedScreening.deal_id}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400 font-mono">
                        Ref: {selectedScreening.reference_id}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[selectedScreening.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
                    >
                      {STATUS_LABEL[selectedScreening.status] ||
                        selectedScreening.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-400">Screened:</span>{" "}
                      <span className="text-gray-700">
                        {fmtDateFull(selectedScreening.screened_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Match Score:</span>{" "}
                      <span
                        className={`font-medium ${selectedScreening.match_score >= 70 ? "text-red-600" : "text-green-600"}`}
                      >
                        {selectedScreening.match_score}
                      </span>
                    </div>
                    {selectedScreening.reviewed_by && (
                      <>
                        <div>
                          <span className="text-gray-400">Reviewed By:</span>{" "}
                          <span className="text-gray-700">
                            {selectedScreening.reviewed_by}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Reviewed At:</span>{" "}
                          <span className="text-gray-700">
                            {selectedScreening.reviewed_at
                              ? fmtDateFull(selectedScreening.reviewed_at)
                              : "--"}
                          </span>
                        </div>
                      </>
                    )}
                    {selectedScreening.override_reason && (
                      <div className="col-span-2">
                        <span className="text-gray-400">Override Reason:</span>{" "}
                        <span className="text-gray-700">
                          {selectedScreening.override_reason}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Match details — side-by-side comparison */}
                {selectedScreening.matches_detail &&
                  selectedScreening.matches_detail.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-gray-900">
                        SDN Match Details
                      </h3>
                      {selectedScreening.matches_detail.map((m, i) => (
                        <div
                          key={i}
                          className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4"
                        >
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {/* Customer side */}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Customer
                              </p>
                              <p className="mt-1 text-sm font-medium text-gray-900">
                                {selectedScreening.customer_name}
                              </p>
                              {selectedScreening.customer_dob_masked && (
                                <p className="text-xs text-gray-500">
                                  DOB: {selectedScreening.customer_dob_masked}
                                </p>
                              )}
                            </div>
                            {/* SDN side */}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                                SDN Entry
                              </p>
                              <p className="mt-1 text-sm font-medium text-red-800">
                                {m.name}
                              </p>
                              <p className="text-xs text-gray-600">
                                {m.type === "individual"
                                  ? "Individual"
                                  : "Entity"}{" "}
                                — Program: {m.program}
                              </p>
                              <p className="text-xs text-gray-500">
                                {m.remarks}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 text-right">
                            <span className="text-xs font-medium text-red-600">
                              Match confidence: {m.score}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Action buttons for potential matches */}
                {selectedScreening.status === "potential_match" &&
                  !selectedScreening.reviewed_by && (
                    <div className="mt-5 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500">
                          Override Reason (required for override)
                        </label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          rows={3}
                          className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          placeholder="Explain why this is not a true match (e.g., different DOB, confirmed identity via government ID)..."
                        />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() => handleAction("override")}
                          disabled={
                            actionLoading || !overrideReason.trim()
                          }
                          className="flex-1 rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm font-semibold text-yellow-800 transition-colors hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actionLoading
                            ? "Processing..."
                            : "Override — Not a Match"}
                        </button>
                        <button
                          onClick={() => handleAction("escalate")}
                          disabled={actionLoading}
                          className="flex-1 rounded-lg border border-brand-400 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Escalate
                        </button>
                        <button
                          onClick={() => handleAction("block")}
                          disabled={actionLoading}
                          className="flex-1 rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Block Deal
                        </button>
                      </div>
                    </div>
                  )}

                {/* Audit log */}
                {selectedScreening.audit_log &&
                  selectedScreening.audit_log.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-gray-900">
                        Compliance Audit Log
                      </h3>
                      <div className="mt-2 space-y-2">
                        {selectedScreening.audit_log.map((entry, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 rounded border border-surface-border p-3"
                          >
                            <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-gray-400" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs font-medium text-gray-700">
                                  {entry.action.replace(/_/g, " ").toUpperCase()}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {fmtDateFull(entry.timestamp)}
                                </p>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {entry.details}
                              </p>
                              <p className="text-xs text-gray-400">
                                By: {entry.user || entry.user_name || "System"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedScreening(null)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Close
              </button>
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
    accent: "border-l-accent-500",
    red: "border-l-red-500",
  };

  return (
    <div
      className={`rounded-card border border-surface-border border-l-4 bg-white p-4 shadow-card ${colorMap[color] || colorMap.brand}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
