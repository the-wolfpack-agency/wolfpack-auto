/**
 * Unit Tests — F&I Desking Engine
 *
 * Validates payment calculation, lease calculation, profit analysis,
 * deal scenarios, lender matching, and F&I product menus.
 */

import {
  calculateRetailPayment,
  calculateLeasePayment,
  analyzeDealProfit,
  generateDealScenarios,
  matchLenderPrograms,
  calculateFIProfit,
  type DealStructure,
  type LenderProgram,
} from "@/lib/fi-desking";

const baseDeal: DealStructure = {
  deal_type: "retail",
  msrp: 35000,
  invoice: 32000,
  selling_price: 34000,
  holdback: 500,
  pack: 300,
  trade_acv: 12000,
  trade_allowance: 13000,
  trade_payoff: 8000,
  doc_fee: 499,
  title_fee: 75,
  registration_fee: 250,
  tax_rate: 0.07,
  other_fees: [],
  cash_down: 2000,
  rebates: 500,
  term_months: 72,
  apr: 5.9,
  residual_pct: 55,
  money_factor: 0.00125,
};

describe("F&I Desking Engine", () => {
  describe("Retail Payment Calculation", () => {
    test("calculates monthly payment correctly", () => {
      const result = calculateRetailPayment(baseDeal);
      expect(result.monthly_payment).toBeGreaterThan(0);
      expect(result.amount_financed).toBeGreaterThan(0);
      expect(result.total_of_payments).toBeGreaterThan(result.amount_financed);
      expect(result.finance_charge).toBeGreaterThan(0);
    });

    test("total_of_payments = monthly * term", () => {
      const result = calculateRetailPayment(baseDeal);
      expect(result.total_of_payments).toBeCloseTo(result.monthly_payment * baseDeal.term_months, 0);
    });

    test("calculates tax correctly", () => {
      const result = calculateRetailPayment(baseDeal);
      expect(result.total_tax).toBeCloseTo((baseDeal.selling_price + baseDeal.doc_fee) * baseDeal.tax_rate, 0);
    });

    test("handles 0% APR", () => {
      const zeroDeal = { ...baseDeal, apr: 0 };
      const result = calculateRetailPayment(zeroDeal);
      expect(result.finance_charge).toBe(0);
      expect(result.monthly_payment).toBeGreaterThan(0);
    });

    test("net trade reduces amount financed", () => {
      const noTrade = { ...baseDeal, trade_allowance: 0, trade_acv: 0, trade_payoff: 0 };
      const withTrade = calculateRetailPayment(baseDeal);
      const without = calculateRetailPayment(noTrade);
      expect(withTrade.amount_financed).toBeLessThan(without.amount_financed);
    });

    test("cash down reduces amount financed", () => {
      const noCash = { ...baseDeal, cash_down: 0 };
      const withCash = calculateRetailPayment(baseDeal);
      const without = calculateRetailPayment(noCash);
      expect(withCash.amount_financed).toBeLessThan(without.amount_financed);
    });

    test("handles other fees correctly", () => {
      const withFees = {
        ...baseDeal,
        other_fees: [
          { name: "Wheel Tax", amount: 50, taxable: true },
          { name: "Inspection", amount: 25, taxable: false },
        ],
      };
      const result = calculateRetailPayment(withFees);
      expect(result.total_fees).toBe(baseDeal.doc_fee + baseDeal.title_fee + baseDeal.registration_fee + 75);
    });

    test("amount_financed is never negative", () => {
      const overpaid = { ...baseDeal, cash_down: 50000 };
      const result = calculateRetailPayment(overpaid);
      expect(result.amount_financed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Lease Calculation", () => {
    test("calculates monthly lease payment", () => {
      const result = calculateLeasePayment(baseDeal);
      expect(result.monthly_payment).toBeGreaterThan(0);
      expect(result.residual_value).toBeGreaterThan(0);
      expect(result.depreciation).toBeGreaterThan(0);
    });

    test("residual value = MSRP * residual_pct", () => {
      const result = calculateLeasePayment(baseDeal);
      expect(result.residual_value).toBeCloseTo(baseDeal.msrp * baseDeal.residual_pct / 100, 2);
    });

    test("lease payment is less than retail payment for same price", () => {
      const retail = calculateRetailPayment(baseDeal);
      const lease = calculateLeasePayment(baseDeal);
      expect(lease.monthly_payment).toBeLessThan(retail.monthly_payment);
    });
  });

  describe("Profit Analysis", () => {
    test("calculates front gross correctly", () => {
      const profit = analyzeDealProfit(baseDeal);
      expect(profit.front_gross).toBe(baseDeal.selling_price - baseDeal.invoice - baseDeal.pack);
    });

    test("calculates back gross with F&I products", () => {
      const profit = analyzeDealProfit(baseDeal, 1500, 300);
      expect(profit.back_gross).toBeGreaterThan(0);
      expect(profit.fi_per_copy).toBe(1800);
    });

    test("total gross = front + back", () => {
      const profit = analyzeDealProfit(baseDeal, 1000, 200);
      expect(profit.total_gross).toBe(profit.front_gross + profit.back_gross);
    });

    test("trade profit is tracked", () => {
      const profit = analyzeDealProfit(baseDeal);
      // trade_acv (12000) - trade_allowance (13000) = -1000 (over-allowed)
      expect(profit.trade_profit).toBe(-1000);
    });

    test("gross margin percentage", () => {
      const profit = analyzeDealProfit(baseDeal);
      expect(profit.gross_margin_pct).toBeGreaterThan(0);
      expect(profit.gross_margin_pct).toBeLessThan(1);
    });
  });

  describe("Deal Scenarios", () => {
    test("generates multiple scenarios", () => {
      const scenarios = generateDealScenarios(baseDeal);
      expect(scenarios.length).toBeGreaterThanOrEqual(5);
    });

    test("each scenario has required fields", () => {
      const scenarios = generateDealScenarios(baseDeal);
      for (const s of scenarios) {
        expect(s.label).toBeTruthy();
        expect(s.term_months).toBeGreaterThan(0);
        expect(s.monthly_payment).toBeGreaterThan(0);
        expect(s.total_cost).toBeGreaterThan(0);
      }
    });

    test("shorter terms have higher payments", () => {
      const scenarios = generateDealScenarios(baseDeal, { terms: [36, 72] });
      const short = scenarios.find((s) => s.term_months === 36)!;
      const long = scenarios.find((s) => s.term_months === 72)!;
      expect(short.monthly_payment).toBeGreaterThan(long.monthly_payment);
    });

    test("shorter terms have lower total cost", () => {
      const scenarios = generateDealScenarios(baseDeal, { terms: [36, 72] });
      const short = scenarios.find((s) => s.term_months === 36)!;
      const long = scenarios.find((s) => s.term_months === 72)!;
      expect(short.total_cost).toBeLessThan(long.total_cost);
    });

    test("custom options override defaults", () => {
      const scenarios = generateDealScenarios(baseDeal, {
        terms: [48],
        down_payments: [5000],
        aprs: [3.9],
      });
      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].term_months).toBe(48);
      expect(scenarios[0].cash_down).toBe(5000);
    });
  });

  describe("Lender Matching", () => {
    const programs: LenderProgram[] = [
      {
        lender_name: "Credit Union A",
        program_name: "Premium",
        rate_tiers: [
          { min_score: 720, max_score: 850, min_term: 12, max_term: 84, rate: 4.9, advance_pct: 120 },
          { min_score: 680, max_score: 719, min_term: 12, max_term: 72, rate: 6.9, advance_pct: 110 },
        ],
        max_advance: 120,
        max_term: 84,
        reserve_markup: 1.5,
        flat_fee: 100,
      },
      {
        lender_name: "Bank B",
        program_name: "Standard",
        rate_tiers: [
          { min_score: 650, max_score: 850, min_term: 12, max_term: 72, rate: 7.9, advance_pct: 100 },
        ],
        max_advance: 100,
        max_term: 72,
        reserve_markup: 2.0,
        flat_fee: 0,
      },
    ];

    test("matches programs by credit score", () => {
      const matches = matchLenderPrograms(programs, 750, 30000, 72);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].lender_name).toBe("Credit Union A");
      expect(matches[0].apr).toBe(4.9);
    });

    test("returns multiple matches sorted by APR", () => {
      const matches = matchLenderPrograms(programs, 750, 30000, 72);
      expect(matches.length).toBe(2);
      expect(matches[0].apr).toBeLessThanOrEqual(matches[1].apr);
    });

    test("excludes programs outside score range", () => {
      const matches = matchLenderPrograms(programs, 620, 30000, 72);
      expect(matches).toHaveLength(0);
    });

    test("calculates reserve profit", () => {
      const matches = matchLenderPrograms(programs, 750, 30000, 72);
      expect(matches[0].reserve_profit).toBeGreaterThan(0);
    });
  });

  describe("F&I Product Menu", () => {
    test("calculates total profit from products", () => {
      const products = [
        { id: "1", name: "Extended Warranty", category: "warranty", cost: 800, retail_price: 2500 },
        { id: "2", name: "GAP Insurance", category: "gap", cost: 200, retail_price: 895 },
      ];
      const result = calculateFIProfit(products);
      expect(result.total_cost).toBe(1000);
      expect(result.total_retail).toBe(3395);
      expect(result.total_profit).toBe(2395);
      expect(result.products).toHaveLength(2);
    });

    test("handles empty product list", () => {
      const result = calculateFIProfit([]);
      expect(result.total_profit).toBe(0);
      expect(result.products).toHaveLength(0);
    });

    test("individual product profit is tracked", () => {
      const result = calculateFIProfit([
        { id: "1", name: "Paint Protection", category: "paint_protection", cost: 100, retail_price: 599 },
      ]);
      expect(result.products[0].profit).toBe(499);
    });
  });
});
