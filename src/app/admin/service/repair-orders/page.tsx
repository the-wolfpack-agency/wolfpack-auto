"use client";

import { useCallback, useEffect, useState } from "react";
import RecallsPanel from "@/components/service/RecallsPanel";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LineItem {
  id: string;
  description: string;
  labor_hours: number;
  labor_rate: number;
  parts_cost: number;
  line_total: number;
}

interface RepairOrder {
  id: string;
  ro_number: string;
  customer_name: string;
  customer_phone: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string;
  odometer: number;
  status: string;
  advisor: string;
  technician: string;
  line_items: LineItem[];
  labor_total: number;
  parts_total: number;
  tax: number;
  grand_total: number;
  customer_concern: string;
  diagnosis: string;
  created_at: string;
}

interface Technician {
  id: string;
  name: string;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const RO_STATUSES = [
  "open", "in_progress", "waiting_parts", "waiting_approval",
  "completed", "invoiced", "closed",
];

const STATUS_BADGE: Record<string, string> = {
  open: "bg-brand-100 text-brand-900",
  in_progress: "bg-purple-100 text-purple-800",
  waiting_parts: "bg-orange-100 text-orange-800",
  waiting_approval: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  invoiced: "bg-teal-100 text-teal-800",
  closed: "bg-gray-100 text-gray-500",
};

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function RepairOrdersPage() {
  const [ros, setRos] = useState<RepairOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // New RO form
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    vehicle_year: "",
    vehicle_make: "",
    vehicle_model: "",
    vin: "",
    odometer: "",
    technician: "",
    customer_concern: "",
  });

  // Line items for new RO
  const [lineItems, setLineItems] = useState<
    { description: string; labor_hours: string; labor_rate: string; parts_cost: string }[]
  >([{ description: "", labor_hours: "1.0", labor_rate: "135.00", parts_cost: "0" }]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const [roRes, techRes] = await Promise.all([
        fetch(`/api/admin/service/repair-orders?${params}`),
        fetch("/api/admin/service/technicians"),
      ]);

      if (roRes.ok) {
        const data = await roRes.json();
        setRos(data.repair_orders ?? []);
      }
      if (techRes.ok) {
        const data = await techRes.json();
        setTechnicians(data.technicians ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  function addLineItem() {
    setLineItems([
      ...lineItems,
      { description: "", labor_hours: "1.0", labor_rate: "135.00", parts_cost: "0" },
    ]);
  }

  function removeLineItem(idx: number) {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  }

  function updateLineItem(idx: number, field: string, value: string) {
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setLineItems(updated);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const items = lineItems.map((li, i) => {
        const hours = parseFloat(li.labor_hours) || 0;
        const rate = parseFloat(li.labor_rate) || 0;
        const parts = parseFloat(li.parts_cost) || 0;
        return {
          id: `li-new-${i}`,
          description: li.description,
          labor_hours: hours,
          labor_rate: rate,
          parts_cost: parts,
          line_total: hours * rate + parts,
        };
      });

      const res = await fetch("/api/admin/service/repair-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year, 10) : null,
          vehicle_make: form.vehicle_make,
          vehicle_model: form.vehicle_model,
          vin: form.vin,
          odometer: form.odometer ? parseInt(form.odometer, 10) : 0,
          technician: form.technician,
          customer_concern: form.customer_concern,
          line_items: items,
        }),
      });

      if (res.ok) {
        setShowForm(false);
        setForm({
          customer_name: "", customer_phone: "", vehicle_year: "",
          vehicle_make: "", vehicle_model: "", vin: "", odometer: "",
          technician: "", customer_concern: "",
        });
        setLineItems([{ description: "", labor_hours: "1.0", labor_rate: "135.00", parts_cost: "0" }]);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repair Orders</h1>
          <p className="mt-1 text-sm text-gray-500">Track and manage service repair orders</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Repair Order
        </button>
      </div>

      {/* New RO Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">New Repair Order</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
              <input
                required value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">VIN *</label>
              <input
                required value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                maxLength={17}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Year</label>
              <input
                type="number" value={form.vehicle_year}
                onChange={(e) => setForm({ ...form, vehicle_year: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Make</label>
              <input
                value={form.vehicle_make}
                onChange={(e) => setForm({ ...form, vehicle_make: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Model</label>
              <input
                value={form.vehicle_model}
                onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Odometer</label>
              <input
                type="number" value={form.odometer}
                onChange={(e) => setForm({ ...form, odometer: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Technician</label>
              <select
                value={form.technician}
                onChange={(e) => setForm({ ...form, technician: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select Technician</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recalls + TSBs — flagged the moment a VIN is entered, before the writer can move past write-up */}
          {form.vin && form.vin.length >= 11 && (
            <div data-testid="repair-order-recalls-panel">
              <RecallsPanel vehicleId={form.vin} title="Recalls and service bulletins" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Customer Concern</label>
            <textarea
              rows={2} value={form.customer_concern}
              onChange={(e) => setForm({ ...form, customer_concern: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Line Items</label>
              <button
                type="button" onClick={addLineItem}
                className="text-sm font-medium text-brand-600 hover:text-brand-800"
              >
                + Add Line
              </button>
            </div>
            <div className="space-y-3">
              {lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-5">
                  <div className="sm:col-span-2">
                    <input
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <input
                      type="number" step="0.1" placeholder="Labor hrs"
                      value={li.labor_hours}
                      onChange={(e) => updateLineItem(idx, "labor_hours", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <input
                      type="number" step="0.01" placeholder="Rate $/hr"
                      value={li.labor_rate}
                      onChange={(e) => updateLineItem(idx, "labor_rate", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number" step="0.01" placeholder="Parts $"
                      value={li.parts_cost}
                      onChange={(e) => updateLineItem(idx, "parts_cost", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {lineItems.length > 1 && (
                      <button
                        type="button" onClick={() => removeLineItem(idx)}
                        className="shrink-0 text-red-500 hover:text-red-700"
                        aria-label="Remove line item"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating..." : "Create Repair Order"}
            </button>
            <button
              type="button" onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          {RO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        {statusFilter && (
          <button onClick={() => setStatusFilter("")} className="text-sm text-brand-600 hover:text-brand-800">
            Clear
          </button>
        )}
      </div>

      {/* RO Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : ros.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">No repair orders found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">RO #</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3 hidden md:table-cell">Vehicle</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 hidden sm:table-cell">Total</th>
                <th className="px-6 py-3 hidden lg:table-cell">Advisor</th>
                <th className="px-6 py-3 hidden lg:table-cell">Technician</th>
                <th className="px-6 py-3 hidden xl:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ros.map((ro) => (
                <tr key={ro.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4 font-mono font-medium text-brand-700">
                    {ro.ro_number}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{ro.customer_name}</div>
                    <div className="text-xs text-gray-400 font-mono hidden sm:block">{ro.vin}</div>
                  </td>
                  <td className="hidden px-6 py-4 text-gray-600 md:table-cell">
                    {ro.vehicle_year} {ro.vehicle_make} {ro.vehicle_model}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[ro.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {ro.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-6 py-4 font-medium text-gray-900 sm:table-cell">
                    {fmtCurrency(ro.grand_total)}
                  </td>
                  <td className="hidden px-6 py-4 text-gray-600 lg:table-cell">{ro.advisor}</td>
                  <td className="hidden px-6 py-4 text-gray-600 lg:table-cell">{ro.technician}</td>
                  <td className="hidden px-6 py-4 text-gray-500 xl:table-cell">{fmtDate(ro.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
