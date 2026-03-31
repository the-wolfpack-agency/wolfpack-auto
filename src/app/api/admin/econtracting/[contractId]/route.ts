/**
 * GET   /api/admin/econtracting/[contractId] — Single contract detail
 * PATCH /api/admin/econtracting/[contractId] — Update contract (resend, void, add documents)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDocument, trackSystem, trackDeal } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Document type labels                                                       */
/* -------------------------------------------------------------------------- */

const DOCUMENT_TYPE_NAMES: Record<string, string> = {
  purchase_agreement: "Purchase Agreement",
  buyers_guide: "Buyer's Guide",
  odometer_disclosure: "Odometer Disclosure Statement",
  title_application: "Title Application",
  insurance_verification: "Insurance Verification",
  arbitration_agreement: "Arbitration Agreement",
  privacy_notice: "Privacy Notice",
  credit_application: "Credit Application",
};

/* -------------------------------------------------------------------------- */
/* Shadow mock — single contract                                              */
/* -------------------------------------------------------------------------- */

const MOCK_CONTRACT = {
  id: "contract-001",
  dealer_id: "demo-dealer",
  deal_id: "deal-001",
  customer_name: "James Rodriguez",
  customer_email: "james.r@email.com",
  vehicle_description: "2024 Toyota Camry XSE",
  provider: "docusign" as const,
  status: "completed" as const,
  documents: [
    { type: "purchase_agreement", name: "Purchase Agreement", status: "signed" as const, signed_at: "2026-03-28T15:30:00Z" },
    { type: "buyers_guide", name: "Buyer's Guide", status: "signed" as const, signed_at: "2026-03-28T15:31:00Z" },
    { type: "odometer_disclosure", name: "Odometer Disclosure Statement", status: "signed" as const, signed_at: "2026-03-28T15:32:00Z" },
    { type: "arbitration_agreement", name: "Arbitration Agreement", status: "signed" as const, signed_at: "2026-03-28T15:33:00Z" },
  ],
  envelope_id: "ENV-DS-78341",
  sent_at: "2026-03-28T14:00:00Z",
  completed_at: "2026-03-28T15:33:00Z",
  expires_at: null,
  created_at: "2026-03-28T13:45:00Z",
  updated_at: "2026-03-28T15:33:00Z",
};

/* -------------------------------------------------------------------------- */
/* In-memory mutation store for shadow mode                                   */
/* -------------------------------------------------------------------------- */

const mutations = new Map<string, Record<string, unknown>>();

