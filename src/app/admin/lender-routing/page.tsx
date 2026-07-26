"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Submission {
  id: string;
  deal_id: string;
  customer_name: string;
  ssn_last4: string | null;
  platform: string;
  lender_name: string;
  lender_id: string;
  status: string;
  apr_offered: number | null;
  term_offered: number | null;
  amount_approved: number | null;
  stipulations: string[];
  submitted_at: string;
  responded_at: string | null;
  expires_at: string | null;
  notes: string | null;
}

interface Lender {
  id: string;
  name: string;
  type: string;
  platforms: string[];
  min_score: number;
  max_ltv: number;
  specialties: string[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "counter_offer", label: "Counter Offer" },
  { value: "funded", label: "Funded" },
  { value: "expired", label: "Expired" },
];

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-brand-50 text-brand-800 ring-brand-700/20",
  pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  approved: "bg-green-50 text-green-700 ring-green-600/20",
  declined: "bg-red-50 text-red-700 ring-red-600/20",
  counter_offer: "bg-orange-50 text-orange-700 ring-orange-600/20",
  funded: "bg-teal-50 text-teal-700 ring-teal-600/20",
  expired: "bg-gray-100 text-gray-600 ring-gray-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  counter_offer: "Counter Offer",
  funded: "Funded",
  expired: "Expired",
};

const PLATFORM_OPTIONS = [
  { value: "", label: "All Platforms" },
  { value: "routeone", label: "RouteOne" },
  { value: "dealertrack", label: "DealerTrack" },
  { value: "direct", label: "Direct" },
];

const PLATFORM_LABEL: Record<string, string> = {
  routeone: "RouteOne",
  dealertrack: "DealerTrack",
  direct: "Direct",
};

const LENDER_TYPE_LABEL: Record<string, string> = {
  captive: "Captive (OEM)",
  national: "National",
  regional: "Regional",
  credit_union: "Credit Unions",
};

