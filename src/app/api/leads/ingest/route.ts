import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/leads/ingest — Public webhook for third-party providers.
 *
 * Uses API key auth (X-API-Key header), not session auth.
 * AutoTrader, Cars.com, CarGurus post leads here.
 */

export async function POST(request: NextRequest) {
  // API key validation
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "X-API-Key header required" },
      { status: 401 },
    );
  }

  // In shadow mode, accept any key
  if (process.env.DATABASE_URL) {
    const { query } = await import("@/lib/db");
    const keyRow = await query(
      `SELECT dealer_id FROM api_keys WHERE key_hash = $1 AND active = true`,
      [apiKey],
    );
    if (keyRow.rows.length === 0) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
  }

  const dealerId = process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";
  const contentType = request.headers.get("content-type") ?? "";

  let leads: Array<Record<string, unknown>> = [];
  let source = "generic_adf";

  if (contentType.includes("xml")) {
    const xml = await request.text();
    const { parseADFLead } = await import("@/lib/lead-ingestion");
    const parsed = parseADFLead(xml);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid ADF XML" }, { status: 400 });
    }
    leads = [parsed as unknown as Record<string, unknown>];
    source = "generic_adf";
  } else {
    const body = await request.json();
    leads = Array.isArray(body.leads) ? body.leads : body.lead ? [body.lead] : [];
    source = body.source ?? "generic_adf";
  }

  if (leads.length === 0) {
    return NextResponse.json({ error: "No leads provided" }, { status: 400 });
  }

  const { normalizeLeadFromSource, ingestLeadBatch } = await import("@/lib/lead-ingestion");

  const normalized = leads.map((l) =>
    normalizeLeadFromSource(l, source as "autotrader" | "cars_com" | "cargurus" | "generic_adf"),
  );

  const result = ingestLeadBatch(
    normalized,
    dealerId,
    source as "autotrader" | "cars_com" | "cargurus" | "generic_adf",
  );

  return NextResponse.json(
    { accepted: true, ...result },
    { status: 201 },
  );
}
