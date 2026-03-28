import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { analyzeDocument, analyzeDealJacket, getComplianceRules } from "@/lib/document-analyzer";
import type { DocCategory } from "@/lib/document-analyzer";

/**
 * POST /api/admin/documents/analyze
 *
 * Analyze a single document or complete deal jacket for compliance issues.
 *
 * Body (single doc):  { document_id, doc_type, metadata? }
 * Body (deal jacket): { deal_id, documents: [{id, doc_type, signed, name}] }
 *
 * GET /api/admin/documents/analyze
 *
 * Returns the compliance rules reference.
 */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    const rules = getComplianceRules();
    return NextResponse.json({ rules, total_rules: rules.length, categories: [...new Set(rules.map((r) => r.category))] });
  }

  return NextResponse.json({
    rules: getComplianceRules(),
    total_rules: getComplianceRules().length,
    categories: [...new Set(getComplianceRules().map((r) => r.category))],
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    // Document analysis is pure computation — proceed with the analysis logic below
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Deal jacket analysis
  if (body.deal_id && Array.isArray(body.documents)) {
    const result = analyzeDealJacket(
      body.deal_id,
      body.documents.map((d: any) => ({
        id: d.id ?? "",
        doc_type: d.doc_type ?? "other",
        signed: d.signed ?? false,
        name: d.name ?? "Unknown",
      })),
    );

    try {
      const { trackDocument } = await import("@/lib/analytics-hooks");
      trackDocument("document.deal_jacket_analyzed", authResult.user.dealer_id, {
        deal_id: body.deal_id,
        score: result.overall_score,
        ready_to_fund: result.ready_to_fund,
        blockers: result.blockers.length,
      });
    } catch {}

    return NextResponse.json(result);
  }

  // Single document analysis
  if (!body.document_id || !body.doc_type) {
    return NextResponse.json(
      { error: "document_id and doc_type are required (or provide deal_id + documents for jacket analysis)" },
      { status: 400 },
    );
  }

  const result = analyzeDocument(
    body.document_id,
    body.doc_type as DocCategory,
    body.metadata ?? {},
  );

  try {
    const { trackDocument } = await import("@/lib/analytics-hooks");
    trackDocument("document.analyzed", authResult.user.dealer_id, {
      doc_type: body.doc_type,
      score: result.score,
      issues: result.issues.length,
      passed: result.passed,
    });
  } catch {}

  return NextResponse.json(result);
}
