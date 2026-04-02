/**
 * F&I Desking Engine
 *
 * Core deal structuring calculations for the F&I desk:
 *  - Payment calculation (retail finance, lease, cash)
 *  - Profit analysis (front gross, back gross, total gross)
 *  - F&I product menu management
 *  - Deal comparison scenarios
 *  - Lender program matching
 *
 * All calculations are deterministic and auditable. Every input
 * and output is tracked for the learning system.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DealStructure {
  deal_type: "retail" | "lease" | "cash" | "wholesale";

  // Vehicle
  msrp: number;
  invoice: number;
  selling_price: number;
  holdback: number;
  pack: number;

  // Trade
  trade_acv: number;
  trade_allowance: number;
  trade_payoff: number;

  // Fees & taxes
  doc_fee: number;
  title_fee: number;
  registration_fee: number;
  tax_rate: number;
  other_fees: { name: string; amount: number; taxable: boolean }[];

  // Down payment
  cash_down: number;
  rebates: number;

  // Finance terms
  term_months: number;
  apr: number;

  // Lease terms
  residual_pct: number;
  money_factor: number;
}

export interface PaymentResult {
  monthly_payment: number;
  amount_financed: number;
  total_of_payments: number;
  finance_charge: number;
  total_tax: number;
  total_fees: number;
  net_trade: number;
  total_due: number;
}

export interface LeaseResult {
  monthly_payment: number;
  residual_value: number;
  capitalized_cost: number;
  adjusted_cap_cost: number;
  depreciation: number;
  rent_charge: number;
  total_lease_cost: number;
  total_tax: number;
}

export interface ProfitAnalysis {
  front_gross: number;
  back_gross: number;
  total_gross: number;
  fi_per_copy: number;
  trade_profit: number;
  holdback_profit: number;
  gross_margin_pct: number;
}

export interface DealScenario {
  label: string;
  term_months: number;
  apr: number;
  cash_down: number;
  monthly_payment: number;
  total_cost: number;
  finance_charge: number;
}

export interface LenderMatch {
  lender_name: string;
  program_name: string;
  apr: number;
  max_term: number;
  max_advance: number;
  reserve_profit: number;
  score_required: number;
}

/* ------------------------------------------------------------------ */
/*  Payment Calculation (Retail Finance)                                */
/* ------------------------------------------------------------------ */

/**
 * Calculate monthly payment and all deal figures for retail finance.
 * Uses standard amortization formula: M = P[r(1+r)^n]/[(1+r)^n-1]
 */