/* -------------------------------------------------------------------------- */
/* GET /api/admin/econtracting/[contractId]                                   */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { contractId } = await params;

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT * FROM contracts WHERE id = $1 AND dealer_id = $2`,
        [contractId, dealerId],
      );
      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Contract not found" }, { status: 404 });
      }
      return NextResponse.json({ contract: result.rows[0] });
    } catch (err) {
      console.error(`[api/admin/econtracting/${contractId}] DB error:`, err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const overrides = mutations.get(contractId) ?? {};
  return NextResponse.json({ contract: { ...MOCK_CONTRACT, id: contractId, ...overrides } });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/econtracting/[contractId]                                 */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { contractId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string | undefined;

  /* ---- Action: send envelope ---- */
  if (action === "send") {
    /* ---- DB path ---- */
    if (process.env.DATABASE_URL) {
      try {
        const { query } = await import("@/lib/db");
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const envelopeId = `ENV-${Date.now()}`;

        const result = await query(
          `UPDATE contracts
              SET status = 'sent',
                  envelope_id = $1,
                  sent_at = $2,
                  expires_at = $3,
                  documents = (
                    SELECT jsonb_agg(
                      CASE WHEN doc->>'status' = 'pending'
                        THEN jsonb_set(doc, '{status}', '"sent"')
                        ELSE doc
                      END
                    )
                    FROM jsonb_array_elements(documents) AS doc
                  ),
                  updated_at = NOW()
            WHERE id = $4 AND dealer_id = $5 AND status = 'draft'
            RETURNING *`,
          [envelopeId, now, expiresAt, contractId, dealerId],
        );

        if ((result.rows as unknown[]).length === 0) {
          return NextResponse.json({ error: "Contract not found or not in draft status" }, { status: 404 });
        }

        try { trackSystem("system.econtracting_sent" as "system.vehicle_updated", dealerId, { contract_id: contractId, envelope_id: envelopeId }); } catch {}

        return NextResponse.json({ contract: result.rows[0], updated: true });
      } catch (err) {
        console.error(`[api/admin/econtracting/${contractId}] DB send error:`, err);
      }
    }

    /* ---- Shadow mode: send ---- */
    const existing = mutations.get(contractId) ?? {};
    const currentDocs = (existing.documents as { type: string; name: string; status: string; signed_at: string | null }[]) || MOCK_CONTRACT.documents;
    const updatedDocs = currentDocs.map((d) => ({
      ...d,
      status: d.status === "pending" ? "sent" : d.status,
    }));
    const now = new Date().toISOString();
    const envelopeId = `ENV-${Date.now()}`;
    const merged = {
      ...existing,
      status: "sent",
      documents: updatedDocs,
      envelope_id: envelopeId,
      sent_at: now,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now,
    };
    mutations.set(contractId, merged);

    try { trackSystem("system.econtracting_sent" as "system.vehicle_updated", dealerId, { contract_id: contractId, envelope_id: envelopeId }); } catch {}

    return NextResponse.json({
      contract: { ...MOCK_CONTRACT, id: contractId, ...merged },
      updated: true,
    });
  }

  /* ---- Action: void ---- */
  if (action === "void") {
    /* ---- DB path ---- */
    if (process.env.DATABASE_URL) {
      try {
        const { query } = await import("@/lib/db");
        const result = await query(
          `UPDATE contracts
              SET status = 'voided',
                  documents = (
                    SELECT jsonb_agg(
                      CASE WHEN doc->>'status' IN ('pending', 'sent')
                        THEN jsonb_set(doc, '{status}', '"declined"')
                        ELSE doc
                      END
                    )
                    FROM jsonb_array_elements(documents) AS doc
                  ),
                  updated_at = NOW()
            WHERE id = $1 AND dealer_id = $2 AND status NOT IN ('completed', 'voided')
            RETURNING *`,
          [contractId, dealerId],
        );

        if ((result.rows as unknown[]).length === 0) {
          return NextResponse.json({ error: "Contract not found or cannot be voided" }, { status: 404 });
        }

        return NextResponse.json({ contract: result.rows[0], updated: true });
      } catch (err) {
        console.error(`[api/admin/econtracting/${contractId}] DB void error:`, err);
      }
    }

    /* ---- Shadow mode: void ---- */
    const existing = mutations.get(contractId) ?? {};
    const currentDocs = (existing.documents as { type: string; name: string; status: string; signed_at: string | null }[]) || MOCK_CONTRACT.documents;
    const updatedDocs = currentDocs.map((d) => ({
      ...d,
      status: (d.status === "pending" || d.status === "sent") ? "declined" : d.status,
    }));
    const merged = {
      ...existing,
      status: "voided",
      documents: updatedDocs,
      updated_at: new Date().toISOString(),
    };
    mutations.set(contractId, merged);

    return NextResponse.json({
      contract: { ...MOCK_CONTRACT, id: contractId, ...merged },
      updated: true,
    });
  }

  /* ---- Action: add_documents ---- */
  if (action === "add_documents") {
    const newTypes = body.document_types as string[] | undefined;
    if (!Array.isArray(newTypes) || newTypes.length === 0) {
      return NextResponse.json({ error: "document_types must be a non-empty array" }, { status: 422 });
    }

    const validTypes = Object.keys(DOCUMENT_TYPE_NAMES);
    for (const dt of newTypes) {
      if (!validTypes.includes(dt)) {
        return NextResponse.json({ error: `Invalid document type: ${dt}` }, { status: 422 });
      }
    }

    const newDocs = newTypes.map((type) => ({
      type,
      name: DOCUMENT_TYPE_NAMES[type] || type,
      status: "pending" as const,
      signed_at: null,
    }));

    /* ---- DB path ---- */
    if (process.env.DATABASE_URL) {
      try {
        const { query } = await import("@/lib/db");
        const result = await query(
          `UPDATE contracts
              SET documents = documents || $1::jsonb,
                  updated_at = NOW()
            WHERE id = $2 AND dealer_id = $3
            RETURNING *`,
          [JSON.stringify(newDocs), contractId, dealerId],
        );

        if ((result.rows as unknown[]).length === 0) {
          return NextResponse.json({ error: "Contract not found" }, { status: 404 });
        }

        try { trackDocument("document.uploaded", dealerId, { contract_id: contractId, doc_count: newDocs.length }); } catch {}

        return NextResponse.json({ contract: result.rows[0], updated: true });
      } catch (err) {
        console.error(`[api/admin/econtracting/${contractId}] DB add_documents error:`, err);
      }
    }

    /* ---- Shadow mode: add_documents ---- */
    const existing = mutations.get(contractId) ?? {};
    const currentDocs = (existing.documents as { type: string; name: string; status: string; signed_at: string | null }[]) || [...MOCK_CONTRACT.documents];
    const merged = {
      ...existing,
      documents: [...currentDocs, ...newDocs],
      updated_at: new Date().toISOString(),
    };
    mutations.set(contractId, merged);

    try { trackDocument("document.uploaded", dealerId, { contract_id: contractId, doc_count: newDocs.length }); } catch {}

    return NextResponse.json({
      contract: { ...MOCK_CONTRACT, id: contractId, ...merged },
      updated: true,
    });
  }

  return NextResponse.json({ error: "Unknown action. Use: send, void, add_documents" }, { status: 422 });
}
