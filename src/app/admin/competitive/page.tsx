"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type IntelCategory = "pricing" | "inventory" | "campaign" | "promotion" | "staffing";
type IntelSource = "customer" | "drive_by" | "online" | "ad";

interface IntelRecord {
  id: string;
  category: IntelCategory;
  observation: string;
  source: IntelSource;
  observed_date: string;
  vehicles_mentioned: string[];
}

interface Competitor {
  id: string;
  name: string;
  distance_miles: number;
  intel: IntelRecord[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CATEGORY_STYLES: Record<IntelCategory, string> = {
  pricing: "bg-purple-100 text-purple-700",
  campaign: "bg-orange-100 text-orange-700",
  inventory: "bg-brand-100 text-brand-800",
  promotion: "bg-emerald-100 text-emerald-700",
  staffing: "bg-gray-100 text-gray-600",
};

const SOURCE_LABELS: Record<IntelSource, string> = {
  customer: "Customer",
  drive_by: "Drive-By",
  online: "Online",
  ad: "Ad",
};

const VALID_CATEGORIES: IntelCategory[] = ["pricing", "inventory", "campaign", "promotion", "staffing"];
const VALID_SOURCES: IntelSource[] = ["customer", "drive_by", "online", "ad"];

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

function IntelCard({ record }: { record: IntelRecord }) {
  return (
    <div className="rounded-lg border border-surface-border bg-white p-4 shadow-sm">
      {/* Badges row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${CATEGORY_STYLES[record.category]}`}>
          {record.category}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {SOURCE_LABELS[record.source]}
        </span>
        <span className="ml-auto text-xs text-gray-400">{formatDate(record.observed_date)}</span>
      </div>

      {/* Observation */}
      <p className="text-sm text-gray-800">{record.observation}</p>

      {/* Vehicles mentioned */}
      {record.vehicles_mentioned.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {record.vehicles_mentioned.map((v) => (
            <span
              key={v}
              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function CompetitivePage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formCompetitorName, setFormCompetitorName] = useState("");
  const [formCategory, setFormCategory] = useState<IntelCategory>("pricing");
  const [formObservation, setFormObservation] = useState("");
  const [formSource, setFormSource] = useState<IntelSource>("customer");
  const [formVehicles, setFormVehicles] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/competitive");
        if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = (await res.json()) as { competitors: Competitor[] };
        const list = data.competitors ?? [];
        setCompetitors(list);
        if (list.length > 0) setActiveTab(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load competitive intel.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derived stats
  const intelThisMonth = competitors.flatMap((c) =>
    c.intel.filter((i) => {
      const now = new Date();
      const d = new Date(i.observed_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }),
  );

  const mostActive = competitors.reduce<Competitor | null>(
    (max, c) => (max === null || c.intel.length > max.intel.length ? c : max),
    null,
  );

  const pricingCount = competitors.flatMap((c) => c.intel).filter((i) => i.category === "pricing").length;

  const activeCompetitor = competitors.find((c) => c.id === activeTab);
  const sortedIntel = activeCompetitor
    ? [...activeCompetitor.intel].sort(
        (a, b) => new Date(b.observed_date).getTime() - new Date(a.observed_date).getTime(),
      )
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const body = {
        competitor_name: formCompetitorName.trim() || activeCompetitor?.name,
        category: formCategory,
        observation: formObservation.trim(),
        source: formSource,
        vehicles_mentioned: formVehicles
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      };

      const res = await fetch("/api/admin/competitive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setFormError(data.error ?? "Failed to log intel.");
        return;
      }

      // Analytics: {event_type: "competitive_intel_logged", metadata: {category: formCategory, source: formSource, competitor_name: body.competitor_name}}

      // Refresh
      const listData = await fetchJson<{ competitors: Competitor[] }>("/api/admin/competitive");
      setCompetitors(listData.competitors ?? []);

      // Reset form
      setShowForm(false);
      setFormCompetitorName("");
      setFormObservation("");
      setFormVehicles("");
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
          <h1 className="text-2xl font-bold text-gray-900">Competitive Intelligence</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Loading…" : `${competitors.length} competitor${competitors.length !== 1 ? "s" : ""} tracked`}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "+ Log Intel"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Competitors Tracked" value={competitors.length} color="text-brand-600" />
        <StatCard label="Intel This Month" value={intelThisMonth.length} />
        <StatCard
          label="Most Active Competitor"
          value={mostActive?.name ?? "—"}
          color="text-gray-700"
        />
        <StatCard label="Pricing Observations" value={pricingCount} color="text-purple-600" />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Log Intel form */}
      {showForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Log Competitive Intel</h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
            {/* Competitor name */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Competitor Name</label>
              <input
                type="text"
                required
                value={formCompetitorName}
                onChange={(e) => setFormCompetitorName(e.target.value)}
                list="competitor-list"
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Select existing or type new name"
              />
              <datalist id="competitor-list">
                {competitors.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>

            {/* Category + Source */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as IntelCategory)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {VALID_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Source</label>
                <select
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value as IntelSource)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {VALID_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Observation */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Observation</label>
              <textarea
                required
                rows={3}
                value={formObservation}
                onChange={(e) => setFormObservation(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Describe what you observed…"
              />
            </div>

            {/* Vehicles mentioned */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vehicles Mentioned{" "}
                <span className="font-normal text-gray-400">(comma-separated, optional)</span>
              </label>
              <input
                type="text"
                value={formVehicles}
                onChange={(e) => setFormVehicles(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="2025 Toyota Camry, 2025 Honda CR-V"
              />
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
                {submitting ? "Saving…" : "Log Intel"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Competitor tabs + feed */}
      {!loading && competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white py-16 text-center shadow-card">
          <p className="text-sm text-gray-500">No competitors tracked yet. Log your first intel observation to get started.</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-white shadow-card">
          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-surface-border">
            {competitors.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveTab(c.id)}
                className={`flex-shrink-0 px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === c.id
                    ? "border-b-2 border-brand-600 text-brand-600"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {c.name}
                <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600">
                  {c.intel.length}
                </span>
              </button>
            ))}
          </div>

          {/* Intel feed */}
          <div className="p-5">
            {activeCompetitor && (
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {activeCompetitor.distance_miles > 0
                    ? `${activeCompetitor.distance_miles} mi away`
                    : "Distance unknown"}
                </p>
                <p className="text-xs text-gray-400">
                  {sortedIntel.length} observation{sortedIntel.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}

            {sortedIntel.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No intel recorded yet for this competitor.</p>
            ) : (
              <div className="space-y-3">
                {sortedIntel.map((record) => (
                  <IntelCard key={record.id} record={record} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
