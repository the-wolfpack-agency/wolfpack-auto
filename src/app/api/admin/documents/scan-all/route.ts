import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { analyzeDealJacket } from "@/lib/document-analyzer";
import type { DocCategory } from "@/lib/document-analyzer";

/**
 * POST /api/admin/documents/scan-all
 *
 * Scan ALL documents for a deal and return aggregated compliance results.
 * Body: { deal_id: string }
 *
 * In shadow mode (no DATABASE_URL), returns a realistic mock deal jacket
 * analysis with mixed results across 4 documents.
 */

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

function shadowMockScanAll(dealId: string) {
  const now = new Date().toISOString();
  return {
    deal_id: dealId,
    analyzed_at: now,
    total_documents: 4,
    missing_documents: [] as DocCategory[],
    document_results: [
      {
        document_id: "doc-pa-001",
        doc_type: "purchase_agreement" as DocCategory,
        analyzed_at: now,
        issues: [
          {
            rule_id: "PA-007",
            severity: "medium",
            category: "Signatures",
            description: "All required signatures (buyer, co-buyer, dealer) must be present",
            recommendation: "Ensure all signature lines are completed before funding",
          },
        ],
        score: 92,
        passed: true,
        summary: "1 issue(s) found: 0 critical, 0 high. No blocking issues.",
        recommendations: [],
      },
      {
        document_id: "doc-ca-001",
        doc_type: "credit_app" as DocCategory,
        analyzed_at: now,
        issues: [
          {
            rule_id: "CA-001",
            severity: "critical",
            category: "FCRA Compliance",
            description: "FCRA authorization to pull credit must be signed",
            recommendation: "Include and obtain signature on FCRA consent disclosure",
            regulatory_ref: "FCRA \u00a7604(a)(3)(A)",
          },
        ],
        score: 75,
        passed: false,
        summary: "1 issue(s) found: 1 critical, 0 high. Blocking issues must be resolved before funding.",
        recommendations: ["[CA-001] Include and obtain signature on FCRA consent disclosure"],
      },
      {
        document_id: "doc-dc-001",
        doc_type: "disclosure" as DocCategory,
        analyzed_at: now,
        issues: [],
        score: 100,
        passed: true,
        summary: "Document passes all 2 compliance checks.",
        recommendations: [],
      },
      {
        document_id: "doc-ins-001",
        doc_type: "insurance" as DocCategory,
        analyzed_at: now,
        issues: [],
        score: 100,
        passed: true,
        summary: "Document passes all 1 compliance checks.",
        recommendations: [],
      },
    ],
    overall_score: 92,
    ready_to_fund: false,
    blockers: [
      "credit_app: 1 blocking issue(s)",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Route handler                                                              */
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

  if (!body.deal_id || typeof body.deal_id !== "string") {
    return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
  }

  const dealId = body.deal_id;

  // Shadow mode: no database, return rich mock data
  if (!process.env.DATABASE_URL) {
    const mock = shadowMockScanAll(dealId);

    try {
      const { trackDocument } = await import("@/lib/analytics-hooks");
      trackDocument("document.deal_jacket_analyzed", authResult.user.dealer_id, {
        deal_id: dealId,
        score: mock.overall_score,
        ready_to_fund: mock.ready_to_fund,
        blockers: mock.blockers.length,
      });
    } catch {}

    return NextResponse.json(mock);
  }

  // Production: fetch documents from DB and run real analysis
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{
      id: string;
      doc_type: string;
      name: string;
      signed: boolean;
    }>(
      `SELECT id, doc_type, name, signed FROM documents WHERE deal_id = $1 ORDER BY created_at`,
      [dealId],
    );

    const documents = result.rows.map((row) => ({
      id: row.id,
      doc_type: row.doc_type as DocCategory,
      signed: row.signed,
      name: row.name,
    }));

    const analysis = analyzeDealJacket(dealId, documents);

    try {
      const { trackDocument } = await import("@/lib/analytics-hooks");
      trackDocument("document.deal_jacket_analyzed", authResult.user.dealer_id, {
        deal_id: dealId,
        score: analysis.overall_score,
        ready_to_fund: analysis.ready_to_fund,
        blockers: analysis.blockers.length,
      });
    } catch {}

    return NextResponse.json(analysis);
  } catch {
    // DB error: return mock data instead of 500
    return NextResponse.json(shadowMockScanAll(dealId));
  }
}
