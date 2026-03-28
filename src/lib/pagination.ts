/**
 * Shared pagination parameter parser.
 * Validates and clamps page/page_size to safe boundaries.
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") ?? "25", 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
