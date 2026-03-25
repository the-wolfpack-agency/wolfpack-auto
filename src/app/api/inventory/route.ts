import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchVehicles, getFacets } from "@/lib/inventory-search";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { InventoryFilters } from "@/types/vehicle";

/**
 * Query parameter schema — all optional except dealer_id.
 */
const searchParamsSchema = z.object({
  dealer_id: z.string().min(1, "dealer_id is required"),
  make: z.string().optional(),
  model: z.string().optional(),
  year_min: z.coerce.number().int().min(1900).max(2100).optional(),
  year_max: z.coerce.number().int().min(1900).max(2100).optional(),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  body_style: z.string().optional(),
  condition: z.enum(["new", "used", "certified"]).optional(),
  fuel_type: z.enum(["gasoline", "diesel", "electric", "hybrid", "plug_in_hybrid"]).optional(),
  transmission: z.enum(["automatic", "manual", "cvt"]).optional(),
  q: z.string().max(200).optional(),
  sort: z
    .enum(["price_asc", "price_desc", "mileage_asc", "year_desc", "days_on_lot_desc", "newest"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(24),
});

export async function GET(request: NextRequest) {
  // Parse query params
  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = searchParamsSchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const {
    dealer_id,
    make,
    model,
    year_min,
    year_max,
    price_min,
    price_max,
    body_style,
    condition,
    fuel_type,
    transmission,
    q,
    sort,
    page,
    page_size,
  } = parsed.data;

  try {
    // Build filters object
    const filters: InventoryFilters = {
      make,
      model,
      year_min,
      year_max,
      price_min,
      price_max,
      body_style,
      condition,
      fuel_type,
      transmission,
      sort_by: sort,
    };

    // Cache key based on full query fingerprint
    const cacheKeyParts = JSON.stringify({ dealer_id, ...filters, q, page, page_size });
    const searchCacheKey = `inventory:search:${dealer_id}:${Buffer.from(cacheKeyParts).toString("base64url")}`;
    const facetCacheKey = `inventory:facets:${dealer_id}`;

    // Try cache for search results
    const cachedSearch = await cacheGet<Awaited<ReturnType<typeof searchVehicles>>>(searchCacheKey);
    const cachedFacets = await cacheGet<Awaited<ReturnType<typeof getFacets>>>(facetCacheKey);

    // Fetch in parallel, using cache where available
    const [searchResult, facets] = await Promise.all([
      cachedSearch ?? searchVehicles(dealer_id, filters, q, page, page_size),
      cachedFacets ?? getFacets(dealer_id),
    ]);

    // Populate cache (non-blocking)
    if (!cachedSearch) {
      void cacheSet(searchCacheKey, searchResult, 10);
    }
    if (!cachedFacets) {
      void cacheSet(facetCacheKey, facets, 30);
    }

    return NextResponse.json({
      vehicles: searchResult.vehicles,
      total: searchResult.total,
      page: searchResult.page,
      page_size: searchResult.page_size,
      facets,
    });
  } catch (err) {
    console.error("[api/inventory] Search failed:", err);

    return NextResponse.json(
      { error: "Search service temporarily unavailable" },
      { status: 503 },
    );
  }
}
