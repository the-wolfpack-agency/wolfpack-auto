/**
 * Vehicle query functions — parameterized SQL only.
 */

import { query } from "@/lib/db";
import type {
  Vehicle,
  VehicleListItem,
  InventoryFilters,
} from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface WhereClause {
  conditions: string[];
  params: unknown[];
}

/**
 * Build parameterized WHERE conditions from InventoryFilters.
 * The first param index ($N) starts at `startIdx`.
 */
function buildFilterClauses(
  filters: InventoryFilters,
  startIdx: number,
): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  if (filters.make) {
    conditions.push(`make = $${idx++}`);
    params.push(filters.make);
  }
  if (filters.model) {
    conditions.push(`model = $${idx++}`);
    params.push(filters.model);
  }
  if (filters.year_min != null) {
    conditions.push(`year >= $${idx++}`);
    params.push(filters.year_min);
  }
  if (filters.year_max != null) {
    conditions.push(`year <= $${idx++}`);
    params.push(filters.year_max);
  }
  if (filters.price_min != null) {
    conditions.push(`price >= $${idx++}`);
    params.push(filters.price_min);
  }
  if (filters.price_max != null) {
    conditions.push(`price <= $${idx++}`);
    params.push(filters.price_max);
  }
  if (filters.mileage_max != null) {
    conditions.push(`mileage <= $${idx++}`);
    params.push(filters.mileage_max);
  }
  if (filters.condition) {
    conditions.push(`condition = $${idx++}`);
    params.push(filters.condition);
  }
  if (filters.body_style) {
    conditions.push(`body_style = $${idx++}`);
    params.push(filters.body_style);
  }
  if (filters.fuel_type) {
    conditions.push(`fuel_type = $${idx++}`);
    params.push(filters.fuel_type);
  }
  if (filters.transmission) {
    conditions.push(`transmission = $${idx++}`);
    params.push(filters.transmission);
  }
  if (filters.drivetrain) {
    conditions.push(`drivetrain = $${idx++}`);
    params.push(filters.drivetrain);
  }
  if (filters.exterior_color) {
    conditions.push(`exterior_color = $${idx++}`);
    params.push(filters.exterior_color);
  }

  return { conditions, params };
}

function sortClause(sortBy: InventoryFilters["sort_by"]): string {
  switch (sortBy) {
    case "price_asc":
      return "price ASC";
    case "price_desc":
      return "price DESC";
    case "mileage_asc":
      return "mileage ASC";
    case "year_desc":
      return "year DESC";
    case "newest":
      return "created_at DESC";
    default:
      return "created_at DESC";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Paginated, filterable vehicle list for a dealer's SRP.
 */
export async function getVehicles(
  dealerId: string,
  filters: InventoryFilters = {},
  page = 1,
  pageSize = 24,
): Promise<VehicleListItem[]> {
  const offset = (page - 1) * pageSize;

  // $1 = dealer_id, dynamic filters start at $2
  const { conditions, params } = buildFilterClauses(filters, 2);

  const where =
    `dealer_id = $1` +
    (conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "");

  const order = sortClause(filters.sort_by);

  const paramIdx = params.length + 2; // next available index
  const sql = `
    SELECT
      id, vin, year, make, model, trim,
      price, mileage, condition, status,
      exterior_color,
      (photos->0->>'url') AS photo_url,
      dealer_id
    FROM vehicles
    WHERE ${where}
    ORDER BY ${order}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  const result = await query(sql, [
    dealerId,
    ...params,
    pageSize,
    offset,
  ]);
  return result.rows as any[];
}

/**
 * Single vehicle lookup by VIN for a specific dealer.
 */
export async function getVehicleByVin(
  dealerId: string,
  vin: string,
): Promise<Vehicle | null> {
  const result = await query(
    `SELECT * FROM vehicles WHERE dealer_id = $1 AND vin = $2 LIMIT 1`,
    [dealerId, vin],
  );
  return result.rows as any[][0] ?? null;
}

/**
 * Total count for pagination.
 */
export async function getVehicleCount(
  dealerId: string,
  filters: InventoryFilters = {},
): Promise<number> {
  const { conditions, params } = buildFilterClauses(filters, 2);

  const where =
    `dealer_id = $1` +
    (conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "");

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vehicles WHERE ${where}`,
    [dealerId, ...params],
  );
  return parseInt((result.rows as any[])[0]?.count ?? "0", 10);
}

/**
 * Facet counts for the filter sidebar (make, body_style, year, condition).
 */
export async function getFacetCounts(
  dealerId: string,
): Promise<{
  makes: { value: string; count: number }[];
  body_styles: { value: string; count: number }[];
  years: { value: number; count: number }[];
  conditions: { value: string; count: number }[];
}> {
  const [makes, bodyStyles, years, conditions] = await Promise.all([
    query<{ value: string; count: string }>(
      `SELECT make AS value, COUNT(*)::text AS count
       FROM vehicles WHERE dealer_id = $1 AND status = 'available'
       GROUP BY make ORDER BY count DESC`,
      [dealerId],
    ),
    query<{ value: string; count: string }>(
      `SELECT body_style AS value, COUNT(*)::text AS count
       FROM vehicles WHERE dealer_id = $1 AND status = 'available'
       GROUP BY body_style ORDER BY count DESC`,
      [dealerId],
    ),
    query<{ value: string; count: string }>(
      `SELECT year::text AS value, COUNT(*)::text AS count
       FROM vehicles WHERE dealer_id = $1 AND status = 'available'
       GROUP BY year ORDER BY year DESC`,
      [dealerId],
    ),
    query<{ value: string; count: string }>(
      `SELECT condition AS value, COUNT(*)::text AS count
       FROM vehicles WHERE dealer_id = $1 AND status = 'available'
       GROUP BY condition ORDER BY count DESC`,
      [dealerId],
    ),
  ]);

  const toFacet = (rows: { value: string; count: string }[]) =>
    rows.map((r) => ({ value: r.value, count: parseInt(r.count, 10) }));

  return {
    makes: toFacet(makes.rows),
    body_styles: toFacet(bodyStyles.rows),
    years: toFacet(years.rows).map((r) => ({
      value: parseInt(String(r.value), 10),
      count: r.count,
    })),
    conditions: toFacet(conditions.rows),
  };
}

/**
 * Full-text search across vehicle inventory.
 */
export async function searchVehicles(
  dealerId: string,
  searchQuery: string,
  page = 1,
  pageSize = 24,
): Promise<VehicleListItem[]> {
  const offset = (page - 1) * pageSize;

  const result = await query(
    `SELECT
       id, vin, year, make, model, trim,
       price, mileage, condition, status,
       exterior_color,
       (photos->0->>'url') AS photo_url,
       dealer_id,
       ts_rank(search_vector, plainto_tsquery('english', $2)) AS rank
     FROM vehicles
     WHERE dealer_id = $1
       AND search_vector @@ plainto_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $3 OFFSET $4`,
    [dealerId, searchQuery, pageSize, offset],
  );
  return result.rows as any[];
}
