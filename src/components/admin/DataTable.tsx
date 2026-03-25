/**
 * Reusable sortable data table with pagination.
 *
 * Server-component-friendly: accepts pre-sorted data and renders
 * sort links + pagination links as plain anchors with search params.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** If true, column header becomes a sort link */
  sortable?: boolean;
  render: (row: T, index: number) => React.ReactNode;
  /** Optional: SR-only description of column content */
  srLabel?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Current sort field */
  sortBy?: string;
  /** Current sort direction */
  sortDir?: "asc" | "desc";
  /** Base URL path for sort/pagination links */
  basePath: string;
  /** Current search params to preserve in links */
  searchParams?: Record<string, string>;
  /** Pagination */
  page?: number;
  pageSize?: number;
  totalCount?: number;
  /** Accessible table caption */
  caption: string;
  /** Optional: when no data */
  emptyMessage?: string;
}

function buildUrl(
  basePath: string,
  params: Record<string, string>,
): string {
  const sp = new URLSearchParams(params);
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function DataTable<T>({
  columns,
  data,
  sortBy,
  sortDir = "asc",
  basePath,
  searchParams = {},
  page = 1,
  pageSize = 25,
  totalCount,
  caption,
  emptyMessage = "No records found.",
}: DataTableProps<T>) {
  const totalPages =
    totalCount !== undefined ? Math.ceil(totalCount / pageSize) : undefined;

  function sortUrl(columnKey: string): string {
    const nextDir =
      sortBy === columnKey && sortDir === "asc" ? "desc" : "asc";
    return buildUrl(basePath, {
      ...searchParams,
      sort: columnKey,
      dir: nextDir,
      page: "1",
    });
  }

  function pageUrl(targetPage: number): string {
    return buildUrl(basePath, {
      ...searchParams,
      ...(sortBy ? { sort: sortBy, dir: sortDir } : {}),
      page: String(targetPage),
    });
  }

  return (
    <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-border">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  {col.sortable ? (
                    <a
                      href={sortUrl(col.key)}
                      className="group inline-flex items-center gap-1 hover:text-gray-700"
                      aria-label={`Sort by ${col.header}${
                        sortBy === col.key
                          ? sortDir === "asc"
                            ? ", currently ascending"
                            : ", currently descending"
                          : ""
                      }`}
                    >
                      {col.header}
                      {sortBy === col.key && (
                        <span aria-hidden="true" className="text-brand-600">
                          {sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </a>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={idx}
                  className="transition-colors hover:bg-surface-muted/50"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="whitespace-nowrap px-4 py-3 text-sm text-gray-700"
                    >
                      {col.render(row, idx)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages !== undefined && totalPages > 1 && (
        <nav
          aria-label="Table pagination"
          className="flex items-center justify-between border-t border-surface-border px-4 py-3"
        >
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
            {totalCount !== undefined && (
              <span className="ml-1">({totalCount} total)</span>
            )}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={pageUrl(page - 1)}
                className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={pageUrl(page + 1)}
                className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
              >
                Next
              </a>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
