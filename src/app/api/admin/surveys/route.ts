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

    return NextResponse.json({ survey }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ survey, mode: "shadow" }, { status: 201 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
