/**
 * Dynamic XML sitemap endpoint.
 *
 * Queries active dealer inventory and generates a sitemap
 * with proper lastmod, changefreq, and priority values.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { generateSitemap } from "@/lib/seo-engine";
import type { Vehicle } from "@/types/vehicle";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Determine dealer from subdomain or query param
  const dealerSlug =
    request.nextUrl.searchParams.get("dealer") ??
    request.headers.get("x-dealer-slug");

  if (!dealerSlug) {
    return new NextResponse("Missing dealer identifier", { status: 400 });
  }

  try {
    // Fetch dealer
    const dealerResult = await query<{ id: string; website_url: string }>(
      `SELECT id, website_url FROM dealers WHERE slug = $1 AND is_active = true`,
      [dealerSlug],
    );

    if (dealerResult.rows.length === 0) {
      return new NextResponse("Dealer not found", { status: 404 });
    }

    const dealer = dealerResult.rows[0];

    // Fetch active vehicles
    const vehiclesResult = await query<Pick<Vehicle, "vin" | "updated_at">>(
      `SELECT vin, updated_at FROM vehicles
       WHERE dealer_id = $1 AND status = 'available'
       ORDER BY updated_at DESC`,
      [dealer.id],
    );

    const xml = generateSitemap(dealer.website_url, vehiclesResult.rows);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[sitemap.xml] Generation error:", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
