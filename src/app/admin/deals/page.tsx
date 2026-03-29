"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Deal {
  id: string;
  status: string;
  deal_type: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  salesperson: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string;
  vehicle_stock: string | null;
  selling_price: number;
  trade_value: number;
  front_gross: number;
  back_gross: number;
  total_gross: number;
  lender: string | null;
  lender_status: string | null;
  monthly_payment: number;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "working", label: "Working" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "presented", label: "Presented" },
  { value: "accepted", label: "Accepted" },
  { value: "funded", label: "Funded" },
  { value: "delivered", label: "Delivered" },
  { value: "unwound", label: "Unwound" },
];

const STATUS_BADGE: Record<string, string> = {
  working: "bg-blue-50 text-blue-700 ring-blue-600/20",
  pending_approval: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  approved: "bg-green-50 text-green-700 ring-green-600/20",
  presented: "bg-purple-50 text-purple-700 ring-purple-600/20",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  funded: "bg-teal-50 text-teal-700 ring-teal-600/20",
  delivered: "bg-gray-100 text-gray-600 ring-gray-400/20",
  unwound: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_LABEL: Record<string, string> = {
  working: "Working",
  pending_approval: "Pending Approval",
  approved: "Approved",
  presented: "Presented",
  accepted: "Accepted",
  funded: "Funded",
  delivered: "Delivered",
  unwound: "Unwound",
};

const DEAL_TYPE_LABEL: Record<string, string> = {
  retail: "Retail",
  lease: "Lease",
  cash: "Cash",
};

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

export default function DealDeskingPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  /* New Deal modal */
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDealForm, setNewDealForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    vehicle_vin: "",
    vehicle_year: "",
    vehicle_make: "",
    vehicle_model: "",
    selling_price: "",
    salesperson: "",
    deal_type: "retail",
  });
  const [creating, setCreating] = useState(false);

  /* Fetch deals */
  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (salespersonFilter) params.set("salesperson", salespersonFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(`/api/admin/deals?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDeals(data.deals ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch deals:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, salespersonFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  /* Stats */
  const stats = useMemo(() => {
    const active = deals.filter((d) =>
      ["working", "pending_approval", "approved", "presented"].includes(d.status),
    );
    const avgFront =
      deals.length > 0
        ? deals.reduce((s, d) => s + d.front_gross, 0) / deals.length
        : 0;
    const avgBack =
      deals.length > 0
        ? deals.reduce((s, d) => s + d.back_gross, 0) / deals.length
        : 0;
    const pipelineValue = active.reduce((s, d) => s + d.total_gross, 0);

    return { activeCount: active.length, avgFront, avgBack, pipelineValue };
  }, [deals]);

  /* Unique salesperson list */
  const salespersons = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => d.salesperson && set.add(d.salesperson));
    return Array.from(set).sort();
  }, [deals]);

  /* Create new deal */
  const handleCreate = async () => {
    if (!newDealForm.customer_name || !newDealForm.vehicle_vin || !newDealForm.selling_price) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newDealForm,
          selling_price: Number(newDealForm.selling_price),
          vehicle_year: newDealForm.vehicle_year ? Number(newDealForm.vehicle_year) : null,
        }),
      });
      if (res.ok) {
        setShowNewDeal(false);
        setNewDealForm({
          customer_name: "",
          customer_email: "",
          customer_phone: "",
          vehicle_vin: "",
          vehicle_year: "",
          vehicle_make: "",
          vehicle_model: "",
          selling_price: "",
          salesperson: "",
          deal_type: "retail",
        });
        fetchDeals();
      }
    } catch (err) {
      console.error("Create deal failed:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Deal Desking</h1>
            <p className="mt-1 text-sm text-gray-500">
              F&I worksheets, payment calculations, and deal pipeline
            </p>
          </div>
          <button
            onClick={() => setShowNewDeal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Deal
          </button>
        </div>

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Deals" value={String(stats.activeCount)} sub="in pipeline" color="brand" />
          <StatCard label="Avg Front Gross" value={fmt(stats.avgFront)} sub="per deal" color="green" />
          <StatCard label="Avg Back Gross" value={fmt(stats.avgBack)} sub="per deal (F&I)" color="purple" />
          <StatCard label="Pipeline Value" value={fmt(stats.pipelineValue)} sub="total gross" color="accent" />
        </div>

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
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">Salesperson</label>
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Salespeople</option>
              {salespersons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Deal list table */}
        <div className="mt-6 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer / Vehicle
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Selling Price
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Payment
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Front
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Back
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Total Gross
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Salesperson
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                      Loading deals...
                    </td>
                  </tr>
                ) : deals.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                      No deals found. Click &quot;New Deal&quot; to start one.
                    </td>
                  </tr>
                ) : (
                  deals.map((deal) => (
                    <tr key={deal.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/deals/${deal.id}`}
                          className="block"
                        >
                          <p className="text-sm font-medium text-gray-900 hover:text-brand-600">
                            {deal.customer_name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {[deal.vehicle_year, deal.vehicle_make, deal.vehicle_model]
                              .filter(Boolean)
                              .join(" ")}{" "}
                            {deal.vehicle_stock && (
                              <span className="text-gray-400">#{deal.vehicle_stock}</span>
                            )}
                          </p>
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-xs font-medium text-gray-600">
                          {DEAL_TYPE_LABEL[deal.deal_type] || deal.deal_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[deal.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
                        >
                          {STATUS_LABEL[deal.status] || deal.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm font-medium text-gray-900 sm:table-cell">
                        {fmt(deal.selling_price)}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm text-gray-600 lg:table-cell">
                        {deal.monthly_payment > 0
                          ? `${fmt(deal.monthly_payment)}/mo`
                          : deal.deal_type === "cash"
                            ? "Cash"
                            : "--"}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm lg:table-cell">
                        <span className={deal.front_gross >= 0 ? "text-green-600" : "text-red-600"}>
                          {fmt(deal.front_gross)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm lg:table-cell">
                        <span className="text-purple-600">{fmt(deal.back_gross)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">
                        <span className={deal.total_gross >= 0 ? "text-green-700" : "text-red-600"}>
                          {fmt(deal.total_gross)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-sm text-gray-600 md:table-cell">
                        {deal.salesperson || "--"}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-400 lg:table-cell">
                        {fmtDate(deal.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Deal Modal */}
      {showNewDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-card bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Deal Worksheet</h2>
              <button
                onClick={() => setShowNewDeal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">Customer Name *</label>
                <input
                  type="text"
                  value={newDealForm.customer_name}
                  onChange={(e) => setNewDealForm({ ...newDealForm, customer_name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Email</label>
                <input
                  type="email"
                  value={newDealForm.customer_email}
                  onChange={(e) => setNewDealForm({ ...newDealForm, customer_email: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Phone</label>
                <input
                  type="tel"
                  value={newDealForm.customer_phone}
                  onChange={(e) => setNewDealForm({ ...newDealForm, customer_phone: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">VIN *</label>
                <input
                  type="text"
                  value={newDealForm.vehicle_vin}
                  onChange={(e) => setNewDealForm({ ...newDealForm, vehicle_vin: e.target.value.toUpperCase() })}
                  maxLength={17}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 font-mono text-sm uppercase focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="4T1G11AK5RU123456"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Year</label>
                <input
                  type="number"
                  value={newDealForm.vehicle_year}
                  onChange={(e) => setNewDealForm({ ...newDealForm, vehicle_year: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="2025"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Make</label>
                <input
                  type="text"
                  value={newDealForm.vehicle_make}
                  onChange={(e) => setNewDealForm({ ...newDealForm, vehicle_make: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Toyota"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Model</label>
                <input
                  type="text"
                  value={newDealForm.vehicle_model}
                  onChange={(e) => setNewDealForm({ ...newDealForm, vehicle_model: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Camry XSE"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Selling Price *</label>
                <input
                  type="number"
                  value={newDealForm.selling_price}
                  onChange={(e) => setNewDealForm({ ...newDealForm, selling_price: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="31500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Salesperson</label>
                <input
                  type="text"
                  value={newDealForm.salesperson}
                  onChange={(e) => setNewDealForm({ ...newDealForm, salesperson: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Deal Type</label>
                <select
                  value={newDealForm.deal_type}
                  onChange={(e) => setNewDealForm({ ...newDealForm, deal_type: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="retail">Retail (Loan)</option>
                  <option value="lease">Lease</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowNewDeal(false)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newDealForm.customer_name || !newDealForm.vehicle_vin || !newDealForm.selling_price}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Deal"}
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
