"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Campaign {
  id: string;
  name: string;
  budget: number;
  spent: number;
  goal: string;
  start_date: string;
  end_date: string;
  channels: string[];
  featured_vehicles: string[];
  status: "draft" | "active" | "completed";
  leads_generated: number;
  conversions: number;
  roi_pct: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<Campaign["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  completed: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  draft: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-400/20",
};

const ALL_CHANNELS = ["Email", "Social", "PPC", "Direct Mail", "Events"];

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

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

function SpendBar({ budget, spent }: { budget: number; spent: number }) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>{formatCurrency(spent)} spent</span>
        <span>{pct}% of {formatCurrency(budget)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all ${pct >= 90 ? "bg-amber-400" : "bg-brand-600"}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemax={100}
          aria-label={`${pct}% of budget spent`}
        />
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const convRate =
    campaign.leads_generated > 0
      ? ((campaign.conversions / campaign.leads_generated) * 100).toFixed(1)
      : "0.0";
  const roiPositive = campaign.roi_pct > 0;

  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatDate(campaign.start_date)} — {formatDate(campaign.end_date)}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[campaign.status]}`}>
          {campaign.status}
        </span>
      </div>

      {/* Goal */}
      <p className="mb-3 text-sm text-gray-600">{campaign.goal}</p>

      {/* Budget bar */}
      <div className="mb-4">
        <SpendBar budget={campaign.budget} spent={campaign.spent} />
      </div>

      {/* Channels */}
      {campaign.channels.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {campaign.channels.map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {ch}
            </span>
          ))}
        </div>
      )}

      {/* Featured vehicles */}
      {campaign.featured_vehicles.length > 0 && (
        <p className="mb-4 text-xs text-gray-500">
          <span className="font-medium">Vehicles: </span>
          {campaign.featured_vehicles.join(", ")}
        </p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 border-t border-surface-border pt-4">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{campaign.leads_generated}</p>
          <p className="text-xs text-gray-500">Leads</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{convRate}%</p>
          <p className="text-xs text-gray-500">Conv. Rate</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${campaign.roi_pct === 0 ? "text-gray-400" : roiPositive ? "text-emerald-600" : "text-red-500"}`}>
            {campaign.roi_pct === 0 ? "—" : `${roiPositive ? "+" : ""}${campaign.roi_pct.toFixed(1)}%`}
          </p>
          <p className="text-xs text-gray-500">ROI</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [formVehicles, setFormVehicles] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/marketing");
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = (await res.json()) as { campaigns: Campaign[] };
        setCampaigns(data.campaigns ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaigns.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derived stats
  const active = campaigns.filter((c) => c.status === "active");
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const leadsThisMonth = campaigns
    .filter((c) => {
      const now = new Date();
      const start = new Date(c.start_date);
      return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
    })
    .reduce((s, c) => s + c.leads_generated, 0);
  const completedWithRoi = campaigns.filter((c) => c.status === "completed" && c.roi_pct !== 0);
  const avgRoi =
    completedWithRoi.length > 0
      ? completedWithRoi.reduce((s, c) => s + c.roi_pct, 0) / completedWithRoi.length
      : null;

  function toggleChannel(ch: string) {
    setFormChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const body = {
        name: formName.trim(),
        budget: parseFloat(formBudget),
        goal: formGoal.trim(),
        start_date: formStartDate,
        end_date: formEndDate,
        channels: formChannels,
        featured_vehicles: formVehicles
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      };

      const res = await fetch("/api/admin/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { error?: string; campaign?: Campaign };

      if (!res.ok) {
        setFormError(data.error ?? "Failed to create campaign.");
        return;
      }

      // Analytics: {event_type: "campaign_created", metadata: {budget: body.budget, channels: body.channels, goal: body.goal}}

      // Refresh list
      const listRes = await fetch("/api/admin/marketing");
      const listData = (await listRes.json()) as { campaigns: Campaign[] };
      setCampaigns(listData.campaigns ?? []);

      // Reset form
      setShowForm(false);
      setFormName("");
      setFormBudget("");
      setFormGoal("");
      setFormStartDate("");
      setFormEndDate("");
      setFormChannels([]);
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
          <h1 className="text-2xl font-bold text-gray-900">Marketing Strategy</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Loading…" : `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Campaigns" value={active.length} color="text-emerald-600" />
        <StatCard label="Total Budget" value={formatCurrency(totalBudget)} />
        <StatCard label="Leads This Month" value={leadsThisMonth} />
        <StatCard
          label="Avg ROI (completed)"
          value={avgRoi !== null ? `${avgRoi.toFixed(1)}%` : "—"}
          color={avgRoi !== null && avgRoi > 0 ? "text-emerald-600" : avgRoi !== null ? "text-red-500" : "text-gray-400"}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* New Campaign form */}
      {showForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">New Campaign</h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
            {/* Name + Budget */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Spring Sales Event"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Budget ($)</label>
                <input
                  type="number"
                  required
                  min={1}
                  step={100}
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="10000"
                />
              </div>
            </div>

            {/* Goal */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Campaign Goal</label>
              <input
                type="text"
                required
                value={formGoal}
                onChange={(e) => setFormGoal(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Generate 60 qualified leads this quarter"
              />
            </div>

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  required
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  required
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Channels */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Channels</label>
              <div className="mt-2 flex flex-wrap gap-3">
                {ALL_CHANNELS.map((ch) => (
                  <label key={ch} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formChannels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    {ch}
                  </label>
                ))}
              </div>
            </div>

            {/* Featured vehicles */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Featured Vehicles{" "}
                <span className="font-normal text-gray-400">(comma-separated)</span>
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
                {submitting ? "Creating…" : "Create Campaign"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaigns grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-card bg-gray-100" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white py-16 text-center shadow-card">
          <p className="text-sm text-gray-500">No campaigns yet. Create your first campaign to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </>
  );
}
