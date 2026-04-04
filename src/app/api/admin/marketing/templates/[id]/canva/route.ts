import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getTemplateById, generateCanvaUrl, type TemplateData } from "@/lib/canva-integration";
import { trackTemplate } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/marketing/templates/[id]/canva                               */
/* Generate a Canva deep link for this template.                               */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    trackTemplate("template.exported_canva", authResult.user.dealer_id ?? "", { shadow: true });
    return NextResponse.json({ templates: [] });
  }

  const { id } = await params;
  const template = getTemplateById(id);

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Build minimal data for URL generation
  const data: TemplateData = {
    dealer: {
      name: authResult.user?.name ?? "Dealer",
      logo_url: "",
      primary_color: "#1e40af",
      secondary_color: "#f59e0b",
      phone: "",
      website: "",
    },
  };

  const canvaUrl = generateCanvaUrl(id, data);
  const hasApiKey = !!process.env.CANVA_API_KEY;

  trackTemplate("template.exported_canva", authResult.user.dealer_id ?? "", { template_id: id });

  return NextResponse.json({
    url: canvaUrl,
    canva_connected: hasApiKey,
    template_id: id,
  });
}
