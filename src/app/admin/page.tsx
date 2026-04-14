export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { getDashboardStats, getRecentLeads } from "@/lib/data";
import { StatsCard } from "@/components/admin/StatsCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { HotLeadsWidget } from "@/components/HotLeadsWidget";
import { OnboardingBanner } from "@/components/admin/OnboardingBanner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Dealer admin dashboard overview.",
};

export default async function AdminDashboardPage() {
  const [{ data: stats }, { data: recentLeads }] = await Promise.all([
    getDashboardStats(),
    getRecentLeads(10),
  ]);

  const { vehicles, leads, avgDaysOnLot, conversionRate } = stats;

  return (
    <>
      {/* Onboarding banner — shown until all setup steps are complete */}
      <OnboardingBanner />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your dealership performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/inventory"
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            Add Vehicle
          </a>
          <a
            href="/admin/leads"
            className="inline-flex items-center rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            View Leads
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Vehicles"
          value={vehicles.total}
          icon={<CarIcon />}
        />
        <StatsCard
          label="Available"
          value={vehicles.available}
          icon={<CheckCircleIcon />}
        />
        <StatsCard
          label="Total Leads"
          value={leads.total}
          icon={<UsersIcon />}
        />
        <StatsCard
          label="Conversion Rate"
          value={`${conversionRate}%`}
          icon={<TrendUpIcon />}
        />
      </div>

      {/* Secondary stats */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="New Leads"
          value={leads.new}
          icon={<SparkleIcon />}
        />
        <StatsCard
          label="Qualified Leads"
          value={leads.qualified}
          icon={<StarIcon />}
        />
        <StatsCard
          label="Avg Days on Lot"
          value={avgDaysOnLot}
          icon={<ClockIcon />}
        />
        <StatsCard
          label="Vehicles Sold"
          value={vehicles.sold}
          icon={<TagIcon />}
        />
      </div>

      {/* Hot Leads Widget */}
      <div className="mt-8">
        <HotLeadsWidget />
      </div>

      {/* Recent Leads Table */}
      <section aria-labelledby="recent-leads-heading" className="mt-8">
        <h2
          id="recent-leads-heading"
          className="mb-4 text-lg font-semibold text-gray-900"
        >
          Recent Leads
        </h2>
        <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <caption className="sr-only">
                Most recent 10 customer leads
              </caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                  <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Email</th>
                  <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">Vehicle Interest</th>
                  <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Source</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {recentLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-gray-500"
                    >
                      No leads yet. They will appear here as customers inquire.
                    </td>
                  </tr>
                ) : (
                  recentLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="transition-colors hover:bg-surface-muted/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                        {lead.first_name} {lead.last_name}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-700 sm:table-cell">
                        {lead.email}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-700 lg:table-cell">
                        {lead.vehicle_interest || "\u2014"}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-700 md:table-cell">
                        {formatSource(lead.source)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(lead.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSource(source: string): string {
  const map: Record<string, string> = {
    website_form: "Website",
    vdp_inquiry: "VDP",
    chat: "Chat",
    phone: "Phone",
    third_party: "3rd Party",
    walk_in: "Walk-in",
  };
  return map[source] ?? source;
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icons                                                           */
/* -------------------------------------------------------------------------- */

function CarIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  );
}
