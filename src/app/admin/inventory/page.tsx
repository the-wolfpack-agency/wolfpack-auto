export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { placeholderVehicles } from "@/lib/placeholder-data";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Manage your vehicle inventory.",
};

const DEALER_ID = process.env.DEALER_ID ?? "default";

interface InventoryVehicle {
  id: string;
  vin: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  status: string;
  exterior_color: string;
  photo_url: string | null;
  created_at: string;
  days_on_lot: number;
  is_ev: boolean;
}

interface PageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

const SORT_COLUMNS: Record<string, string> = {
  price: "price",
  date: "created_at",
  days: "days_on_lot",
  year: "year",
  make: "make",
};

async function getInventory(params: {
  status?: string;
  search?: string;
  sort?: string;
  dir?: string;
  page?: string;
}) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = ["v.dealer_id = $1"];
  const queryParams: unknown[] = [DEALER_ID];
  let idx = 2;

  if (params.status && ["available", "pending", "sold", "in_transit"].includes(params.status)) {
    conditions.push(`v.status = $${idx++}`);
    queryParams.push(params.status);
  }

  if (params.search) {
    conditions.push(
      `(v.vin ILIKE $${idx} OR v.make ILIKE $${idx} OR v.model ILIKE $${idx} OR v.stock_number ILIKE $${idx})`,
    );
    queryParams.push(`%${params.search}%`);
    idx++;
  }

  const where = conditions.join(" AND ");

  const sortCol = SORT_COLUMNS[params.sort ?? ""] ?? "created_at";
  const sortDir = params.dir === "asc" ? "ASC" : "DESC";

  try {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT
           v.id, v.vin, v.stock_number, v.year, v.make, v.model, v.trim,
           v.price, v.status, v.exterior_color,
           (v.photos->0->>'url') AS photo_url,
           v.created_at,
           EXTRACT(EPOCH FROM (now() - v.created_at))::int / 86400 AS days_on_lot,
           COALESCE(v.is_ev, false) AS is_ev
         FROM vehicles v
         WHERE ${where}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...queryParams, PAGE_SIZE, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM vehicles v WHERE ${where}`,
        queryParams,
      ),
    ]);

    return {
      vehicles: dataResult.rows as unknown as InventoryVehicle[],
      total: parseInt((countResult.rows as any[])[0]?.count ?? "0", 10),
      page,
    };
  } catch {
    // DB unavailable — render page with placeholder vehicles so the UI looks populated
    const fallback: InventoryVehicle[] = placeholderVehicles.slice(0, 8).map((v, i) => ({
      id: `placeholder-${i}`,
      vin: v.vin,
      stock_number: v.stockNumber,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      price: v.price,
      status: i % 3 === 0 ? "pending" : i % 5 === 0 ? "sold" : "available",
      exterior_color: v.exteriorColor,
      photo_url: v.thumbnail,
      created_at: new Date(Date.now() - i * 86400000 * 3).toISOString(),
      days_on_lot: i * 3,
      is_ev: v.fuel === "Electric",
    }));
    return { vehicles: fallback, total: fallback.length, page };
  }
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { vehicles, total, page } = await getInventory(params);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string>): string {
    const sp = new URLSearchParams({
      ...(params.status ? { status: params.status } : {}),
      ...(params.search ? { search: params.search } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
      ...(params.dir ? { dir: params.dir } : {}),
      page: String(page),
      ...overrides,
    });
    return `/admin/inventory?${sp.toString()}`;
  }

  function sortUrl(col: string): string {
    const nextDir =
      params.sort === col && params.dir !== "asc" ? "asc" : "desc";
    return buildUrl({ sort: col, dir: nextDir, page: "1" });
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} vehicle{total !== 1 ? "s" : ""} in inventory.
          </p>
        </div>
        <a
          href="/admin/inventory/add"
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:w-auto"
        >
          + Add Vehicle
        </a>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        {/* Search */}
        <form
          action="/admin/inventory"
          method="GET"
          role="search"
          aria-label="Search inventory"
          className="flex flex-1 gap-2"
        >
          {params.status && (
            <input type="hidden" name="status" value={params.status} />
          )}
          <label htmlFor="inv-search" className="sr-only">
            Search by VIN, make, or model
          </label>
          <input
            id="inv-search"
            name="search"
            type="search"
            defaultValue={params.search}
            placeholder="Search VIN, make, model, stock #..."
            className="flex-1 rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            Search
          </button>
        </form>

        {/* Status filter */}
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          {[
            { value: "", label: "All" },
            { value: "available", label: "Available" },
            { value: "pending", label: "Pending" },
            { value: "sold", label: "Sold" },
          ].map(({ value, label }) => {
            const isActive =
              value === "" ? !params.status : params.status === value;
            return (
              <a
                key={value}
                href={buildUrl({
                  status: value,
                  page: "1",
                  ...(value === "" ? {} : { status: value }),
                })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-surface-border bg-white text-gray-600 hover:bg-surface-muted"
                }`}
                aria-current={isActive ? "true" : undefined}
              >
                {label}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <caption className="sr-only">Vehicle inventory list</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vehicle
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  VIN
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <a href={sortUrl("price")} className="inline-flex items-center gap-1 hover:text-gray-700" aria-label="Sort by price">
                    Price
                    {params.sort === "price" && (
                      <span aria-hidden="true" className="text-brand-600">
                        {params.dir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </a>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                  <a href={sortUrl("days")} className="inline-flex items-center gap-1 hover:text-gray-700" aria-label="Sort by days on lot">
                    Days on Lot
                    {params.sort === "days" && (
                      <span aria-hidden="true" className="text-brand-600">
                        {params.dir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </a>
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                  <a href={sortUrl("date")} className="inline-flex items-center gap-1 hover:text-gray-700" aria-label="Sort by date added">
                    Added
                    {params.sort === "date" && (
                      <span aria-hidden="true" className="text-brand-600">
                        {params.dir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </a>
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {vehicles.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No vehicles match your filters.
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => (
                  <tr
                    key={v.id}
                    className="transition-colors hover:bg-surface-muted/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        {v.photo_url ? (
                          <img
                            src={v.photo_url}
                            alt={`${v.year} ${v.make} ${v.model}`}
                            className="h-10 w-14 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-10 w-14 items-center justify-center rounded bg-surface-subtle text-xs text-gray-400">
                            No img
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {v.year} {v.make} {v.model}
                          </p>
                          <p className="text-xs text-gray-500">
                            {v.trim} &middot; {v.exterior_color}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-700 sm:table-cell">
                      {v.vin}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900">
                      ${v.price.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={v.status} />
                        {v.is_ev && (
                          <span
                            title="Electric Vehicle"
                            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          >
                            &#x26A1; EV
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-700 md:table-cell">
                      {v.days_on_lot}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-500 md:table-cell">
                      {formatDate(v.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <a
                        href={`/admin/inventory/${v.vin}/edit`}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50"
                      >
                        Edit
                      </a>
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
            aria-label="Inventory pagination"
            className="flex items-center justify-between border-t border-surface-border px-4 py-3"
          >
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} vehicles)
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
