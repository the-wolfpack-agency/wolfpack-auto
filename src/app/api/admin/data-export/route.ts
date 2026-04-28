import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackDataExport } from "@/lib/analytics-hooks";

/**
 * Per-dealer in-memory export history. POST writes to it on every
 * successful export; GET concatenates with the durable history so a
 * new export shows up immediately even when the data_exports table
 * is unmigrated (returns an empty list otherwise — that's why
 * "Export History" was always blank). Per-instance, ephemeral
 * across cold starts; the migration is the durable fix.
 */
const SHADOW_EXPORTS = new Map<string, Record<string, unknown>[]>();

function pushShadowExport(dealerId: string, entry: Record<string, unknown>) {
  const list = SHADOW_EXPORTS.get(dealerId) ?? [];
  list.unshift(entry);
  SHADOW_EXPORTS.set(dealerId, list.slice(0, 100));
}

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/data-export — Export history                                */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const shadow = SHADOW_EXPORTS.get(dealerId) ?? [];

  if (!process.env.DATABASE_URL) {
    const { getExportHistory } = await import("@/lib/data-export");
    const history = await getExportHistory(dealerId);
    return NextResponse.json({ exports: [...shadow, ...history] });
  }

  try {
    const { getExportHistory } = await import("@/lib/data-export");
    const history = await getExportHistory(dealerId);
    /* Dedupe shadow entries that have since landed in the durable
       store (matched by id when present). */
    const existing = new Set((history as Array<{ id?: string }>).map((h) => h.id));
    const merged = [
      ...shadow.filter((e) => !existing.has(e.id as string | undefined)),
      ...history,
    ];
    return NextResponse.json({ exports: merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ exports: shadow });
    }
    return NextResponse.json({ error: "Database error", cause: msg.slice(0, 200) }, { status: 500 });
  }
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

  try {
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

    /* Mirror every successful export into the shadow history so the
       Export History list updates without a hard reload — `result`
       carries the rows, format, destination and timestamp shape that
       getExportHistory() returns. */
    pushShadowExport(dealerId, {
      id: (result as unknown as Record<string, unknown>).id ?? `exp-${Date.now()}`,
      dealer_id: dealerId,
      table: config.table,
      format: config.format ?? "csv",
      destination: config.destination ?? "download",
      target: config.target ?? null,
      status: "completed",
      rows: (result as unknown as Record<string, unknown>).rows ?? 0,
      created_at: new Date().toISOString(),
      ...(result as unknown as Record<string, unknown>),
    });
    trackDataExport("export.completed", dealerId, { table: config.table, format: config.format ?? "csv", destination: config.destination ?? "download" });
    return NextResponse.json({ export: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      const fallback = { status: "empty", rows: 0, message: "Table not yet migrated" };
      pushShadowExport(dealerId, {
        id: `exp-${Date.now()}`,
        dealer_id: dealerId,
        table: config.table,
        format: config.format ?? "csv",
        destination: config.destination ?? "download",
        target: config.target ?? null,
        ...fallback,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ export: fallback });
    }
    return NextResponse.json({ error: "Database error", cause: msg.slice(0, 200) }, { status: 500 });
  }
}
