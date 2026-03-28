/**
 * Test webhook delivery — sends a sample payload to verify the URL.
 * Shadow mode: DATABASE_URL check is delegated to webhook-outbound.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { getWebhookOutboundConfig, sendTestWebhook } from "@/lib/webhook-outbound";
import { trackWebhook } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* POST /api/admin/webhooks/[id]/test — send a test webhook                   */
/* -------------------------------------------------------------------------- */

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  const dealerId = getDealerId(authResult);
  const config = await getWebhookOutboundConfig(id, dealerId);

  if (!config) {
    return NextResponse.json({ error: "Webhook config not found" }, { status: 404 });
  }

  const result = await sendTestWebhook(config);

  trackWebhook("webhook.test_sent", dealerId, {
    config_id: id,
    success: result.success,
    status_code: result.status_code ?? 0,
  });

  return NextResponse.json({
    success: result.success,
    status_code: result.status_code,
    error: result.error ?? null,
  });
}
