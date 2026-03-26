/**
 * Data access layer with graceful fallback to placeholder data.
 *
 * Every public function tries the real database first.  If the DB
 * connection fails (no DATABASE_URL, Docker not running, etc.) it
 * silently falls back to the placeholder dataset so the site still
 * renders on Vercel or in local dev without infrastructure.
 */

import { query } from "@/lib/db";
import {
  placeholderVehicles,
  placeholderFeaturedVehicles,
  placeholderLeads,
  placeholderDashboardStats,
  placeholderFacets,
  placeholderSimilarVehicles,
  type PlaceholderVehicle,
  type PlaceholderLead,
  type PlaceholderDashboardStats,
  type PlaceholderFacets,
} from "@/lib/placeholder-data";
import type { InventoryFilters } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type DataSource = "database" | "placeholder";

interface WithSource<T> {
  data: T;
  source: DataSource;
}

const DEALER_ID = process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/** Return true when there is no DATABASE_URL configured at all. */
function dbUnavailable(): boolean {
  return !process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  msrp: number;
  mileage: number;
  fuel: string;
  transmission: string;
  gradient: string;
  condition: string;
  bodyStyle: string;
  photo: string;
}

function toInventoryVehicle(p: PlaceholderVehicle): InventoryVehicle {
  return {
    vin: p.vin,
    year: p.year,
    make: p.make,
    model: p.model,
    trim: p.trim,
    price: p.price,
    msrp: p.msrp,
    mileage: p.mileage,
    fuel: p.fuel,
    transmission: p.transmission,
    gradient: p.gradient,
    condition: p.condition,
    bodyStyle: p.bodyStyle,
    photo: p.photo,
  };
}

function applyPlaceholderFilters(
  vehicles: PlaceholderVehicle[],
  filters?: { make?: string; condition?: string; sort?: string; q?: string },
): PlaceholderVehicle[] {
  let result = [...vehicles];

  if (filters?.q) {
    const tokens = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
    result = result.filter((v) => {
      const searchable = [
        v.make, v.model, v.trim, v.bodyStyle, v.fuel, v.drivetrain,
        v.exteriorColor, v.condition, v.engine, String(v.year),
        ...v.features,
      ].join(" ").toLowerCase();
      return tokens.every((t) => searchable.includes(t));
    });
  }

  if (filters?.make) {
    result = result.filter(
      (v) => v.make.toLowerCase() === filters.make!.toLowerCase(),
    );
  }
  if (filters?.condition) {
    result = result.filter(
      (v) => v.condition.toLowerCase() === filters.condition!.toLowerCase(),
    );
  }

  switch (filters?.sort) {
    case "price_asc":
      result.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      result.sort((a, b) => b.price - a.price);
      break;
    case "mileage_asc":
      result.sort((a, b) => a.mileage - b.mileage);
      break;
    case "year_desc":
      result.sort((a, b) => b.year - a.year);
      break;
    default:
      // "newest" or undefined — keep insertion order (newest first)
      break;
  }

  return result;
}

/**
 * Get inventory vehicles with optional filters.
 */
