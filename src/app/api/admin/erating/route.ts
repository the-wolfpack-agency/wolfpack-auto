import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getRates,
  compareRates,
  getDemoProductSummary,
  type ERateRequest,
  type ERateProvider,
} from "@/lib/erating";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/erating — Available products overview                       */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const vin = request.nextUrl.searchParams.get("vin");

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    if (vin) {
      const { getAvailableProducts } = await import("@/lib/erating");
      const products = await getAvailableProducts(vin, "demo-dealer");
      return NextResponse.json({ vin, products });
    }
    return NextResponse.json({
      summary: getDemoProductSummary(),
      providers: ["jm_family", "ally", "assurant"],
    });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);

  if (vin) {
    const { getAvailableProducts } = await import("@/lib/erating");
    const products = await getAvailableProducts(vin, dealerId);
    return NextResponse.json({ vin, products });
  }

  return NextResponse.json({
    summary: getDemoProductSummary(),
    providers: ["jm_family", "ally", "assurant"],
  });
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/erating — Request rates / compare                          */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const dealerId = getDealerId(authResult);
  const body = await request.json();
  const { vin, vehicle_year, vehicle_make, vehicle_model, vehicle_mileage, term_months, sale_price, provider, compare } = body;

  if (!vin) {
    return NextResponse.json({ error: "vin is required" }, { status: 400 });
  }

  const rateRequest: ERateRequest = {
    vin,
    vehicle_year: vehicle_year ?? 2024,
    vehicle_make: vehicle_make ?? "Unknown",
    vehicle_model: vehicle_model ?? "Unknown",
    vehicle_mileage: vehicle_mileage ?? 10000,
    term_months: term_months ?? 60,
    sale_price: sale_price ?? 35000,
    dealer_id: dealerId,
  };

  // Compare mode
  if (compare) {
    const providers = (body.providers as ERateProvider[]) ?? ["jm_family", "ally", "assurant"];
    const comparisons = await compareRates(rateRequest, providers);

    // Track analytics
    import("@/lib/analytics-hooks")
      .then(({ trackDesking }) =>
        trackDesking("desking.fi_product_presented", dealerId, {
          vin,
          providers: providers.join(","),
          product_count: comparisons.length,
        }),
      )
      .catch(() => {});

    return NextResponse.json({ comparisons, request: rateRequest });
  }

  // Single provider mode
  const rates = await getRates(rateRequest, provider ?? "demo");

  // Track analytics
  import("@/lib/analytics-hooks")
    .then(({ trackDesking }) =>
      trackDesking("desking.fi_product_presented", dealerId, {
        vin,
        provider: provider ?? "demo",
        product_count: rates.products.length,
      }),
    )
    .catch(() => {});

  return NextResponse.json({ rates, request: rateRequest });
}
