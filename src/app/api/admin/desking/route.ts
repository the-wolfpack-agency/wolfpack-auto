/**
 * GET  /api/admin/desking — List active deals on the desk
 * POST /api/admin/desking — Create or calculate a new deal structure
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDesking } from "@/lib/analytics-hooks";
import {
  calculateRetailPayment,
  calculateLeasePayment,
  analyzeDealProfit,
  generateDealScenarios,
  calculateFIProfit,
  type DealStructure,
} from "@/lib/fi-desking";

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let deals: Record<string, unknown>[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT * FROM deal_desk WHERE dealer_id = $1 AND status != 'unwound'
         ORDER BY updated_at DESC LIMIT 50`,
        [dealerId],
      );
      deals = rows;
    } catch (err) {
      console.error("[api/desking] GET error:", err);
    }
  }

  return NextResponse.json({ deals, count: deals.length });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: {
    action?: string;
    deal?: Partial<DealStructure>;
    fi_products?: { id: string; name: string; category: string; cost: number; retail_price: number }[];
    scenarios_options?: { terms?: number[]; down_payments?: number[]; aprs?: number[] };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "calculate";
  const deal = body.deal as DealStructure;

  if (!deal || !deal.selling_price) {
    return NextResponse.json({ error: "deal with selling_price is required" }, { status: 400 });
  }

  // Fill defaults
  const fullDeal: DealStructure = {
    deal_type: deal.deal_type ?? "retail",
    msrp: deal.msrp ?? deal.selling_price,
    invoice: deal.invoice ?? deal.selling_price * 0.92,
    selling_price: deal.selling_price,
    holdback: deal.holdback ?? 0,
    pack: deal.pack ?? 0,
    trade_acv: deal.trade_acv ?? 0,
    trade_allowance: deal.trade_allowance ?? 0,
    trade_payoff: deal.trade_payoff ?? 0,
    doc_fee: deal.doc_fee ?? 499,
    title_fee: deal.title_fee ?? 75,
    registration_fee: deal.registration_fee ?? 250,
    tax_rate: deal.tax_rate ?? 0.07,
    other_fees: deal.other_fees ?? [],
    cash_down: deal.cash_down ?? 0,
    rebates: deal.rebates ?? 0,
    term_months: deal.term_months ?? 72,
    apr: deal.apr ?? 5.9,
    residual_pct: deal.residual_pct ?? 55,
    money_factor: deal.money_factor ?? 0.00125,
  };

  // Calculate payment
  const payment = fullDeal.deal_type === "lease"
    ? calculateLeasePayment(fullDeal)
    : calculateRetailPayment(fullDeal);

  // F&I products
  const fiResult = body.fi_products
    ? calculateFIProfit(body.fi_products)
    : { total_cost: 0, total_retail: 0, total_profit: 0, products: [] };

  // Profit analysis
  const profit = analyzeDealProfit(fullDeal, fiResult.total_profit, 0);

  // Scenarios (if requested)
  let scenarios = null;
  if (action === "scenarios" || body.scenarios_options) {
    scenarios = generateDealScenarios(fullDeal, body.scenarios_options);
  }

  // Save to DB if action is "create"
  let savedId: string | null = null;
  if (action === "create" && process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `INSERT INTO deal_desk (dealer_id, deal_type, msrp, invoice, selling_price,
           holdback, pack, trade_acv, trade_allowance, trade_payoff,
           doc_fee, title_fee, registration_fee, tax_rate, total_tax,
           cash_down, rebates, term_months, apr, monthly_payment,
           amount_financed, total_of_payments, finance_charge,
           front_gross, back_gross, fi_per_copy, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                 $21, $22, $23, $24, $25, $26, $27)
         RETURNING id`,
        [
          dealerId, fullDeal.deal_type, fullDeal.msrp, fullDeal.invoice, fullDeal.selling_price,
          fullDeal.holdback, fullDeal.pack, fullDeal.trade_acv, fullDeal.trade_allowance, fullDeal.trade_payoff,
          fullDeal.doc_fee, fullDeal.title_fee, fullDeal.registration_fee, fullDeal.tax_rate,
          "monthly_payment" in payment ? (payment as any).total_tax : 0,
          fullDeal.cash_down, fullDeal.rebates, fullDeal.term_months, fullDeal.apr,
          "monthly_payment" in payment ? payment.monthly_payment : 0,
          "amount_financed" in payment ? (payment as any).amount_financed : 0,
          "total_of_payments" in payment ? (payment as any).total_of_payments : 0,
          "finance_charge" in payment ? (payment as any).finance_charge : 0,
          profit.front_gross, profit.back_gross, profit.fi_per_copy,
          authResult.user.id,
        ],
      );
      savedId = rows[0]?.id;
    } catch (err) {
      console.error("[api/desking] DB error:", err);
    }
  }

  trackDesking(
    action === "create" ? "desking.deal_created" : "desking.deal_structured",
    dealerId,
    {
      deal_type: fullDeal.deal_type,
      selling_price: fullDeal.selling_price,
      monthly_payment: payment.monthly_payment,
      front_gross: profit.front_gross,
      back_gross: profit.back_gross,
      total_gross: profit.total_gross,
      fi_per_copy: profit.fi_per_copy,
    },
  );

  return NextResponse.json({
    id: savedId,
    deal: fullDeal,
    payment,
    profit,
    fi: fiResult,
    scenarios,
  });
}
