/**
 * POST /api/admin/desking/scenarios — Generate payment comparison scenarios
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDesking } from "@/lib/analytics-hooks";
import { generateDealScenarios, type DealStructure } from "@/lib/fi-desking";

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ scenarios: [], count: 0 });
  }

  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: {
    deal?: Partial<DealStructure>;
    terms?: number[];
    down_payments?: number[];
    aprs?: number[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.deal?.selling_price) {
    return NextResponse.json({ error: "deal.selling_price is required" }, { status: 400 });
  }

  const deal: DealStructure = {
    deal_type: body.deal.deal_type ?? "retail",
    msrp: body.deal.msrp ?? body.deal.selling_price,
    invoice: body.deal.invoice ?? body.deal.selling_price * 0.92,
    selling_price: body.deal.selling_price,
    holdback: body.deal.holdback ?? 0,
    pack: body.deal.pack ?? 0,
    trade_acv: body.deal.trade_acv ?? 0,
    trade_allowance: body.deal.trade_allowance ?? 0,
    trade_payoff: body.deal.trade_payoff ?? 0,
    doc_fee: body.deal.doc_fee ?? 499,
    title_fee: body.deal.title_fee ?? 75,
    registration_fee: body.deal.registration_fee ?? 250,
    tax_rate: body.deal.tax_rate ?? 0.07,
    other_fees: body.deal.other_fees ?? [],
    cash_down: body.deal.cash_down ?? 0,
    rebates: body.deal.rebates ?? 0,
    term_months: body.deal.term_months ?? 72,
    apr: body.deal.apr ?? 5.9,
    residual_pct: body.deal.residual_pct ?? 55,
    money_factor: body.deal.money_factor ?? 0.00125,
  };

  const scenarios = generateDealScenarios(deal, {
    terms: body.terms,
    down_payments: body.down_payments,
    aprs: body.aprs,
  });

  trackDesking("desking.scenario_generated", dealerId, {
    scenario_count: scenarios.length,
    selling_price: deal.selling_price,
  });

  return NextResponse.json({ scenarios, count: scenarios.length });
}
