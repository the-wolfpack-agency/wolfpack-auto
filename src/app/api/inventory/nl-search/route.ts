/**
 * Natural Language Inventory Search API
 *
 * POST /api/inventory/nl-search
 *   Body: { query: string }
 *   Returns: { query, parsed_filters, intent_category, keywords_used, vehicles[], total }
 *
 * Parses buyer intent from natural language into structured inventory filters,
 * then returns matching vehicles. Every query is stored for SEO insights.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseNaturalQuery, storeQuery } from "@/lib/nl-search";
import { getInventoryVehicles } from "@/lib/data";
import { trackFilterCombo } from "@/lib/seo-content-signals";

const bodySchema = z.object({
  query: z
    .string()
    .min(1, "Query must not be empty")
    .max(500, "Query too long"),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(`nl-search:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { query } = parsed.data;

  try {
    // Parse natural language into structured filters
    const nlResult = parseNaturalQuery(query);
    const { parsed_filters } = nlResult;

    // Build inventory query from parsed filters
    const inventoryFilters: Record<string, string | undefined> = {};
    if (parsed_filters.make) inventoryFilters.make = parsed_filters.make;
    if (parsed_filters.condition) inventoryFilters.condition = parsed_filters.condition;
    if (parsed_filters.body_type) {
      inventoryFilters.body_style = Array.isArray(parsed_filters.body_type)
        ? parsed_filters.body_type[0]
        : parsed_filters.body_type;
    }

    // Fetch matching inventory
    const { data: vehicles } = await getInventoryVehicles({
      make: inventoryFilters.make,
      condition: inventoryFilters.condition,
    });

    // Apply additional client-side filters that the data layer may not support
    let filtered = vehicles;

    if (parsed_filters.max_price) {
      filtered = filtered.filter((v) => v.price <= parsed_filters.max_price!);
    }
    if (parsed_filters.min_price) {
      filtered = filtered.filter((v) => v.price >= parsed_filters.min_price!);
    }
    if (parsed_filters.year_min) {
      filtered = filtered.filter((v) => v.year >= parsed_filters.year_min!);
    }
    if (parsed_filters.year_max) {
      filtered = filtered.filter((v) => v.year <= parsed_filters.year_max!);
    }
    if (parsed_filters.color) {
      const colorLower = parsed_filters.color.toLowerCase();
      filtered = filtered.filter((v) => {
        const rec = v as unknown as Record<string, unknown>;
        const extColor = (rec.exterior_color as string) || (rec.color as string) || "";
        return extColor.toLowerCase().includes(colorLower);
      });
    }
    if (parsed_filters.fuel_type) {
      filtered = filtered.filter((v) => {
        const rec = v as unknown as Record<string, unknown>;
        const fuel = ((rec.fuel_type as string) || (rec.fuel as string) || "").toLowerCase();
        return fuel === parsed_filters.fuel_type;
      });
    }

    const resultCount = filtered.length;

    // Store for SEO insights
    storeQuery(query, parsed_filters, resultCount);

    // Track filter combo for SEO signals
    const seoFilters: Record<string, string> = {};
    if (parsed_filters.make) seoFilters.make = parsed_filters.make;
    if (parsed_filters.body_type) {
      seoFilters.body_type = Array.isArray(parsed_filters.body_type)
        ? parsed_filters.body_type.join(",")
        : parsed_filters.body_type;
    }
    if (parsed_filters.max_price) seoFilters.max_price = String(parsed_filters.max_price);
    if (parsed_filters.condition) seoFilters.condition = parsed_filters.condition;
    if (Object.keys(seoFilters).length > 0) {
      trackFilterCombo(seoFilters, resultCount);
    }

    return NextResponse.json({
      query: nlResult.raw_query,
      parsed_filters: nlResult.parsed_filters,
      intent_category: nlResult.intent_category,
      keywords_used: nlResult.keywords_used,
      vehicles: filtered.slice(0, 24),
      total: resultCount,
    });
  } catch (err) {
    console.error("[api/inventory/nl-search] Search failed:", err);
    return NextResponse.json(
      { error: "Search service temporarily unavailable" },
      { status: 503 },
    );
  }
}
