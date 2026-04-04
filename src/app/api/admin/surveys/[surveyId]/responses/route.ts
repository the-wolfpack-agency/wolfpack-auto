import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDemoEnrichedResponses } from "@/lib/survey-replay-linker";
import { trackSurvey } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/surveys/[surveyId]/responses — Responses with replay links  */
/* -------------------------------------------------------------------------- */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { surveyId } = await params;

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    trackSurvey("survey.response_received", "", { survey_id: surveyId, shadow: true });
    return NextResponse.json({
      survey_id: surveyId,
      responses: getDemoEnrichedResponses(surveyId),
    });
  }

  // --- Live mode ---
  const { query } = await import("@/lib/db");
  const { enrichSurveyResponses } = await import("@/lib/survey-replay-linker");

  const responseRows = await query(
    `SELECT sr.id, sr.survey_id, sr.session_id, sr.answers, sr.submitted_at, sr.page_url
     FROM survey_responses sr
     WHERE sr.survey_id = $1
     ORDER BY sr.submitted_at DESC`,
    [surveyId],
  );

  const linkRows = await query(
    `SELECT id, survey_response_id, session_id, linked_at
     FROM survey_replay_links
     WHERE survey_response_id = ANY($1)`,
    [responseRows.rows.map((r: Record<string, unknown>) => r.id)],
  );

  const responses = responseRows.rows.map((r: Record<string, unknown>) => ({
    ...r,
    answers: typeof r.answers === "string" ? JSON.parse(r.answers as string) : r.answers,
  }));

  const enriched = enrichSurveyResponses(
    responses as Array<{
      id: string;
      survey_id: string;
      session_id: string | null;
      answers: Array<{ question_id: string; value: string | number }>;
      submitted_at: string;
      page_url: string;
    }>,
    linkRows.rows as Array<{
      id: string;
      survey_response_id: string;
      session_id: string;
      linked_at: string;
    }>,
  );

  trackSurvey("survey.response_received", "", { survey_id: surveyId, count: enriched.length });

  return NextResponse.json({ survey_id: surveyId, responses: enriched });
}
