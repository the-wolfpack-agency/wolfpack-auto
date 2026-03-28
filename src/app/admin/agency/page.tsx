"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DealerSummary {
  id: string;
  name: string;
  slug: string;
  leads_count: number;
  deals_count: number;
  inventory_count: number;
  revenue_mtd: number;
  status: "active" | "onboarding" | "suspended";
  created_at: string;
}

interface AgencyOverview {
  total_dealers: number;
  active_dealers: number;
  total_leads: number;
  total_deals: number;
  total_revenue_mtd: number;
  avg_leads_per_dealer: number;
  avg_revenue_per_dealer: number;
  top_performer: { name: string; revenue: number } | null;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  full_key?: string;
  created_at: string;
  last_used_at: string | null;
  active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Style helpers                                                              */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  onboarding: "bg-blue-100 text-blue-800",
  suspended: "bg-red-100 text-red-800",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function AgencyPage() {
  const [overview, setOverview] = useState<AgencyOverview | null>(null);
  const [dealers, setDealers] = useState<DealerSummary[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, dealersRes, keysRes] = await Promise.all([
        fetch("/api/agency/overview"),
        fetch("/api/agency/dealers"),
        fetch("/api/agency/api-keys"),
      ]);
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data.overview ?? null);
      }
      if (dealersRes.ok) {
        const data = await dealersRes.json();
        setDealers(data.dealers ?? []);
      }
      if (keysRes.ok) {
        const data = await keysRes.json();
        setApiKeys(data.keys ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerateKey = async () => {
    try {
      const res = await fetch("/api/agency/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Untitled Key" }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKey(data.key.full_key);
        setNewKeyName("");
        fetchData();
      }
    } catch {
      // swallow
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Agency Dashboard</h1>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Agency Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Overview of all dealers managed by your agency.
      </p>

      {/* Overview stats */}
      {overview && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Dealers" value={overview.total_dealers} />
          <StatCard label="Active Dealers" value={overview.active_dealers} color="text-green-600" />
          <StatCard label="Total Leads (All Dealers)" value={overview.total_leads} />
          <StatCard label="Revenue MTD" value={formatCurrency(overview.total_revenue_mtd)} color="text-blue-600" />
        </div>
      )}

      {overview && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Deals" value={overview.total_deals} />
          <StatCard label="Avg Revenue/Dealer" value={formatCurrency(overview.avg_revenue_per_dealer)} />
          <StatCard
            label="Top Performer"
            value={overview.top_performer ? `${overview.top_performer.name} (${formatCurrency(overview.top_performer.revenue)})` : "--"}
          />
        </div>
      )}

      {/* Dealer table */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Dealer Performance</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Dealer</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Leads</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Deals</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Inventory</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Revenue MTD</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dealers.map((dealer) => (
                <tr key={dealer.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <a
                      href={`/admin?dealer=${dealer.slug}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      {dealer.name}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[dealer.status] ?? ""}`}>
                      {dealer.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{dealer.leads_count}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{dealer.deals_count}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{dealer.inventory_count}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(dealer.revenue_mtd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(dealer.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* API Keys */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use API keys for programmatic access to the agency management API.
        </p>

        {generatedKey && (
          <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
            <p className="text-sm font-medium text-yellow-800">
              New API key generated. Copy it now -- it will not be shown again.
            </p>
            <code className="mt-2 block break-all rounded bg-yellow-100 p-2 text-xs text-yellow-900">
              {generatedKey}
            </code>
            <button
              onClick={() => setGeneratedKey(null)}
              className="mt-2 text-xs text-yellow-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. CRM Integration)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            onClick={handleGenerateKey}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Generate Key
          </button>
        </div>

        {apiKeys.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Prefix</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Created</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Last Used</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {apiKeys.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{key.name}</td>
                    <td className="px-4 py-2 font-mono text-sm text-gray-600">{key.prefix}...</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{formatDate(key.created_at)}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{formatDate(key.last_used_at)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${key.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {key.active ? "Active" : "Revoked"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
