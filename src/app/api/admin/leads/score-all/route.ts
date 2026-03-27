import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { scoreLeadIntent, extractEmailDomain } from "@/lib/lead-scorer";

const DEALER_ID = process.env.DEALER_ID ?? "default";
const BATCH_SIZE = 20;

/* -------------------------------------------------------------------------- */
/* POST /api/admin/leads/score-all                                             */
/* -------------------------------------------------------------------------- */

export async function POST() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        scored: 0,
        skipped: 0,
        note: "Database unavailable — score-all requires a live database",
      },
      { status: 200 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // Fetch all unscored leads for this dealer
    const unscored = await query<Record<string, unknown>>(
      `SELECT id, source, vehicle_interest, phone, message, email,
              page_views, vdp_views, time_on_site_seconds, return_visits,
              created_at
         FROM leads
        WHERE dealer_id = $1
          AND scored_at IS NULL
        ORDER BY created_at DESC`,
      [DEALER_ID],
    );

    const rows = unscored.rows as Record<string, unknown>[];
    let scored = 0;
    let skipped = 0;

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (row) => {
          try {
            const createdAt = row.created_at
              ? new Date(row.created_at as string)
              : new Date();

            const leadScore = scoreLeadIntent({
              pageViews: (row.page_views as number | null) ?? 0,
              vdpViews: (row.vdp_views as number | null) ?? 0,
              timeOnSiteSeconds:
                (row.time_on_site_seconds as number | null) ?? 0,
              returnVisits: (row.return_visits as number | null) ?? 0,
              source: row.source as string | undefined,
              vehicleInterest: row.vehicle_interest as string | undefined,
              hasPhone:
                row.phone !== null &&
                row.phone !== undefined &&
                row.phone !== "",
              messageLength:
                typeof row.message === "string" ? row.message.length : 0,
              emailDomain:
                typeof row.email === "string"
                  ? extractEmailDomain(row.email)
                  : "",
              submittedHour: createdAt.getUTCHours(),
              submittedDayOfWeek: createdAt.getUTCDay(),
            });

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
                row.id as string,
              ],
            );

            scored++;
          } catch (rowErr) {
            console.error(
              `[api/admin/leads/score-all] Failed to score lead ${row.id}:`,
              rowErr,
            );
            skipped++;
          }
        }),
      );
    }

    return NextResponse.json({ scored, skipped });
  } catch (err) {
    console.error("[api/admin/leads/score-all] DB error:", err);
    return NextResponse.json(
      { error: "Batch scoring failed due to a database error" },
      { status: 500 },
    );
  }
}
