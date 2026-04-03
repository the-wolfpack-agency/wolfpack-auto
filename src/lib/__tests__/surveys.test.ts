/**
 * Unit tests for src/lib/surveys.ts
 *
 * Tests trigger evaluation, NPS calculation, template generation,
 * and response aggregation.
 *
 * Run with: npx jest src/lib/__tests__/surveys.test.ts
 */

import {
  createSurvey,
  evaluateTrigger,
  calculateNPS,
  aggregateResponses,
  npsTemplate,
  csatTemplate,
  exitFeedbackTemplate,
  postPurchaseTemplate,
  vehicleInterestTemplate,
  getTemplates,
  type SurveyTrigger,
  type SessionContext,
  type Survey,
  type SurveyResponse,
} from "../surveys";

const DEALER_ID = "00000000-0000-4000-a000-000000000001";

/* -------------------------------------------------------------------------- */
/*  createSurvey                                                               */
/* -------------------------------------------------------------------------- */

describe("createSurvey", () => {
  it("creates a survey with generated IDs", () => {
    const survey = createSurvey({
      dealer_id: DEALER_ID,
      title: "Test Survey",
      description: "A test",
      questions: [
        { text: "How are you?", type: "rating", required: true, order: 0 },
      ],
      trigger: { type: "time_on_page", delay_seconds: 30 },
    });

    expect(survey.id).toMatch(/^survey-/);
    expect(survey.dealer_id).toBe(DEALER_ID);
    expect(survey.title).toBe("Test Survey");
    expect(survey.questions).toHaveLength(1);
    expect(survey.questions[0].id).toMatch(/^q-/);
    expect(survey.active).toBe(true);
    expect(survey.response_count).toBe(0);
    expect(survey.nps_score).toBeNull();
  });

  it("assigns question IDs and preserves order", () => {
    const survey = createSurvey({
      dealer_id: DEALER_ID,
      title: "Multi-Q",
      description: "",
      questions: [
        { text: "Q1", type: "rating", required: true, order: 0 },
        { text: "Q2", type: "nps", required: true, order: 1 },
        { text: "Q3", type: "free_text", required: false, order: 2 },
      ],
      trigger: { type: "exit_intent" },
    });

    expect(survey.questions).toHaveLength(3);
    expect(survey.questions[0].order).toBe(0);
    expect(survey.questions[1].order).toBe(1);
    expect(survey.questions[2].order).toBe(2);
    // Each question ID should be unique
    const ids = new Set(survey.questions.map((q) => q.id));
    expect(ids.size).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  evaluateTrigger                                                            */
/* -------------------------------------------------------------------------- */

describe("evaluateTrigger", () => {
  const baseCtx: SessionContext = {
    time_on_page_seconds: 10,
    scroll_depth_percentage: 20,
    current_page: "/inventory",
    has_purchased: false,
    is_exit_intent: false,
  };

  it("triggers on exit_intent when user shows exit intent", () => {
    const trigger: SurveyTrigger = { type: "exit_intent" };
    expect(evaluateTrigger(trigger, { ...baseCtx, is_exit_intent: true })).toBe(true);
    expect(evaluateTrigger(trigger, baseCtx)).toBe(false);
  });

  it("triggers on time_on_page when threshold met", () => {
    const trigger: SurveyTrigger = { type: "time_on_page", delay_seconds: 30 };
    expect(evaluateTrigger(trigger, { ...baseCtx, time_on_page_seconds: 30 })).toBe(true);
    expect(evaluateTrigger(trigger, { ...baseCtx, time_on_page_seconds: 29 })).toBe(false);
    expect(evaluateTrigger(trigger, { ...baseCtx, time_on_page_seconds: 60 })).toBe(true);
  });

  it("uses default 30s for time_on_page when delay_seconds not set", () => {
    const trigger: SurveyTrigger = { type: "time_on_page" };
    expect(evaluateTrigger(trigger, { ...baseCtx, time_on_page_seconds: 30 })).toBe(true);
    expect(evaluateTrigger(trigger, { ...baseCtx, time_on_page_seconds: 15 })).toBe(false);
  });

  it("triggers on scroll_depth when percentage reached", () => {
    const trigger: SurveyTrigger = { type: "scroll_depth", scroll_percentage: 75 };
    expect(evaluateTrigger(trigger, { ...baseCtx, scroll_depth_percentage: 75 })).toBe(true);
    expect(evaluateTrigger(trigger, { ...baseCtx, scroll_depth_percentage: 74 })).toBe(false);
  });

  it("triggers on page_visit when URL matches", () => {
    const trigger: SurveyTrigger = { type: "page_visit", page_pattern: "/inventory" };
    expect(evaluateTrigger(trigger, { ...baseCtx, current_page: "/inventory" })).toBe(true);
    expect(evaluateTrigger(trigger, { ...baseCtx, current_page: "/contact" })).toBe(false);
  });

  it("returns false for page_visit without pattern", () => {
    const trigger: SurveyTrigger = { type: "page_visit" };
    expect(evaluateTrigger(trigger, baseCtx)).toBe(false);
  });

  it("triggers on post_purchase when user has purchased", () => {
    const trigger: SurveyTrigger = { type: "post_purchase" };
    expect(evaluateTrigger(trigger, { ...baseCtx, has_purchased: true })).toBe(true);
    expect(evaluateTrigger(trigger, baseCtx)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  calculateNPS                                                               */
/* -------------------------------------------------------------------------- */

describe("calculateNPS", () => {
  it("returns null for empty array", () => {
    expect(calculateNPS([])).toBeNull();
  });

  it("returns 100 when all are promoters (9-10)", () => {
    expect(calculateNPS([9, 10, 9, 10])).toBe(100);
  });

  it("returns -100 when all are detractors (0-6)", () => {
    expect(calculateNPS([0, 3, 5, 6])).toBe(-100);
  });

  it("returns 0 when all are passives (7-8)", () => {
    expect(calculateNPS([7, 8, 7, 8])).toBe(0);
  });

  it("calculates correct NPS for mixed scores", () => {
    // 2 promoters, 1 passive, 1 detractor = (2-1)/4 = 25%
    expect(calculateNPS([10, 9, 7, 3])).toBe(25);
  });

  it("handles single response", () => {
    expect(calculateNPS([10])).toBe(100);
    expect(calculateNPS([5])).toBe(-100);
    expect(calculateNPS([7])).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  aggregateResponses                                                         */
/* -------------------------------------------------------------------------- */

describe("aggregateResponses", () => {
  it("aggregates responses with NPS and rating", () => {
    const survey = createSurvey({
      dealer_id: DEALER_ID,
      title: "Test",
      description: "",
      questions: [
        { text: "NPS", type: "nps", required: true, order: 0 },
        { text: "Rating", type: "rating", required: true, order: 1 },
      ],
      trigger: { type: "time_on_page" },
    });

    const responses: SurveyResponse[] = [
      {
        id: "r1",
        survey_id: survey.id,
        session_id: "s1",
        answers: [
          { question_id: survey.questions[0].id, value: 9 },
          { question_id: survey.questions[1].id, value: 5 },
        ],
        submitted_at: "2026-04-01T10:00:00Z",
        page_url: "/",
        user_agent: "",
      },
      {
        id: "r2",
        survey_id: survey.id,
        session_id: "s2",
        answers: [
          { question_id: survey.questions[0].id, value: 3 },
          { question_id: survey.questions[1].id, value: 4 },
        ],
        submitted_at: "2026-04-01T11:00:00Z",
        page_url: "/",
        user_agent: "",
      },
    ];

    const agg = aggregateResponses(survey, responses);
    expect(agg.response_count).toBe(2);
    expect(agg.nps_score).not.toBeNull();
    expect(agg.avg_rating).not.toBeNull();
    expect(agg.question_summaries).toHaveLength(2);
  });

  it("returns null NPS when no NPS question exists", () => {
    const survey = createSurvey({
      dealer_id: DEALER_ID,
      title: "Rating Only",
      description: "",
      questions: [
        { text: "Rate us", type: "rating", required: true, order: 0 },
      ],
      trigger: { type: "time_on_page" },
    });

    const agg = aggregateResponses(survey, []);
    expect(agg.nps_score).toBeNull();
    expect(agg.response_count).toBe(0);
  });

  it("builds distribution for multiple choice", () => {
    const survey = createSurvey({
      dealer_id: DEALER_ID,
      title: "MC",
      description: "",
      questions: [
        {
          text: "Pick one",
          type: "multiple_choice",
          options: ["A", "B", "C"],
          required: true,
          order: 0,
        },
      ],
      trigger: { type: "time_on_page" },
    });

    const responses: SurveyResponse[] = [
      { id: "r1", survey_id: survey.id, session_id: "s1", answers: [{ question_id: survey.questions[0].id, value: "A" }], submitted_at: "", page_url: "", user_agent: "" },
      { id: "r2", survey_id: survey.id, session_id: "s2", answers: [{ question_id: survey.questions[0].id, value: "A" }], submitted_at: "", page_url: "", user_agent: "" },
      { id: "r3", survey_id: survey.id, session_id: "s3", answers: [{ question_id: survey.questions[0].id, value: "B" }], submitted_at: "", page_url: "", user_agent: "" },
    ];

    const agg = aggregateResponses(survey, responses);
    const summary = agg.question_summaries[0];
    expect(summary.distribution["A"]).toBe(2);
    expect(summary.distribution["B"]).toBe(1);
    expect(summary.response_count).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  Templates                                                                  */
/* -------------------------------------------------------------------------- */

describe("Survey templates", () => {
  it("npsTemplate has NPS question with time trigger", () => {
    const survey = npsTemplate(DEALER_ID);
    expect(survey.dealer_id).toBe(DEALER_ID);
    expect(survey.questions.some((q) => q.type === "nps")).toBe(true);
    expect(survey.trigger.type).toBe("time_on_page");
  });

  it("csatTemplate has rating and yes/no questions", () => {
    const survey = csatTemplate(DEALER_ID);
    expect(survey.questions.some((q) => q.type === "rating")).toBe(true);
    expect(survey.questions.some((q) => q.type === "yes_no")).toBe(true);
  });

  it("exitFeedbackTemplate triggers on exit intent", () => {
    const survey = exitFeedbackTemplate(DEALER_ID);
    expect(survey.trigger.type).toBe("exit_intent");
    expect(survey.questions.some((q) => q.type === "yes_no")).toBe(true);
  });

  it("postPurchaseTemplate triggers on post purchase", () => {
    const survey = postPurchaseTemplate(DEALER_ID);
    expect(survey.trigger.type).toBe("post_purchase");
  });

  it("vehicleInterestTemplate triggers on scroll depth", () => {
    const survey = vehicleInterestTemplate(DEALER_ID);
    expect(survey.trigger.type).toBe("scroll_depth");
    expect(survey.questions.some((q) => q.type === "multiple_choice")).toBe(true);
  });

  it("getTemplates returns all 5 templates", () => {
    const templates = getTemplates(DEALER_ID);
    expect(templates).toHaveLength(5);
    templates.forEach((t) => {
      expect(t.dealer_id).toBe(DEALER_ID);
      expect(t.id).toMatch(/^survey-/);
      expect(t.questions.length).toBeGreaterThan(0);
    });
  });
});
