import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  getTemplateById,
  populateTemplate,
  type TemplateData,
} from "@/lib/canva-integration";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/marketing/templates/[id]                                     */
/* Get a single template's details and preview.                                */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  const template = getTemplateById(id);

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ template });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/marketing/templates/[id]                                    */
/* Populate this template with data, returns rendered HTML.                     */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data } = body as { data?: TemplateData };

  if (!data || !data.dealer) {
    return NextResponse.json({ error: "data with dealer branding is required" }, { status: 400 });
  }

  try {
    const html = populateTemplate(id, data);

    try {
      trackSystem("system.campaign_created", authResult?.user?.dealer_id ?? "system", {
        action: "template_populated",
        template_id: id,
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({ html, template_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to populate template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
