"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type ChangeCategory = "process" | "pricing" | "staffing" | "system" | "policy";
type ChangeImpact = "high" | "medium" | "low";
type ChangeStatus = "proposed" | "approved" | "active" | "rolled_back";

interface ChangeRecord {
  id: string;
  title: string;
  description: string;
  category: ChangeCategory;
  impact: ChangeImpact;
  status: ChangeStatus;
  owner: string;
  effective_date: string;
  metrics_before: Record<string, string | number> | null;
  metrics_after: Record<string, string | number> | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso.includes("T") ? iso : iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<ChangeStatus, string> = {
  proposed: "bg-gray-100 text-gray-600",
  approved: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  rolled_back: "bg-red-50 text-red-700",
};

const IMPACT_STYLES: Record<ChangeImpact, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-500",
};

const CATEGORY_STYLES: Record<ChangeCategory, string> = {
  process: "bg-indigo-50 text-indigo-700",
  pricing: "bg-purple-50 text-purple-700",
  staffing: "bg-orange-50 text-orange-700",
  system: "bg-cyan-50 text-cyan-700",
  policy: "bg-gray-100 text-gray-600",
};

const VALID_CATEGORIES: ChangeCategory[] = ["process", "pricing", "staffing", "system", "policy"];
const VALID_IMPACTS: ChangeImpact[] = ["high", "medium", "low"];

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function MetricsTable({
  before,
  after,
}: {
  before: Record<string, string | number> | null;
  after: Record<string, string | number> | null;
}) {
  if (!before || !after) return null;

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  if (keys.length === 0) return null;

  function formatKey(k: string) {
    return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-surface-border">
      <table className="min-w-full divide-y divide-surface-border text-sm">
        <caption className="sr-only">Before and after metrics comparison</caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Metric
            </th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
              Before
            </th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
              After
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border bg-white">
          {keys.map((k) => {
            const bv = before[k];
            const av = after[k];
            return (
              <tr key={k}>
                <td className="px-4 py-2 text-gray-700">{formatKey(k)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">{bv ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{av ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChangeCard({ record }: { record: ChangeRecord }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
      {/* Badges row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[record.status]}`}>
          {record.status.replace("_", " ")}
        </span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${CATEGORY_STYLES[record.category]}`}>
          {record.category}
        </span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${IMPACT_STYLES[record.impact]}`}>
          {record.impact} impact
        </span>
        <span className="ml-auto text-xs text-gray-400">Effective {formatDate(record.effective_date)}</span>
      </div>

      {/* Title + description */}
      <h3 className="font-semibold text-gray-900">{record.title}</h3>
      <p className="mt-1 text-sm text-gray-600">{record.description}</p>

      {/* Owner */}
      <p className="mt-2 text-xs text-gray-400">
        Owner: <span className="font-medium text-gray-600">{record.owner}</span>
      </p>

      {/* Before/after metrics */}
      <MetricsTable before={record.metrics_before} after={record.metrics_after} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ChangeManagementPage() {
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<ChangeCategory>("process");
  const [formImpact, setFormImpact] = useState<ChangeImpact>("medium");
  const [formOwner, setFormOwner] = useState("");
  const [formEffectiveDate, setFormEffectiveDate] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/change-management");
        if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = (await res.json()) as { changes: ChangeRecord[] };
        setChanges(data.changes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load change records.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derived stats
  const activeChanges = changes.filter((c) => c.status === "active").length;
  const proposedChanges = changes.filter((c) => c.status === "proposed").length;
  const rolledBack = changes.filter((c) => c.status === "rolled_back").length;
  const highImpact = changes.filter((c) => c.impact === "high").length;

  // Timeline: sort by effective_date desc
  const sorted = [...changes].sort(
    (a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime(),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const body = {
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        impact: formImpact,
        owner: formOwner.trim(),
        effective_date: formEffectiveDate,
      };

      const res = await fetch("/api/admin/change-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setFormError(data.error ?? "Failed to create change record.");
        return;
      }

      // Analytics: {event_type: "change_recorded", metadata: {category: formCategory, impact: formImpact, status: "proposed"}}

      // Refresh
      const listRes = await fetch("/api/admin/change-management");
      const listData = (await listRes.json()) as { changes: ChangeRecord[] };
      setChanges(listData.changes ?? []);

      // Reset
      setShowForm(false);
      setFormTitle("");
      setFormDescription("");
      setFormCategory("process");
      setFormImpact("medium");
      setFormOwner("");
      setFormEffectiveDate("");
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
          <h1 className="text-2xl font-bold text-gray-900">Change Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading
              ? "Loading…"
              : `${changes.length} change record${changes.length !== 1 ? "s" : ""} — analytics insights are automatically segmented by active changes`}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "+ New Change"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Changes" value={activeChanges} color="text-emerald-600" />
        <StatCard label="Proposed" value={proposedChanges} color="text-gray-700" />
        <StatCard label="Rolled Back" value={rolledBack} color="text-red-500" />
        <StatCard label="High Impact" value={highImpact} color="text-red-700" />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* New Change form */}
      {showForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">New Change Record</h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Internet Pricing Transparency Initiative"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                required
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Describe the change and its intent…"
              />
            </div>

            {/* Category + Owner */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ChangeCategory)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {VALID_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Owner</label>
                <input
                  type="text"
                  required
                  value={formOwner}
                  onChange={(e) => setFormOwner(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Mike Chen"
                />
              </div>
            </div>

            {/* Impact (button group) + Effective Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Impact</label>
                <div className="mt-1.5 flex rounded-lg border border-gray-300 overflow-hidden">
                  {VALID_IMPACTS.map((imp) => (
                    <button
                      key={imp}
                      type="button"
                      onClick={() => setFormImpact(imp)}
                      className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                        formImpact === imp
                          ? imp === "high"
                            ? "bg-red-600 text-white"
                            : imp === "medium"
                            ? "bg-amber-500 text-white"
                            : "bg-gray-500 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      } ${imp !== "low" ? "border-r border-gray-300" : ""}`}
                    >
                      {imp.charAt(0).toUpperCase() + imp.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Effective Date</label>
                <input
                  type="date"
                  required
                  value={formEffectiveDate}
                  onChange={(e) => setFormEffectiveDate(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-surface-border pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Create Record"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-card bg-gray-100" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white py-16 text-center shadow-card">
          <p className="text-sm text-gray-500">No change records yet. Create your first to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((c) => (
            <ChangeCard key={c.id} record={c} />
          ))}
        </div>
      )}
    </>
  );
}
