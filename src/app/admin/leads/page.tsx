export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { StatsCard } from "@/components/admin/StatsCard";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const metadata: Metadata = {
  title: "Leads",
  description: "Manage customer leads and inquiries.",
};

const DEALER_ID = process.env.DEALER_ID ?? "default";

type LeadStatus = "new" | "contacted" | "qualified" | "appointment_set" | "sold" | "lost";

interface LeadRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  source: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface LeadCounts {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  appointment_set: number;
  sold: number;
  lost: number;
}

interface PageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "appointment_set", label: "Appointment" },
  { value: "sold", label: "Sold" },
  { value: "lost", label: "Lost" },
];

const QUICK_STATUS_TRANSITIONS: Record<string, LeadStatus[]> = {
  new: ["contacted", "lost"],
  contacted: ["qualified", "lost"],
  qualified: ["appointment_set", "lost"],
  appointment_set: ["sold", "lost"],
  sold: [],
  lost: ["new"],
};

async function getLeadsData(params: {
  status?: string;
  search?: string;
  page?: string;
}) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = ["dealer_id = $1"];
  const queryParams: unknown[] = [DEALER_ID];
  let idx = 2;

  if (params.status && ["new", "contacted", "qualified", "appointment_set", "sold", "lost"].includes(params.status)) {
    conditions.push(`status = $${idx++}`);
    queryParams.push(params.status);
  }

  if (params.search) {
    conditions.push(
      `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`,
    );
    queryParams.push(`%${params.search}%`);
    idx++;
  }

  const where = conditions.join(" AND ");

  const [dataResult, countResult, statsResult] = await Promise.all([
    query(
      `SELECT id, first_name, last_name, email, phone,
              vehicle_interest, source, status, notes,
              created_at, updated_at
       FROM leads
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...queryParams, PAGE_SIZE, offset],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM leads WHERE ${where}`,
      queryParams,
    ),
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM leads WHERE dealer_id = $1
       GROUP BY status`,
      [DEALER_ID],
    ),
  ]);

  const counts: LeadCounts = {
    total: 0, new: 0, contacted: 0, qualified: 0,
    appointment_set: 0, sold: 0, lost: 0,
  };
  for (const row of statsResult.rows as any[]) {
    const count = parseInt(row.count, 10);
    counts.total += count;
    if (row.status in counts) {
      counts[row.status as keyof LeadCounts] = count;
    }
  }

  return {
    leads: dataResult.rows as unknown as LeadRow[],
    total: parseInt((countResult.rows as any[])[0]?.count ?? "0", 10),
    page,
    counts,
  };
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { leads, total, page, counts } = await getLeadsData(params);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string>): string {
    const sp = new URLSearchParams({
      ...(params.status ? { status: params.status } : {}),
      ...(params.search ? { search: params.search } : {}),
      page: String(page),
      ...overrides,
    });
    return `/admin/leads?${sp.toString()}`;
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage customer inquiries and track conversions.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Leads"
          value={counts.total}
          icon={<UsersSmallIcon />}
        />
        <StatsCard
          label="New"
          value={counts.new}
          icon={<InboxIcon />}
        />
        <StatsCard
          label="Qualified"
          value={counts.qualified}
          icon={<CheckSmallIcon />}
        />
        <StatsCard
          label="Converted"
          value={counts.sold}
          icon={<TrophyIcon />}
        />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <form
          action="/admin/leads"
          method="GET"
          role="search"
          aria-label="Search leads"
          className="flex flex-1 gap-2"
        >
          {params.status && (
            <input type="hidden" name="status" value={params.status} />
          )}
          <label htmlFor="lead-search" className="sr-only">
            Search by name, email, or phone
          </label>
          <input
            id="lead-search"
            name="search"
            type="search"
            defaultValue={params.search}
            placeholder="Search name, email, phone..."
            className="flex-1 rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            Search
          </button>
        </form>

        <nav aria-label="Filter by lead status" className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(({ value, label }) => {
            const isActive =
              value === "" ? !params.status : params.status === value;
            return (
              <a
                key={value}
                href={buildUrl({
                  ...(value ? { status: value } : {}),
                  page: "1",
                })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-surface-border bg-white text-gray-600 hover:bg-surface-muted"
                }`}
                aria-current={isActive ? "true" : undefined}
              >
                {label}
                {value && (
                  <span className="ml-1 text-xs text-gray-400">
                    {counts[value as keyof LeadCounts] ?? 0}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <caption className="sr-only">Customer leads</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Vehicle Interest</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Source</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No leads match your filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="group transition-colors hover:bg-surface-muted/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {lead.first_name} {lead.last_name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{lead.email}</p>
                      {lead.phone && (
                        <p className="text-xs text-gray-500">{lead.phone}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {lead.vehicle_interest || "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatSource(lead.source)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {(QUICK_STATUS_TRANSITIONS[lead.status] ?? []).map(
                          (nextStatus) => (
                            <form
                              key={nextStatus}
                              action={`/api/admin/leads/${lead.id}/status`}
                              method="POST"
                            >
                              <input
                                type="hidden"
                                name="status"
                                value={nextStatus}
                              />
                              <button
                                type="submit"
                                className="rounded border border-surface-border px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-surface-muted hover:text-gray-900"
                                aria-label={`Update ${lead.first_name} ${lead.last_name} to ${nextStatus}`}
                              >
                                {formatStatusLabel(nextStatus)}
                              </button>
                            </form>
                          ),
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            aria-label="Leads pagination"
            className="flex items-center justify-between border-t border-surface-border px-4 py-3"
          >
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} leads)
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildUrl({ page: String(page - 1) })}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
                >
                  Previous
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildUrl({ page: String(page + 1) })}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
                >
                  Next
                </a>
              )}
            </div>
          </nav>
        )}
      </div>
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

function formatStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "New",
    contacted: "Mark Contacted",
    qualified: "Mark Qualified",
    appointment_set: "Set Appt",
    sold: "Mark Sold",
    lost: "Mark Lost",
  };
  return map[status] ?? status;
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

function UsersSmallIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.27.308 6.023 6.023 0 0 1-2.27-.308" />
    </svg>
  );
}
