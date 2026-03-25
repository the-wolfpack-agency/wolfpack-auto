import { esClient, VEHICLES_INDEX } from "@/lib/elasticsearch";
import type { Vehicle, InventoryFilters } from "@/types/vehicle";

// ── Types ───────────────────────────────────────────────────────────

export type SortOption =
  | "price_asc"
  | "price_desc"
  | "mileage_asc"
  | "year_desc"
  | "days_on_lot_desc"
  | "newest";

export interface SearchResult {
  vehicles: VehicleHit[];
  total: number;
  page: number;
  page_size: number;
}

export interface VehicleHit {
  vin: string;
  stock_number: string;
  dealer_id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  price: number;
  internet_price: number | null;
  mileage: number;
  condition: string;
  status: string;
  photo_url: string | null;
  photo_count: number;
  days_on_lot: number;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface FacetResults {
  make: FacetBucket[];
  model: FacetBucket[];
  body_style: FacetBucket[];
  year: FacetBucket[];
  condition: FacetBucket[];
  price_ranges: FacetBucket[];
}

// ── Sort mapping ────────────────────────────────────────────────────

const SORT_MAP: Record<SortOption, Record<string, "asc" | "desc">[]> = {
  price_asc: [{ price: "asc" }],
  price_desc: [{ price: "desc" }],
  mileage_asc: [{ mileage: "asc" }],
  year_desc: [{ year: "desc" }],
  days_on_lot_desc: [{ days_on_lot: "desc" }],
  newest: [{ created_at: "desc" }],
};

// ── Filter builder ──────────────────────────────────────────────────

function buildFilterClauses(
  dealerId: string,
  filters: InventoryFilters,
): Record<string, unknown>[] {
  const must: Record<string, unknown>[] = [
    { term: { dealer_id: dealerId } },
    { term: { status: "available" } },
  ];

  if (filters.make) must.push({ term: { make: filters.make } });
  if (filters.model) must.push({ term: { model: filters.model } });
  if (filters.body_style) must.push({ term: { body_style: filters.body_style } });
  if (filters.condition) must.push({ term: { condition: filters.condition } });
  if (filters.fuel_type) must.push({ term: { fuel_type: filters.fuel_type } });
  if (filters.transmission) must.push({ term: { transmission: filters.transmission } });
  if (filters.drivetrain) must.push({ term: { drivetrain: filters.drivetrain } });
  if (filters.exterior_color) must.push({ term: { exterior_color: filters.exterior_color } });

  // Range filters
  if (filters.year_min !== undefined || filters.year_max !== undefined) {
    const range: Record<string, number> = {};
    if (filters.year_min !== undefined) range.gte = filters.year_min;
    if (filters.year_max !== undefined) range.lte = filters.year_max;
    must.push({ range: { year: range } });
  }

  if (filters.price_min !== undefined || filters.price_max !== undefined) {
    const range: Record<string, number> = {};
    if (filters.price_min !== undefined) range.gte = filters.price_min;
    if (filters.price_max !== undefined) range.lte = filters.price_max;
    must.push({ range: { price: range } });
  }

  if (filters.mileage_max !== undefined) {
    must.push({ range: { mileage: { lte: filters.mileage_max } } });
  }

  return must;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Full-text search with faceted filtering.
 */
export async function searchVehicles(
  dealerId: string,
  filters: InventoryFilters,
  query?: string,
  page: number = 1,
  pageSize: number = 24,
): Promise<SearchResult> {
  const from = (page - 1) * pageSize;
  const filterClauses = buildFilterClauses(dealerId, filters);
  const sortOption = filters.sort_by ?? "newest";
  const sort = SORT_MAP[sortOption] ?? SORT_MAP.newest;

  const body: Record<string, unknown> = {
    from,
    size: pageSize,
    sort,
    _source: [
      "vin", "stock_number", "dealer_id", "year", "make", "model", "trim",
      "body_style", "exterior_color", "price", "internet_price", "mileage",
      "condition", "status", "photo_url", "photo_count", "days_on_lot",
    ],
    query: {
      bool: {
        filter: filterClauses,
        ...(query
          ? {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ["searchable^3", "description", "features", "vin"],
                    type: "best_fields",
                    fuzziness: "AUTO",
                  },
                },
              ],
            }
          : {}),
      },
    },
  };

  const response = await esClient.search({
    index: VEHICLES_INDEX,
    body,
  });

  const hits = response.hits.hits;
  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const vehicles: VehicleHit[] = hits.map((hit) => hit._source as VehicleHit);

  return { vehicles, total, page, page_size: pageSize };
}

/**
 * Aggregation queries for filter sidebar facet counts.
 */
