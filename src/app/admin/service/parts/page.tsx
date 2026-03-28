"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Part {
  id: string;
  part_number: string;
  name: string;
  category: string;
  manufacturer: string;
  qty_on_hand: number;
  reorder_point: number;
  cost: number;
  retail_price: number;
  location: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  "filters", "brakes", "fluids", "electrical", "engine",
  "suspension", "tires", "body", "exhaust", "other",
];

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PartsInventoryPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    part_number: "",
    name: "",
    category: "other",
    manufacturer: "",
    qty_on_hand: "0",
    reorder_point: "5",
    cost: "0",
    retail_price: "0",
    location: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (lowStockOnly) params.set("low_stock", "true");
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`/api/admin/service/parts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setParts(data.parts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, lowStockOnly, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/service/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_number: form.part_number,
          name: form.name,
          category: form.category,
          manufacturer: form.manufacturer,
          qty_on_hand: parseInt(form.qty_on_hand, 10),
          reorder_point: parseInt(form.reorder_point, 10),
          cost: parseFloat(form.cost),
          retail_price: parseFloat(form.retail_price),
          location: form.location,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({
          part_number: "", name: "", category: "other", manufacturer: "",
          qty_on_hand: "0", reorder_point: "5", cost: "0", retail_price: "0", location: "",
        });
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
          <h1 className="text-2xl font-bold text-gray-900">Parts Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track parts stock, costs, and reorder alerts
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Part
        </button>
      </div>

      {/* Add Part Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Add New Part</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Part Number *</label>
              <input
                required value={form.part_number}
                onChange={(e) => setForm({ ...form, part_number: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Part Name *</label>
              <input
                required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Manufacturer</label>
              <input
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Shelf A-1"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Qty on Hand</label>
              <input
                type="number" value={form.qty_on_hand}
                onChange={(e) => setForm({ ...form, qty_on_hand: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Reorder Point</label>
              <input
                type="number" value={form.reorder_point}
                onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Cost</label>
              <input
                type="number" step="0.01" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Retail Price</label>
              <input
                type="number" step="0.01" value={form.retail_price}
                onChange={(e) => setForm({ ...form, retail_price: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Add Part"}
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

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by part name or number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Low Stock Only
        </label>
      </div>

      {/* Parts Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : parts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">No parts found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Part #</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3 hidden md:table-cell">Category</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right hidden sm:table-cell">Reorder Pt</th>
                <th className="px-6 py-3 text-right hidden lg:table-cell">Cost</th>
                <th className="px-6 py-3 text-right hidden lg:table-cell">Retail</th>
                <th className="px-6 py-3 hidden xl:table-cell">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {parts.map((p) => {
                const isLow = p.qty_on_hand <= p.reorder_point;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm font-medium text-gray-700">
                      {p.part_number}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        {isLow && (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            LOW
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 md:hidden">
                        {p.category.charAt(0).toUpperCase() + p.category.slice(1)}
                      </div>
                    </td>
                    <td className="hidden px-6 py-4 text-gray-600 md:table-cell">
                      {p.category.charAt(0).toUpperCase() + p.category.slice(1)}
                    </td>
                    <td className={`whitespace-nowrap px-6 py-4 text-right font-medium ${isLow ? "text-red-700" : "text-gray-900"}`}>
                      {p.qty_on_hand}
                    </td>
                    <td className="hidden whitespace-nowrap px-6 py-4 text-right text-gray-500 sm:table-cell">
                      {p.reorder_point}
                    </td>
                    <td className="hidden whitespace-nowrap px-6 py-4 text-right text-gray-600 lg:table-cell">
                      {fmtCurrency(p.cost)}
                    </td>
                    <td className="hidden whitespace-nowrap px-6 py-4 text-right font-medium text-gray-900 lg:table-cell">
                      {fmtCurrency(p.retail_price)}
                    </td>
                    <td className="hidden px-6 py-4 text-gray-500 xl:table-cell">{p.location}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
