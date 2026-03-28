import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getWebhookConfigs,
  saveWebhookConfig,
} from "@/lib/webhooks";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const webhookConfigSchema = z.object({
  id: z.string().min(1, "id is required"),
  dealer_id: z.string().optional(), // overridden server-side
  provider: z.enum(["hubspot", "salesforce", "zapier", "custom"]),
  url: z.string().url("A valid webhook URL is required"),
  api_key: z.string().optional(),
  events: z
    .array(z.string())
    .min(1, "At least one event must be selected"),
  active: z.boolean(),
});

/* -------------------------------------------------------------------------- */
/* GET /api/admin/settings/integrations                                       */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      configs: [
        { id: "wh-demo-1", provider: "hubspot", url: "https://hooks.example.com/hubspot", events: ["lead.created", "lead.status_changed"], active: true },
      ],
    });
  }

  try {
    const configs = await getWebhookConfigs(dealerId);
    return NextResponse.json({ configs });
  } catch (err) {
    console.error("[api/admin/settings/integrations] GET error:", err);
    return NextResponse.json({ configs: [] });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/settings/integrations                                      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = webhookConfigSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const config = {
    ...parsed.data,
    dealer_id: dealerId,
  };

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ success: true, config });
  }

  try {
    await saveWebhookConfig(config);

    try { trackSystem("system.integration_updated", authResult?.user?.dealer_id ?? "system", { action: "integration_saved", provider: config.provider }); } catch {}
    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err) {
    console.error("[api/admin/settings/integrations] POST error:", err);
    return NextResponse.json(
      { error: "Failed to save integration configuration" },
      { status: 500 },
    );
  }
}
