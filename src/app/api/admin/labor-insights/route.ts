/**
 * GET /api/admin/labor-insights
 *
 * Operator surface for the cross-tool labor-efficiency insights (General Ledger
 * + Payroll). Refreshes the derived insights for the dealer, persists them
 * (snapshot upsert + triple-write fan-out + analytics + audit), and returns the
 * report. 200 with report; 401 if unauthenticated; forwards a 403 from the auth
 * guard. Shadow mode (no DATABASE_URL) returns the demo fixture.
 *
 * dealer_id ALWAYS comes from the authenticated session — never the query string.
 * Only period bounds (validated ISO dates) are honored from the request.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { refreshLaborInsights, resolvePeriod } from "@/lib/labor-insight";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const sp = new URL(request.url).searchParams;
  const period = resolvePeriod(sp.get("periodStart"), sp.get("periodEnd"));
  const userId = auth.user?.id;

  const report = await refreshLaborInsights(dealerId, {
    via: "api",
    userId,
    period,
  });

  return NextResponse.json({ ...report, dealerId });
}
