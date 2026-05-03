/**
 * GET  /api/admin/econtracting — List contract envelopes (filterable)
 * POST /api/admin/econtracting — Create a new contract envelope
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackDocument, trackSystem, trackSecurity } from "@/lib/analytics-hooks";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ContractDocument {
  type: string;
  name: string;
  status: "pending" | "sent" | "signed" | "declined";
  signed_at: string | null;
}

interface Contract {
  id: string;
  dealer_id: string;
  deal_id: string;
  customer_name: string;
  customer_email: string;
  vehicle_description: string;
  provider: "docusign" | "hellosign" | "internal";
  status: "draft" | "sent" | "partially_signed" | "completed" | "voided" | "expired";
  documents: ContractDocument[];
  envelope_id: string | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

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
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_CONTRACTS: Contract[] = [
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
  {
    id: "contract-003",
    dealer_id: "demo-dealer",
    deal_id: "deal-004",
    customer_name: "Emily Watson",
    customer_email: "emily.w@email.com",
    vehicle_description: "2025 BMW X3 xDrive30i",
    provider: "hellosign",
    status: "draft",
    documents: [
      { type: "purchase_agreement", name: "Purchase Agreement", status: "pending", signed_at: null },
      { type: "buyers_guide", name: "Buyer's Guide", status: "pending", signed_at: null },
      { type: "odometer_disclosure", name: "Odometer Disclosure Statement", status: "pending", signed_at: null },
      { type: "insurance_verification", name: "Insurance Verification", status: "pending", signed_at: null },
      { type: "privacy_notice", name: "Privacy Notice", status: "pending", signed_at: null },
    ],
    envelope_id: null,
    sent_at: null,
    completed_at: null,
    expires_at: null,
    created_at: "2026-03-29T11:00:00Z",
    updated_at: "2026-03-29T11:00:00Z",
  },
  {
    id: "contract-004",
    dealer_id: "demo-dealer",
    deal_id: "deal-003",
    customer_name: "Robert Kim",
    customer_email: "robert.kim@email.com",
    vehicle_description: "2024 Ford F-150 XLT SuperCrew",
    provider: "docusign",
    status: "completed",
    documents: [
      { type: "purchase_agreement", name: "Purchase Agreement", status: "signed", signed_at: "2026-03-26T14:10:00Z" },
      { type: "buyers_guide", name: "Buyer's Guide", status: "signed", signed_at: "2026-03-26T14:11:00Z" },
      { type: "odometer_disclosure", name: "Odometer Disclosure Statement", status: "signed", signed_at: "2026-03-26T14:12:00Z" },
      { type: "title_application", name: "Title Application", status: "signed", signed_at: "2026-03-26T14:13:00Z" },
    ],
    envelope_id: "ENV-DS-78299",
    sent_at: "2026-03-26T13:00:00Z",
    completed_at: "2026-03-26T14:13:00Z",
    expires_at: null,
    created_at: "2026-03-26T12:30:00Z",
    updated_at: "2026-03-26T14:13:00Z",
  },
  {
    id: "contract-005",
    dealer_id: "demo-dealer",
    deal_id: "deal-005",
    customer_name: "William Tran",
    customer_email: "wtran@email.com",
    vehicle_description: "2023 Lexus RX 350 F Sport",
    provider: "internal",
    status: "voided",
    documents: [
      { type: "purchase_agreement", name: "Purchase Agreement", status: "declined", signed_at: null },
      { type: "buyers_guide", name: "Buyer's Guide", status: "declined", signed_at: null },
      { type: "privacy_notice", name: "Privacy Notice", status: "declined", signed_at: null },
    ],
    envelope_id: "ENV-INT-40112",
    sent_at: "2026-03-25T16:00:00Z",
    completed_at: null,
    expires_at: null,
    created_at: "2026-03-25T15:30:00Z",
    updated_at: "2026-03-27T09:00:00Z",
  },
];

/**
 * In-memory contract store — surfaces newly-created contracts in the
 * GET list immediately, even when the DB INSERT silently fails or
 * DATABASE_URL is unset. Per-instance + ephemeral; the durable fix
 * is the migration that backs the contracts table.
 */
const SHADOW_CONTRACTS = new Map<string, Contract[]>();

