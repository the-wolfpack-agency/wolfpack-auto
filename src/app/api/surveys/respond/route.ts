import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/surveys/respond — Public endpoint (no auth required).
 *
 * Accepts survey responses from the visitor-facing widget.
 * This is intentionally unauthenticated so anonymous visitors can submit.
 */

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(`survey:${ip}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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

  // Auto-link to session replay if session_id provided
  if (response.session_id && !response.session_id.startsWith("anon-")) {
    import("@/lib/survey-replay-linker")
      .then(({ linkSurveyToSession }) => {
        const link = linkSurveyToSession(response.id, response.session_id);
        import("@/lib/db").then(({ query: q }) => {
          q(
            `INSERT INTO survey_replay_links (id, survey_response_id, session_id, linked_at)
             VALUES ($1, $2, $3, $4)`,
            [link.id, link.survey_response_id, link.session_id, link.linked_at],
          ).catch(() => {});
        });
      })
      .catch(() => {});
  }

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
