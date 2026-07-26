"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type InteractionType = "test_drive" | "purchase" | "service" | "follow_up" | "walk_in";
type Outcome = "purchased" | "returning" | "lost" | "follow_up_needed";

interface EngagementReport {
  id: string;
  customer_name: string;
  employee_name: string;
  interaction_type: InteractionType;
  outcome: Outcome;
  competitor_mentioned: string | null;
  objections_raised: string | null;
  notes: string | null;
  rating: number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants / display maps                                                    */
/* -------------------------------------------------------------------------- */

const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  test_drive: "Test Drive",
  purchase: "Purchase",
  service: "Service",
  follow_up: "Follow-Up",
  walk_in: "Walk-In",
};

const INTERACTION_TYPE_BADGE: Record<InteractionType, string> = {
  test_drive: "bg-purple-50 text-purple-700 ring-purple-600/20",
  purchase: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  service: "bg-brand-50 text-brand-800 ring-brand-700/20",
  follow_up: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  walk_in: "bg-gray-100 text-gray-600 ring-gray-400/20",
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  purchased: "Purchased",
  returning: "Returning",
  lost: "Lost",
  follow_up_needed: "Follow-Up Needed",
};

const OUTCOME_BADGE: Record<Outcome, string> = {
  purchased: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  returning: "bg-brand-50 text-brand-800 ring-brand-700/20",
  lost: "bg-red-50 text-red-700 ring-red-600/20",
  follow_up_needed: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

const OUTCOME_FILTER_OPTIONS: { value: Outcome | "all"; label: string }[] = [
  { value: "all", label: "All Outcomes" },
  { value: "purchased", label: "Purchased" },
  { value: "returning", label: "Returning" },
  { value: "lost", label: "Lost" },
  { value: "follow_up_needed", label: "Follow-Up Needed" },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StarRating({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? "text-amber-400" : "text-gray-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function EngagementReportsPage() {
  const [reports, setReports] = useState<EngagementReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | "all">("all");

  // Form state
  const [formInteractionType, setFormInteractionType] = useState<InteractionType>("test_drive");
  const [formOutcome, setFormOutcome] = useState<Outcome>("purchased");
  const [formRating, setFormRating] = useState<number>(5);
  const [formHoverRating, setFormHoverRating] = useState<number>(0);
  const [formData, setFormData] = useState({
    customer_name: "",
    employee_name: "",
    competitor_mentioned: "",
    objections_raised: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  async function loadReports(filter: Outcome | "all") {
    setLoading(true);
    setError(null);
    try {
      const params = filter !== "all" ? `?outcome=${filter}` : "";
      const res = await fetch(`/api/admin/engagement-reports${params}`);
      if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports(outcomeFilter);
  }, [outcomeFilter]);

  // Derived stats (always from full unfiltered set cached on initial load)
  const allReports = reports;
  const thisWeekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const reportsThisWeek = allReports.filter(
    (r) => new Date(r.created_at).getTime() > thisWeekCutoff,
  ).length;
  const purchased = allReports.filter((r) => r.outcome === "purchased").length;
  const winRate =
    allReports.length > 0 ? Math.round((purchased / allReports.length) * 100) : 0;
  const competitorMentioned = allReports.filter((r) => r.competitor_mentioned).length;
  const followUpsNeeded = allReports.filter((r) => r.outcome === "follow_up_needed").length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const res = await fetch("/api/admin/engagement-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          interaction_type: formInteractionType,
          outcome: formOutcome,
          rating: formRating,
          competitor_mentioned: formData.competitor_mentioned || undefined,
          objections_raised: formData.objections_raised || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error ?? `Server error: ${res.status}`);
      }

      // Analytics event
      if (typeof window !== "undefined") {
        console.info("[analytics]", {
          event_type: "engagement_report_submitted",
          metadata: {
            interaction_type: formInteractionType,
            outcome: formOutcome,
            competitor_mentioned: formData.competitor_mentioned || null,
            rating: formRating,
          },
        });
      }

      setSubmitSuccess(true);
      setFormData({ customer_name: "", employee_name: "", competitor_mentioned: "", objections_raised: "", notes: "" });
      setFormInteractionType("test_drive");
      setFormOutcome("purchased");
      setFormRating(5);
      loadReports(outcomeFilter);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Customer Engagement Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track interaction outcomes to improve follow-up and win rates.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reports This Week" value={reportsThisWeek} color="text-brand-600" />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          sub="purchased / total"
          color={winRate >= 40 ? "text-emerald-600" : winRate >= 20 ? "text-amber-600" : "text-red-600"}
        />
        <StatCard
          label="Competitors Mentioned"
          value={competitorMentioned}
          color={competitorMentioned > 3 ? "text-red-600" : "text-gray-900"}
        />
        <StatCard label="Follow-Ups Needed" value={followUpsNeeded} color="text-yellow-600" />
      </div>

      {/* Main two-column layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left — Report list */}
        <div className="lg:col-span-3">
          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {OUTCOME_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setOutcomeFilter(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  outcomeFilter === opt.value
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Cards */}
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-card border border-surface-border bg-white p-8 text-center text-sm text-gray-500 shadow-card">
                Loading reports…
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-card border border-surface-border bg-white p-8 text-center text-sm text-gray-500 shadow-card">
                No reports found for this filter.
              </div>
            ) : (
              reports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-card border border-surface-border bg-white p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{report.customer_name}</p>
                      <p className="text-xs text-gray-500">
                        {report.employee_name} · {formatDate(report.created_at)}
                      </p>
                    </div>
                    <StarRating value={report.rating} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${INTERACTION_TYPE_BADGE[report.interaction_type]}`}
                    >
                      {INTERACTION_TYPE_LABELS[report.interaction_type]}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${OUTCOME_BADGE[report.outcome]}`}
                    >
                      {OUTCOME_LABELS[report.outcome]}
                    </span>
                    {report.competitor_mentioned && (
                      <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
                        vs {report.competitor_mentioned}
                      </span>
                    )}
                  </div>

                  {report.objections_raised && (
                    <p className="mt-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">Objections:</span>{" "}
                      {report.objections_raised}
                    </p>
                  )}
                  {report.notes && (
                    <p className="mt-1 text-xs text-gray-400 line-clamp-2">{report.notes}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right — New Report form */}
        <div className="lg:col-span-2">
          <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold text-gray-900">New Report</h2>

            {submitSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                Report submitted successfully.
              </div>
            )}
            {submitError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer name */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Customer Name</label>
                <input
                  type="text"
                  required
                  value={formData.customer_name}
                  onChange={(e) => setFormData((d) => ({ ...d, customer_name: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="John Smith"
                />
              </div>

              {/* Employee name */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Employee Name</label>
                <input
                  type="text"
                  required
                  value={formData.employee_name}
                  onChange={(e) => setFormData((d) => ({ ...d, employee_name: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Sarah Chen"
                />
              </div>

              {/* Interaction type — button group */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Interaction Type</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(Object.keys(INTERACTION_TYPE_LABELS) as InteractionType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormInteractionType(t)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        formInteractionType === t
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {INTERACTION_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Outcome — button group */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Outcome</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setFormOutcome(o)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        formOutcome === o
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {OUTCOME_LABELS[o]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating — star selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Rating</label>
                <div className="mt-1 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFormRating(n)}
                      onMouseEnter={() => setFormHoverRating(n)}
                      onMouseLeave={() => setFormHoverRating(0)}
                      className="focus:outline-none"
                      aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                    >
                      <svg
                        className={`h-6 w-6 transition-colors ${
                          n <= (formHoverRating || formRating)
                            ? "text-amber-400"
                            : "text-gray-200"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                  <span className="ml-1 text-xs text-gray-500">{formRating}/5</span>
                </div>
              </div>

              {/* Competitor mentioned */}
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Competitor Mentioned{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.competitor_mentioned}
                  onChange={(e) => setFormData((d) => ({ ...d, competitor_mentioned: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g. AutoNation, CarMax"
                />
              </div>

              {/* Objections raised */}
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Objections Raised{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.objections_raised}
                  onChange={(e) => setFormData((d) => ({ ...d, objections_raised: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g. Price too high, needs financing"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Notes{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData((d) => ({ ...d, notes: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Additional context about this interaction…"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Report"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
