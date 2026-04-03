import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  getTemplateLibrary,
  getTemplatesByCategory,
  populateTemplate,
  type TemplateCategory,
  type TemplateData,
} from "@/lib/canva-integration";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/marketing/templates                                          */
/* List all templates, optionally filtered by category.                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ templates: [] });
  }

  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const category = request.nextUrl.searchParams.get("category") as TemplateCategory | null;

  const templates = category
    ? getTemplatesByCategory(category)
    : getTemplateLibrary();

  return NextResponse.json({ templates });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/marketing/templates                                         */
/* Generate a populated template. Body: { template_id, data }                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { template_id, data } = body as {
    template_id?: string;
    data?: TemplateData;
  };

  if (!template_id || typeof template_id !== "string") {
    return NextResponse.json({ error: "template_id is required" }, { status: 400 });
  }
  if (!data || !data.dealer) {
    return NextResponse.json({ error: "data with dealer branding is required" }, { status: 400 });
  }

  try {
    const html = populateTemplate(template_id, data);

    try {
      trackSystem("system.campaign_created", authResult?.user?.dealer_id ?? "system", {
        action: "template_populated",
        template_id,
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({ html, template_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to populate template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
