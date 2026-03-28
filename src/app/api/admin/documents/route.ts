import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackDocument, trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_DOCUMENTS = [
  {
    id: "doc-001",
    dealer_id: "default",
    deal_id: "deal-2026-001",
    lead_id: "lead-101",
    vehicle_vin: "1HGBH41JXMN109186",
    doc_type: "purchase_agreement",
    name: "Purchase Agreement - Rodriguez 2025 Accord",
    file_url: null,
    file_size_bytes: 245_760,
    mime_type: "application/pdf",
    uploaded_by: "Sarah Mitchell",
    signed: true,
    signed_at: "2026-03-25T15:30:00Z",
    notes: "Signed at delivery",
    tags: ["completed", "retail"],
    created_at: "2026-03-24T10:00:00Z",
  },
  {
    id: "doc-002",
    dealer_id: "default",
    deal_id: "deal-2026-001",
    lead_id: "lead-101",
    vehicle_vin: "1HGBH41JXMN109186",
    doc_type: "credit_app",
    name: "Credit Application - James Rodriguez",
    file_url: null,
    file_size_bytes: 128_000,
    mime_type: "application/pdf",
    uploaded_by: "Mark Johnson",
    signed: true,
    signed_at: "2026-03-23T14:20:00Z",
    notes: null,
    tags: ["finance"],
    created_at: "2026-03-23T14:00:00Z",
  },
  {
    id: "doc-003",
    dealer_id: "default",
    deal_id: "deal-2026-002",
    lead_id: "lead-088",
    vehicle_vin: "5YJSA1DG9DFP14705",
    doc_type: "insurance",
    name: "Insurance Binder - Chen Tesla Model 3",
    file_url: null,
    file_size_bytes: 89_000,
    mime_type: "application/pdf",
    uploaded_by: "Emily Chen",
    signed: false,
    signed_at: null,
    notes: "Waiting for updated declaration page",
    tags: ["pending"],
    created_at: "2026-03-26T09:30:00Z",
  },
  {
    id: "doc-004",
    dealer_id: "default",
    deal_id: null,
    lead_id: null,
    vehicle_vin: "2T1BURHE5JC073843",
    doc_type: "title",
    name: "Title - 2018 Toyota Corolla (trade-in)",
    file_url: null,
    file_size_bytes: 52_000,
    mime_type: "image/jpeg",
    uploaded_by: "Sarah Mitchell",
    signed: false,
    signed_at: null,
    notes: "Trade-in title, pending lien release",
    tags: ["trade-in"],
    created_at: "2026-03-27T08:15:00Z",
  },
  {
    id: "doc-005",
    dealer_id: "default",
    deal_id: "deal-2026-003",
    lead_id: "lead-095",
    vehicle_vin: "1G1YY22G965115431",
    doc_type: "disclosure",
    name: "Buyer's Guide - Washington Corvette",
    file_url: null,
    file_size_bytes: 34_500,
    mime_type: "application/pdf",
    uploaded_by: "Mark Johnson",
    signed: true,
    signed_at: "2026-03-26T16:00:00Z",
    notes: null,
    tags: ["compliance"],
    created_at: "2026-03-26T15:45:00Z",
  },
  {
    id: "doc-006",
    dealer_id: "default",
    deal_id: "deal-2026-001",
    lead_id: "lead-101",
    vehicle_vin: "1HGBH41JXMN109186",
    doc_type: "inspection",
    name: "Vehicle Inspection Report - 2025 Accord",
    file_url: null,
    file_size_bytes: 1_200_000,
    mime_type: "application/pdf",
    uploaded_by: "Tech Bay 3",
    signed: false,
    signed_at: null,
    notes: "PDI completed, minor paint touch-up noted",
    tags: ["service", "pdi"],
    created_at: "2026-03-22T11:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/documents                                                   */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get("deal_id");
  const leadId = searchParams.get("lead_id");
  const vin = searchParams.get("vehicle_vin");
  const docType = searchParams.get("doc_type");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      let sql = `SELECT * FROM documents WHERE dealer_id = $1 AND deleted_at IS NULL`;
      const params: unknown[] = [authResult.user.dealer_id];
      let idx = 2;

      if (dealId) { sql += ` AND deal_id = $${idx++}`; params.push(dealId); }
      if (leadId) { sql += ` AND lead_id = $${idx++}`; params.push(leadId); }
      if (vin) { sql += ` AND vehicle_vin = $${idx++}`; params.push(vin); }
      if (docType) { sql += ` AND doc_type = $${idx++}`; params.push(docType); }

      sql += ` ORDER BY created_at DESC LIMIT 200`;

      const result = await query(sql, params);
      return NextResponse.json({ documents: result.rows });
    } catch (err) {
      console.error("[api/admin/documents] DB error:", err);
    }
  }

  // Shadow mock with filters
  let docs = [...MOCK_DOCUMENTS];
  if (dealId) docs = docs.filter((d) => d.deal_id === dealId);
  if (leadId) docs = docs.filter((d) => d.lead_id === leadId);
  if (vin) docs = docs.filter((d) => d.vehicle_vin === vin);
  if (docType) docs = docs.filter((d) => d.doc_type === docType);

  return NextResponse.json({ documents: docs });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/documents                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const rl = await checkRateLimit(`documents:${authResult.user.dealer_id}`, 20, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", authResult.user.dealer_id, { route: "documents", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, doc_type, deal_id, lead_id, vehicle_vin, mime_type, file_size_bytes, notes, tags } = body as {
    name?: string;
    doc_type?: string;
    deal_id?: string;
    lead_id?: string;
    vehicle_vin?: string;
    mime_type?: string;
    file_size_bytes?: number;
    notes?: string;
    tags?: string[];
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 422 });
  }

  const validDocTypes = [
    "purchase_agreement", "title", "registration", "insurance", "disclosure",
    "credit_app", "trade_title", "lien_release", "inspection", "other",
  ];
  if (!doc_type || !validDocTypes.includes(doc_type)) {
    return NextResponse.json({ error: `doc_type must be one of: ${validDocTypes.join(", ")}` }, { status: 422 });
  }

  const id = `doc-${Date.now().toString(36)}`;
  const dealerId = authResult.user.dealer_id;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO documents (id, dealer_id, deal_id, lead_id, vehicle_vin, doc_type, name, mime_type, file_size_bytes, uploaded_by, notes, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          id, dealerId, deal_id ?? null, lead_id ?? null, vehicle_vin ?? null,
          doc_type, name.trim(), mime_type ?? null, file_size_bytes ?? null,
          authResult.user.name, notes ?? null, tags ?? [],
        ],
      );

      try { trackDocument("document.uploaded", dealerId, { doc_type, document_id: id }); } catch {}

      return NextResponse.json({ document: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/documents] DB insert error:", err);
    }
  }

  // Shadow mode
  const created = {
    id,
    dealer_id: dealerId,
    deal_id: deal_id ?? null,
    lead_id: lead_id ?? null,
    vehicle_vin: vehicle_vin ?? null,
    doc_type,
    name: name.trim(),
    file_url: null,
    file_size_bytes: file_size_bytes ?? null,
    mime_type: mime_type ?? null,
    uploaded_by: authResult.user.name,
    signed: false,
    signed_at: null,
    notes: notes ?? null,
    tags: tags ?? [],
    created_at: new Date().toISOString(),
  };

  try { trackDocument("document.uploaded", dealerId, { doc_type, document_id: id }); } catch {}

  return NextResponse.json({ document: created }, { status: 201 });
}
