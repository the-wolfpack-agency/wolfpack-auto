import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getInventoryVehicles, getVehicleFacets } from "@/lib/data";

/**
 * Query parameter schema — all optional.
 */
const searchParamsSchema = z.object({
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
  /** EV filter: pass ev_only=true to return only electric vehicles */
  ev_only: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Minimum EV range in miles */
  ev_range_min: z.coerce.number().int().min(0).optional(),
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

  const { make, condition, sort, ev_only, ev_range_min } = parsed.data;

  try {
    const [inventoryResult, facetsResult] = await Promise.all([
      getInventoryVehicles({
        make,
        condition,
        sort,
        ev_only: ev_only || undefined,
        ev_range_min,
      }),
      getVehicleFacets(),
    ]);

    return NextResponse.json({
      vehicles: inventoryResult.data,
      total: inventoryResult.data.length,
      page: parsed.data.page,
      page_size: parsed.data.page_size,
      facets: facetsResult.data,
      source: inventoryResult.source,
    });
  } catch (err) {
    console.error("[api/inventory] Search failed:", err);

    return NextResponse.json(
      { error: "Search service temporarily unavailable" },
      { status: 503 },
    );
  }
}