export async function getInventoryVehicles(
  filters?: { make?: string; condition?: string; sort?: string; q?: string },
): Promise<WithSource<InventoryVehicle[]>> {
  if (dbUnavailable()) {
    return {
      data: applyPlaceholderFilters(placeholderVehicles, filters).map(
        toInventoryVehicle,
      ),
      source: "placeholder",
    };
  }

  try {
    const conditions: string[] = ["dealer_id = $1"];
    const params: unknown[] = [DEALER_ID];
    let idx = 2;

    if (filters?.make) {
      conditions.push(`make = $${idx++}`);
      params.push(filters.make);
    }
    if (filters?.condition) {
      conditions.push(`condition = $${idx++}`);
      params.push(filters.condition.toLowerCase());
    }

    const where = conditions.join(" AND ");

    let orderBy = "created_at DESC";
    switch (filters?.sort) {
      case "price_asc":
        orderBy = "price ASC";
        break;
      case "price_desc":
        orderBy = "price DESC";
        break;
      case "mileage_asc":
        orderBy = "mileage ASC";
        break;
      case "year_desc":
        orderBy = "year DESC";
        break;
    }

    const result = await query(
      `SELECT vin, year, make, model, trim, price,
              COALESCE(msrp, price) AS msrp, mileage,
              fuel_type AS fuel, transmission, condition, body_style,
              exterior_color
       FROM vehicles
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT 100`,
      params,
    );

    const vehicles: InventoryVehicle[] = (result.rows as any[]).map((r) => ({
      vin: r.vin,
      year: r.year,
      make: r.make,
      model: r.model,
      trim: r.trim ?? "",
      price: Number(r.price),
      msrp: Number(r.msrp),
      mileage: Number(r.mileage),
      fuel: r.fuel ?? "Gasoline",
      transmission: r.transmission ?? "Automatic",
      gradient: "from-brand-400 to-brand-600",
      condition: r.condition ?? "used",
      bodyStyle: r.body_style ?? "Sedan",
      photo: r.photo_url ?? "",
    }));

    return { data: vehicles, source: "database" };
  } catch (err) {
    console.error("[data] getInventoryVehicles DB error, falling back:", err);
    return {
      data: applyPlaceholderFilters(placeholderVehicles, filters).map(
        toInventoryVehicle,
      ),
      source: "placeholder",
    };
  }
}

// ---------------------------------------------------------------------------
// Single vehicle (VDP)
// ---------------------------------------------------------------------------

export interface VehicleDetail {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  msrp: number;
  mileage: number;
  exteriorColor: string;
  interiorColor: string;
  transmission: string;
  drivetrain: string;
  fuelType: string;
  engine: string;
  mpg: string;
  stockNumber: string;
  features: string[];
  gradient: string;
  condition: string;
  photo: string;
  thumbnail: string;
  similarVehicles: {
    year: number;
    make: string;
    model: string;
    price: number;
    mileage: number;
    gradient: string;
    vin: string;
    photo: string;
  }[];
}

export async function getVehicleByVin(
  vin: string,
): Promise<WithSource<VehicleDetail | null>> {
  if (dbUnavailable()) {
    const found = placeholderVehicles.find(
      (v) => v.vin.toLowerCase() === vin.toLowerCase(),
    );
    if (!found) return { data: null, source: "placeholder" };
    return {
      data: placeholderToDetail(found),
      source: "placeholder",
    };
  }

  try {
    const result = await query(
      `SELECT * FROM vehicles WHERE dealer_id = $1 AND vin = $2 LIMIT 1`,
      [DEALER_ID, vin],
    );

    const row = (result.rows as any[])[0];
    if (!row) {
      // Fall back to placeholder lookup
      const found = placeholderVehicles.find(
        (v) => v.vin.toLowerCase() === vin.toLowerCase(),
      );
      if (!found) return { data: null, source: "placeholder" };
      return { data: placeholderToDetail(found), source: "placeholder" };
    }

    const detail: VehicleDetail = {
      vin: row.vin,
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim ?? "",
      price: Number(row.price),
      msrp: Number(row.msrp ?? row.price),
      mileage: Number(row.mileage),
      exteriorColor: row.exterior_color ?? "Unknown",
      interiorColor: row.interior_color ?? "Unknown",
      transmission: row.transmission ?? "Automatic",
      drivetrain: row.drivetrain ?? "FWD",
      fuelType: row.fuel_type ?? "Gasoline",
      engine: row.engine ?? "Unknown",
      mpg: row.mpg_city && row.mpg_highway
        ? `${row.mpg_city} city / ${row.mpg_highway} hwy`
        : "N/A",
      stockNumber: row.stock_number ?? "",
      features: Array.isArray(row.features) ? row.features : [],
      gradient: "from-brand-400 to-brand-600",
      condition: row.condition ?? "used",
      photo: row.photo_url ?? "",
      thumbnail: row.thumbnail_url ?? "",
      similarVehicles: placeholderSimilarVehicles,
    };

    return { data: detail, source: "database" };
  } catch (err) {
    console.error("[data] getVehicleByVin DB error, falling back:", err);
    const found = placeholderVehicles.find(
      (v) => v.vin.toLowerCase() === vin.toLowerCase(),
    );
    if (!found) return { data: null, source: "placeholder" };
    return { data: placeholderToDetail(found), source: "placeholder" };
  }
}

