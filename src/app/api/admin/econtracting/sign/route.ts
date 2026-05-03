/**
 * POST /api/admin/econtracting/sign — Simulate / initiate document signing
 *
 * In shadow mode: marks a document as signed and updates contract status.
 * In production: would call DocuSign/HelloSign API to initiate the signing ceremony.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackDocument, trackDeal, trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock state (shared with [contractId] route via module scope)        */
/* -------------------------------------------------------------------------- */

interface ContractDocument {
  type: string;
  name: string;
  status: "pending" | "sent" | "signed" | "declined";
  signed_at: string | null;
}

interface MockContract {
  id: string;
  dealer_id: string;
  deal_id: string;
  customer_name: string;
  customer_email: string;
  vehicle_description: string;
  provider: string;
  status: string;
  documents: ContractDocument[];
  envelope_id: string | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const MOCK_CONTRACTS: MockContract[] = [
  {
    id: "contract-001",
    dealer_id: "demo-dealer",
    deal_id: "deal-001",
    customer_name: "James Rodriguez",
    customer_email: "james.r@email.com",
    vehicle_description: "2024 Toyota Camry XSE",
    provider: "docusign",
    status: "completed",
    documents: [
      { type: "purchase_agreement", name: "Purchase Agreement", status: "signed", signed_at: "2026-03-28T15:30:00Z" },
      { type: "buyers_guide", name: "Buyer's Guide", status: "signed", signed_at: "2026-03-28T15:31:00Z" },
      { type: "odometer_disclosure", name: "Odometer Disclosure Statement", status: "signed", signed_at: "2026-03-28T15:32:00Z" },
      { type: "arbitration_agreement", name: "Arbitration Agreement", status: "signed", signed_at: "2026-03-28T15:33:00Z" },
    ],
    envelope_id: "ENV-DS-78341",
    sent_at: "2026-03-28T14:00:00Z",
    completed_at: "2026-03-28T15:33:00Z",
    expires_at: null,
    created_at: "2026-03-28T13:45:00Z",
    updated_at: "2026-03-28T15:33:00Z",
  },
  {
    id: "contract-002",
    dealer_id: "demo-dealer",
    deal_id: "deal-002",
    customer_name: "Sarah Mitchell",
    customer_email: "sarah.m@email.com",
    vehicle_description: "2025 Honda CR-V Hybrid Sport-L",
    provider: "docusign",
    status: "partially_signed",
    documents: [
      { type: "purchase_agreement", name: "Purchase Agreement", status: "signed", signed_at: "2026-03-29T10:15:00Z" },
      { type: "buyers_guide", name: "Buyer's Guide", status: "signed", signed_at: "2026-03-29T10:16:00Z" },
      { type: "odometer_disclosure", name: "Odometer Disclosure Statement", status: "sent", signed_at: null },
      { type: "credit_application", name: "Credit Application", status: "sent", signed_at: null },
    ],
    envelope_id: "ENV-DS-78342",
    sent_at: "2026-03-29T09:00:00Z",
    completed_at: null,
    expires_at: "2026-04-05T09:00:00Z",
    created_at: "2026-03-29T08:30:00Z",
    updated_at: "2026-03-29T10:16:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* POST /api/admin/econtracting/sign                                          */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`econtracting-sign:${dealerId}`, 20, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "econtracting/sign", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contractId = body.contract_id as string | undefined;
  const documentType = body.document_type as string | undefined;

  if (!contractId || !documentType) {
    return NextResponse.json(
      { error: "Missing required fields: contract_id, document_type" },
      { status: 422 },
    );
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const now = new Date().toISOString();

      // Update the specific document to signed
      const result = await query(
        `UPDATE contracts
            SET documents = (
              SELECT jsonb_agg(
                CASE WHEN doc->>'type' = $1 AND doc->>'status' IN ('pending', 'sent')
                  THEN doc || jsonb_build_object('status', 'signed', 'signed_at', $2::text)
                  ELSE doc
                END
              )
              FROM jsonb_array_elements(documents) AS doc
            ),
            updated_at = NOW()
          WHERE id = $3 AND dealer_id = $4
          RETURNING *`,
        [documentType, now, contractId, dealerId],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Contract not found" }, { status: 404 });
      }

      const contract = result.rows[0] as Record<string, unknown>;
      const docs = contract.documents as ContractDocument[];

      // Check if all documents are now signed
      const allSigned = docs.every((d) => d.status === "signed");
      const anySigned = docs.some((d) => d.status === "signed");

      let newStatus = contract.status as string;
      if (allSigned) {
        newStatus = "completed";
        await query(
          `UPDATE contracts SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND dealer_id = $2`,
          [contractId, dealerId],
        );
      } else if (anySigned) {
        newStatus = "partially_signed";
        await query(
          `UPDATE contracts SET status = 'partially_signed', updated_at = NOW() WHERE id = $1 AND dealer_id = $2`,
          [contractId, dealerId],
        );
      }

      try { trackDocument("document.signed", dealerId, { contract_id: contractId, document_type: documentType }); } catch {}
      if (allSigned) {
        try { trackDeal("deal.signed", dealerId, { contract_id: contractId, deal_id: String(contract.deal_id) }); } catch {}
      }

      return NextResponse.json({
        contract: { ...contract, status: newStatus },
        signed: true,
        all_complete: allSigned,
      });
    } catch (err) {
      console.error("[api/admin/econtracting/sign] DB error:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const contract = MOCK_CONTRACTS.find((c) => c.id === contractId);
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updatedDocs = contract.documents.map((d) => {
    if (d.type === documentType && (d.status === "pending" || d.status === "sent")) {
      return { ...d, status: "signed" as const, signed_at: now };
    }
    return d;
  });

  const allSigned = updatedDocs.every((d) => d.status === "signed");
  const anySigned = updatedDocs.some((d) => d.status === "signed");

  let newStatus: string = contract.status;
  if (allSigned) {
    newStatus = "completed";
  } else if (anySigned) {
    newStatus = "partially_signed";
  }

  // Mutate in-memory for subsequent reads
  contract.documents = updatedDocs;
  contract.status = newStatus as MockContract["status"];
  contract.updated_at = now;
  if (allSigned) {
    contract.completed_at = now;
  }

  try { trackDocument("document.signed", dealerId, { contract_id: contractId, document_type: documentType }); } catch {}
  if (allSigned) {
    try { trackDeal("deal.signed", dealerId, { contract_id: contractId, deal_id: contract.deal_id }); } catch {}
  }

  return NextResponse.json({
    contract,
    signed: true,
    all_complete: allSigned,
  });
}
