import { NextRequest, NextResponse } from "next/server";
import { trackRetail } from "@/lib/analytics-hooks";

/**
 * POST /api/admin/digital-retail/calculator
 *
 * Public-facing payment calculator for digital retailing.
 * No auth required — this powers the customer-facing financing page.
 */
export async function POST(request: NextRequest) {
  // Calculator is pure computation — no DB needed, but check DATABASE_URL
  // for consistent shadow mode pattern across all admin routes.
  if (!process.env.DATABASE_URL) {
    // Proceed — calculator works without a database
  }

  let body: {
    vehicle_price?: number;
    down_payment?: number;
    trade_value?: number;
    trade_payoff?: number;
    apr?: number;
    term_months?: number;
    deal_type?: "retail" | "lease";
    residual_pct?: number;
    tax_rate?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    vehicle_price = 0,
    down_payment = 0,
    trade_value = 0,
    trade_payoff = 0,
    apr = 5.9,
    term_months = 60,
    deal_type = "retail",
    residual_pct = 55,
    tax_rate = 7.0,
  } = body;

  try { trackRetail("retail.calculator_used", process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001", { deal_type, vehicle_price }); } catch {}

  // --- Input validation: reject negative/extreme values ---
  if (typeof vehicle_price !== "number" || vehicle_price <= 0) {
    return NextResponse.json(
      { error: "vehicle_price must be a positive number" },
      { status: 400 },
    );
  }

  if (typeof down_payment !== "number" || down_payment < 0) {
    return NextResponse.json(
      { error: "down_payment must be >= 0" },
      { status: 400 },
    );
  }

  if (typeof apr !== "number" || apr < 0 || apr > 30) {
    return NextResponse.json(
      { error: "apr must be between 0 and 30" },
      { status: 400 },
    );
  }

  const VALID_TERMS = [12, 24, 36, 48, 60, 72, 84];
  if (typeof term_months !== "number" || !VALID_TERMS.includes(term_months)) {
    return NextResponse.json(
      { error: `term_months must be one of: ${VALID_TERMS.join(", ")}` },
      { status: 400 },
    );
  }

  if (deal_type === "lease" && (typeof residual_pct !== "number" || residual_pct < 0 || residual_pct > 100)) {
    return NextResponse.json(
      { error: "residual_pct must be between 0 and 100" },
      { status: 400 },
    );
  }

  const net_trade = Math.max(0, trade_value - trade_payoff);
  const taxable_amount = vehicle_price - net_trade;
  const sales_tax = taxable_amount * (tax_rate / 100);

  if (deal_type === "lease") {
    const residual = vehicle_price * (residual_pct / 100);
    const capitalized_cost = vehicle_price + sales_tax - down_payment - net_trade;
    const depreciation = (capitalized_cost - residual) / term_months;
    const mf = apr / 2400;
    const finance_charge = (capitalized_cost + residual) * mf;
    const monthly_payment = Math.round((depreciation + finance_charge) * 100) / 100;
    const total_cost = monthly_payment * term_months + down_payment;
    const due_at_signing = monthly_payment + down_payment;

    return NextResponse.json({
      deal_type: "lease",
      monthly_payment,
      term_months,
      apr,
      residual_value: Math.round(residual),
      capitalized_cost: Math.round(capitalized_cost),
      due_at_signing: Math.round(due_at_signing * 100) / 100,
      total_cost: Math.round(total_cost * 100) / 100,
      sales_tax: Math.round(sales_tax * 100) / 100,
    });
  }

  // Retail / finance
  const amount_financed = vehicle_price + sales_tax - down_payment - net_trade;
  const monthly_rate = apr / 100 / 12;
  let monthly_payment: number;

  if (monthly_rate === 0) {
    monthly_payment = amount_financed / term_months;
  } else {
    monthly_payment =
      (amount_financed * monthly_rate * Math.pow(1 + monthly_rate, term_months)) /
      (Math.pow(1 + monthly_rate, term_months) - 1);
  }

  monthly_payment = Math.round(monthly_payment * 100) / 100;
  const total_cost = monthly_payment * term_months;
  const total_interest = Math.round((total_cost - amount_financed) * 100) / 100;

  return NextResponse.json({
    deal_type: "retail",
    monthly_payment,
    term_months,
    apr,
    amount_financed: Math.round(amount_financed * 100) / 100,
    total_interest,
    total_cost: Math.round(total_cost * 100) / 100,
    sales_tax: Math.round(sales_tax * 100) / 100,
    down_payment,
    net_trade,
  });
}
