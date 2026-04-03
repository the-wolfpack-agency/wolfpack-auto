import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/data-export — Export history                                */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);

  if (!process.env.DATABASE_URL) {
    const { getExportHistory } = await import("@/lib/data-export");
    const history = await getExportHistory(dealerId);
    return NextResponse.json({ exports: history });
  }

  const { getExportHistory } = await import("@/lib/data-export");
  const history = await getExportHistory(dealerId);
  return NextResponse.json({ exports: history });
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/data-export — Trigger an export                            */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const body = await request.json();

  const { validateExportConfig, exportAnalyticsEvents, exportLeads, exportInventory } =
    await import("@/lib/data-export");

  const config = {
    dealerId,
    target: body.target,
    table: body.table,
    format: body.format,
    destination: body.destination,
    dateRange: body.dateRange,
  };

  const validation = validateExportConfig(config);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid export configuration", details: validation.errors },
      { status: 400 },
    );
  }

  let result;
  switch (config.table) {
    case "analytics_events":
      result = await exportAnalyticsEvents(config);
      break;
    case "leads":
      result = await exportLeads(config);
      break;
    case "inventory":
      result = await exportInventory(config);
      break;
    default:
      return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  return NextResponse.json({ export: result });
}
