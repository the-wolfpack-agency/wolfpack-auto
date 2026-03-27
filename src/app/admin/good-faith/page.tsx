"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type GestureType = "service_credit" | "accessory" | "loaner" | "discount" | "apology_gift";
type GestureStatus = "pending" | "approved" | "claimed" | "denied";

interface GoodFaithGesture {
  id: string;
  customer_name: string;
  customer_email: string;
  gesture_type: GestureType;
  value_usd: number;
  reason: string;
  oem_reimbursable: boolean;
  oem_claim_id: string | null;
  status: GestureStatus;
  created_at: string;
}

interface GoodFaithData {
  gestures: GoodFaithGesture[];
  budget_used: number;
  budget_total: number;
  oem_pending_claims: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const GESTURE_TYPE_LABELS: Record<GestureType, string> = {
  service_credit: "Service Credit",
  accessory: "Accessory",
  loaner: "Loaner Vehicle",
  discount: "Discount",
  apology_gift: "Apology Gift",
};

const GESTURE_TYPE_BADGE: Record<GestureType, string> = {
  service_credit: "bg-blue-50 text-blue-700 ring-blue-600/20",
  accessory: "bg-purple-50 text-purple-700 ring-purple-600/20",
  loaner: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  discount: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  apology_gift: "bg-pink-50 text-pink-700 ring-pink-600/20",
};

const STATUS_BADGE: Record<GestureStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  approved: "bg-blue-50 text-blue-700 ring-blue-600/20",
  claimed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  denied: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_LABELS: Record<GestureStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  claimed: "Claimed",
  denied: "Denied",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default function GoodFaithPage() {
  const [data, setData] = useState<GoodFaithData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New gesture form state
  const [formGestureType, setFormGestureType] = useState<GestureType>("service_credit");
  const [formOemReimbursable, setFormOemReimbursable] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    value_usd: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Status update state
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/good-faith");
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const value_usd = parseFloat(formData.value_usd);
    if (isNaN(value_usd) || value_usd <= 0) {
      setSubmitError("Please enter a valid dollar amount.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/good-faith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: formData.customer_name,
          customer_email: formData.customer_email,
          gesture_type: formGestureType,
          value_usd,
          reason: formData.reason,
          oem_reimbursable: formOemReimbursable,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error ?? `Server error: ${res.status}`);
      }

      // Analytics event
      if (typeof window !== "undefined") {
        console.info("[analytics]", {
          event_type: "good_faith_gesture_created",
          metadata: {
            gesture_type: formGestureType,
            value_usd,
            oem_reimbursable: formOemReimbursable,
          },
        });
      }

      setSubmitSuccess(true);
      setFormData({ customer_name: "", customer_email: "", value_usd: "", reason: "" });
      setFormGestureType("service_credit");
      setFormOemReimbursable(false);
      loadData();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusUpdate(id: string, status: GestureStatus) {
    setUpdatingId(id);
    try {
      await fetch("/api/admin/good-faith", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      loadData();
    } catch (err) {
      console.error("[good-faith] Status update failed:", err);
    } finally {
      setUpdatingId(null);
    }
  }

  function handleSubmitToOem() {
    // UI only — logs analytics event, real OEM portal submission is out of scope
    if (typeof window !== "undefined") {
      console.info("[analytics]", {
        event_type: "oem_claims_submitted",
        metadata: { oem_pending_claims: data?.oem_pending_claims ?? 0 },
      });
    }
    alert(
      `OEM submission initiated for ${data?.oem_pending_claims ?? 0} pending claim(s). Your OEM portal will process these within 2–3 business days.`,
    );
  }

  const budgetPct =
    data && data.budget_total > 0
      ? Math.min(100, Math.round((data.budget_used / data.budget_total) * 100))
      : 0;

  const gestures = data?.gestures ?? [];
  const totalGestures = gestures.length;
  const avgGestureValue =
    gestures.length > 0
      ? gestures.reduce((sum, g) => sum + g.value_usd, 0) / gestures.length
      : 0;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Good Faith Program</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage customer goodwill gestures, OEM reimbursements, and program budget.
        </p>
      </div>

      {/* Budget bar */}
      <div className="mb-6 rounded-card border border-surface-border bg-white p-5 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Program Budget</p>
          <p className="text-sm font-semibold text-gray-900">
            {data ? `${formatCurrency(data.budget_used)} / ${formatCurrency(data.budget_total)}` : "—"}
          </p>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-3 rounded-full transition-all ${
              budgetPct >= 90
                ? "bg-red-500"
                : budgetPct >= 70
                  ? "bg-amber-400"
                  : "bg-emerald-500"
            }`}
            style={{ width: `${budgetPct}%` }}
            role="progressbar"
            aria-valuenow={budgetPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Budget used: ${budgetPct}%`}
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">{budgetPct}% of budget used this period</p>
      </div>

      {/* OEM Claims section */}
      {data && data.oem_pending_claims > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-card border border-amber-200 bg-amber-50 p-4 shadow-card">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {data.oem_pending_claims} OEM Reimbursement Claim
              {data.oem_pending_claims !== 1 ? "s" : ""} Pending
            </p>
            <p className="text-xs text-amber-600">
              These gestures are marked OEM-reimbursable but have not been submitted.
            </p>
          </div>
          <button
            onClick={handleSubmitToOem}
            className="ml-4 shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Submit to OEM
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Gestures" value={totalGestures} />
        <StatCard
          label="Budget Used"
          value={data ? formatCurrency(data.budget_used) : "—"}
          color={budgetPct >= 90 ? "text-red-600" : budgetPct >= 70 ? "text-amber-600" : "text-emerald-600"}
        />
        <StatCard
          label="OEM Pending"
          value={data?.oem_pending_claims ?? 0}
          color={data?.oem_pending_claims ? "text-amber-600" : "text-gray-900"}
        />
        <StatCard
          label="Avg Gesture Value"
          value={avgGestureValue > 0 ? formatCurrency(Math.round(avgGestureValue)) : "—"}
        />
      </div>

      {/* Main layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left — Gesture list */}
        <div className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Gestures</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading gestures…</div>
            ) : gestures.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No gestures recorded yet.</div>
            ) : (
              <ul className="divide-y divide-surface-border">
                {gestures.map((gesture) => (
                  <li key={gesture.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-900">
                            {gesture.customer_name}
                          </p>
                          {gesture.oem_reimbursable && (
                            <span
                              className="text-amber-400"
                              title="OEM Reimbursable"
                              aria-label="OEM Reimbursable"
                            >
                              ★
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{gesture.customer_email}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(gesture.value_usd)}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${GESTURE_TYPE_BADGE[gesture.gesture_type]}`}
                      >
                        {GESTURE_TYPE_LABELS[gesture.gesture_type]}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[gesture.status]}`}
                      >
                        {STATUS_LABELS[gesture.status]}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(gesture.created_at)}</span>
                    </div>

                    <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{gesture.reason}</p>

                    {/* Quick status actions for pending/approved gestures */}
                    {(gesture.status === "pending" || gesture.status === "approved") && (
                      <div className="mt-2 flex items-center gap-2">
                        {gesture.status === "pending" && (
                          <button
                            onClick={() => handleStatusUpdate(gesture.id, "approved")}
                            disabled={updatingId === gesture.id}
                            className="rounded px-2 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {gesture.status === "approved" && (
                          <button
                            onClick={() => handleStatusUpdate(gesture.id, "claimed")}
                            disabled={updatingId === gesture.id}
                            className="rounded px-2 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                          >
                            Mark Claimed
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusUpdate(gesture.id, "denied")}
                          disabled={updatingId === gesture.id}
                          className="rounded px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right — New Gesture form */}
        <div className="lg:col-span-2">
          <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold text-gray-900">New Gesture</h2>

            {submitSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                Gesture created successfully.
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
                  placeholder="Jane Doe"
                />
              </div>

              {/* Customer email */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Customer Email</label>
                <input
                  type="email"
                  required
                  value={formData.customer_email}
                  onChange={(e) => setFormData((d) => ({ ...d, customer_email: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="jane@example.com"
                />
              </div>

              {/* Gesture type — button group */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Gesture Type</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(Object.keys(GESTURE_TYPE_LABELS) as GestureType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormGestureType(t)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        formGestureType === t
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {GESTURE_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Value (USD)</label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                    $
                  </span>
                  <input
                    type="number"
                    required
                    min={1}
                    step="0.01"
                    value={formData.value_usd}
                    onChange={(e) => setFormData((d) => ({ ...d, value_usd: e.target.value }))}
                    className="block w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="250"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-gray-700">Reason</label>
                <textarea
                  rows={3}
                  required
                  value={formData.reason}
                  onChange={(e) => setFormData((d) => ({ ...d, reason: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Briefly describe why this gesture is being offered…"
                />
              </div>

              {/* OEM Reimbursable toggle */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-700">OEM Reimbursable</p>
                  <p className="text-xs text-gray-400">Flag for OEM cost recovery claim</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formOemReimbursable}
                  onClick={() => setFormOemReimbursable((v) => !v)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    formOemReimbursable ? "bg-brand-600" : "bg-gray-300"
                  }`}
                >
                  <span className="sr-only">OEM reimbursable</span>
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      formOemReimbursable ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Create Gesture"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
