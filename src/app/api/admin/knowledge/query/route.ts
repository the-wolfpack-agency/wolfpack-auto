import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/**
 * Knowledge Store Query Endpoint
 *
 * POST /api/admin/knowledge/query
 *   Query the knowledge base for relevant documents.
 *   Body: { query: string, doc_types?: string[], limit?: number }
 *
 * Shadow mode: return mock results based on query keywords.
 * Production (QDRANT_URL + AI): would do semantic vector search.
 */

/* -------------------------------------------------------------------------- */
/* Shadow mock search results                                                 */
/* -------------------------------------------------------------------------- */

interface KnowledgeResult {
  document_id: string;
  doc_type: string;
  relevance_score: number;
  excerpt: string;
  title: string;
}

const MOCK_KNOWLEDGE_BASE: KnowledgeResult[] = [
  {
    document_id: "kb-001",
    doc_type: "purchase_agreement",
    relevance_score: 0.95,
    title: "Standard Purchase Agreement Template",
    excerpt: "The Annual Percentage Rate (APR) must be disclosed conspicuously in the purchase agreement per TILA Regulation Z Section 226.18. The finance charge, total of payments, and payment schedule must all be clearly stated.",
  },
  {
    document_id: "kb-004",
    doc_type: "disclosure",
    relevance_score: 0.92,
    title: "TILA Regulation Z Disclosure Template",
    excerpt: "Truth in Lending disclosures require: APR, finance charge, amount financed, total of payments, and payment schedule. Trigger terms in advertising require full disclosure of all credit terms.",
  },
  {
    document_id: "kb-002",
    doc_type: "credit_app",
    relevance_score: 0.88,
    title: "Credit Application Form v3.2",
    excerpt: "FCRA authorization must be signed before pulling credit. The Equal Credit Opportunity Act (ECOA) notice must be provided. Gramm-Leach-Bliley privacy notice is required for all applicants.",
  },
  {
    document_id: "kb-003",
    doc_type: "disclosure",
    relevance_score: 0.85,
    title: "FTC Buyer's Guide - Used Vehicle",
    excerpt: "The FTC Used Car Rule (16 CFR 455) requires dealers to display a Buyer's Guide on all used vehicles. Must indicate warranty terms or AS-IS status. Guide becomes part of the sales contract.",
  },
  {
    document_id: "kb-006",
    doc_type: "title",
    relevance_score: 0.82,
    title: "Title Transfer Requirements by State",
    excerpt: "Federal odometer disclosure required on all title transfers per 49 USC 32705. Title branding (salvage, rebuilt, flood) must be disclosed to buyer in writing before sale completion.",
  },
  {
    document_id: "kb-007",
    doc_type: "marketing",
    relevance_score: 0.78,
    title: "TILA Trigger Terms Advertising Guide",
    excerpt: "When advertising a monthly payment amount, dealers must include all TILA trigger terms: APR, number of payments, down payment amount, and total of payments per Reg Z Section 226.24.",
  },
  {
    document_id: "kb-011",
    doc_type: "credit_app",
    relevance_score: 0.75,
    title: "ECOA Adverse Action Notice Template",
    excerpt: "Adverse action notices must be provided within 30 days of credit denial per ECOA Section 1002.9. Must include specific reasons for denial and applicant's right to request the credit report.",
  },
  {
    document_id: "kb-012",
    doc_type: "disclosure",
    relevance_score: 0.72,
    title: "GLBA Privacy Notice Template",
    excerpt: "The Gramm-Leach-Bliley Act requires financial institutions to provide privacy notices explaining information-sharing practices. Must be given at account opening and annually thereafter.",
  },
  {
    document_id: "kb-005",
    doc_type: "insurance",
    relevance_score: 0.68,
    title: "Insurance Verification Checklist",
    excerpt: "Proof of insurance must be obtained and verified before vehicle delivery. Minimum coverage requirements vary by state. Dealer must retain copy of insurance card or binder in deal jacket.",
  },
  {
    document_id: "kb-008",
    doc_type: "lien_release",
    relevance_score: 0.65,
    title: "Lien Release Process Documentation",
    excerpt: "Upon payoff of a vehicle loan, the lienholder must provide a lien release within the timeframe specified by state law. Dealer must verify clear title before resale of trade-in vehicles.",
  },
];

function searchMockKnowledge(
  queryText: string,
  docTypes?: string[],
  limit: number = 5,
): KnowledgeResult[] {
  const queryLower = queryText.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  let results = MOCK_KNOWLEDGE_BASE.map((doc) => {
    const textToSearch = `${doc.title} ${doc.excerpt} ${doc.doc_type}`.toLowerCase();
    let score = doc.relevance_score;

    // Boost score based on keyword matches
    let matches = 0;
    for (const kw of keywords) {
      if (textToSearch.includes(kw)) matches++;
    }
    if (keywords.length > 0) {
      score = Math.min(0.99, score + (matches / keywords.length) * 0.15);
    }

    return { ...doc, relevance_score: Math.round(score * 100) / 100 };
  });

  // Filter by doc_types if provided
  if (docTypes && docTypes.length > 0) {
    results = results.filter((r) => docTypes.includes(r.doc_type));
  }

  // Sort by relevance descending
  results.sort((a, b) => b.relevance_score - a.relevance_score);

  return results.slice(0, limit);
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

  const { query: queryText, doc_types, limit } = body as {
    query?: string;
    doc_types?: string[];
    limit?: number;
  };

  if (!queryText || typeof queryText !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const maxResults = Math.min(limit ?? 5, 20);

  // Track analytics event
  try {
    const { trackKnowledge } = await import("@/lib/analytics-hooks");
    trackKnowledge("knowledge.queried", authResult.user.dealer_id, {
      query_length: queryText.length,
      doc_types_filter: (doc_types ?? []).join(",") || "all",
      limit: maxResults,
    });
  } catch {}

  // Shadow mode: return mock results based on keyword matching
  if (!process.env.QDRANT_URL) {
    const results = searchMockKnowledge(queryText, doc_types, maxResults);
    return NextResponse.json({
      results,
      total: results.length,
      query: queryText,
      mode: "shadow",
    });
  }

  // Production: would do semantic search via Qdrant + embeddings
  try {
    // Future:
    // const embedding = await createEmbedding(queryText);
    // const qdrantResults = await qdrantClient.search(collectionName, { vector: embedding, limit: maxResults, filter: docTypes ? { doc_type: docTypes } : undefined });

    // For now, use keyword-based mock
    const results = searchMockKnowledge(queryText, doc_types, maxResults);
    return NextResponse.json({
      results,
      total: results.length,
      query: queryText,
      mode: "shadow",
    });
  } catch {
    // Fallback: return mock results instead of 500
    const results = searchMockKnowledge(queryText, doc_types, maxResults);
    return NextResponse.json({
      results,
      total: results.length,
      query: queryText,
      mode: "shadow",
    });
  }
}