export function calculateRetailPayment(deal: DealStructure): PaymentResult {
  // Calculate taxable amount
  const taxableBase = deal.selling_price + deal.doc_fee +
    deal.other_fees.filter((f) => f.taxable).reduce((sum, f) => sum + f.amount, 0);

  const total_tax = Math.round(taxableBase * deal.tax_rate * 100) / 100;

  // Total fees
  const total_fees = deal.doc_fee + deal.title_fee + deal.registration_fee +
    deal.other_fees.reduce((sum, f) => sum + f.amount, 0);

  // Net trade value
  const net_trade = deal.trade_allowance - deal.trade_payoff;

  // Amount financed
  const total_due = deal.selling_price + total_fees + total_tax;
  const amount_financed = Math.max(0,
    total_due - deal.cash_down - deal.rebates - Math.max(0, net_trade),
  );

  // Monthly payment
  let monthly_payment = 0;
  let total_of_payments = 0;
  let finance_charge = 0;

  if (deal.apr > 0 && deal.term_months > 0 && amount_financed > 0) {
    const r = deal.apr / 100 / 12; // monthly rate
    const n = deal.term_months;
    monthly_payment = Math.round(
      (amount_financed * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) * 100,
    ) / 100;
    total_of_payments = Math.round(monthly_payment * n * 100) / 100;
    finance_charge = Math.round((total_of_payments - amount_financed) * 100) / 100;
  } else if (deal.term_months > 0 && amount_financed > 0) {
    // 0% APR
    monthly_payment = Math.round((amount_financed / deal.term_months) * 100) / 100;
    total_of_payments = Math.round(monthly_payment * deal.term_months * 100) / 100;
    finance_charge = 0;
  }

  return {
    monthly_payment,
    amount_financed: Math.round(amount_financed * 100) / 100,
    total_of_payments,
    finance_charge,
    total_tax,
    total_fees,
    net_trade,
    total_due: Math.round(total_due * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Lease Calculation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Calculate lease payment using standard automotive lease formula.
 * Monthly = (Depreciation + Rent Charge) / term + tax
 */
export function calculateLeasePayment(deal: DealStructure): LeaseResult {
  const residual_value = Math.round(deal.msrp * (deal.residual_pct / 100) * 100) / 100;
  const capitalized_cost = deal.selling_price;
  const net_trade = deal.trade_allowance - deal.trade_payoff;
  const adjusted_cap_cost = capitalized_cost - deal.cash_down - deal.rebates - Math.max(0, net_trade);

  // Depreciation per month
  const depreciation = (adjusted_cap_cost - residual_value) / deal.term_months;

  // Rent charge per month (money factor × (adj cap + residual))
  const rent_charge = (adjusted_cap_cost + residual_value) * deal.money_factor;

  // Base monthly before tax
  const base_monthly = depreciation + rent_charge;

  // Tax on monthly payment
  const total_tax_monthly = base_monthly * deal.tax_rate;
  const monthly_payment = Math.round((base_monthly + total_tax_monthly) * 100) / 100;

  const total_tax = Math.round(total_tax_monthly * deal.term_months * 100) / 100;
  const total_lease_cost = Math.round(monthly_payment * deal.term_months * 100) / 100;

  return {
    monthly_payment,
    residual_value,
    capitalized_cost,
    adjusted_cap_cost: Math.round(adjusted_cap_cost * 100) / 100,
    depreciation: Math.round(depreciation * 100) / 100,
    rent_charge: Math.round(rent_charge * 100) / 100,
    total_lease_cost,
    total_tax,
  };
}

/* ------------------------------------------------------------------ */
/*  Profit Analysis                                                    */
/* ------------------------------------------------------------------ */

/**
 * Calculate deal profitability.
 */
export function analyzeDealProfit(
  deal: DealStructure,
  fi_product_profit: number = 0,
  reserve_profit: number = 0,
): ProfitAnalysis {
  // Front gross = selling price - invoice - pack
  const front_gross = deal.selling_price - deal.invoice - deal.pack;

  // Trade profit = ACV - allowance (positive when we under-allow)
  const trade_profit = deal.trade_acv - deal.trade_allowance;

  // Back gross = F&I product profit + reserve markup + trade profit
  const back_gross = fi_product_profit + reserve_profit + Math.max(0, trade_profit);

  const total_gross = front_gross + back_gross;

  // F&I per copy
  const fi_per_copy = fi_product_profit + reserve_profit;

  // Gross margin
  const gross_margin_pct = deal.selling_price > 0
    ? Math.round((front_gross / deal.selling_price) * 10000) / 10000
    : 0;

  return {
    front_gross: Math.round(front_gross * 100) / 100,
    back_gross: Math.round(back_gross * 100) / 100,
    total_gross: Math.round(total_gross * 100) / 100,
    fi_per_copy: Math.round(fi_per_copy * 100) / 100,
    trade_profit: Math.round(trade_profit * 100) / 100,
    holdback_profit: deal.holdback,
    gross_margin_pct,
  };
}

/* ------------------------------------------------------------------ */
/*  Deal Scenarios                                                     */
/* ------------------------------------------------------------------ */

/**
 * Generate multiple payment scenarios for customer comparison.
 */
export function generateDealScenarios(
  deal: DealStructure,
  options: {
    terms?: number[];
    down_payments?: number[];
    aprs?: number[];
  } = {},
): DealScenario[] {
  const terms = options.terms ?? [36, 48, 60, 72, 84];
  const downs = options.down_payments ?? [deal.cash_down];
  const aprs = options.aprs ?? [deal.apr];

  const scenarios: DealScenario[] = [];
  let idx = 0;

  for (const term of terms) {
    for (const down of downs) {
      for (const apr of aprs) {
        const modified = { ...deal, term_months: term, cash_down: down, apr };
        const result = calculateRetailPayment(modified);

        const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
        scenarios.push({
          label: `Option ${labels[idx % labels.length]}`,
          term_months: term,
          apr,
          cash_down: down,
          monthly_payment: result.monthly_payment,
          total_cost: result.total_of_payments + down,
          finance_charge: result.finance_charge,
        });
        idx++;
      }
    }
  }

  return scenarios;
}

/* ------------------------------------------------------------------ */
/*  Lender Matching                                                    */
/* ------------------------------------------------------------------ */

export interface LenderProgram {
  lender_name: string;
  program_name: string;
  rate_tiers: {
    min_score: number;
    max_score: number;
    min_term: number;
    max_term: number;
    rate: number;
    advance_pct: number;
  }[];
  max_advance: number;
  max_term: number;
  reserve_markup: number;
  flat_fee: number;
}

/**
 * Find matching lender programs for a deal based on credit score and amount.
 */
export function matchLenderPrograms(
  programs: LenderProgram[],
  creditScore: number,
  amount: number,
  term: number,
): LenderMatch[] {
  const matches: LenderMatch[] = [];

  for (const program of programs) {
    for (const tier of program.rate_tiers) {
      if (
        creditScore >= tier.min_score &&
        creditScore <= tier.max_score &&
        term >= tier.min_term &&
        term <= tier.max_term
      ) {
        const reserve_profit = program.flat_fee +
          (amount * program.reserve_markup / 100);

        matches.push({
          lender_name: program.lender_name,
          program_name: program.program_name,
          apr: tier.rate,
          max_term: tier.max_term,
          max_advance: tier.advance_pct,
          reserve_profit: Math.round(reserve_profit * 100) / 100,
          score_required: tier.min_score,
        });
        break; // Use first matching tier per program
      }
    }
  }

  // Sort by lowest APR
  matches.sort((a, b) => a.apr - b.apr);
  return matches;
}

/* ------------------------------------------------------------------ */
/*  F&I Product Menu                                                   */
/* ------------------------------------------------------------------ */

export interface FIProduct {
  id: string;
  name: string;
  category: string;
  cost: number;
  retail_price: number;
  term_months?: number;
  deductible?: number;
}

/**
 * Calculate total F&I profit from selected products.
 */
export function calculateFIProfit(products: FIProduct[]): {
  total_cost: number;
  total_retail: number;
  total_profit: number;
  products: { name: string; cost: number; price: number; profit: number }[];
} {
  let total_cost = 0;
  let total_retail = 0;

  const breakdown = products.map((p) => {
    const profit = p.retail_price - p.cost;
    total_cost += p.cost;
    total_retail += p.retail_price;
    return { name: p.name, cost: p.cost, price: p.retail_price, profit };
  });

  return {
    total_cost: Math.round(total_cost * 100) / 100,
    total_retail: Math.round(total_retail * 100) / 100,
    total_profit: Math.round((total_retail - total_cost) * 100) / 100,
    products: breakdown,
  };
}
