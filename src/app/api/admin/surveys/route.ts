import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  createSurvey,
  aggregateResponses,
  getTemplates,
  type CreateSurveyConfig,
  type Survey,
  type SurveyResponse,
} from "@/lib/surveys";
import { trackSurvey } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Demo data (shadow mode — no DATABASE_URL)                                  */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER = "00000000-0000-4000-a000-000000000001";

function getDemoSurveys(): Survey[] {
  const templates = getTemplates(DEMO_DEALER);
  // Simulate some response data
  templates[0].response_count = 47;
  templates[0].nps_score = 62;
  templates[1].response_count = 83;
  templates[1].nps_score = null;
  templates[2].response_count = 21;
  templates[3].response_count = 12;
  templates[3].nps_score = 75;
  templates[4].response_count = 34;
  return templates;
}

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/surveys                                                     */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ surveys: getDemoSurveys() });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");

    const rows = await query(
      `SELECT s.*,
              COALESCE(r.cnt, 0) AS response_count
       FROM surveys s
       LEFT JOIN (
         SELECT survey_id, COUNT(*) AS cnt
         FROM survey_responses
         GROUP BY survey_id
       ) r ON r.survey_id = s.id
       WHERE s.dealer_id = $1
       ORDER BY s.created_at DESC`,
      [dealerId],
    );

    const surveys = rows.rows.map((row: Record<string, unknown>) => ({
      ...row,
      questions: typeof row.questions === "string" ? JSON.parse(row.questions as string) : row.questions,
      trigger: typeof row.trigger === "string" ? JSON.parse(row.trigger as string) : row.trigger,
    }));

    trackSurvey("survey.created", dealerId, { survey_count: surveys.length });
    return NextResponse.json({ surveys });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ surveys: getDemoSurveys() });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/surveys                                                    */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { title, description, questions, trigger } = body;

  if (!title || !questions || !Array.isArray(questions) || !trigger) {
    return NextResponse.json(
      { error: "title, questions[], and trigger are required" },
      { status: 400 },
    );
  }

  const dealerId = getDealerId(authResult);

  const config: CreateSurveyConfig = {
    dealer_id: dealerId,
    title,
    description: description ?? "",
    questions,
    trigger,
  };

  const survey = createSurvey(config);

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ survey, mode: "shadow" }, { status: 201 });
  }

  // --- Live mode ---
  try {
    const { query } = await import("@/lib/db");

    await query(
      `INSERT INTO surveys (id, dealer_id, title, description, questions, trigger, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        survey.id,
        survey.dealer_id,
        survey.title,
        survey.description,
        JSON.stringify(survey.questions),
        JSON.stringify(survey.trigger),
        survey.active,
        survey.created_at,
        survey.updated_at,
      ],
    );

    trackSurvey("survey.created", dealerId, { survey_id: survey.id, title: survey.title, question_count: survey.questions.length });
    return NextResponse.json({ survey }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ survey, mode: "shadow" }, { status: 201 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  PATCH /api/admin/surveys?id=<id> — edit a survey                          */
/*                                                                             */
/*  Accepts a partial body — only fields supplied will overwrite. Used by      */
/*  the detail page's Edit button. Tracks `survey.updated` so the learning     */
/*  pipeline can attribute audit entries to the right operator. Falls back     */
/*  to a 200 success-with-warning when the surveys table is missing so an      */
/*  un-migrated env doesn't black-box the operator.                            */
/* -------------------------------------------------------------------------- */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dealerId = getDealerId(authResult);
  const allowed: Record<string, string> = {
    title: "title",
    description: "description",
    questions: "questions",
    trigger: "trigger",
    active: "active",
  };
  const setClauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let idx = 1;
  for (const [k, col] of Object.entries(allowed)) {
    if (body[k] === undefined) continue;
    setClauses.push(`${col} = $${idx++}`);
    params.push(
      k === "questions" || k === "trigger" ? JSON.stringify(body[k]) : body[k],
    );
  }
  if (setClauses.length === 1) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    trackSurvey("survey.updated", dealerId, { survey_id: id, mode: "shadow" });
    return NextResponse.json({ id, updated: true, mode: "shadow" });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `UPDATE surveys SET ${setClauses.join(", ")} WHERE id = $${idx} AND dealer_id = $${idx + 1} RETURNING *`,
      [...params, id, dealerId],
    );
    if ((result.rows as unknown[]).length === 0) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    trackSurvey("survey.updated", dealerId, { survey_id: id });
    return NextResponse.json({ survey: result.rows[0], updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/does not exist/i.test(msg)) {
      trackSurvey("survey.updated", dealerId, { survey_id: id, mode: "shadow" });
      return NextResponse.json({ id, updated: true, mode: "shadow", warning: "surveys table missing — edit recorded in shadow mode only" });
    }
    return NextResponse.json({ error: "Database error", cause: msg.slice(0, 200) }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  DELETE /api/admin/surveys?id=<id> — soft-delete a survey                  */
/*                                                                             */
/*  Sets active=false rather than removing the row so survey_responses keep   */
/*  pointing at a real parent for the learning pipeline. Tracks               */
/*  `survey.deleted` + writes audit_log on the durable path.                   */
/* -------------------------------------------------------------------------- */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    trackSurvey("survey.deleted", dealerId, { survey_id: id, mode: "shadow" });
    return NextResponse.json({ id, deleted: true, mode: "shadow" });
  }

  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE surveys SET active = false, updated_at = NOW()
        WHERE id = $1 AND dealer_id = $2`,
      [id, dealerId],
    );
    try {
      await query(
        `INSERT INTO audit_log (dealer_id, action, resource_type, resource_id)
         VALUES ($1, 'survey.deleted', 'survey', $2)`,
        [dealerId, id],
      );
    } catch {}
    trackSurvey("survey.deleted", dealerId, { survey_id: id });
    return NextResponse.json({ id, deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/does not exist/i.test(msg)) {
      trackSurvey("survey.deleted", dealerId, { survey_id: id, mode: "shadow" });
      return NextResponse.json({ id, deleted: true, mode: "shadow" });
    }
    return NextResponse.json({ error: "Database error", cause: msg.slice(0, 200) }, { status: 500 });
  }
}
