/**
 * POST /api/admin/deals/[dealId]/calculate — Payment calculator
 *
 * Accepts deal numbers and returns calculated payment breakdown.
 * Works for retail (loan), lease, and cash deal types.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDeal } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CalcInput {
  selling_price: number;
  trade_value?: number;
  trade_payoff?: number;
  down_payment?: number;
  rebates?: number;
  apr?: number;
  term_months?: number;
  deal_type?: "retail" | "lease" | "cash";
  residual_pct?: number;
  money_factor?: number;
  fi_total?: number;
  doc_fee?: number;
  tax_rate?: number;
}

/* -------------------------------------------------------------------------- */
/* Calculator logic                                                           */
/* -------------------------------------------------------------------------- */

function calculateRetail(input: CalcInput) {
  const {
    selling_price,
    trade_value = 0,
    trade_payoff = 0,
    down_payment = 0,
    rebates = 0,
    apr = 5.99,
    term_months = 60,
    fi_total = 0,
    doc_fee = 150,
    tax_rate = 6.25,
  } = input;

  const tradeEquity = trade_value - trade_payoff;
  const netSellingPrice = selling_price - rebates;
  const taxableAmount = netSellingPrice - (tradeEquity > 0 ? Math.min(tradeEquity, netSellingPrice) : 0);
  const salesTax = taxableAmount * (tax_rate / 100);
  const totalBeforeFinancing = netSellingPrice + salesTax + doc_fee + fi_total;
  const amountFinanced = totalBeforeFinancing - down_payment - Math.max(tradeEquity, 0) + (tradeEquity < 0 ? Math.abs(tradeEquity) : 0);

  let monthlyPayment = 0;
  let totalInterest = 0;

  if (term_months > 0 && apr > 0) {
    const monthlyRate = apr / 100 / 12;
    monthlyPayment =
      (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, term_months)) /
      (Math.pow(1 + monthlyRate, term_months) - 1);
    totalInterest = monthlyPayment * term_months - amountFinanced;
  } else if (term_months > 0) {
    monthlyPayment = amountFinanced / term_months;
  }

  const totalCost = amountFinanced + totalInterest;
  const invoice = (input as unknown as Record<string, number>).invoice;
  const frontGross = invoice ? selling_price - invoice : selling_price * 0.04;

  return {
    deal_type: "retail",
    selling_price,
    trade_equity: tradeEquity,
    rebates,
    down_payment,
    sales_tax: round(salesTax),
    doc_fee,
    fi_total,
    amount_financed: round(amountFinanced),
    apr,
    term_months,
    monthly_payment: round(monthlyPayment),
    total_interest: round(totalInterest),
    total_cost: round(totalCost),
    front_gross: round(typeof frontGross === "number" ? frontGross : 0),
  };
}

function calculateLease(input: CalcInput) {
  const {
    selling_price,
    trade_value = 0,
    trade_payoff = 0,
    down_payment = 0,
    rebates = 0,
    term_months = 36,
    residual_pct = 55,
    money_factor = 0.00125,
    fi_total = 0,
    doc_fee = 150,
    tax_rate = 6.25,
  } = input;

  const tradeEquity = trade_value - trade_payoff;
  const adjustedCap = selling_price + doc_fee + fi_total - rebates - down_payment - Math.max(tradeEquity, 0) + (tradeEquity < 0 ? Math.abs(tradeEquity) : 0);
  const residualValue = selling_price * (residual_pct / 100);
  const depreciation = (adjustedCap - residualValue) / term_months;
  const rentCharge = (adjustedCap + residualValue) * money_factor;
  const monthlyPreTax = depreciation + rentCharge;
  const monthlyTax = monthlyPreTax * (tax_rate / 100);
  const monthlyPayment = monthlyPreTax + monthlyTax;
  const totalCost = monthlyPayment * term_months + down_payment;
  const impliedApr = money_factor * 2400;

  return {
    deal_type: "lease",
    selling_price,
    adjusted_cap_cost: round(adjustedCap),
    residual_value: round(residualValue),
    residual_pct,
    money_factor,
    implied_apr: round(impliedApr),
    depreciation: round(depreciation),
    rent_charge: round(rentCharge),
    monthly_pre_tax: round(monthlyPreTax),
    monthly_tax: round(monthlyTax),
    monthly_payment: round(monthlyPayment),
    term_months,
    total_cost: round(totalCost),
    down_payment,
    trade_equity: trade_value - trade_payoff,
    fi_total,
  };
}

function calculateCash(input: CalcInput) {
  const {
    selling_price,
    trade_value = 0,
    trade_payoff = 0,
    rebates = 0,
    fi_total = 0,
    doc_fee = 150,
    tax_rate = 6.25,
  } = input;

  const tradeEquity = trade_value - trade_payoff;
  const netPrice = selling_price - rebates;
  const taxableAmount = netPrice - (tradeEquity > 0 ? Math.min(tradeEquity, netPrice) : 0);
  const salesTax = taxableAmount * (tax_rate / 100);
  const totalDue = netPrice + salesTax + doc_fee + fi_total - Math.max(tradeEquity, 0) + (tradeEquity < 0 ? Math.abs(tradeEquity) : 0);

  return {
    deal_type: "cash",
    selling_price,
    rebates,
    trade_equity: tradeEquity,
    sales_tax: round(salesTax),
    doc_fee,
    fi_total,
    total_due: round(totalDue),
    monthly_payment: 0,
    total_interest: 0,
    amount_financed: 0,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* POST handler                                                               */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Deal calculator is pure computation — no DB needed, but check DATABASE_URL
  // for consistent shadow mode pattern across all admin routes.
  if (!process.env.DATABASE_URL) {
    // Proceed — calculator works without a database
  }

  await params; // consume params to avoid Next.js warnings

  let body: CalcInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.selling_price || typeof body.selling_price !== "number" || body.selling_price <= 0) {
    return NextResponse.json(
      { error: "selling_price is required and must be > 0" },
      { status: 422 },
    );
  }

  // Validate optional numeric fields — reject negative/extreme values
  if (body.down_payment !== undefined && (typeof body.down_payment !== "number" || body.down_payment < 0)) {
    return NextResponse.json({ error: "down_payment must be >= 0" }, { status: 422 });
  }

  if (body.apr !== undefined && (typeof body.apr !== "number" || body.apr < 0 || body.apr > 30)) {
    return NextResponse.json({ error: "apr must be between 0 and 30" }, { status: 422 });
  }

  const VALID_TERMS = [12, 24, 36, 48, 60, 72, 84];
  if (body.term_months !== undefined && (typeof body.term_months !== "number" || !VALID_TERMS.includes(body.term_months))) {
    return NextResponse.json({ error: `term_months must be one of: ${VALID_TERMS.join(", ")}` }, { status: 422 });
  }

  if (body.residual_pct !== undefined && (typeof body.residual_pct !== "number" || body.residual_pct < 0 || body.residual_pct > 100)) {
    return NextResponse.json({ error: "residual_pct must be between 0 and 100" }, { status: 422 });
  }

  const dealType = body.deal_type || "retail";

  let result;
  switch (dealType) {
    case "lease":
      result = calculateLease(body);
      break;
    case "cash":
      result = calculateCash(body);
      break;
    default:
      result = calculateRetail(body);
  }

  try { trackDeal("deal.payment_calculated", authResult.user.dealer_id, { deal_type: dealType, term: body.term_months ?? 60, apr: body.apr ?? 0 }); } catch {}

  return NextResponse.json({ calculation: result });
}
