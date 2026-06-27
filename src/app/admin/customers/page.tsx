"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "active" | "prospect" | "inactive";
  vehicles_owned: number;
  last_interaction: string;
  lifetime_value: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  prospect: "bg-blue-100 text-blue-700",
  inactive: "bg-gray-100 text-gray-500",
};

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CustomerListPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await fetchJson<{ customers?: CustomerListItem[] }>(`/api/admin/customers${qs}`);
      setCustomers(data.customers ?? []);
    } catch {
      setError("Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => void loadCustomers(), 300);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  const totalLTV = customers.reduce((s, c) => s + c.lifetime_value, 0);
  const activeCount = customers.filter((c) => c.status === "active").length;
  const prospectCount = customers.filter((c) => c.status === "prospect").length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete customer database with lifetime value and interaction history.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Customers</p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">{customers.length}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-green-700">Active</p>
          <p className="mt-0.5 text-2xl font-bold text-green-700">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-blue-700">Prospects</p>
          <p className="mt-0.5 text-2xl font-bold text-blue-700">{prospectCount}</p>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-brand-700">Total LTV</p>
          <p className="mt-0.5 text-2xl font-bold text-brand-700">{usd(totalLTV)}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Search & Filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Search by name, email, or phone..."
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Customer Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No customers found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Vehicles</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Last Interaction</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">LTV</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((cust) => (
                <tr key={cust.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{cust.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{cust.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{cust.phone}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[cust.status]}`}>
                      {cust.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600 hidden lg:table-cell">{cust.vehicles_owned}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{formatDate(cust.last_interaction)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {cust.lifetime_value > 0 ? usd(cust.lifetime_value) : "--"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={`/admin/customers/${cust.id}`}
                      className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      360
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