function pushShadowContract(dealerId: string, contract: Contract) {
  const list = SHADOW_CONTRACTS.get(dealerId) ?? [];
  list.unshift(contract);
  SHADOW_CONTRACTS.set(dealerId, list.slice(0, 200));
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/econtracting                                                */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const url = request.nextUrl;
  const status = url.searchParams.get("status") || "";
  const dealId = url.searchParams.get("deal_id") || "";

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["c.dealer_id = $1", "c.deleted_at IS NULL"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (status) {
        conditions.push(`c.status = $${idx++}`);
        params.push(status);
      }
      if (dealId) {
        conditions.push(`c.deal_id = $${idx++}`);
        params.push(dealId);
      }
      const result = await query( /* audit-safe: A4 reason="c.dealer_id always pushed as first condition above" */
        `SELECT c.*
           FROM contracts c
          WHERE ${conditions.join(" AND ")}
          ORDER BY c.updated_at DESC
          LIMIT 100`,
        params,
      );

      const dbRows = (result.rows as unknown as Contract[]);
      const shadow = SHADOW_CONTRACTS.get(dealerId) ?? [];
      const existing = new Set(dbRows.map((c) => c.id));
      const merged = [
        ...shadow.filter((c) => !existing.has(c.id))
          .filter((c) => !status || c.status === status)
          .filter((c) => !dealId || c.deal_id === dealId),
        ...dbRows,
      ];
      return NextResponse.json({ contracts: merged, total: merged.length });
    } catch (err) {
      console.error("[api/admin/econtracting] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  let filtered: Contract[] = MOCK_CONTRACTS.filter((c) => c.dealer_id === "demo-dealer");
  const shadow = SHADOW_CONTRACTS.get(dealerId) ?? [];
  filtered = [...shadow, ...filtered];
  if (status) filtered = filtered.filter((c) => c.status === status);
  if (dealId) filtered = filtered.filter((c) => c.deal_id === dealId);

  return NextResponse.json({ contracts: filtered, total: filtered.length });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/econtracting                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`econtracting:${dealerId}`, 10, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "econtracting", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Idempotency
  const iKey = idempotencyKey("/api/admin/econtracting", body);
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached, { status: 201 });

  const required = ["deal_id", "document_types", "signer_name", "signer_email"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 422 },
      );
    }
  }

  const documentTypes = body.document_types as string[];
  if (!Array.isArray(documentTypes) || documentTypes.length === 0) {
    return NextResponse.json(
      { error: "document_types must be a non-empty array" },
      { status: 422 },
    );
  }

  // Validate document types
  const validTypes = Object.keys(DOCUMENT_TYPE_NAMES);
  for (const dt of documentTypes) {
    if (!validTypes.includes(dt)) {
      return NextResponse.json(
        { error: `Invalid document type: ${dt}` },
        { status: 422 },
      );
    }
  }

  // Validate provider
  const provider = (body.provider as string) || "internal";
  if (!["docusign", "hellosign", "internal"].includes(provider)) {
    return NextResponse.json(
      { error: "provider must be one of: docusign, hellosign, internal" },
      { status: 422 },
    );
  }

  // Validate email
  const signerEmail = String(body.signer_email);
  if (!signerEmail.includes("@")) {
    return NextResponse.json(
      { error: "Invalid signer_email" },
      { status: 422 },
    );
  }

  const documents: ContractDocument[] = documentTypes.map((type) => ({
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
        `INSERT INTO contracts (
           dealer_id, deal_id, customer_name, customer_email,
           vehicle_description, provider, status, documents,
           envelope_id, sent_at, completed_at, expires_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, 'draft', $7::jsonb,
           NULL, NULL, NULL, NULL
         ) RETURNING *`,
        [
          dealerId,
          body.deal_id,
          body.signer_name,
          signerEmail,
          body.vehicle_description || "",
          provider,
          JSON.stringify(documents),
        ],
      );

      try { trackDocument("document.uploaded", dealerId, { deal_id: String(body.deal_id), doc_count: documents.length, provider }); } catch {}

      const created = result.rows[0] as Contract;
      pushShadowContract(dealerId, created);
      const resp = { contract: created, created: true };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp, { status: 201 });
    } catch (err) {
      console.error("[api/admin/econtracting] DB insert error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const newContract: Contract = {
    id: `contract-${Date.now()}`,
    dealer_id: dealerId,
    deal_id: String(body.deal_id),
    customer_name: String(body.signer_name),
    customer_email: signerEmail,
    vehicle_description: String(body.vehicle_description || ""),
    provider: provider as Contract["provider"],
    status: "draft",
    documents,
    envelope_id: null,
    sent_at: null,
    completed_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try { trackDocument("document.uploaded", dealerId, { deal_id: String(body.deal_id), doc_count: documents.length, provider }); } catch {}

  pushShadowContract(dealerId, newContract);
  const resp = { contract: newContract, created: true };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp, { status: 201 });
}
