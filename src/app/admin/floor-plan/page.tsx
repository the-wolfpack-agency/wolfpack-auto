"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface FloorPlanLine {
  id: string;
  vehicle_vin: string;
  vehicle_desc: string | null;
  lender: string;
  principal: number;
  daily_rate: number;
  funded_date: string;
  curtailment_date: string | null;
  payoff_date: string | null;
  interest_accrued: number;
  fees: number;
  status: "active" | "curtailed" | "paid_off" | "repossessed";
  notes: string | null;
  days_floored?: number;
}

interface FloorPlanStats {
  active_count: number;
  total_principal: number;
  total_daily_interest: number;
  avg_days_floored: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<FloorPlanLine["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  curtailed: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  paid_off: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  repossessed: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
};

const STATUS_LABELS: Record<FloorPlanLine["status"], string> = {
  active: "Active",
  curtailed: "Curtailed",
  paid_off: "Paid Off",
  repossessed: "Repossessed",
};

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
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

export default function FloorPlanPage() {
  const [lines, setLines] = useState<FloorPlanLine[]>([]);
  const [stats, setStats] = useState<FloorPlanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sortOldest, setSortOldest] = useState(true);

  // Add form state
  const [formVin, setFormVin] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formLender, setFormLender] = useState("NextGear Capital");
  const [formPrincipal, setFormPrincipal] = useState("");
  const [formRate, setFormRate] = useState("0.000164");
  const [formFunded, setFormFunded] = useState(new Date().toISOString().slice(0, 10));
  const [formCurtailment, setFormCurtailment] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/floor-plan");
      const data = await res.json();
      setLines(data.lines ?? []);
      setStats(data.stats ?? null);
    } catch {
      setLines([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVin.trim() || !formPrincipal) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/floor-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_vin: formVin.trim(),
          vehicle_desc: formDesc.trim() || undefined,
          lender: formLender,
          principal: parseFloat(formPrincipal),
          daily_rate: parseFloat(formRate),
          funded_date: formFunded,
          curtailment_date: formCurtailment || undefined,
          notes: formNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setFormVin("");
        setFormDesc("");
        setFormPrincipal("");
        setFormNotes("");
        setShowForm(false);
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayoff = async (lineId: string) => {
    if (!confirm("Mark this vehicle as paid off?")) return;
    try {
      await fetch(`/api/admin/floor-plan/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid_off" }),
      });
      fetchData();
    } catch { /* swallow */ }
  };

  // Sort: active lines by days floored
  const activeLines = lines.filter((l) => l.status === "active" || l.status === "curtailed");
  const inactiveLines = lines.filter((l) => l.status === "paid_off" || l.status === "repossessed");
  const sortedActive = [...activeLines].sort((a, b) => {
    const aDays = a.days_floored ?? 0;
    const bDays = b.days_floored ?? 0;
    return sortOldest ? bDays - aDays : aDays - bDays;
  });

  // Curtailment alerts — vehicles within 7 days of curtailment
  const today = new Date();
  const curtailmentAlerts = activeLines.filter((l) => {
    if (!l.curtailment_date) return false;
    const curtDate = new Date(l.curtailment_date + "T12:00:00Z");
    const daysUntil = Math.round((curtDate.getTime() - today.getTime()) / 86_400_000);
    return daysUntil >= 0 && daysUntil <= 7;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Floor Plan Management</h1>
          <p className="mt-1 text-sm text-gray-500">Track vehicle financing, interest accrual, and curtailment schedules</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          Add to Floor Plan
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Vehicles on Plan" value={String(stats.active_count)} />
          <StatCard label="Total Principal" value={formatCurrency(stats.total_principal)} color="text-brand-700" />
          <StatCard label="Daily Interest Cost" value={formatCurrency(stats.total_daily_interest)} color="text-amber-600" />
          <StatCard label="Avg Days Floored" value={String(stats.avg_days_floored)} sub="days" />
        </div>
      )}

      {/* Curtailment Alerts */}
      {curtailmentAlerts.length > 0 && (
        <div className="mb-6 rounded-card border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-800">Curtailment Alerts</h3>
          <p className="mt-1 text-xs text-amber-700">
            {curtailmentAlerts.length} vehicle{curtailmentAlerts.length > 1 ? "s" : ""} approaching curtailment date:
          </p>
          <ul className="mt-2 space-y-1">
            {curtailmentAlerts.map((l) => (
              <li key={l.id} className="text-sm text-amber-800">
                <span className="font-medium">{l.vehicle_desc ?? l.vehicle_vin}</span>
                {" — "}curtailment due {formatDate(l.curtailment_date!)} ({l.lender})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <div className="mb-6 rounded-card border border-surface-border bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Add Vehicle to Floor Plan</h2>
          <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">VIN *</label>
              <input type="text" value={formVin} onChange={(e) => setFormVin(e.target.value)} required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="1HGCV1F34PA012345" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Vehicle Description</label>
              <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="2025 Honda Civic Sport — Silver" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Lender *</label>
              <select value={formLender} onChange={(e) => setFormLender(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500">
                <option>NextGear Capital</option>
                <option>AFC</option>
                <option>Ally Floor Plan</option>
                <option>Capital One Dealer Finance</option>
                <option>KAR Global</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Principal ($) *</label>
              <input type="number" step="0.01" value={formPrincipal} onChange={(e) => setFormPrincipal(e.target.value)} required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="24500.00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Daily Rate *</label>
              <input type="number" step="0.000001" value={formRate} onChange={(e) => setFormRate(e.target.value)} required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="0.000164" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Funded Date *</label>
              <input type="date" value={formFunded} onChange={(e) => setFormFunded(e.target.value)} required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Curtailment Date</label>
              <input type="date" value={formCurtailment} onChange={(e) => setFormCurtailment(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
              <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Optional notes..." />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" disabled={submitting}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {submitting ? "Adding..." : "Add Vehicle"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sort toggle */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setSortOldest(!sortOldest)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Sort: {sortOldest ? "Oldest First (Most Expensive)" : "Newest First"}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : lines.length === 0 ? (
        <div className="rounded-card border border-surface-border bg-white py-12 text-center text-gray-400 shadow-card">
          No floor plan lines found.
        </div>
      ) : (
        <>
          {/* Active lines */}
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Active ({sortedActive.length})</h2>
          <div className="mb-6 overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Lender</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Principal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Daily Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Funded</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Days</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Interest</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedActive.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{line.vehicle_desc ?? line.vehicle_vin}</p>
                      <p className="text-xs text-gray-400 font-mono">{line.vehicle_vin}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{line.lender}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(line.principal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-gray-500">{line.daily_rate.toFixed(6)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatDate(line.funded_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">{line.days_floored ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-amber-600">{formatCurrency(line.interest_accrued)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[line.status]}`}>
                        {STATUS_LABELS[line.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handlePayoff(line.id)}
                        className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Pay Off
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inactive lines */}
          {inactiveLines.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Closed ({inactiveLines.length})</h2>
              <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Lender</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Principal</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Interest Paid</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Payoff Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inactiveLines.map((line) => (
                      <tr key={line.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{line.vehicle_desc ?? line.vehicle_vin}</p>
                          <p className="text-xs text-gray-400 font-mono">{line.vehicle_vin}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{line.lender}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{formatCurrency(line.principal)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{formatCurrency(line.interest_accrued)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{line.payoff_date ? formatDate(line.payoff_date) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[line.status]}`}>
                            {STATUS_LABELS[line.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
