"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Flag {
  rule: string;
  description: string;
  severity: string;
}

interface ComplianceCheck {
  id: string;
  dealer_id: string;
  lead_id: string | null;
  deal_id: string | null;
  check_type: "red_flags" | "ofac" | "id_verification";
  customer_name: string;
  result: "clear" | "flagged" | "review_required" | "blocked";
  flags: Flag[];
  checked_by: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  override_approved: boolean;
  override_by: string | null;
  override_at: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const RESULT_STYLES: Record<ComplianceCheck["result"], string> = {
  clear: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  flagged: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  review_required: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20",
  blocked: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
};

const RESULT_LABELS: Record<ComplianceCheck["result"], string> = {
  clear: "Clear",
  flagged: "Flagged",
  review_required: "Review Required",
  blocked: "Blocked",
};

const TYPE_STYLES: Record<ComplianceCheck["check_type"], string> = {
  red_flags: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20",
  ofac: "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-700/20",
  id_verification: "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-700/20",
};

const TYPE_LABELS: Record<ComplianceCheck["check_type"], string> = {
  red_flags: "Red Flags",
  ofac: "OFAC",
  id_verification: "ID Verification",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "text-gray-600",
  medium: "text-amber-600",
  high: "text-orange-600",
  critical: "text-red-600 font-semibold",
};

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ComplianceChecksPage() {
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("");
  const [filterResult, setFilterResult] = useState<string>("");

  // Run check form
  const [showRunForm, setShowRunForm] = useState(false);
  const [runName, setRunName] = useState("");
  const [runType, setRunType] = useState<"red_flags" | "ofac" | "id_verification">("red_flags");
  const [runLeadId, setRunLeadId] = useState("");
  const [runDealId, setRunDealId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Review modal
  const [reviewCheck, setReviewCheck] = useState<ComplianceCheck | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [overrideApproved, setOverrideApproved] = useState(false);

  const fetchChecks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("check_type", filterType);
      if (filterResult) params.set("result", filterResult);
      const data = await fetchJson<{ checks?: ComplianceCheck[] }>(`/api/admin/compliance/checks?${params}`);
      setChecks(data.checks ?? []);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterResult]);

  const handleRunCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/compliance/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: runName.trim(),
          check_type: runType,
          lead_id: runLeadId.trim() || undefined,
          deal_id: runDealId.trim() || undefined,
        }),
      });
      if (res.ok) {
        setRunName("");
        setRunLeadId("");
        setRunDealId("");
        setShowRunForm(false);
        fetchChecks();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!reviewCheck || !reviewNotes.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/compliance/checks/${reviewCheck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_notes: reviewNotes.trim(),
          override_approved: overrideApproved,
        }),
      });
      if (res.ok) {
        setReviewCheck(null);
        setReviewNotes("");
        setOverrideApproved(false);
        fetchChecks();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Stats
  const totalChecks = checks.length;
  const clearCount = checks.filter((c) => c.result === "clear").length;
  const flaggedCount = checks.filter((c) => c.result === "flagged" || c.result === "blocked").length;
  const reviewCount = checks.filter((c) => c.result === "review_required").length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Checks</h1>
          <p className="mt-1 text-sm text-gray-500">Red Flags Rule, OFAC screening, and ID verification</p>
        </div>
        <button
          onClick={() => setShowRunForm(!showRunForm)}
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          Run Check
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Checks" value={totalChecks} />
        <StatCard label="Clear" value={clearCount} color="text-emerald-600" />
        <StatCard label="Flagged / Blocked" value={flaggedCount} color="text-red-600" />
        <StatCard label="Review Required" value={reviewCount} color="text-orange-600" />
      </div>

      {/* Run Check Form */}
      {showRunForm && (
        <div className="mb-6 rounded-card border border-surface-border bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Run Compliance Check</h2>
          <form onSubmit={handleRunCheck} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Customer Name *</label>
              <input
                type="text"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Check Type *</label>
              <select
                value={runType}
                onChange={(e) => setRunType(e.target.value as any)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="red_flags">Red Flags Rule</option>
                <option value="ofac">OFAC / SDN Screening</option>
                <option value="id_verification">ID Verification</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Lead ID (optional)</label>
              <input
                type="text"
                value={runLeadId}
                onChange={(e) => setRunLeadId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="lead-042"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Deal ID (optional)</label>
              <input
                type="text"
                value={runDealId}
                onChange={(e) => setRunDealId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="deal-019"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Running..." : "Run Check"}
              </button>
              <button
                type="button"
                onClick={() => setShowRunForm(false)}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Types</option>
          <option value="red_flags">Red Flags</option>
          <option value="ofac">OFAC</option>
          <option value="id_verification">ID Verification</option>
        </select>
        <select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Results</option>
          <option value="clear">Clear</option>
          <option value="flagged">Flagged</option>
          <option value="review_required">Review Required</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : checks.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-white py-12 text-center text-gray-400 shadow-card">
          No compliance checks found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Result</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Flags</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Reviewer</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {checks.map((check) => (
                <tr key={check.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatDate(check.created_at)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{check.customer_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[check.check_type]}`}>
                      {TYPE_LABELS[check.check_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_STYLES[check.result]}`}>
                      {RESULT_LABELS[check.result]}
                    </span>
                    {check.override_approved && (
                      <span className="ml-1 text-xs text-gray-400">(overridden)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {check.flags.length > 0 ? (
                      <ul className="space-y-0.5">
                        {check.flags.map((f, i) => (
                          <li key={i} className={`text-xs ${SEVERITY_STYLES[f.severity] ?? "text-gray-600"}`}>
                            <span className="font-mono">{f.rule}</span> — {f.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-gray-400">None</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {check.reviewed_by ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {(check.result === "flagged" || check.result === "review_required" || check.result === "blocked") && !check.reviewed_by && (
                      <button
                        onClick={() => { setReviewCheck(check); setReviewNotes(""); setOverrideApproved(false); }}
                        className="rounded-lg border border-brand-300 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Modal */}
      {reviewCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-card bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Review: {reviewCheck.customer_name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {TYPE_LABELS[reviewCheck.check_type]} — {RESULT_LABELS[reviewCheck.result]}
            </p>

            {reviewCheck.flags.length > 0 && (
              <div className="mt-4 rounded-lg bg-red-50 p-3">
                <p className="mb-1 text-xs font-semibold text-red-700">Flags Found:</p>
                <ul className="space-y-1">
                  {reviewCheck.flags.map((f, i) => (
                    <li key={i} className={`text-xs ${SEVERITY_STYLES[f.severity] ?? "text-gray-600"}`}>
                      <span className="font-mono font-semibold">{f.rule}</span> ({f.severity}) — {f.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-gray-600">Review Notes *</label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Explain your findings and decision..."
              />
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideApproved}
                onChange={(e) => setOverrideApproved(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-gray-700">Override and approve (proceed despite flags)</span>
            </label>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                onClick={() => setReviewCheck(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReviewSubmit}
                disabled={!reviewNotes.trim() || submitting}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Submit Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
