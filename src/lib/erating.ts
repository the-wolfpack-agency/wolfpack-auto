/**
 * eRating Integration — Real-time F&I Product Pricing
 *
 * Fetch rates from F&I product providers, compare across providers,
 * calculate dealer markup, and return available products for a VIN.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ERateProvider = "jm_family" | "ally" | "assurant" | "safe_guard" | "portfolio" | "demo";

export interface ERateRequest {
  vin: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_mileage: number;
  term_months: number;
  sale_price: number;
  dealer_id: string;
}

export interface ERateProduct {
  id: string;
  name: string;
  category: "vsc" | "gap" | "tire_wheel" | "paint_fabric" | "theft" | "key_replacement" | "maintenance" | "windshield";
  provider: ERateProvider;
  cost_rate: number;
  retail_rate: number;
  term_months: number;
  deductible: number;
  coverage_description: string;
}

export interface ERateResponse {
  vin: string;
  provider: ERateProvider;
  products: ERateProduct[];
  quoted_at: string;
  expires_at: string;
}

export interface RateComparison {
  product_name: string;
  category: ERateProduct["category"];
  rates: Array<{
    provider: ERateProvider;
    cost_rate: number;
    retail_rate: number;
    dealer_profit: number;
    profit_margin: number;
  }>;
  best_margin_provider: ERateProvider;
}

/* -------------------------------------------------------------------------- */
/*  Rate Fetching                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fetch real-time rates from an F&I product provider.
 * Returns demo data when no provider API keys are configured.
 */
export async function getRates(
  request: ERateRequest,
  provider: ERateProvider = "demo",
): Promise<ERateResponse> {
  // Check for configured provider
  const providerKey = process.env[`ERATE_${provider.toUpperCase()}_API_KEY`];

  if (!providerKey || provider === "demo") {
    return getDemoRates(request, provider === "demo" ? "demo" : provider);
  }

  // Real provider integration would go here.
  // For now, return demo rates with a note.
  console.log(`[erating] Would fetch rates from ${provider} for VIN ${request.vin}`);
  return getDemoRates(request, provider);
}

/* -------------------------------------------------------------------------- */
/*  Rate Comparison                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compare rates across multiple providers for the same vehicle.
 */
export async function compareRates(
  request: ERateRequest,
  providers: ERateProvider[] = ["jm_family", "ally", "assurant"],
): Promise<RateComparison[]> {
  const responses = await Promise.all(
    providers.map((p) => getRates(request, p)),
  );

  // Group products by category
  const categoryMap = new Map<string, RateComparison>();

  for (const response of responses) {
    for (const product of response.products) {
      const key = product.category;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          product_name: product.name,
          category: product.category,
          rates: [],
          best_margin_provider: response.provider,
        });
      }

      const comparison = categoryMap.get(key)!;
      const profit = product.retail_rate - product.cost_rate;
      const margin = product.retail_rate > 0
        ? Math.round((profit / product.retail_rate) * 100)
        : 0;

      comparison.rates.push({
        provider: response.provider,
        cost_rate: product.cost_rate,
        retail_rate: product.retail_rate,
        dealer_profit: profit,
        profit_margin: margin,
      });
    }
  }

  // Determine best margin provider for each category
  for (const comparison of categoryMap.values()) {
    const best = comparison.rates.reduce((a, b) =>
      a.dealer_profit > b.dealer_profit ? a : b,
    );
    comparison.best_margin_provider = best.provider;
  }

  return Array.from(categoryMap.values());
}

/* -------------------------------------------------------------------------- */
/*  Markup Calculation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Calculate dealer markup (profit) on an F&I product.
 */
export function calculateDealerMarkup(
  costRate: number,
  retailRate: number,
): { profit: number; margin_percent: number } {
  const profit = retailRate - costRate;
  const margin_percent = retailRate > 0
    ? Math.round((profit / retailRate) * 100 * 100) / 100
    : 0;
  return { profit, margin_percent };
}

/* -------------------------------------------------------------------------- */
/*  Available Products                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Get all available F&I products for a specific vehicle.
 */
