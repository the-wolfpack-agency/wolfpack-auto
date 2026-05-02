import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEMO_OPPORTUNITIES = [
  {
    id: "demo-opp-1",
    listing: {
      vin: "1HGCV1F34LA000001",
      year: 2021,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      mileage: 42_000,
      condition_grade: 4.0,
      reserve_price_cents: 1_650_000,
      sale_at: new Date(Date.now() + 86_400_000).toISOString(),
      location: "Pittsburgh PA",
    },
    opportunity_score: 78.5,
    suggested_max_bid_cents: 1_700_000,
    predicted_retail_cents: 2_000_000,
    predicted_gross_cents: 350_000,
    status: "open" as const,
  },
  {
    id: "demo-opp-2",
    listing: {
      vin: "5TFDY5F10LX000002",
      year: 2020,
      make: "Toyota",
      model: "Tundra",
      trim: "SR5",
      mileage: 68_000,
      condition_grade: 3.5,
      reserve_price_cents: 2_900_000,
      sale_at: new Date(Date.now() + 6 * 3_600_000).toISOString(),
      location: "Atlanta GA",
    },
    opportunity_score: 65.0,
    suggested_max_bid_cents: 3_100_000,
    predicted_retail_cents: 3_650_000,
    predicted_gross_cents: 750_000,
    status: "open" as const,
  },
];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  const dealerId = auth.user.dealer_id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ opportunities: DEMO_OPPORTUNITIES });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  try {
    const { query } = await import("@/lib/db");
    const params: unknown[] = [dealerId];
    let where = "WHERE o.dealer_id = $1";
    if (status) {
      params.push(status);
      where += ` AND o.status = $${params.length}`;
    }
    const rows = await query<{
      id: string; listing_id: string; vin: string; year: number; make: string;
      model: string; trim: string | null; mileage: number; condition_grade: number | null;
      reserve_price_cents: string | number | null; sale_at: string; location: string | null;
      opportunity_score: string | number; suggested_max_bid_cents: string | number;
      predicted_retail_cents: string | number; predicted_gross_cents: string | number;
      status: string;
    }>(
      `SELECT o.id, o.listing_id, l.vin, l.year, l.make, l.model, l.trim, l.mileage,
              l.condition_grade, l.reserve_price_cents, l.sale_at, l.location,
              o.opportunity_score, o.suggested_max_bid_cents,
              o.predicted_retail_cents, o.predicted_gross_cents, o.status
         FROM auction_acquisition_opportunities o
         JOIN auction_listings l ON l.id = o.listing_id
         ${where}
        ORDER BY o.opportunity_score DESC
        LIMIT 100`,
      params,
    );

    return NextResponse.json({
      opportunities: rows.rows.map((r) => ({
        id: r.id,
        listing: {
          vin: r.vin, year: r.year, make: r.make, model: r.model, trim: r.trim,
          mileage: r.mileage, condition_grade: r.condition_grade,
          reserve_price_cents: Number(r.reserve_price_cents ?? 0),
          sale_at: r.sale_at, location: r.location,
        },
        opportunity_score: Number(r.opportunity_score),
        suggested_max_bid_cents: Number(r.suggested_max_bid_cents),
        predicted_retail_cents: Number(r.predicted_retail_cents),
        predicted_gross_cents: Number(r.predicted_gross_cents),
        status: r.status,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ opportunities: DEMO_OPPORTUNITIES });
    }
    console.error("[auction/opportunities] error:", err);
    return NextResponse.json({ error: "Failed to load opportunities" }, { status: 500 });
  }
}
