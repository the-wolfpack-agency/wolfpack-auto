/**
 * Unit tests for src/lib/erating.ts
 *
 * Tests rate calculation, markup, comparison, and demo data.
 *
 * Run with: npx jest src/lib/__tests__/erating.test.ts
 */

import {
  getRates,
  compareRates,
  calculateDealerMarkup,
  getAvailableProducts,
  getDemoProductSummary,
  type ERateRequest,
} from "../erating";

const BASE_REQUEST: ERateRequest = {
  vin: "1HGBH41JXMN109186",
  vehicle_year: 2024,
  vehicle_make: "Honda",
  vehicle_model: "Accord",
  vehicle_mileage: 15000,
  term_months: 60,
  sale_price: 32000,
  dealer_id: "dealer-1",
};

/* -------------------------------------------------------------------------- */
/*  getRates                                                                   */
/* -------------------------------------------------------------------------- */

describe("getRates", () => {
  it("returns demo rates with products", async () => {
    const response = await getRates(BASE_REQUEST, "demo");
    expect(response.vin).toBe(BASE_REQUEST.vin);
    expect(response.provider).toBe("demo");
    expect(response.products.length).toBeGreaterThan(0);
    expect(response.quoted_at).toBeDefined();
    expect(response.expires_at).toBeDefined();
  });

  it("each product has required fields", async () => {
    const response = await getRates(BASE_REQUEST, "demo");
    for (const product of response.products) {
      expect(product.id).toBeDefined();
      expect(product.name).toBeDefined();
      expect(product.category).toBeDefined();
      expect(product.cost_rate).toBeGreaterThan(0);
      expect(product.retail_rate).toBeGreaterThan(product.cost_rate);
      expect(product.term_months).toBeGreaterThan(0);
    }
  });

  it("returns rates for different providers", async () => {
    const jm = await getRates(BASE_REQUEST, "jm_family");
    const ally = await getRates(BASE_REQUEST, "ally");
    expect(jm.provider).toBe("jm_family");
    expect(ally.provider).toBe("ally");
    // Rates should differ between providers
    expect(jm.products[0].cost_rate).not.toBe(ally.products[0].cost_rate);
  });
});

/* -------------------------------------------------------------------------- */
/*  compareRates                                                               */
/* -------------------------------------------------------------------------- */

describe("compareRates", () => {
  it("compares rates across multiple providers", async () => {
    const comparisons = await compareRates(BASE_REQUEST, ["jm_family", "ally"]);
    expect(comparisons.length).toBeGreaterThan(0);
    for (const comp of comparisons) {
      expect(comp.rates.length).toBe(2);
      expect(comp.best_margin_provider).toBeDefined();
      expect(comp.product_name).toBeDefined();
    }
  });

  it("identifies best margin provider", async () => {
    const comparisons = await compareRates(BASE_REQUEST, ["jm_family", "ally", "assurant"]);
    for (const comp of comparisons) {
      const best = comp.rates.reduce((a, b) => (a.dealer_profit > b.dealer_profit ? a : b));
      expect(comp.best_margin_provider).toBe(best.provider);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  calculateDealerMarkup                                                      */
/* -------------------------------------------------------------------------- */

describe("calculateDealerMarkup", () => {
  it("calculates profit and margin correctly", () => {
    const result = calculateDealerMarkup(500, 1000);
    expect(result.profit).toBe(500);
    expect(result.margin_percent).toBe(50);
  });

  it("handles zero retail rate", () => {
    const result = calculateDealerMarkup(100, 0);
    expect(result.profit).toBe(-100);
    expect(result.margin_percent).toBe(0);
  });

  it("handles equal cost and retail", () => {
    const result = calculateDealerMarkup(500, 500);
    expect(result.profit).toBe(0);
    expect(result.margin_percent).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  getAvailableProducts                                                       */
/* -------------------------------------------------------------------------- */

describe("getAvailableProducts", () => {
  it("returns products for a VIN", async () => {
    const products = await getAvailableProducts("1HGBH41JXMN109186", "dealer-1");
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p.name).toBeDefined();
      expect(p.category).toBeDefined();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

describe("getDemoProductSummary", () => {
  it("returns summary with all expected fields", () => {
    const summary = getDemoProductSummary();
    expect(summary.length).toBeGreaterThan(0);
    for (const item of summary) {
      expect(item.category).toBeDefined();
      expect(item.avg_cost).toBeGreaterThan(0);
      expect(item.avg_retail).toBeGreaterThan(item.avg_cost);
      expect(item.avg_profit).toBe(item.avg_retail - item.avg_cost);
      expect(item.penetration_rate).toBeGreaterThan(0);
      expect(item.penetration_rate).toBeLessThanOrEqual(100);
    }
  });
});
