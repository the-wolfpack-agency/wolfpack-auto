import type { Metadata } from "next";
import Link from "next/link";
import {
  getOemNetworkStats,
  getRecentEnrollments,
  type OemNetworkStats,
  type OemProgramEnrollment,
} from "@/db/queries/oem";

export const metadata: Metadata = { title: "OEM Network Overview" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    enrolled: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    expired: "bg-red-100 text-red-700",
    withdrawn: "bg-gray-100 text-gray-500",
  };
  return map[status] ?? "bg-gray-100 text-gray-500";
}

function friendlyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold ${accent ?? "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OemOverviewPage() {
  const [stats, recentEnrollments] = await Promise.all([
    getOemNetworkStats(),
    getRecentEnrollments(undefined, 8),
  ]);

  const migrationPending =
    stats.total_dealers === 0 &&
    stats.total_programs === 0 &&
    recentEnrollments.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OEM Network Overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cross-dealer program compliance, enrollment activity, and network health.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/oem/dealers"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Dealer Network
          </Link>
          <Link
            href="/admin/oem/programs"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Manage Programs
          </Link>
        </div>
      </div>

      {/* Empty state notice */}
      {migrationPending && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <strong className="text-gray-700">Getting started:</strong>{" "}
          Connect your database to activate OEM network features. The portal will display live data once configured.
        </div>
      )}

      {/* Network stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total Dealers"
          value={stats.total_dealers.toLocaleString()}
          sub={`${stats.active_dealers} active`}
        />
        <StatCard
          label="Programs"
          value={stats.total_programs.toLocaleString()}
          sub={`${stats.active_programs} active`}
        />
        <StatCard
          label="Enrollments"
          value={stats.total_enrollments.toLocaleString()}
          sub={`${stats.completed_enrollments} completed`}
          accent="text-brand-600"
        />
        <StatCard
          label="Network Close Rate"
          value={`${stats.network_close_rate}%`}
          sub={`${stats.total_leads_network.toLocaleString()} total leads`}
          accent={stats.network_close_rate >= 10 ? "text-green-600" : "text-gray-900"}
        />
        <StatCard
          label="Avg Compliance"
          value={
            stats.avg_program_compliance > 0
              ? `${stats.avg_program_compliance}%`
              : "—"
          }
          sub="across all programs"
          accent={
            stats.avg_program_compliance >= 80
              ? "text-green-600"
              : stats.avg_program_compliance >= 60
              ? "text-yellow-600"
              : "text-gray-900"
          }
        />
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            href: "/admin/oem/dealers",
            title: "Dealer Network",
            desc: "View and manage all franchise dealers, enrollment status, and performance benchmarks.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            ),
          },
          {
            href: "/admin/oem/programs",
            title: "Programs",
            desc: "Create and manage incentive programs, certification tiers, and brand standards.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
              </svg>
            ),
          },
          {
            href: "/admin/oem/analytics",
            title: "Cross-Dealer Analytics",
            desc: "Benchmark dealers against each other — close rates, inventory turns, lead velocity.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            ),
          },
          {
            href: "/admin/settings",
            title: "Brand Standards",
            desc: "Configure required brand compliance checklists and audit schedules.",
            icon: (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.040.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
            ),
          },
        ].map(({ href, title, desc, icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100">
              {icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent enrollment activity */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Recent Enrollment Activity
          </h2>
          <Link
            href="/admin/oem/programs"
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {recentEnrollments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No enrollment activity yet. Create a program and enroll dealers to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Dealer</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Program</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Score</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentEnrollments.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{e.dealer_name}</td>
                    <td className="px-5 py-3 text-gray-600">{e.program_name}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(e.status)}`}
                      >
                        {friendlyStatus(e.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {e.score != null ? `${e.score}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(e.enrolled_at)}</td>
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
