"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Feed {
  id: string;
  source: string;
  api_key: string;
  endpoint_url: string;
  active: boolean;
  last_sync: string | null;
  leads_received: number;
  created_at: string;
}

interface IngestedLead {
  id: string;
  source: string;
  first_name: string;
  last_name: string;
  email: string;
  vehicle_interest: string;
  ingested_at: string;
  duplicate: boolean;
  matched_lead_id: string | null;
}

interface Stats {
  total_ingested: number;
  duplicates_caught: number;
  feeds_active: number;
  last_24h: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function LeadIngestionPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [recentLeads, setRecentLeads] = useState<IngestedLead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<{ feeds?: Feed[]; recent_leads?: IngestedLead[]; stats?: Stats | null }>("/api/admin/lead-ingestion")
      .then((data) => {
        setFeeds(data.feeds ?? []);
        setRecentLeads(data.recent_leads ?? []);
        setStats(data.stats ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lead Ingestion</h1>
        <p className="mt-1 text-sm text-gray-500">
          Third-party lead feeds from AutoTrader, Cars.com, CarGurus, and ADF/XML sources.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Ingested" value={String(stats.total_ingested)} />
          <StatCard label="Duplicates Caught" value={String(stats.duplicates_caught)} color="text-amber-600" />
          <StatCard label="Active Feeds" value={String(stats.feeds_active)} color="text-green-600" />
          <StatCard label="Last 24h" value={String(stats.last_24h)} />
        </div>
      )}

      {/* Configured Sources */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Configured Sources</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {feeds.map((feed) => (
            <div key={feed.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900 capitalize">
                  {feed.source.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-gray-500">{feed.endpoint_url}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-700">{feed.leads_received} leads</span>
                {feed.last_sync && (
                  <span className="text-xs text-gray-500">
                    Last sync: {new Date(feed.last_sync).toLocaleString()}
                  </span>
                )}
                {feed.active ? (
                  <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          ))}
          {feeds.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              No feeds configured. Add an AutoTrader, Cars.com, or CarGurus feed to get started.
            </p>
          )}
        </div>
      </div>

      {/* Recent Ingested Leads */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Ingested Leads</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Vehicle Interest</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ingested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recentLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {lead.first_name} {lead.last_name}
                </td>
                <td className="px-4 py-3 text-gray-700 capitalize text-xs">
                  {lead.source.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-3 text-gray-700">{lead.vehicle_interest}</td>
                <td className="px-4 py-3">
                  {lead.duplicate ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Duplicate
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      New
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(lead.ingested_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}
