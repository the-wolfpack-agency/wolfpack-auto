export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { StatsCard } from "@/components/admin/StatsCard";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Dealership analytics and performance insights.",
};

const DEALER_ID = process.env.DEALER_ID ?? "default";

interface TopVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  view_count: number;
}

interface LeadSourceBreakdown {
  source: string;
  count: number;
  percentage: number;
}

interface SearchTerm {
  term: string;
  count: number;
}

async function getAnalyticsData() {
  const [
    totalViewsResult,
    topVehiclesResult,
    leadSourcesResult,
    searchTermsResult,
    funnelResult,
  ] = await Promise.all([
    // Total page views (from analytics_events table if it exists, fallback to 0)
    query<{ total: string }>(
      `SELECT COALESCE(COUNT(*)::text, '0') AS total
       FROM analytics_events
       WHERE dealer_id = $1
         AND event_type = 'page_view'
         AND created_at >= now() - interval '30 days'`,
      [DEALER_ID],
    ).catch(() => ({ rows: [{ total: "0" }] })),

    // Top viewed vehicles
    query(
      `SELECT
         v.id, v.year, v.make, v.model, v.trim, v.price,
         COALESCE(ae.view_count, 0) AS view_count
       FROM vehicles v
       LEFT JOIN (
         SELECT vehicle_id, COUNT(*) AS view_count
         FROM analytics_events
         WHERE dealer_id = $1
           AND event_type = 'vdp_view'
           AND created_at >= now() - interval '30 days'
         GROUP BY vehicle_id
       ) ae ON ae.vehicle_id = v.id
       WHERE v.dealer_id = $1 AND v.status = 'available'
       ORDER BY view_count DESC
       LIMIT 10`,
      [DEALER_ID],
    ).catch(() => ({ rows: [] })),

    // Lead sources
    query<{ source: string; count: string }>(
      `SELECT source, COUNT(*)::text AS count
       FROM leads
       WHERE dealer_id = $1
         AND created_at >= now() - interval '30 days'
       GROUP BY source
       ORDER BY count DESC`,
      [DEALER_ID],
    ).catch(() => ({ rows: [] })),

    // Top search terms
    query<{ term: string; count: string }>(
      `SELECT search_query AS term, COUNT(*)::text AS count
       FROM analytics_events
       WHERE dealer_id = $1
         AND event_type = 'search'
         AND created_at >= now() - interval '30 days'
       GROUP BY search_query
       ORDER BY count DESC
       LIMIT 20`,
      [DEALER_ID],
    ).catch(() => ({ rows: [] })),

    // Conversion funnel
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM leads
       WHERE dealer_id = $1
         AND created_at >= now() - interval '30 days'
       GROUP BY status`,
      [DEALER_ID],
    ).catch(() => ({ rows: [] })),
  ]);

  const totalViews = parseInt(
    (totalViewsResult.rows as any[])[0]?.total ?? "0",
    10,
  );

  const topVehicles = (topVehiclesResult.rows as any[]).map((r) => ({
    id: r.id,
    year: r.year,
    make: r.make,
    model: r.model,
    trim: r.trim,
    price: r.price,
    view_count: parseInt(r.view_count, 10),
  })) as TopVehicle[];

  const leadSourcesRaw = (leadSourcesResult.rows as any[]).map((r) => ({
    source: r.source as string,
    count: parseInt(r.count, 10),
  }));
  const totalLeadsSources = leadSourcesRaw.reduce(
    (sum, r) => sum + r.count,
    0,
  );
  const leadSources: LeadSourceBreakdown[] = leadSourcesRaw.map((r) => ({
    ...r,
    percentage:
      totalLeadsSources > 0
        ? Math.round((r.count / totalLeadsSources) * 100)
        : 0,
  }));

  const searchTerms: SearchTerm[] = (searchTermsResult.rows as any[]).map(
    (r) => ({
      term: r.term,
      count: parseInt(r.count, 10),
    }),
  );

  // Funnel data
  const funnelMap: Record<string, number> = {};
  for (const row of funnelResult.rows as any[]) {
    funnelMap[row.status] = parseInt(row.count, 10);
  }
  const funnel = [
    { stage: "New", count: funnelMap["new"] ?? 0 },
    { stage: "Contacted", count: funnelMap["contacted"] ?? 0 },
    { stage: "Qualified", count: funnelMap["qualified"] ?? 0 },
    { stage: "Appointment", count: funnelMap["appointment_set"] ?? 0 },
    { stage: "Sold", count: funnelMap["sold"] ?? 0 },
  ];
  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);

  return {
    totalViews,
    topVehicles,
    leadSources,
    searchTerms,
    funnel,
    funnelMax,
  };
}

export default async function AnalyticsPage() {
  const {
    totalViews,
    topVehicles,
    leadSources,
    searchTerms,
    funnel,
    funnelMax,
  } = await getAnalyticsData();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Performance insights for the last 30 days.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          label="Page Views (30d)"
          value={totalViews.toLocaleString()}
          icon={<EyeIcon />}
        />
        <StatsCard
          label="New Leads (30d)"
          value={leadSources.reduce((s, r) => s + r.count, 0)}
          icon={<UsersAnalyticsIcon />}
        />
        <StatsCard
          label="Top Search Terms"
          value={searchTerms.length}
          icon={<SearchAnalyticsIcon />}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        {/* Page Views Over Time (chart placeholder)                         */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="views-chart-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card lg:col-span-2"
        >
          <h2
            id="views-chart-heading"
            className="mb-4 text-lg font-semibold text-gray-900"
          >
            Page Views Over Time
          </h2>
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-surface-border bg-surface-muted">
            <div className="text-center">
              <ChartIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-500">
                Chart integration pending
              </p>
              <p className="text-xs text-gray-400">
                Connect Recharts or Chart.js to visualize page view trends
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Top Viewed Vehicles                                              */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="top-vehicles-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="top-vehicles-heading"
            className="mb-4 text-lg font-semibold text-gray-900"
          >
            Top Viewed Vehicles
          </h2>

          {topVehicles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No vehicle view data available yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-border">
                <caption className="sr-only">
                  Most viewed vehicles in the last 30 days
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Vehicle</th>
                    <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Price</th>
                    <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {topVehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2 text-sm text-gray-900">
                        {v.year} {v.make} {v.model} {v.trim}
                      </td>
                      <td className="py-2 text-right text-sm font-medium text-gray-700">
                        ${v.price.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-sm font-semibold text-brand-600">
                        {v.view_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Lead Sources Breakdown                                           */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="lead-sources-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="lead-sources-heading"
            className="mb-4 text-lg font-semibold text-gray-900"
          >
            Lead Sources
          </h2>

          {leadSources.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No lead source data available yet.
            </p>
          ) : (
            <div className="space-y-3">
              {leadSources.map(({ source, count, percentage }) => (
                <div key={source}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      {formatSourceLabel(source)}
                    </span>
                    <span className="text-gray-500">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${percentage}%` }}
                      role="progressbar"
                      aria-valuenow={percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${formatSourceLabel(source)}: ${percentage}%`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Search Terms                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="search-terms-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="search-terms-heading"
            className="mb-4 text-lg font-semibold text-gray-900"
          >
            Popular Search Terms
          </h2>

          {searchTerms.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No search data available yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {searchTerms.map(({ term, count }) => (
                <span
                  key={term}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-muted px-3 py-1 text-sm"
                >
                  <span className="text-gray-700">{term}</span>
                  <span className="text-xs font-medium text-gray-400">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Conversion Funnel                                                */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="funnel-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="funnel-heading"
            className="mb-4 text-lg font-semibold text-gray-900"
          >
            Conversion Funnel
          </h2>

          <div className="space-y-3">
            {funnel.map(({ stage, count }, idx) => {
              const widthPct = Math.max(
                (count / funnelMax) * 100,
                4, // minimum visible bar
              );
              const colors = [
                "bg-blue-500",
                "bg-indigo-500",
                "bg-purple-500",
                "bg-cyan-500",
                "bg-green-500",
              ];
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{stage}</span>
                    <span className="font-semibold text-gray-900">
                      {count}
                    </span>
                  </div>
                  <div className="mt-1 h-6 overflow-hidden rounded bg-surface-subtle">
                    <div
                      className={`flex h-full items-center rounded ${colors[idx % colors.length]} px-2 text-xs font-medium text-white transition-all`}
                      style={{ width: `${widthPct}%` }}
                      role="progressbar"
                      aria-valuenow={count}
                      aria-valuemin={0}
                      aria-valuemax={funnelMax}
                      aria-label={`${stage}: ${count} leads`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatSourceLabel(source: string): string {
  const map: Record<string, string> = {
    website_form: "Website Form",
    vdp_inquiry: "VDP Inquiry",
    chat: "Chat",
    phone: "Phone",
    third_party: "3rd Party",
    walk_in: "Walk-in",
  };
  return map[source] ?? source;
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

function EyeIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function UsersAnalyticsIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </svg>
  );
}

function SearchAnalyticsIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}
