"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import OperatorChrome from "@/components/operator/OperatorChrome";

interface DealerRow {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  leads_count: number;
  inventory_count: number;
  user_count: number;
  last_activity_at: string | null;
}

type StatusFilter = "all" | "active" | "suspended" | "onboarding";

export default function OperatorDealersPage() {
  return (
    <OperatorChrome>
      <DealersList />
    </OperatorChrome>
  );
}

function DealersList() {
  const [rows, setRows] = useState<DealerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    const url = new URL("/api/operator/dealers", window.location.origin);
    if (search) url.searchParams.set("search", search);
    if (status === "active" || status === "suspended") {
      url.searchParams.set("status", status);
    }
    setLoading(true);
    setError("");
    fetch(url.toString())
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { dealers: DealerRow[] }) => setRows(data.dealers))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [search, status]);

  const filtered = useMemo(() => {
    if (status !== "onboarding") return rows;
    return rows.filter((r) => r.is_active && r.leads_count === 0 && r.inventory_count === 0);
  }, [rows, status]);

  return (
    <div className="space-y-5" data-testid="operator-dealers-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Dealers</h2>
        <Link
          href="/operator/dealers/new"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
          data-testid="cta-new-dealer"
        >
          + New Dealer
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or slug..."
          className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          data-testid="dealer-search"
        />
        <div className="flex gap-1 rounded-lg border border-surface-border bg-white p-1 text-xs">
          {(["all", "active", "onboarding", "suspended"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded px-3 py-1 ${
                status === s ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-surface-subtle"
              }`}
              data-testid={`filter-${s}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading dealers...</div>}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Dealer</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Team</th>
                <th className="px-4 py-2.5">Leads</th>
                <th className="px-4 py-2.5">Inventory</th>
                <th className="px-4 py-2.5">Last activity</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border" data-testid="dealers-tbody">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No dealers match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-muted" data-testid={`dealer-row-${d.slug}`}>
                    <td className="px-4 py-3">
                      <Link href={`/operator/dealers/${d.id}`} className="font-medium text-brand-700 hover:underline">
                        {d.name}
                      </Link>
                      <div className="text-xs text-gray-500">{d.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      {d.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Suspended
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{d.user_count}</td>
                    <td className="px-4 py-3 text-gray-700">{d.leads_count}</td>
                    <td className="px-4 py-3 text-gray-700">{d.inventory_count}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {d.last_activity_at ? new Date(d.last_activity_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/operator/dealers/${d.id}`} className="text-xs text-brand-600 hover:underline">
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
