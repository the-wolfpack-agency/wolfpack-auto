/**
 * Single webhook config — GET/PATCH/DELETE operations.
 * Shadow mode: DATABASE_URL check is delegated to webhook-outbound.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getWebhookOutboundConfig,
  updateWebhookOutboundConfig,
  deleteWebhookOutboundConfig,
  getWebhookDeliveries,
} from "@/lib/webhook-outbound";
import { trackWebhook } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const updateSchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(z.string().max(100)).min(1).max(50).optional(),
  active: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* GET /api/admin/webhooks/[id] — single config with recent deliveries        */
/* -------------------------------------------------------------------------- */

export async function GET(
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

  const deliveries = await getWebhookDeliveries(dealerId, {
    configId: id,
    limit: 25,
  });

  return NextResponse.json({ config, deliveries });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/webhooks/[id] — update config                             */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  const dealerId = getDealerId(authResult);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await updateWebhookOutboundConfig(id, dealerId, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Webhook config not found" }, { status: 404 });
  }

  try { trackWebhook("webhook.config_updated", authResult?.user?.dealer_id ?? "system", { action: "webhook_config_updated", config_id: id }); } catch {}
  return NextResponse.json({ config: updated });
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/webhooks/[id] — remove config                            */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  const dealerId = getDealerId(authResult);

  const deleted = await deleteWebhookOutboundConfig(id, dealerId);
  if (!deleted) {
    return NextResponse.json({ error: "Webhook config not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
