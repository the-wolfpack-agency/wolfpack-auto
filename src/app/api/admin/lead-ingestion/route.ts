import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { getDemoFeeds, getDemoIngestionHistory } from "@/lib/lead-ingestion";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/lead-ingestion — List configured feeds + stats              */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      feeds: getDemoFeeds(),
      recent_leads: getDemoIngestionHistory(),
      stats: {
        total_ingested: 231,
        duplicates_caught: 34,
        feeds_active: 2,
        last_24h: 12,
      },
    });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");

    const feedRows = await query(
      `SELECT * FROM lead_ingestion_feeds WHERE dealer_id = $1 ORDER BY created_at DESC`,
      [dealerId],
    );

    const recentRows = await query(
      `SELECT * FROM ingested_leads WHERE dealer_id = $1 ORDER BY ingested_at DESC LIMIT 50`,
      [dealerId],
    );

    const statsRow = await query(
      `SELECT
         COUNT(*) AS total_ingested,
         COUNT(*) FILTER (WHERE duplicate = true) AS duplicates_caught,
         COUNT(DISTINCT feed_id) FILTER (WHERE ingested_at > NOW() - INTERVAL '24 hours') AS last_24h
       FROM ingested_leads WHERE dealer_id = $1`,
      [dealerId],
    );

    return NextResponse.json({
      feeds: feedRows.rows,
      recent_leads: recentRows.rows,
      stats: {
        total_ingested: Number(statsRow.rows[0]?.total_ingested ?? 0),
        duplicates_caught: Number(statsRow.rows[0]?.duplicates_caught ?? 0),
        feeds_active: feedRows.rows.filter((f: Record<string, unknown>) => f.active).length,
        last_24h: Number(statsRow.rows[0]?.last_24h ?? 0),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({
        feeds: getDemoFeeds(),
        recent_leads: getDemoIngestionHistory(),
        stats: { total_ingested: 0, duplicates_caught: 0, feeds_active: 0, last_24h: 0 },
      });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/lead-ingestion — Receive a batch of leads or ADF XML       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const dealerId = getDealerId(authResult);
  const contentType = request.headers.get("content-type") ?? "";
  let leads: Array<Record<string, unknown>> = [];

  if (contentType.includes("xml") || contentType.includes("text/plain")) {
    // ADF XML ingestion
    const xml = await request.text();
    const { parseADFLead } = await import("@/lib/lead-ingestion");
    const parsed = parseADFLead(xml);
    if (!parsed) {
      return NextResponse.json({ error: "Failed to parse ADF XML" }, { status: 400 });
    }
    leads = [parsed as unknown as Record<string, unknown>];
  } else {
    const body = await request.json();
    leads = Array.isArray(body.leads) ? body.leads : body.lead ? [body.lead] : [];
  }

  if (leads.length === 0) {
    return NextResponse.json({ error: "No leads provided" }, { status: 400 });
  }

  const { normalizeLeadFromSource, ingestLeadBatch } = await import("@/lib/lead-ingestion");
  const source = (leads[0] as Record<string, unknown>).source as string ?? "generic_adf";

  const normalized = leads.map((l) =>
    normalizeLeadFromSource(l, source as "autotrader" | "cars_com" | "cargurus" | "generic_adf"),
  );

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    const result = ingestLeadBatch(normalized, dealerId, source as "autotrader" | "cars_com" | "cargurus" | "generic_adf");
    return NextResponse.json({ ...result, mode: "shadow" }, { status: 201 });
  }

  // --- Live mode ---
  try {
    const { query } = await import("@/lib/db");

    // Fetch existing leads for dedup
    const existingRows = await query(
      `SELECT id, email, phone, first_name, last_name, vehicle_interest
       FROM leads WHERE dealer_id = $1 AND created_at > NOW() - INTERVAL '90 days'`,
      [dealerId],
    );

    const result = ingestLeadBatch(
      normalized,
      dealerId,
      source as "autotrader" | "cars_com" | "cargurus" | "generic_adf",
      existingRows.rows as Array<{ id: string; email: string; phone: string | null; first_name: string; last_name: string; vehicle_interest: string }>,
    );

    // Persist non-duplicate leads
    for (const lead of result.leads.filter((l) => !l.duplicate)) {
      await query(
        `INSERT INTO leads (id, dealer_id, first_name, last_name, email, phone, vehicle_interest, source, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'third_party', 'new', NOW(), NOW())`,
        [lead.id, dealerId, lead.first_name, lead.last_name, lead.email, lead.phone, lead.vehicle_interest],
      );
    }

    // Track analytics
    import("@/lib/analytics-hooks")
      .then(({ trackLead }) =>
        trackLead("lead.created", dealerId, {
          source,
          batch_size: leads.length,
          created: result.created,
          duplicates: result.duplicates,
        }),
      )
      .catch(() => {});

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      const result = ingestLeadBatch(normalized, dealerId, source as "autotrader" | "cars_com" | "cargurus" | "generic_adf");
      return NextResponse.json({ ...result, mode: "shadow" }, { status: 201 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