export async function getAvailableProducts(
  vin: string,
  dealerId: string,
): Promise<ERateProduct[]> {
  const request: ERateRequest = {
    vin,
    vehicle_year: 2024,
    vehicle_make: "Generic",
    vehicle_model: "Vehicle",
    vehicle_mileage: 10000,
    term_months: 60,
    sale_price: 35000,
    dealer_id: dealerId,
  };

  const response = await getRates(request, "demo");
  return response.products;
}

/* -------------------------------------------------------------------------- */
/*  Demo Rates                                                                 */
/* -------------------------------------------------------------------------- */

function getDemoRates(request: ERateRequest, provider: ERateProvider): ERateResponse {
  const baseMultiplier = provider === "jm_family" ? 1.0 : provider === "ally" ? 0.95 : provider === "assurant" ? 1.05 : 1.0;
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 3600_000);

  return {
    vin: request.vin,
    provider,
    quoted_at: now.toISOString(),
    expires_at: expires.toISOString(),
    products: [
      {
        id: `${provider}-vsc-${request.term_months}`,
        name: "Vehicle Service Contract",
        category: "vsc",
        provider,
        cost_rate: Math.round(890 * baseMultiplier),
        retail_rate: Math.round(1995 * baseMultiplier),
        term_months: request.term_months,
        deductible: 100,
        coverage_description: "Powertrain + electronics coverage",
      },
      {
        id: `${provider}-gap-${request.term_months}`,
        name: "GAP Insurance",
        category: "gap",
        provider,
        cost_rate: Math.round(295 * baseMultiplier),
        retail_rate: Math.round(895 * baseMultiplier),
        term_months: request.term_months,
        deductible: 0,
        coverage_description: "Covers difference between loan balance and vehicle value",
      },
      {
        id: `${provider}-tw-${request.term_months}`,
        name: "Tire & Wheel Protection",
        category: "tire_wheel",
        provider,
        cost_rate: Math.round(195 * baseMultiplier),
        retail_rate: Math.round(599 * baseMultiplier),
        term_months: request.term_months,
        deductible: 0,
        coverage_description: "Road hazard tire & wheel replacement",
      },
      {
        id: `${provider}-pf-${request.term_months}`,
        name: "Paint & Fabric Protection",
        category: "paint_fabric",
        provider,
        cost_rate: Math.round(125 * baseMultiplier),
        retail_rate: Math.round(495 * baseMultiplier),
        term_months: request.term_months,
        deductible: 0,
        coverage_description: "Interior & exterior protection",
      },
      {
        id: `${provider}-maint-${request.term_months}`,
        name: "Prepaid Maintenance",
        category: "maintenance",
        provider,
        cost_rate: Math.round(350 * baseMultiplier),
        retail_rate: Math.round(799 * baseMultiplier),
        term_months: Math.min(request.term_months, 36),
        deductible: 0,
        coverage_description: "Scheduled maintenance per manufacturer specs",
      },
    ],
  };
}

/**
 * Get demo product list for admin page display.
 */
export function getDemoProductSummary(): Array<{
  category: string;
  avg_cost: number;
  avg_retail: number;
  avg_profit: number;
  deals_attached: number;
  penetration_rate: number;
}> {
  return [
    { category: "Vehicle Service Contract", avg_cost: 890, avg_retail: 1995, avg_profit: 1105, deals_attached: 34, penetration_rate: 68 },
    { category: "GAP Insurance", avg_cost: 295, avg_retail: 895, avg_profit: 600, deals_attached: 28, penetration_rate: 56 },
    { category: "Tire & Wheel", avg_cost: 195, avg_retail: 599, avg_profit: 404, deals_attached: 18, penetration_rate: 36 },
    { category: "Paint & Fabric", avg_cost: 125, avg_retail: 495, avg_profit: 370, deals_attached: 15, penetration_rate: 30 },
    { category: "Prepaid Maintenance", avg_cost: 350, avg_retail: 799, avg_profit: 449, deals_attached: 22, penetration_rate: 44 },
  ];
}