function placeholderToDetail(p: PlaceholderVehicle): VehicleDetail {
  return {
    vin: p.vin,
    year: p.year,
    make: p.make,
    model: p.model,
    trim: p.trim,
    price: p.price,
    msrp: p.msrp,
    mileage: p.mileage,
    exteriorColor: p.exteriorColor,
    interiorColor: p.interiorColor,
    transmission: p.transmission,
    drivetrain: p.drivetrain,
    fuelType: p.fuel,
    engine: p.engine,
    mpg: p.mpg,
    stockNumber: p.stockNumber,
    features: p.features,
    gradient: p.gradient,
    condition: p.condition,
    photo: p.photo,
    thumbnail: p.thumbnail,
    similarVehicles: placeholderSimilarVehicles,
  };
}

// ---------------------------------------------------------------------------
// Featured vehicles (homepage)
// ---------------------------------------------------------------------------

export interface FeaturedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  mileage: number;
  gradient: string;
  tag: string;
  photo: string;
}

export async function getFeaturedVehicles(
  limit = 4,
): Promise<WithSource<FeaturedVehicle[]>> {
  if (dbUnavailable()) {
    return {
      data: placeholderFeaturedVehicles.slice(0, limit),
      source: "placeholder",
    };
  }

  try {
    const result = await query(
      `SELECT vin, year, make, model, trim, price, mileage, condition
       FROM vehicles
       WHERE dealer_id = $1 AND status = 'available'
       ORDER BY created_at DESC, mileage ASC
       LIMIT $2`,
      [DEALER_ID, limit],
    );

    if ((result.rows as any[]).length === 0) {
      return {
        data: placeholderFeaturedVehicles.slice(0, limit),
        source: "placeholder",
      };
    }

    const vehicles: FeaturedVehicle[] = (result.rows as any[]).map((r) => ({
      vin: r.vin,
      year: r.year,
      make: r.make,
      model: `${r.model}${r.trim ? ` ${r.trim}` : ""}`,
      price: Number(r.price),
      mileage: Number(r.mileage),
      gradient: "from-brand-400 to-brand-600",
      tag: r.condition === "new" ? "New Arrival" : r.condition === "certified" ? "Certified" : "Pre-Owned",
      photo: r.photo_url ?? "",
    }));

    return { data: vehicles, source: "database" };
  } catch (err) {
    console.error("[data] getFeaturedVehicles DB error, falling back:", err);
    return {
      data: placeholderFeaturedVehicles.slice(0, limit),
      source: "placeholder",
    };
  }
}

// ---------------------------------------------------------------------------
// Facets (filter sidebar)
// ---------------------------------------------------------------------------