export async function getFacets(dealerId: string): Promise<FacetResults> {
  const response = await esClient.search({
    index: VEHICLES_INDEX,
    body: {
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { dealer_id: dealerId } },
            { term: { status: "available" } },
          ],
        },
      },
      aggs: {
        make: { terms: { field: "make", size: 50 } },
        model: { terms: { field: "model", size: 100 } },
        body_style: { terms: { field: "body_style", size: 20 } },
        year: { terms: { field: "year", size: 20, order: { _key: "desc" } } },
        condition: { terms: { field: "condition", size: 5 } },
        price_ranges: {
          range: {
            field: "price",
            ranges: [
              { key: "Under $10,000", to: 10_000 },
              { key: "$10,000 - $20,000", from: 10_000, to: 20_000 },
              { key: "$20,000 - $30,000", from: 20_000, to: 30_000 },
              { key: "$30,000 - $50,000", from: 30_000, to: 50_000 },
              { key: "$50,000 - $75,000", from: 50_000, to: 75_000 },
              { key: "Over $75,000", from: 75_000 },
            ],
          },
        },
      },
    },
  });

  const aggs = response.aggregations as Record<string, unknown> | undefined;

  function extractBuckets(
    aggName: string,
  ): FacetBucket[] {
    const agg = aggs?.[aggName] as { buckets?: Array<{ key: string | number; doc_count: number }> } | undefined;
    return (
      agg?.buckets?.map((b) => ({
        key: String(b.key),
        count: b.doc_count,
      })) ?? []
    );
  }

  return {
    make: extractBuckets("make"),
    model: extractBuckets("model"),
    body_style: extractBuckets("body_style"),
    year: extractBuckets("year"),
    condition: extractBuckets("condition"),
    price_ranges: extractBuckets("price_ranges"),
  };
}

/**
 * Index or update a single vehicle document.
 */
export async function indexVehicle(vehicle: Vehicle): Promise<void> {
  const primaryPhoto = vehicle.photos.find((p) => p.is_primary);
  const daysOnLot = Math.floor(
    (Date.now() - new Date(vehicle.created_at).getTime()) / (1000 * 60 * 60 * 24),
  );

  await esClient.index({
    index: VEHICLES_INDEX,
    id: `${vehicle.dealer_id}:${vehicle.vin}`,
    body: {
      vin: vehicle.vin,
      stock_number: vehicle.stock_number,
      dealer_id: vehicle.dealer_id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      body_style: vehicle.body_style,
      exterior_color: vehicle.exterior_color,
      interior_color: vehicle.interior_color,
      engine: vehicle.engine,
      transmission: vehicle.transmission,
      drivetrain: vehicle.drivetrain,
      fuel_type: vehicle.fuel_type,
      mpg_city: vehicle.mpg_city,
      mpg_highway: vehicle.mpg_highway,
      msrp: vehicle.msrp,
      price: vehicle.price,
      internet_price: vehicle.internet_price,
      condition: vehicle.condition,
      mileage: vehicle.mileage,
      status: vehicle.status,
      description: vehicle.description,
      features: vehicle.features.join(" "),
      photo_url: primaryPhoto?.url ?? null,
      photo_count: vehicle.photo_count,
      created_at: vehicle.created_at,
      updated_at: vehicle.updated_at,
      days_on_lot: daysOnLot,
    },
    refresh: false,
  });
}

/**
 * Remove a vehicle from the search index.
 */
export async function removeVehicle(
  dealerId: string,
  vin: string,
): Promise<void> {
  await esClient.delete({
    index: VEHICLES_INDEX,
    id: `${dealerId}:${vin}`,
    refresh: false,
  }).catch((err) => {
    // 404 is fine — vehicle may not be indexed
    if (err?.meta?.statusCode !== 404) throw err;
  });
}

/**
 * Bulk reindex all vehicles for a dealer.
 *
 * Deletes existing documents for the dealer first, then indexes
 * the new set in a single bulk request.
 */
export async function reindexDealer(
  dealerId: string,
  vehicles: Vehicle[],
): Promise<void> {
  // Delete existing dealer docs
  await esClient.deleteByQuery({
    index: VEHICLES_INDEX,
    body: {
      query: { term: { dealer_id: dealerId } },
    },
    refresh: true,
  });

  if (vehicles.length === 0) return;

  // Build bulk body
  const operations = vehicles.flatMap((vehicle) => {
    const primaryPhoto = vehicle.photos.find((p) => p.is_primary);
    const daysOnLot = Math.floor(
      (Date.now() - new Date(vehicle.created_at).getTime()) / (1000 * 60 * 60 * 24),
    );

    return [
      { index: { _index: VEHICLES_INDEX, _id: `${dealerId}:${vehicle.vin}` } },
      {
        vin: vehicle.vin,
        stock_number: vehicle.stock_number,
        dealer_id: vehicle.dealer_id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        body_style: vehicle.body_style,
        exterior_color: vehicle.exterior_color,
        interior_color: vehicle.interior_color,
        engine: vehicle.engine,
        transmission: vehicle.transmission,
        drivetrain: vehicle.drivetrain,
        fuel_type: vehicle.fuel_type,
        mpg_city: vehicle.mpg_city,
        mpg_highway: vehicle.mpg_highway,
        msrp: vehicle.msrp,
        price: vehicle.price,
        internet_price: vehicle.internet_price,
        condition: vehicle.condition,
        mileage: vehicle.mileage,
        status: vehicle.status,
        description: vehicle.description,
        features: vehicle.features.join(" "),
        photo_url: primaryPhoto?.url ?? null,
        photo_count: vehicle.photo_count,
        created_at: vehicle.created_at,
        updated_at: vehicle.updated_at,
        days_on_lot: daysOnLot,
      },
    ];
  });

  const bulkResponse = await esClient.bulk({ body: operations, refresh: true });

  if (bulkResponse.errors) {
    const errorItems = bulkResponse.items
      .filter((item) => item.index?.error)
      .slice(0, 5);
    console.error(
      `[inventory-search] Bulk reindex errors for dealer ${dealerId}:`,
      JSON.stringify(errorItems),
    );
  }
}
