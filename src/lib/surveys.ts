/**
 * Survey Engine — Configurable surveys with trigger rules and NPS scoring.
 *
 * Supports five question types (rating, NPS, multiple choice, free text, yes/no)
 * and five trigger types (exit intent, time on page, scroll depth, page visit,
 * post-purchase). All responses feed into the analytics/learning system.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type QuestionType = "rating" | "nps" | "multiple_choice" | "free_text" | "yes_no";

export type TriggerType =
  | "exit_intent"
  | "time_on_page"
  | "scroll_depth"
  | "page_visit"
  | "post_purchase";

export interface SurveyQuestion {
  id: string;
  text: string;
  type: QuestionType;
  /** For multiple_choice: available options */
  options?: string[];
  /** Whether the question is required */
  required: boolean;
  /** Display order */
  order: number;
}

export interface SurveyTrigger {
  type: TriggerType;
  /** For time_on_page: seconds before showing */
  delay_seconds?: number;
  /** For scroll_depth: percentage (0-100) */
  scroll_percentage?: number;
  /** For page_visit: URL pattern to match */
  page_pattern?: string;
}

export interface Survey {
  id: string;
  dealer_id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  trigger: SurveyTrigger;
  active: boolean;
  created_at: string;
  updated_at: string;
  response_count: number;
  nps_score: number | null;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  session_id: string;
  answers: SurveyAnswer[];
  submitted_at: string;
  page_url: string;
  user_agent: string;
}

export interface SurveyAnswer {
  question_id: string;
  value: string | number | boolean;
}

export interface SessionContext {
  time_on_page_seconds: number;
  scroll_depth_percentage: number;
  current_page: string;
  has_purchased: boolean;
  is_exit_intent: boolean;
}

export interface SurveyAggregation {
  survey_id: string;
  response_count: number;
  nps_score: number | null;
  avg_rating: number | null;
  sentiment_breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  question_summaries: QuestionSummary[];
}