export async function getVehicleFacets(): Promise<WithSource<PlaceholderFacets>> {
  if (dbUnavailable()) {
    return { data: placeholderFacets, source: "placeholder" };
  }

  try {
    const [makes, conditions, bodyStyles, years] = await Promise.all([
      query<{ value: string; count: string }>(
        `SELECT make AS value, COUNT(*)::text AS count
         FROM vehicles WHERE dealer_id = $1 AND status = 'available'
         GROUP BY make ORDER BY count DESC`,
        [DEALER_ID],
      ),
      query<{ value: string; count: string }>(
        `SELECT condition AS value, COUNT(*)::text AS count
         FROM vehicles WHERE dealer_id = $1 AND status = 'available'
         GROUP BY condition ORDER BY count DESC`,
        [DEALER_ID],
      ),
      query<{ value: string; count: string }>(
        `SELECT body_style AS value, COUNT(*)::text AS count
         FROM vehicles WHERE dealer_id = $1 AND status = 'available'
         GROUP BY body_style ORDER BY count DESC`,
        [DEALER_ID],
      ),
      query<{ value: string; count: string }>(
        `SELECT year::text AS value, COUNT(*)::text AS count
         FROM vehicles WHERE dealer_id = $1 AND status = 'available'
         GROUP BY year ORDER BY year DESC`,
        [DEALER_ID],
      ),
    ]);

    const toFacet = (rows: any[]) =>
      rows.map((r: any) => ({ value: r.value, count: parseInt(r.count, 10) }));

    const facets: PlaceholderFacets = {
      makes: toFacet(makes.rows),
      conditions: toFacet(conditions.rows),
      bodyStyles: toFacet(bodyStyles.rows),
      years: toFacet(years.rows).map((r: { value: string; count: number }) => ({
        value: parseInt(r.value as string, 10),
        count: r.count,
      })),
    };

    return { data: facets, source: "database" };
  } catch (err) {
    console.error("[data] getVehicleFacets DB error, falling back:", err);
    return { data: placeholderFacets, source: "placeholder" };
  }
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export async function getDashboardStats(): Promise<
  WithSource<PlaceholderDashboardStats>
> {
  if (dbUnavailable()) {
    return { data: placeholderDashboardStats, source: "placeholder" };
  }

  try {
    const [vehicleRows, leadRows, avgDaysRows] = await Promise.all([
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
         FROM vehicles WHERE dealer_id = $1
         GROUP BY status`,
        [DEALER_ID],
      ),
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
         FROM leads WHERE dealer_id = $1
         GROUP BY status`,
        [DEALER_ID],
      ),
      query<{ avg_days: string }>(
        `SELECT COALESCE(
           ROUND(AVG(EXTRACT(EPOCH FROM (now() - created_at)) / 86400))::text,
           '0'
         ) AS avg_days
         FROM vehicles
         WHERE dealer_id = $1 AND status = 'available'`,
        [DEALER_ID],
      ),
    ]);

    const vehicles = { total: 0, available: 0, pending: 0, sold: 0 };
    for (const row of vehicleRows.rows as any[]) {
      const count = parseInt(row.count, 10);
      vehicles.total += count;
      if (row.status in vehicles) {
        vehicles[row.status as keyof typeof vehicles] = count;
      }
    }

    const leads = {
      total: 0,
      new: 0,
      contacted: 0,
      qualified: 0,
      appointment_set: 0,
      sold: 0,
      lost: 0,
    };
    for (const row of leadRows.rows as any[]) {
      const count = parseInt(row.count, 10);
      leads.total += count;
      if (row.status in leads) {
        leads[row.status as keyof typeof leads] = count;
      }
    }

    const avgDaysOnLot = parseInt(
      (avgDaysRows.rows as any[])[0]?.avg_days ?? "0",
      10,
    );
    const convertible = leads.total - leads.lost;
    const conversionRate =
      convertible > 0 ? Math.round((leads.sold / convertible) * 100) : 0;

    return {
      data: { vehicles, leads, avgDaysOnLot, conversionRate },
      source: "database",
    };
  } catch (err) {
    console.error("[data] getDashboardStats DB error, falling back:", err);
    return { data: placeholderDashboardStats, source: "placeholder" };
  }
}

// ---------------------------------------------------------------------------
// Recent leads
// ---------------------------------------------------------------------------

export async function getRecentLeads(
  limit = 10,
): Promise<WithSource<PlaceholderLead[]>> {
  if (dbUnavailable()) {
    return {
      data: placeholderLeads.slice(0, limit),
      source: "placeholder",
    };
  }

  try {
    const result = await query(
      `SELECT id, first_name, last_name, email, phone,
              vehicle_interest, source, status, created_at
       FROM leads WHERE dealer_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [DEALER_ID, limit],
    );

    if ((result.rows as any[]).length === 0) {
      return {
        data: placeholderLeads.slice(0, limit),
        source: "placeholder",
      };
    }

    return {
      data: result.rows as unknown as PlaceholderLead[],
      source: "database",
    };
  } catch (err) {
    console.error("[data] getRecentLeads DB error, falling back:", err);
    return {
      data: placeholderLeads.slice(0, limit),
      source: "placeholder",
    };
  }
}
