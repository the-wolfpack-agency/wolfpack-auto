"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RateTier {
  min_score: number;
  max_score: number;
  rate: number;
  max_term: number;
}

interface Lender {
  id: string;
  lender_name: string;
  lender_code: string | null;
  portal: "routeone" | "dealertrack" | "cudl" | "direct";
  contact_email: string | null;
  contact_phone: string | null;
  rate_sheet: { tiers?: RateTier[] };
  buy_rates: { spread?: number; max_markup?: number };
  active: boolean;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PORTAL_STYLES: Record<string, string> = {
  routeone: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  dealertrack: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20",
  cudl: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  direct: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-400/20",
};

const PORTAL_LABELS: Record<string, string> = {
  routeone: "RouteOne",
  dealertrack: "DealerTrack",
  cudl: "CUDL",
  direct: "Direct",
};

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

function RateSheetTable({ tiers }: { tiers: RateTier[] }) {
  if (tiers.length === 0) {
    return <p className="text-xs text-gray-400 italic">No rate tiers configured</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-surface-border text-gray-500">
            <th className="pb-1.5 pr-3 font-medium">Score Range</th>
            <th className="pb-1.5 pr-3 font-medium">Rate</th>
            <th className="pb-1.5 font-medium">Max Term</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) => (
            <tr key={i} className="border-b border-surface-border last:border-0">
              <td className="py-1.5 pr-3 text-gray-900">{tier.min_score} - {tier.max_score}</td>
              <td className="py-1.5 pr-3 font-semibold text-gray-900">{tier.rate.toFixed(2)}%</td>
              <td className="py-1.5 text-gray-700">{tier.max_term} mo</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LenderCard({
  lender,
  onToggleActive,
}: {
  lender: Lender;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const [showRates, setShowRates] = useState(false);
  const tiers = lender.rate_sheet?.tiers ?? [];

  return (
    <div className={`rounded-card border border-surface-border bg-white p-5 shadow-card ${!lender.active ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{lender.lender_name}</h3>
          {lender.lender_code && (
            <p className="mt-0.5 text-xs text-gray-500">Code: {lender.lender_code}</p>
          )}
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PORTAL_STYLES[lender.portal] ?? PORTAL_STYLES.direct}`}>
          {PORTAL_LABELS[lender.portal] ?? lender.portal}
        </span>
      </div>

      {/* Contact */}
      <div className="mb-3 space-y-1 text-sm text-gray-600">
        {lender.contact_email && <p>{lender.contact_email}</p>}
        {lender.contact_phone && <p>{lender.contact_phone}</p>}
      </div>

      {/* Buy rate info */}
      {(lender.buy_rates?.spread || lender.buy_rates?.max_markup) && (
        <div className="mb-3 flex gap-4 text-xs text-gray-500">
          {lender.buy_rates.spread != null && <span>Spread: {lender.buy_rates.spread}%</span>}
          {lender.buy_rates.max_markup != null && <span>Max Markup: {lender.buy_rates.max_markup}%</span>}
        </div>
      )}

      {/* Rate sheet toggle */}
      <button
        onClick={() => setShowRates((v) => !v)}
        className="mb-2 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        {showRates ? "Hide Rate Sheet" : `View Rate Sheet (${tiers.length} tiers)`}
      </button>

      {showRates && <RateSheetTable tiers={tiers} />}

      {/* Footer: active toggle */}
      <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3">
        <span className={`text-xs font-medium ${lender.active ? "text-emerald-600" : "text-gray-400"}`}>
          {lender.active ? "Active" : "Inactive"}
        </span>
        <button
          onClick={() => onToggleActive(lender.id, !lender.active)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            lender.active
              ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-brand-600 text-white hover:bg-brand-700"
          }`}
        >
          {lender.active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function LendersPage() {
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formPortal, setFormPortal] = useState("routeone");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/lenders");
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = (await res.json()) as { lenders: Lender[] };
        setLenders(data.lenders ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lenders.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const activeLenders = lenders.filter((l) => l.active);
  const portals = [...new Set(lenders.map((l) => PORTAL_LABELS[l.portal] ?? l.portal))];

  async function handleToggleActive(id: string, active: boolean) {
    try {
      await fetch(`/api/admin/lenders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      setLenders((prev) => prev.map((l) => (l.id === id ? { ...l, active } : l)));
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/lenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lender_name: formName.trim(),
          lender_code: formCode.trim() || null,
          portal: formPortal,
          contact_email: formEmail.trim() || null,
          contact_phone: formPhone.trim() || null,
          rate_sheet: { tiers: [] },
          buy_rates: {},
        }),
      });

      const data = (await res.json()) as { error?: string; lender?: Lender };
      if (!res.ok) {
        setFormError(data.error ?? "Failed to add lender.");
        return;
      }

      // Refresh
      const listRes = await fetch("/api/admin/lenders");
      const listData = (await listRes.json()) as { lenders: Lender[] };
      setLenders(listData.lenders ?? []);

      // Reset form
      setShowForm(false);
      setFormName("");
      setFormCode("");
      setFormPortal("routeone");
      setFormEmail("");
      setFormPhone("");
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
          <h1 className="text-2xl font-bold text-gray-900">Lender Portal</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Loading..." : `${lenders.length} lender${lenders.length !== 1 ? "s" : ""} configured`}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "+ Add Lender"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Lenders" value={lenders.length} />
        <StatCard label="Active" value={activeLenders.length} color="text-emerald-600" />
        <StatCard label="Portals" value={portals.join(", ") || "---"} />
        <StatCard
          label="Best Rate (Tier 1)"
          value={
            activeLenders.length > 0
              ? `${Math.min(
                  ...activeLenders
                    .flatMap((l) => l.rate_sheet?.tiers ?? [])
                    .map((t) => t.rate)
                    .filter((r) => r > 0),
                  99,
                ).toFixed(2)}%`
              : "---"
          }
          color="text-brand-600"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Add Lender form */}
      {showForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Add Lender</h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
          )}

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Lender Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Chase Auto Finance"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lender Code</label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="CHASE-4821"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Portal</label>
                <select
                  value={formPortal}
                  onChange={(e) => setFormPortal(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="routeone">RouteOne</option>
                  <option value="dealertrack">DealerTrack</option>
                  <option value="cudl">CUDL</option>
                  <option value="direct">Direct</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="support@lender.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="(800) 555-0100"
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
                {submitting ? "Adding..." : "Add Lender"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lender grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-card bg-gray-100" />
          ))}
        </div>
      ) : lenders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white py-16 text-center shadow-card">
          <p className="text-sm text-gray-500">No lenders configured. Add your first lender to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lenders.map((l) => (
            <LenderCard key={l.id} lender={l} onToggleActive={handleToggleActive} />
          ))}
        </div>
      )}
    </>
  );
}
