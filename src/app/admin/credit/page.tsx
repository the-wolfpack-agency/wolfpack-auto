"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CreditPull {
  id: string;
  lead_id: string | null;
  applicant_name: string;
  bureau: string;
  pull_type: "soft" | "hard";
  score: number;
  score_factors: string[];
  pulled_at: string;
  pulled_by: string;
  consent_obtained: boolean;
}

interface CreditReport {
  score: number;
  factors: string[];
  trade_lines: {
    creditor: string;
    type: string;
    balance: number;
    limit: number;
    opened: string;
    status: string;
    payment_history: string;
  }[];
  inquiries: { last_6_months: number; last_12_months: number };
  collections: { creditor: string; amount: number; status: string }[];
  public_records: unknown[];
  total_debt: number;
  total_available_credit: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
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

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const BUREAU_LABELS: Record<string, string> = {
  equifax: "Equifax",
  experian: "Experian",
  transunion: "TransUnion",
  tri_merge: "Tri-Merge",
};

function scoreTier(score: number): { label: string; color: string } {
  if (score >= 750) return { label: "Excellent", color: "text-emerald-600" };
  if (score >= 700) return { label: "Good", color: "text-blue-600" };
  if (score >= 650) return { label: "Fair", color: "text-amber-600" };
  return { label: "Poor", color: "text-red-600" };
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function ScoreDistribution({ pulls }: { pulls: CreditPull[] }) {
  const tiers = [
    { label: "Excellent (750+)", min: 750, max: 900 },
    { label: "Good (700-749)", min: 700, max: 749 },
    { label: "Fair (650-699)", min: 650, max: 699 },
    { label: "Needs Work (<650)", min: 0, max: 649 },
  ];

  const total = pulls.length || 1;

  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Score Distribution</h3>
      <div className="space-y-3">
        {tiers.map((tier) => {
          const count = pulls.filter((p) => p.score >= tier.min && p.score <= tier.max).length;
          const pct = Math.round((count / total) * 100);
          return (
            <div key={tier.label}>
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>{tier.label}</span>
                <span className="font-medium">{count} ({pct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-brand-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function CreditPage() {
  const [pulls, setPulls] = useState<CreditPull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pull form state
  const [formName, setFormName] = useState("");
  const [formBureau, setFormBureau] = useState("tri_merge");
  const [formPullType, setFormPullType] = useState("soft");
  const [formLeadId, setFormLeadId] = useState("");
  const [formConsent, setFormConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Result display
  const [lastReport, setLastReport] = useState<CreditReport | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/credit/history");
        if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = (await res.json()) as { pulls: CreditPull[] };
        setPulls(data.pulls ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load credit history.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const avgScore = pulls.length > 0
    ? Math.round(pulls.reduce((s, p) => s + p.score, 0) / pulls.length)
    : 0;
  const hardPulls = pulls.filter((p) => p.pull_type === "hard").length;
  const softPulls = pulls.filter((p) => p.pull_type === "soft").length;

  async function handlePull(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLastReport(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/credit/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_name: formName.trim(),
          bureau: formBureau,
          pull_type: formPullType,
          lead_id: formLeadId.trim() || null,
          consent_obtained: formConsent,
        }),
      });

      const data = (await res.json()) as { error?: string; credit_pull?: CreditPull; report?: CreditReport };
      if (!res.ok) {
        setFormError(data.error ?? "Failed to pull credit.");
        return;
      }

      setLastReport(data.report ?? null);

      // Refresh list
      const listData = await fetchJson<{ pulls: CreditPull[] }>("/api/admin/credit/history");
      setPulls(listData.pulls ?? []);

      // Reset form partially (keep consent)
      setFormName("");
      setFormLeadId("");
      setFormConsent(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Bureau</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Loading..." : `${pulls.length} pull${pulls.length !== 1 ? "s" : ""} on record`}
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setLastReport(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "Pull Credit"}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Pulls" value={pulls.length} />
        <StatCard label="Average Score" value={avgScore || "---"} color={avgScore >= 700 ? "text-emerald-600" : avgScore >= 650 ? "text-amber-600" : "text-gray-900"} />
        <StatCard label="Hard Pulls" value={hardPulls} />
        <StatCard label="Soft Pulls" value={softPulls} color="text-blue-600" />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Pull credit form */}
      {showForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Pull Credit Report</h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
          )}

          <form onSubmit={(e) => { void handlePull(e); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Applicant Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lead ID <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={formLeadId}
                  onChange={(e) => setFormLeadId(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="lead-101"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Bureau</label>
                <select
                  value={formBureau}
                  onChange={(e) => setFormBureau(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="tri_merge">Tri-Merge (All 3)</option>
                  <option value="equifax">Equifax</option>
                  <option value="experian">Experian</option>
                  <option value="transunion">TransUnion</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Pull Type</label>
                <select
                  value={formPullType}
                  onChange={(e) => setFormPullType(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="soft">Soft Pull</option>
                  <option value="hard">Hard Pull</option>
                </select>
              </div>
            </div>

            {/* Consent checkbox */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={formConsent}
                  onChange={(e) => setFormConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  required
                />
                <span className="text-sm text-amber-800">
                  I confirm that the applicant has provided written consent for this credit inquiry in compliance with the Fair Credit Reporting Act (FCRA).
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-surface-border pt-4">
              <button
                type="button"
                onClick={() => { setShowForm(false); setLastReport(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formConsent}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? "Pulling..." : "Pull Credit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Last report result */}
      {lastReport && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Credit Report Result</h2>
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold ${scoreTier(lastReport.score).color}`}>
                {lastReport.score}
              </span>
              <span className={`text-sm font-medium ${scoreTier(lastReport.score).color}`}>
                {scoreTier(lastReport.score).label}
              </span>
            </div>
          </div>

          {/* Factors */}
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">Key Factors</h3>
            <div className="flex flex-wrap gap-2">
              {lastReport.factors.map((f) => (
                <span key={f} className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Trade lines */}
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">Trade Lines ({lastReport.trade_lines.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-border text-gray-500">
                    <th className="pb-1.5 pr-3 font-medium">Creditor</th>
                    <th className="pb-1.5 pr-3 font-medium">Type</th>
                    <th className="pb-1.5 pr-3 font-medium">Balance</th>
                    <th className="pb-1.5 pr-3 font-medium">Limit</th>
                    <th className="pb-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lastReport.trade_lines.map((tl, i) => (
                    <tr key={i} className="border-b border-surface-border last:border-0">
                      <td className="py-1.5 pr-3 text-gray-900">{tl.creditor}</td>
                      <td className="py-1.5 pr-3 capitalize text-gray-600">{tl.type.replace("_", " ")}</td>
                      <td className="py-1.5 pr-3 text-gray-900">{formatCurrency(tl.balance)}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{formatCurrency(tl.limit)}</td>
                      <td className="py-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tl.status === "current" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {tl.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3 border-t border-surface-border pt-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{formatCurrency(lastReport.total_debt)}</p>
              <p className="text-xs text-gray-500">Total Debt</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{formatCurrency(lastReport.total_available_credit)}</p>
              <p className="text-xs text-gray-500">Available Credit</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{lastReport.collections.length}</p>
              <p className="text-xs text-gray-500">Collections</p>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout: table + distribution */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pulls table */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-card bg-gray-100" />
              ))}
            </div>
          ) : pulls.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white py-16 text-center shadow-card">
              <p className="text-sm text-gray-500">No credit pulls yet. Pull a credit report to get started.</p>
            </div>
          ) : (
            <div className="rounded-card border border-surface-border bg-white shadow-card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-gray-50 text-gray-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Applicant</th>
                    <th className="px-4 py-3 font-medium">Bureau</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Pulled By</th>
                  </tr>
                </thead>
                <tbody>
                  {pulls.map((pull) => {
                    const tier = scoreTier(pull.score);
                    return (
                      <tr key={pull.id} className="border-b border-surface-border last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(pull.pulled_at)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{pull.applicant_name}</p>
                          {pull.lead_id && (
                            <a href={`/admin/leads?id=${pull.lead_id}`} className="text-xs text-brand-600 hover:underline">
                              {pull.lead_id}
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{BUREAU_LABELS[pull.bureau] ?? pull.bureau}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            pull.pull_type === "hard"
                              ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
                              : "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20"
                          }`}>
                            {pull.pull_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${tier.color}`}>{pull.score}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{pull.pulled_by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Score distribution sidebar */}
        {pulls.length > 0 && (
          <div>
            <ScoreDistribution pulls={pulls} />
          </div>
        )}
      </div>
    </>
  );
}
