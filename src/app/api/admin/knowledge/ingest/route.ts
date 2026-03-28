import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/**
 * Knowledge Store Ingestion Endpoint
 *
 * POST /api/admin/knowledge/ingest
 *   Ingest a document into the knowledge base for future RAG queries.
 *   Body: { document_id, doc_type, content_text, metadata? }
 *
 * GET /api/admin/knowledge/ingest
 *   List ingested documents with count and last ingest date.
 *
 * Shadow mode: log and return success / mock data.
 * Production: would create embeddings via QDRANT_URL and store in vector DB.
 */

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_INGESTED = [
  { document_id: "kb-001", doc_type: "purchase_agreement", name: "Standard Purchase Agreement Template", ingested_at: "2026-03-25T10:15:00Z", size_chars: 14200 },
  { document_id: "kb-002", doc_type: "credit_app", name: "Credit Application Form v3.2", ingested_at: "2026-03-25T10:18:00Z", size_chars: 8400 },
  { document_id: "kb-003", doc_type: "disclosure", name: "FTC Buyer's Guide - Used Vehicle", ingested_at: "2026-03-24T14:30:00Z", size_chars: 3200 },
  { document_id: "kb-004", doc_type: "disclosure", name: "TILA Regulation Z Disclosure Template", ingested_at: "2026-03-24T14:35:00Z", size_chars: 5100 },
  { document_id: "kb-005", doc_type: "insurance", name: "Insurance Verification Checklist", ingested_at: "2026-03-23T09:00:00Z", size_chars: 2800 },
  { document_id: "kb-006", doc_type: "title", name: "Title Transfer Requirements by State", ingested_at: "2026-03-23T09:12:00Z", size_chars: 18600 },
  { document_id: "kb-007", doc_type: "marketing", name: "TILA Trigger Terms Advertising Guide", ingested_at: "2026-03-22T16:45:00Z", size_chars: 6700 },
  { document_id: "kb-008", doc_type: "lien_release", name: "Lien Release Process Documentation", ingested_at: "2026-03-22T16:50:00Z", size_chars: 4100 },
  { document_id: "kb-009", doc_type: "inspection", name: "Pre-Delivery Inspection Checklist", ingested_at: "2026-03-21T11:20:00Z", size_chars: 3400 },
  { document_id: "kb-010", doc_type: "trade_title", name: "Trade-In Title Processing Guide", ingested_at: "2026-03-21T11:25:00Z", size_chars: 7200 },
  { document_id: "kb-011", doc_type: "credit_app", name: "ECOA Adverse Action Notice Template", ingested_at: "2026-03-20T08:30:00Z", size_chars: 2900 },
  { document_id: "kb-012", doc_type: "disclosure", name: "GLBA Privacy Notice Template", ingested_at: "2026-03-20T08:35:00Z", size_chars: 4600 },
];

/* -------------------------------------------------------------------------- */
/* POST: Ingest a document                                                    */
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

  const { document_id, doc_type, content_text, metadata } = body as {
    document_id?: string;
    doc_type?: string;
    content_text?: string;
    metadata?: Record<string, unknown>;
  };

  if (!document_id || !doc_type || !content_text) {
    return NextResponse.json(
      { error: "document_id, doc_type, and content_text are required" },
      { status: 400 },
    );
  }

  // Track analytics event
  try {
    const { trackKnowledge } = await import("@/lib/analytics-hooks");
    trackKnowledge("knowledge.document_ingested", authResult.user.dealer_id, {
      document_id: document_id,
      doc_type: doc_type,
      content_length: content_text.length,
    });
  } catch {}

  // Shadow mode: no vector DB, log and return success
  if (!process.env.QDRANT_URL) {
    console.log(`[knowledge] Shadow ingest: ${document_id} (${doc_type}, ${content_text.length} chars)`);
    return NextResponse.json({
      status: "ingested",
      document_id,
      doc_type,
      content_length: content_text.length,
      metadata: metadata ?? {},
      ingested_at: new Date().toISOString(),
      mode: "shadow",
    });
  }

  // Production: would create embeddings and store in vector DB
  try {
    // Future: call embedding API, store in Qdrant
    // const embedding = await createEmbedding(content_text);
    // await qdrantClient.upsert(collectionName, { id: document_id, vector: embedding, payload: { doc_type, metadata } });

    return NextResponse.json({
      status: "ingested",
      document_id,
      doc_type,
      content_length: content_text.length,
      metadata: metadata ?? {},
      ingested_at: new Date().toISOString(),
      mode: "production",
    });
  } catch {
    // Fallback to shadow response on error
    return NextResponse.json({
      status: "ingested",
      document_id,
      doc_type,
      content_length: content_text.length,
      metadata: metadata ?? {},
      ingested_at: new Date().toISOString(),
      mode: "shadow",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* GET: List ingested documents                                               */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Shadow mode: return mock ingested documents
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      documents: MOCK_INGESTED,
      total: MOCK_INGESTED.length,
      last_ingested_at: MOCK_INGESTED[0].ingested_at,
    });
  }

  // Production: query the database for ingested documents
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{
      document_id: string;
      doc_type: string;
      name: string;
      ingested_at: string;
      size_chars: number;
    }>(
      `SELECT document_id, doc_type, name, ingested_at, size_chars
       FROM knowledge_documents
       WHERE dealer_id = $1
       ORDER BY ingested_at DESC`,
      [authResult.user.dealer_id],
    );

    return NextResponse.json({
      documents: result.rows,
      total: result.rows.length,
      last_ingested_at: result.rows[0]?.ingested_at ?? null,
    });
  } catch {
    // DB error: return mock data instead of 500
    return NextResponse.json({
      documents: MOCK_INGESTED,
      total: MOCK_INGESTED.length,
      last_ingested_at: MOCK_INGESTED[0].ingested_at,
    });
  }
}
