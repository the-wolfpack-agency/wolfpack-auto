"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OperatorChrome from "@/components/operator/OperatorChrome";

interface Stats {
  total_dealers: number;
  dealers_active: number;
  dealers_suspended: number;
  dealers_in_onboarding: number;
  dealers_active_7d: number;
  recent_actions: Array<{
    id: number;
    staff_name: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    created_at: string;
  }>;
}

interface AuditRun {
  id: string;
  dealership_name: string;
  contact_name: string;
  contact_email: string;
  status: string;
  requested_at: string;
}

interface WebsiteAuditRun extends AuditRun {
  website_url: string;
}

export default function OperatorDashboardPage() {
  return (
    <OperatorChrome>
      <Dashboard />
    </OperatorChrome>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [audits, setAudits] = useState<AuditRun[]>([]);
  const [websiteAudits, setWebsiteAudits] = useState<WebsiteAuditRun[]>([]);

  useEffect(() => {
    fetch("/api/operator/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Stats) => setStats(data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));

    // F&I audit lead-magnet follow-up surface — top 5 most recent
    fetch("/api/admin/fi-audit-runs?limit=5")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((data: { runs?: AuditRun[] }) => setAudits(data.runs ?? []))
      .catch(() => setAudits([]));

    // Website audit lead-magnet follow-up surface — top 5 most recent
    fetch("/api/admin/website-audit-runs?limit=5")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((data: { runs?: WebsiteAuditRun[] }) => setWebsiteAudits(data.runs ?? []))
      .catch(() => setWebsiteAudits([]));
  }, []);

  return (
    <div className="space-y-6" data-testid="operator-dashboard">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Operator overview</h2>
        <Link
          href="/operator/dealers/new"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
          data-testid="cta-new-dealer"
        >
          + New Dealer
        </Link>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading...</div>}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total dealers" value={stats.total_dealers} testid="stat-total-dealers" />
            <StatCard label="Active" value={stats.dealers_active} accent="brand" testid="stat-active" />
            <StatCard
              label="Active last 7 days"
              value={stats.dealers_active_7d}
              accent="accent"
              testid="stat-active-7d"
            />
            <StatCard
              label="In onboarding"
              value={stats.dealers_in_onboarding}
              accent="neutral"
              testid="stat-onboarding"
            />
          </div>

          <div
            className="rounded-xl border border-surface-border bg-white p-5 shadow-card"
            data-testid="recent-audit-requests"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Recent F&amp;I audit requests
              </h3>
              <Link
                href="/api/admin/fi-audit-runs"
                className="text-xs text-blue-700 hover:underline"
              >
                View all
              </Link>
            </div>
            {audits.length === 0 ? (
              <p className="text-sm text-gray-500">
                No audit submissions yet. Once dealers submit the public F&amp;I
                audit form, they will appear here for BDC follow-up.
              </p>
            ) : (
              <ul className="space-y-2">
                {audits.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {a.dealership_name}
                      </span>
                      <span className="text-gray-500">
                        {" "}
                        · {a.contact_name} ({a.contact_email})
                      </span>
                      <span className="text-gray-400"> · {a.status}</span>
                    </div>
                    <time className="shrink-0 text-xs text-gray-400">
                      {new Date(a.requested_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            className="rounded-xl border border-surface-border bg-white p-5 shadow-card"
            data-testid="recent-website-audit-requests"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Recent Website audit requests
              </h3>
              <Link
                href="/api/admin/website-audit-runs"
                className="text-xs text-blue-700 hover:underline"
              >
                View all
              </Link>
            </div>
            {websiteAudits.length === 0 ? (
              <p className="text-sm text-gray-500">
                No Website audit submissions yet. Once dealers submit the
                public Website audit form, they will appear here for BDC
                follow-up.
              </p>
            ) : (
              <ul className="space-y-2">
                {websiteAudits.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {a.dealership_name}
                      </span>
                      <span className="text-gray-500">
                        {" "}· {a.website_url}
                      </span>
                      <span className="text-gray-400"> · {a.status}</span>
                    </div>
                    <time className="shrink-0 text-xs text-gray-400">
                      {new Date(a.requested_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-surface-border bg-white p-5 shadow-card" data-testid="recent-actions">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent staff actions</h3>
            {stats.recent_actions.length === 0 ? (
              <p className="text-sm text-gray-500">No recorded actions yet. Once staff create or edit dealers, they&apos;ll appear here.</p>
            ) : (
              <ul className="space-y-2">
                {stats.recent_actions.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{a.staff_name ?? "Unknown"}</span>
                      <span className="text-gray-500"> · {a.action}</span>
                      {a.target_type && (
                        <span className="text-gray-400"> · {a.target_type}:{a.target_id ?? "-"}</span>
                      )}
                    </div>
                    <time className="shrink-0 text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  testid,
}: {
  label: string;
  value: number;
  accent?: "brand" | "accent" | "neutral";
  testid?: string;
}) {
  const tone =
    accent === "brand"
      ? "bg-brand-50 border-brand-100 text-brand-800"
      : accent === "accent"
        ? "bg-accent-50 border-accent-100 text-accent-800"
        : "bg-white border-surface-border text-gray-900";
  return (
    <div className={`rounded-xl border p-5 shadow-card ${tone}`} data-testid={testid}>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
