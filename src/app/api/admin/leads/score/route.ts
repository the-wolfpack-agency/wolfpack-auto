import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  scoreLeadIntent,
  extractEmailDomain,
  type LeadScoringInput,
} from "@/lib/lead-scorer";

/* -------------------------------------------------------------------------- */
/* Input schema                                                                */
/* -------------------------------------------------------------------------- */

const scoringSignalsSchema = z
  .object({
    pageViews: z.number().int().nonnegative().optional(),
    vdpViews: z.number().int().nonnegative().optional(),
    timeOnSiteSeconds: z.number().int().nonnegative().optional(),
    returnVisits: z.number().int().nonnegative().optional(),
    source: z.string().optional(),
    vehicleInterest: z.string().optional(),
    hasPhone: z.boolean().optional(),
    messageLength: z.number().int().nonnegative().optional(),
    emailDomain: z.string().optional(),
    submittedHour: z.number().int().min(0).max(23).optional(),
    submittedDayOfWeek: z.number().int().min(0).max(6).optional(),
  })
  .optional();

const bodySchema = z.object({
  lead_id: z.string().min(1),
  signals: scoringSignalsSchema,
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/leads/score                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const { lead_id, signals } = parsed.data;

  // When a database is available, fetch the lead row so we can supplement
  // caller-supplied signals with stored behavioural data.
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const leadResult = await query<Record<string, unknown>>(
        `SELECT * FROM leads WHERE id = $1`,
        [lead_id],
      );

      if (!leadResult.rows || leadResult.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const row = leadResult.rows[0] as Record<string, unknown>;

      // Merge DB behavioural columns with caller-supplied overrides
      const input: LeadScoringInput = {
        pageViews: (signals?.pageViews ?? (row.page_views as number | null)) ?? 0,
        vdpViews: (signals?.vdpViews ?? (row.vdp_views as number | null)) ?? 0,
        timeOnSiteSeconds:
          (signals?.timeOnSiteSeconds ?? (row.time_on_site_seconds as number | null)) ?? 0,
        returnVisits:
          (signals?.returnVisits ?? (row.return_visits as number | null)) ?? 0,
        source: signals?.source ?? (row.source as string | undefined),
        vehicleInterest:
          signals?.vehicleInterest ?? (row.vehicle_interest as string | undefined),
        hasPhone:
          signals?.hasPhone ??
          (row.phone !== null && row.phone !== undefined && row.phone !== ""),
        messageLength:
          signals?.messageLength ??
          (typeof row.message === "string" ? row.message.length : 0),
        emailDomain:
          signals?.emailDomain ??
          (typeof row.email === "string" ? extractEmailDomain(row.email) : ""),
        submittedHour:
          signals?.submittedHour ??
          (row.created_at
            ? new Date(row.created_at as string).getUTCHours()
            : undefined),
        submittedDayOfWeek:
          signals?.submittedDayOfWeek ??
          (row.created_at
            ? new Date(row.created_at as string).getUTCDay()
            : undefined),
      };

      const leadScore = scoreLeadIntent(input);

      // Persist score back to DB
      await query(
        `UPDATE leads
            SET intent_score            = $1,
                score_factors           = $2,
                recommended_followup_at = $3,
                scored_at               = NOW(),
                temperature             = $4,
                updated_at              = NOW()
          WHERE id = $5`,
        [
          leadScore.score,
          JSON.stringify(leadScore.factors),
          leadScore.recommendedFollowupAt.toISOString(),
          leadScore.tier,
          lead_id,
        ],
      );

      return NextResponse.json({
        lead_id,
        score: leadScore.score,
        tier: leadScore.tier,
        factors: leadScore.factors,
        recommendedFollowupAt: leadScore.recommendedFollowupAt.toISOString(),
        recommendedChannel: leadScore.recommendedChannel,
      });
    } catch (err) {
      console.error("[api/admin/leads/score] DB error:", err);
      return NextResponse.json(
        { error: "Scoring failed due to a database error" },
        { status: 500 },
      );
    }
  }

  // Shadow / no-DB mode: score from caller-supplied signals only
  const input: LeadScoringInput = {
    ...(signals ?? {}),
    submittedHour: signals?.submittedHour ?? new Date().getUTCHours(),
    submittedDayOfWeek:
      signals?.submittedDayOfWeek ?? new Date().getUTCDay(),
  };

  const leadScore = scoreLeadIntent(input);

  return NextResponse.json({
    lead_id,
    score: leadScore.score,
    tier: leadScore.tier,
    factors: leadScore.factors,
    recommendedFollowupAt: leadScore.recommendedFollowupAt.toISOString(),
    recommendedChannel: leadScore.recommendedChannel,
    note: "Scored from provided signals only — database unavailable",
  });
}