export interface QuestionSummary {
  question_id: string;
  question_text: string;
  question_type: QuestionType;
  response_count: number;
  avg_value: number | null;
  distribution: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/*  Survey creation                                                            */
/* -------------------------------------------------------------------------- */

export interface CreateSurveyConfig {
  dealer_id: string;
  title: string;
  description: string;
  questions: Omit<SurveyQuestion, "id">[];
  trigger: SurveyTrigger;
}

/**
 * Create a new survey from a configuration object.
 * Returns a fully-formed Survey ready for persistence.
 */
export function createSurvey(config: CreateSurveyConfig): Survey {
  const now = new Date().toISOString();
  const surveyId = `survey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const questions: SurveyQuestion[] = config.questions.map((q, i) => ({
    ...q,
    id: `q-${surveyId}-${i}`,
    order: q.order ?? i,
  }));

  return {
    id: surveyId,
    dealer_id: config.dealer_id,
    title: config.title,
    description: config.description,
    questions,
    trigger: config.trigger,
    active: true,
    created_at: now,
    updated_at: now,
    response_count: 0,
    nps_score: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Trigger evaluation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate whether a survey trigger should fire given the current session context.
 */
export function evaluateTrigger(
  trigger: SurveyTrigger,
  ctx: SessionContext,
): boolean {
  switch (trigger.type) {
    case "exit_intent":
      return ctx.is_exit_intent;

    case "time_on_page":
      return ctx.time_on_page_seconds >= (trigger.delay_seconds ?? 30);

    case "scroll_depth":
      return ctx.scroll_depth_percentage >= (trigger.scroll_percentage ?? 50);

    case "page_visit": {
      if (!trigger.page_pattern) return false;
      // Support simple wildcard matching
      const pattern = trigger.page_pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*");
      return new RegExp(`^${pattern}$`).test(ctx.current_page);
    }

    case "post_purchase":
      return ctx.has_purchased;

    default:
      return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Response aggregation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Calculate NPS score from an array of NPS responses (0-10 scale).
 *
 * NPS = % Promoters (9-10) minus % Detractors (0-6).
 * Returns a score from -100 to 100, or null if no responses.
 */
export function calculateNPS(scores: number[]): number | null {
  if (scores.length === 0) return null;

  let promoters = 0;
  let detractors = 0;

  for (const score of scores) {
    if (score >= 9) promoters++;
    else if (score <= 6) detractors++;
    // 7-8 are passives — not counted
  }

  const total = scores.length;
  return Math.round(((promoters - detractors) / total) * 100);
}

/**
 * Aggregate all responses for a survey into a summary report.
 */
export function aggregateResponses(
  survey: Survey,
  responses: SurveyResponse[],
): SurveyAggregation {
  const question_summaries: QuestionSummary[] = survey.questions.map((q) => {
    const answers = responses
      .flatMap((r) => r.answers)
      .filter((a) => a.question_id === q.id);

    const distribution: Record<string, number> = {};
    let numericSum = 0;
    let numericCount = 0;

    for (const answer of answers) {
      const key = String(answer.value);
      distribution[key] = (distribution[key] ?? 0) + 1;

      if (typeof answer.value === "number") {
        numericSum += answer.value;
        numericCount++;
      } else if (typeof answer.value === "string" && !isNaN(Number(answer.value))) {
        numericSum += Number(answer.value);
        numericCount++;
      }
    }

    return {
      question_id: q.id,
      question_text: q.text,
      question_type: q.type,
      response_count: answers.length,
      avg_value: numericCount > 0 ? Math.round((numericSum / numericCount) * 10) / 10 : null,
      distribution,
    };
  });

  // Calculate NPS from NPS-type questions
  let nps_score: number | null = null;
  const npsQuestion = survey.questions.find((q) => q.type === "nps");
  if (npsQuestion) {
    const npsScores = responses
      .flatMap((r) => r.answers)
      .filter((a) => a.question_id === npsQuestion.id)
      .map((a) => Number(a.value))
      .filter((v) => !isNaN(v));
    nps_score = calculateNPS(npsScores);
  }

  // Calculate avg rating from rating-type questions
  let avg_rating: number | null = null;
  const ratingQuestion = survey.questions.find((q) => q.type === "rating");
  if (ratingQuestion) {
    const ratings = responses
      .flatMap((r) => r.answers)
      .filter((a) => a.question_id === ratingQuestion.id)
      .map((a) => Number(a.value))
      .filter((v) => !isNaN(v));
    if (ratings.length > 0) {
      avg_rating =
        Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10;
    }
  }

  // Sentiment: rating >= 4 = positive, 3 = neutral, <= 2 = negative
  const ratingAnswers = responses
    .flatMap((r) => r.answers)
    .filter((a) => {
      const q = survey.questions.find((q) => q.id === a.question_id);
      return q?.type === "rating" || q?.type === "nps";
    })
    .map((a) => Number(a.value));

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  for (const val of ratingAnswers) {
    if (isNaN(val)) continue;
    if (val >= 4) positive++;
    else if (val === 3) neutral++;
    else negative++;
  }

  return {
    survey_id: survey.id,
    response_count: responses.length,
    nps_score,
    avg_rating,
    sentiment_breakdown: { positive, neutral, negative },
    question_summaries,
  };
}

/* -------------------------------------------------------------------------- */
/*  Built-in templates                                                         */
/* -------------------------------------------------------------------------- */

export function npsTemplate(dealerId: string): Survey {
  return createSurvey({
    dealer_id: dealerId,
    title: "How likely are you to recommend us?",
    description: "Quick NPS survey to measure customer satisfaction",
    questions: [
      {
        text: "How likely are you to recommend us to a friend or colleague?",
        type: "nps",
        required: true,
        order: 0,
      },
      {
        text: "What is the primary reason for your score?",
        type: "free_text",
        required: false,
        order: 1,
      },
    ],
    trigger: { type: "time_on_page", delay_seconds: 60 },
  });
}

export function csatTemplate(dealerId: string): Survey {
  return createSurvey({
    dealer_id: dealerId,
    title: "How was your experience?",
    description: "Customer satisfaction rating",
    questions: [
      {
        text: "How would you rate your overall experience?",
        type: "rating",
        required: true,
        order: 0,
      },
      {
        text: "Was the information you needed easy to find?",
        type: "yes_no",
        required: true,
        order: 1,
      },
      {
        text: "Any additional feedback?",
        type: "free_text",
        required: false,
        order: 2,
      },
    ],
    trigger: { type: "time_on_page", delay_seconds: 45 },
  });
}

export function exitFeedbackTemplate(dealerId: string): Survey {
  return createSurvey({
    dealer_id: dealerId,
    title: "Before you go...",
    description: "Quick feedback when visitor is about to leave",
    questions: [
      {
        text: "Did you find what you were looking for?",
        type: "yes_no",
        required: true,
        order: 0,
      },
      {
        text: "What could we improve?",
        type: "multiple_choice",
        options: [
          "Better pricing information",
          "More vehicle photos",
          "Easier navigation",
          "Faster page loads",
          "More financing options",
        ],
        required: false,
        order: 1,
      },
    ],
    trigger: { type: "exit_intent" },
  });
}

export function postPurchaseTemplate(dealerId: string): Survey {
  return createSurvey({
    dealer_id: dealerId,
    title: "Thank you for your purchase!",
    description: "Post-purchase satisfaction survey",
    questions: [
      {
        text: "How satisfied are you with your buying experience?",
        type: "rating",
        required: true,
        order: 0,
      },
      {
        text: "How likely are you to recommend us?",
        type: "nps",
        required: true,
        order: 1,
      },
      {
        text: "What did we do well?",
        type: "free_text",
        required: false,
        order: 2,
      },
    ],
    trigger: { type: "post_purchase" },
  });
}

export function vehicleInterestTemplate(dealerId: string): Survey {
  return createSurvey({
    dealer_id: dealerId,
    title: "Help us find your perfect vehicle",
    description: "Vehicle interest survey shown on VDP pages",
    questions: [
      {
        text: "Are you actively shopping for a vehicle?",
        type: "yes_no",
        required: true,
        order: 0,
      },
      {
        text: "What is most important to you?",
        type: "multiple_choice",
        options: ["Price", "Fuel efficiency", "Safety features", "Performance", "Interior comfort"],
        required: true,
        order: 1,
      },
      {
        text: "When are you looking to purchase?",
        type: "multiple_choice",
        options: ["This week", "This month", "In 1-3 months", "Just browsing"],
        required: true,
        order: 2,
      },
    ],
    trigger: { type: "scroll_depth", scroll_percentage: 60 },
  });
}

/**
 * Get all built-in survey templates.
 */
export function getTemplates(dealerId: string): Survey[] {
  return [
    npsTemplate(dealerId),
    csatTemplate(dealerId),
    exitFeedbackTemplate(dealerId),
    postPurchaseTemplate(dealerId),
    vehicleInterestTemplate(dealerId),
  ];
}
