/**
 * Webhook delivery log — lists recent deliveries with optional status filter.
 * Shadow mode: DATABASE_URL check is delegated to webhook-outbound.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { getWebhookDeliveries } from "@/lib/webhook-outbound";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/webhooks/deliveries — recent deliveries with status filter  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status") ?? undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 200) : 50;

  // Validate status filter
  if (status && !["pending", "delivered", "failed"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status filter. Must be: pending, delivered, or failed" },
      { status: 400 },
    );
  }

  const deliveries = await getWebhookDeliveries(dealerId, { status, limit });

  return NextResponse.json({ deliveries });
}
