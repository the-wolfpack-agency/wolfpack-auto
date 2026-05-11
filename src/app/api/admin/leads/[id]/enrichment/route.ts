/**
 * GET /api/admin/leads/:id/enrichment
 *
 * Returns the latest enrichment + routing decision (and a derived score
 * card from the decision_factors blob) for a single lead. Admin-only,
 * scoped to the authenticated user's dealer.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const { id } = await params;
  const dealerId = getDealerId(auth);

  // Shadow-mode response — synthetic stub so the UI can render.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      lead_id: id,
      dealer_id: dealerId,
      enrichment: {
        enriched_data: {
          household_income_band: "$75-100k",
          estimated_credit_band: "prime",
          property_owner: true,
          vehicle_history_owned: ["2019 Toyota Camry"],
          geographic_distance_miles: 12,
          extras: { mock: true },
        },
        confidence: 0.66,
        sources: ["mock"],
        generated_at: new Date(0).toISOString(),
      },
      routing: {
        chosen_user_id: null,
        candidate_users: [],
        decision_factors: {
          reason: "Shadow mode — no real routing computed",
          score: { score: 0, tier: "cold", factors: [] },
        },
        created_at: new Date(0).toISOString(),
      },
    });
  }

  try {
    const { query } = await import("@/lib/db");

    const enrichmentRow = await query<{
      enriched_data: Record<string, unknown>;
      confidence: string | number;
      sources: string[];
      generated_at: string;
    }>(
      `SELECT enriched_data, confidence, sources, generated_at
         FROM lead_enrichment
        WHERE lead_id = $1::uuid AND dealer_id = $2::uuid
        LIMIT 1`,
      [id, dealerId],
    );

    const routingRow = await query<{
      candidate_users: string[];
      chosen_user_id: string | null;
      decision_factors: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT candidate_users, chosen_user_id, decision_factors, created_at
         FROM lead_routing_decisions
        WHERE lead_id = $1::uuid AND dealer_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1`,
      [id, dealerId],
    );

    return NextResponse.json({
      lead_id: id,
      dealer_id: dealerId,
      enrichment: enrichmentRow.rows[0]
        ? {
            ...enrichmentRow.rows[0],
            confidence: Number(enrichmentRow.rows[0].confidence),
          }
        : null,
      routing: routingRow.rows[0] ?? null,
    });
  } catch (err) {
    console.error("[admin/leads/:id/enrichment] query failed:", err);
    return NextResponse.json({ error: "Unable to fetch enrichment" }, { status: 500 });
  }
}
