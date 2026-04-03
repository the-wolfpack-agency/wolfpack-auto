import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/surveys/respond — Public endpoint (no auth required).
 *
 * Accepts survey responses from the visitor-facing widget.
 * This is intentionally unauthenticated so anonymous visitors can submit.
 */

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { survey_id, answers, session_id, page_url } = body;

  if (!survey_id || !answers || !Array.isArray(answers)) {
    return NextResponse.json(
      { error: "survey_id and answers[] are required" },
      { status: 400 },
    );
  }

  const responseId = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userAgent = request.headers.get("user-agent") ?? "";

  const response = {
    id: responseId,
    survey_id,
    session_id: session_id ?? `anon-${Date.now()}`,
    answers,
    submitted_at: new Date().toISOString(),
    page_url: page_url ?? "",
    user_agent: userAgent,
  };

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { stored: true, response_id: responseId, mode: "shadow" },
      { status: 201 },
    );
  }

  // --- Live mode ---
  const { query } = await import("@/lib/db");

  await query(
    `INSERT INTO survey_responses (id, survey_id, session_id, answers, submitted_at, page_url, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      response.id,
      response.survey_id,
      response.session_id,
      JSON.stringify(response.answers),
      response.submitted_at,
      response.page_url,
      response.user_agent,
    ],
  );

  // Update response count on the survey
  await query(
    `UPDATE surveys SET response_count = response_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [survey_id],
  );

  // Fire analytics event (fire-and-forget)
  import("@/lib/analytics-hooks")
    .then(({ trackSurvey }) => {
      // Determine dealer_id from survey
      import("@/lib/db").then(({ query: q }) => {
        q(`SELECT dealer_id FROM surveys WHERE id = $1`, [survey_id]).then(
          (res) => {
            const dealerId = res.rows[0]?.dealer_id ?? "unknown";
            trackSurvey("survey.response_received", dealerId, {
              survey_id,
              response_id: responseId,
            });
          },
        );
      });
    })
    .catch(() => {});

  return NextResponse.json(
    { stored: true, response_id: responseId },
    { status: 201 },
  );
}
