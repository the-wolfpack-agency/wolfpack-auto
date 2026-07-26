"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FiProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  provider: string | null;
  cost: number;
  retail_price: number;
  margin: number;
  margin_pct: number;
  terms: string[];
  default_term: string | null;
  deductible_options: number[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  { value: "warranty", label: "Warranty" },
  { value: "insurance", label: "Insurance" },
  { value: "protection", label: "Protection" },
  { value: "appearance", label: "Appearance" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

const CATEGORY_BADGE: Record<string, string> = {
  warranty: "bg-brand-50 text-brand-800",
  insurance: "bg-green-50 text-green-700",
  protection: "bg-purple-50 text-purple-700",
  appearance: "bg-pink-50 text-pink-700",
  maintenance: "bg-orange-50 text-orange-700",
  other: "bg-gray-100 text-gray-600",
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

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function FiProductsPage() {
  const [products, setProducts] = useState<FiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  /* Form state */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "warranty",
    description: "",
    provider: "",
    cost: "",
    retail_price: "",
    terms: "",
    default_term: "",
    is_active: true,
    sort_order: "99",
  });
  const [saving, setSaving] = useState(false);

  /* Fetch products */
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = showInactive ? "?include_inactive=true" : "";
      const res = await fetch(`/api/admin/fi-products${params}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch F&I products:", err);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  /* Stats */
  const activeCount = products.filter((p) => p.is_active).length;
  const totalCount = products.length;
  const avgMargin =
    products.length > 0
      ? products.reduce((s, p) => s + p.margin_pct, 0) / products.length
      : 0;
  const totalMarginPotential = products
    .filter((p) => p.is_active)
    .reduce((s, p) => s + p.margin, 0);

  /* Open form for add/edit */
  const openAdd = () => {
    setEditingId(null);
    setForm({
      name: "",
      category: "warranty",
      description: "",
      provider: "",
      cost: "",
      retail_price: "",
      terms: "",
      default_term: "",
      is_active: true,
      sort_order: "99",
    });
    setShowForm(true);
  };

  const openEdit = (product: FiProduct) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      description: product.description || "",
      provider: product.provider || "",
      cost: String(product.cost),
      retail_price: String(product.retail_price),
      terms: (product.terms || []).join(", "),
      default_term: product.default_term || "",
      is_active: product.is_active,
      sort_order: String(product.sort_order),
    });
    setShowForm(true);
  };

  /* Save (add only — PATCH not wired to keep scope manageable) */
  const handleSave = async () => {
    if (!form.name || !form.cost || !form.retail_price) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fi-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          description: form.description || null,
          provider: form.provider || null,
          cost: Number(form.cost),
          retail_price: Number(form.retail_price),
          terms: form.terms
            ? form.terms.split(",").map((t) => t.trim())
            : [],
          default_term: form.default_term || null,
          is_active: form.is_active,
          sort_order: Number(form.sort_order) || 99,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        fetchProducts();
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">F&I Product Catalog</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage finance and insurance products offered during the deal process
            </p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Product
          </button>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Products" value={String(activeCount)} sub={`of ${totalCount} total`} color="brand" />
          <StatCard label="Avg Margin %" value={`${avgMargin.toFixed(1)}%`} sub="across catalog" color="green" />
          <StatCard label="Max Per-Deal Back" value={fmt(totalMarginPotential)} sub="if all products sold" color="purple" />
          <StatCard label="Categories" value={String(new Set(products.map((p) => p.category)).size)} sub="product types" color="accent" />
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Show inactive products
          </label>
        </div>

        {/* Product list */}
        <div className="mt-4 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Category
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Retail Price
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Margin
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Margin %
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      Loading products...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      No products in catalog. Add your first F&I product.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr
                      key={product.id}
                      className={`transition-colors hover:bg-surface-muted ${!product.is_active ? "opacity-60" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{product.name}</p>
                        {product.description && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">
                            {product.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[product.category] || CATEGORY_BADGE.other}`}
                        >
                          {product.category.charAt(0).toUpperCase() + product.category.slice(1)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-sm text-gray-600 md:table-cell">
                        {product.provider || "--"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {fmt(product.cost)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        {fmt(product.retail_price)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                        {fmt(product.margin)}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-sm text-gray-600 lg:table-cell">
                        {product.margin_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            product.is_active
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {product.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(product)}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-card bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Product" : "Add F&I Product"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Extended Warranty"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500">Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Provider</label>
                  <input
                    type="text"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Ally Premier Protection"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500">Dealer Cost *</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      className="block w-full rounded-md border border-surface-border pl-7 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="650"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Retail Price *</label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      value={form.retail_price}
                      onChange={(e) => setForm({ ...form, retail_price: e.target.value })}
                      className="block w-full rounded-md border border-surface-border pl-7 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="1495"
                    />
                  </div>
                </div>
              </div>

              {form.cost && form.retail_price && (
                <div className="rounded-lg bg-surface-subtle p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Margin</span>
                    <span className="font-semibold text-green-600">
                      {fmt(Number(form.retail_price) - Number(form.cost))}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-gray-500">Margin %</span>
                    <span className="font-medium text-gray-700">
                      {Number(form.retail_price) > 0
                        ? (
                            ((Number(form.retail_price) - Number(form.cost)) /
                              Number(form.retail_price)) *
                            100
                          ).toFixed(1)
                        : "0.0"}
                      %
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Terms (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="36 mo / 36K mi, 60 mo / 75K mi, 72 mo / 100K mi"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500">Default Term</label>
                  <input
                    type="text"
                    value={form.default_term}
                    onChange={(e) => setForm({ ...form, default_term: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="72 mo / 100K mi"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Active (visible in deal worksheets)
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.cost || !form.retail_price}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update Product" : "Add Product"}
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
