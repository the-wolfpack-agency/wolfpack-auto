/**
 * Webhook config management — CRUD for outbound webhook subscriptions.
 * Shadow mode: DATABASE_URL check is delegated to webhook-outbound.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getWebhookOutboundConfigs,
  createWebhookOutboundConfig,
  getWebhookDeliveries,
} from "@/lib/webhook-outbound";
import { trackWebhook } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const createSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.string().max(100)).min(1).max(50),
  description: z.string().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* GET /api/admin/webhooks — list configs with delivery stats                 */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);
  const configs = await getWebhookOutboundConfigs(dealerId);
  const deliveries = await getWebhookDeliveries(dealerId, { limit: 200 });

  // Compute stats per config
  const configsWithStats = configs.map((config) => {
    const configDeliveries = deliveries.filter(
      (d) => d.webhook_config_id === config.id,
    );
    const delivered = configDeliveries.filter((d) => d.status === "delivered").length;
    const failed = configDeliveries.filter((d) => d.status === "failed").length;
    const total = delivered + failed;
    return {
      ...config,
      stats: {
        total_deliveries: total,
        delivered,
        failed,
        success_rate: total > 0 ? Math.round((delivered / total) * 100) : 100,
        last_delivery: configDeliveries[0]?.created_at ?? null,
        last_status: configDeliveries[0]?.status ?? null,
      },
    };
  });

  return NextResponse.json({ configs: configsWithStats });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/webhooks — create new config                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const config = await createWebhookOutboundConfig(
      dealerId,
      parsed.data.url,
      parsed.data.events,
      parsed.data.description,
    );

    trackWebhook("webhook.config_created", dealerId, {
      config_id: config.id,
      url: parsed.data.url,
      events_count: parsed.data.events.length,
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/webhooks] Create error:", err);
    return NextResponse.json(
      { error: "Failed to create webhook config" },
      { status: 500 },
    );
  }
}