const LENDER_TYPE_ORDER = ["captive", "national", "regional", "credit_union"];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function LenderRoutingPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState("");
  const [lenderFilter, setLenderFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");

  /* New submission modal */
  const [showNewSubmission, setShowNewSubmission] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newForm, setNewForm] = useState({
    deal_id: "",
    customer_name: "",
    customer_email: "",
    ssn_last4: "",
    customer_dob: "",
    customer_address: "",
    customer_income: "",
    customer_employer: "",
    vehicle_vin: "",
    vehicle_year: "",
    vehicle_make: "",
    vehicle_model: "",
    selling_price: "",
    submission_platform: "routeone",
    selected_lenders: [] as string[],
  });

  /* Compare view */
  const [compareDealId, setCompareDealId] = useState<string | null>(null);

  /* Action state */
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* Fetch submissions */
  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (lenderFilter) params.set("lender", lenderFilter);
      if (platformFilter) params.set("platform", platformFilter);

      const res = await fetch(`/api/admin/lender-routing?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions ?? []);
      } else {
        setError("Failed to load submissions");
      }
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
      setError("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, lenderFilter, platformFilter]);

  /* Fetch lenders */
  const fetchLenders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lender-routing/lenders");
      if (res.ok) {
        const data = await res.json();
        setLenders(data.lenders ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch lenders:", err);
    }
  }, []);

  useEffect(() => {
    fetchSubmissions();
    fetchLenders();
  }, [fetchSubmissions, fetchLenders]);

  /* Stats */
  const stats = useMemo(() => {
    const active = submissions.filter((s) =>
      ["submitted", "pending", "approved", "counter_offer"].includes(s.status),
    );
    const approved = submissions.filter((s) => s.status === "approved" || s.status === "funded");
    const total = submissions.filter((s) => s.status !== "submitted" && s.status !== "pending");
    const approvalRate = total.length > 0 ? (approved.length / total.length) * 100 : 0;

    const rates = submissions
      .filter((s) => s.apr_offered !== null && s.apr_offered > 0)
      .map((s) => s.apr_offered as number);
    const bestRate = rates.length > 0 ? Math.min(...rates) : 0;

    const responseTimes = submissions
      .filter((s) => s.responded_at && s.submitted_at)
      .map((s) => {
        const sub = new Date(s.submitted_at).getTime();
        const resp = new Date(s.responded_at!).getTime();
        return (resp - sub) / 1000 / 60 / 60; // hours
      });
    const avgResponse = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    return { activeCount: active.length, approvalRate, bestRate, avgResponse };
  }, [submissions]);

  /* Lenders grouped by type, filtered by selected platform */
  const groupedLenders = useMemo(() => {
    const filtered = newForm.submission_platform
      ? lenders.filter((l) => l.platforms.includes(newForm.submission_platform))
      : lenders;

    const groups: Record<string, Lender[]> = {};
    for (const l of filtered) {
      if (!groups[l.type]) groups[l.type] = [];
      groups[l.type].push(l);
    }
    return groups;
  }, [lenders, newForm.submission_platform]);

  /* Unique lender names */
  const uniqueLenders = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => set.add(s.lender_name));
    return Array.from(set).sort();
  }, [submissions]);

  /* Deal comparison data */
  const compareOffers = useMemo(() => {
    if (!compareDealId) return [];
    return submissions
      .filter((s) => s.deal_id === compareDealId && (s.status === "approved" || s.status === "counter_offer" || s.status === "funded"))
      .sort((a, b) => (a.apr_offered ?? 99) - (b.apr_offered ?? 99));
  }, [submissions, compareDealId]);

  /* Unique deal IDs with approved offers */
  const dealsWithOffers = useMemo(() => {
    const map = new Map<string, string>();
    submissions
      .filter((s) => s.status === "approved" || s.status === "counter_offer" || s.status === "funded")
      .forEach((s) => map.set(s.deal_id, s.customer_name));
    return Array.from(map.entries());
  }, [submissions]);

  /* Toggle lender selection */
  const toggleLender = (lenderId: string) => {
    setNewForm((prev) => ({
      ...prev,
      selected_lenders: prev.selected_lenders.includes(lenderId)
        ? prev.selected_lenders.filter((id) => id !== lenderId)
        : [...prev.selected_lenders, lenderId],
    }));
  };

  /* Submit credit application */
  const handleSubmit = async () => {
    if (
      !newForm.deal_id ||
      !newForm.customer_name ||
      !newForm.vehicle_vin ||
      !newForm.selling_price ||
      newForm.selected_lenders.length === 0
    ) {
      setSubmitError("Please fill in all required fields and select at least one lender.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/lender-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newForm,
          selling_price: Number(newForm.selling_price),
          vehicle_year: newForm.vehicle_year ? Number(newForm.vehicle_year) : null,
          customer_income: newForm.customer_income ? Number(newForm.customer_income) : null,
        }),
      });

      if (res.ok) {
        setShowNewSubmission(false);
        setNewForm({
          deal_id: "",
          customer_name: "",
          customer_email: "",
          ssn_last4: "",
          customer_dob: "",
          customer_address: "",
          customer_income: "",
          customer_employer: "",
          vehicle_vin: "",
          vehicle_year: "",
          vehicle_make: "",
          vehicle_model: "",
          selling_price: "",
          submission_platform: "routeone",
          selected_lenders: [],
        });
        fetchSubmissions();
      } else if (res.status === 429) {
        setSubmitError("Rate limit exceeded. Credit applications are limited to 5 per minute.");
      } else {
        const data = await res.json();
        setSubmitError(data.error || "Failed to submit credit application.");
      }
    } catch (err) {
      console.error("Submit failed:", err);
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* Submission action (accept, decline, fund) */
  const handleAction = async (submissionId: string, action: string) => {
    setActionLoading(submissionId);
    try {
      const res = await fetch(`/api/admin/lender-routing/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        fetchSubmissions();
      }
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lender Routing</h1>
            <p className="mt-1 text-sm text-gray-500">
              Submit credit applications to multiple lenders via RouteOne and DealerTrack
            </p>
          </div>
          <button
            onClick={() => setShowNewSubmission(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Submission
          </button>
        </div>

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Submissions" value={String(stats.activeCount)} sub="in pipeline" color="brand" />
          <StatCard label="Approval Rate" value={stats.approvalRate > 0 ? `${stats.approvalRate.toFixed(0)}%` : "--"} sub="of responded" color="green" />
          <StatCard label="Best Rate" value={stats.bestRate > 0 ? fmtPct(stats.bestRate) : "--"} sub="APR available" color="purple" />
          <StatCard label="Avg Response" value={stats.avgResponse > 0 ? `${stats.avgResponse.toFixed(1)}h` : "--"} sub="lender response time" color="accent" />
        </div>

        {/* Compare bar */}
        {dealsWithOffers.length > 0 && (
          <div className="mt-6 flex flex-col gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-gray-700">Compare Offers:</span>
            <select
              value={compareDealId || ""}
              onChange={(e) => setCompareDealId(e.target.value || null)}
              className="block rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Select a deal...</option>
              {dealsWithOffers.map(([dealId, name]) => (
                <option key={dealId} value={dealId}>
                  {name} ({dealId})
                </option>
              ))}
            </select>
            {compareDealId && (
              <button
                onClick={() => setCompareDealId(null)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Comparison table */}
        {compareDealId && compareOffers.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
            <div className="border-b border-surface-border bg-surface-subtle px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Offer Comparison — {compareOffers[0].customer_name}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-border">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lender</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Platform</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">APR</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Term</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Stipulations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {compareOffers.map((offer, i) => (
                    <tr key={offer.id} className={i === 0 ? "bg-green-50/50" : ""}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {offer.lender_name}
                        {i === 0 && <span className="ml-2 text-xs text-green-600 font-semibold">BEST RATE</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {PLATFORM_LABEL[offer.platform] || offer.platform}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[offer.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}>
                          {STATUS_LABEL[offer.status] || offer.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        {offer.apr_offered !== null ? fmtPct(offer.apr_offered) : "--"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {offer.term_offered ? `${offer.term_offered}mo` : "--"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        {offer.amount_approved ? fmt(offer.amount_approved) : "--"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {offer.stipulations.length > 0 ? offer.stipulations.join(", ") : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="mt-6 flex flex-col gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">Lender</label>
            <select
              value={lenderFilter}
              onChange={(e) => setLenderFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Lenders</option>
              {uniqueLenders.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">Platform</label>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submissions table */}
        <div className="mt-6 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Lender
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Platform
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    APR
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Term
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Amount
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      Loading submissions...
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      No submissions found. Click &quot;New Submission&quot; to submit a credit application.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{sub.customer_name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {sub.deal_id} {sub.ssn_last4 && <span className="text-gray-400">SSN ***{sub.ssn_last4}</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{sub.lender_name}</p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-xs font-medium text-gray-600">
                          {PLATFORM_LABEL[sub.platform] || sub.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[sub.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
                        >
                          {STATUS_LABEL[sub.status] || sub.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm font-medium text-gray-900 sm:table-cell">
                        {sub.apr_offered !== null ? fmtPct(sub.apr_offered) : "--"}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm text-gray-600 lg:table-cell">
                        {sub.term_offered ? `${sub.term_offered}mo` : "--"}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm font-medium text-gray-900 sm:table-cell">
                        {sub.amount_approved ? fmt(sub.amount_approved) : "--"}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-400 lg:table-cell">
                        {fmtDate(sub.submitted_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(sub.status === "approved" || sub.status === "counter_offer") && (
                            <>
                              <button
                                onClick={() => handleAction(sub.id, "accepted")}
                                disabled={actionLoading === sub.id}
                                className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleAction(sub.id, "declined")}
                                disabled={actionLoading === sub.id}
                                className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {sub.status === "accepted" && (
                            <button
                              onClick={() => handleAction(sub.id, "funded")}
                              disabled={actionLoading === sub.id}
                              className="rounded px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                            >
                              Mark Funded
                            </button>
                          )}
                          {sub.status === "funded" && (
                            <span className="text-xs text-teal-600 font-medium">Funded</span>
                          )}
                          {sub.status === "declined" && (
                            <span className="text-xs text-gray-400">Declined</span>
                          )}
                          {(sub.status === "submitted" || sub.status === "pending") && (
                            <span className="text-xs text-gray-400">Awaiting response</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Submission Modal */}
      {showNewSubmission && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-card bg-white p-6 shadow-xl max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Submit Credit Application</h2>
              <button
                onClick={() => { setShowNewSubmission(false); setSubmitError(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {submitError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="mt-5 space-y-6">
              {/* Deal info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 border-b border-surface-border pb-2">Deal Information</h3>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500">Deal ID *</label>
                    <input
                      type="text"
                      value={newForm.deal_id}
                      onChange={(e) => setNewForm({ ...newForm, deal_id: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="deal-001"
                    />
                  </div>
                </div>
              </div>

              {/* Customer info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 border-b border-surface-border pb-2">Customer Information</h3>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500">Customer Name *</label>
                    <input
                      type="text"
                      value={newForm.customer_name}
                      onChange={(e) => setNewForm({ ...newForm, customer_name: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="James Rodriguez"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Email</label>
                    <input
                      type="email"
                      value={newForm.customer_email}
                      onChange={(e) => setNewForm({ ...newForm, customer_email: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">SSN (last 4 only)</label>
                    <input
                      type="text"
                      value={newForm.ssn_last4}
                      onChange={(e) => setNewForm({ ...newForm, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      maxLength={4}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="4829"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Date of Birth</label>
                    <input
                      type="date"
                      value={newForm.customer_dob}
                      onChange={(e) => setNewForm({ ...newForm, customer_dob: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500">Address</label>
                    <input
                      type="text"
                      value={newForm.customer_address}
                      onChange={(e) => setNewForm({ ...newForm, customer_address: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="4821 E Riverside Dr, Austin, TX 78741"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Annual Income</label>
                    <input
                      type="number"
                      value={newForm.customer_income}
                      onChange={(e) => setNewForm({ ...newForm, customer_income: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="85000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Employer</label>
                    <input
                      type="text"
                      value={newForm.customer_employer}
                      onChange={(e) => setNewForm({ ...newForm, customer_employer: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Dell Technologies"
                    />
                  </div>
                </div>
              </div>

              {/* Vehicle info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 border-b border-surface-border pb-2">Vehicle Information</h3>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500">VIN *</label>
                    <input
                      type="text"
                      value={newForm.vehicle_vin}
                      onChange={(e) => setNewForm({ ...newForm, vehicle_vin: e.target.value.toUpperCase() })}
                      maxLength={17}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 font-mono text-sm uppercase focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="4T1G11AK5RU123456"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Year</label>
                    <input
                      type="number"
                      value={newForm.vehicle_year}
                      onChange={(e) => setNewForm({ ...newForm, vehicle_year: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="2024"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Make</label>
                    <input
                      type="text"
                      value={newForm.vehicle_make}
                      onChange={(e) => setNewForm({ ...newForm, vehicle_make: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Toyota"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Model</label>
                    <input
                      type="text"
                      value={newForm.vehicle_model}
                      onChange={(e) => setNewForm({ ...newForm, vehicle_model: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Camry XSE"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Selling Price *</label>
                    <input
                      type="number"
                      value={newForm.selling_price}
                      onChange={(e) => setNewForm({ ...newForm, selling_price: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="31500"
                    />
                  </div>
                </div>
              </div>

              {/* Platform + Lender selection */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 border-b border-surface-border pb-2">Submission Platform & Lenders</h3>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500">Platform *</label>
                  <div className="mt-2 flex gap-3">
                    {(["routeone", "dealertrack", "direct"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setNewForm({ ...newForm, submission_platform: p, selected_lenders: [] })}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                          newForm.submission_platform === p
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-surface-border bg-white text-gray-600 hover:bg-surface-subtle"
                        }`}
                      >
                        {PLATFORM_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    Select Lenders * ({newForm.selected_lenders.length} selected)
                  </label>
                  <div className="max-h-60 overflow-y-auto rounded-md border border-surface-border p-3 space-y-4">
                    {LENDER_TYPE_ORDER.map((type) => {
                      const group = groupedLenders[type];
                      if (!group || group.length === 0) return null;
                      return (
                        <div key={type}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                            {LENDER_TYPE_LABEL[type] || type}
                          </p>
                          <div className="space-y-1">
                            {group.map((lender) => (
                              <label
                                key={lender.id}
                                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-subtle cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={newForm.selected_lenders.includes(lender.name)}
                                  onChange={() => toggleLender(lender.name)}
                                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                />
                                <span className="text-gray-900">{lender.name}</span>
                                <span className="ml-auto text-xs text-gray-400">
                                  {lender.min_score}+ score
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(groupedLenders).length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No lenders available for this platform.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowNewSubmission(false); setSubmitError(null); }}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !newForm.deal_id ||
                  !newForm.customer_name ||
                  !newForm.vehicle_vin ||
                  !newForm.selling_price ||
                  newForm.selected_lenders.length === 0
                }
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Submitting..."
                  : `Submit to ${newForm.selected_lenders.length} Lender${newForm.selected_lenders.length !== 1 ? "s" : ""}`}
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
