/**
 * Survey -> Session Replay Linking
 *
 * Associates survey responses with session recordings so teams can
 * see exactly what the user experienced before giving feedback.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SurveyReplayLink {
  id: string;
  survey_response_id: string;
  session_id: string;
  linked_at: string;
}

export interface EnrichedSurveyResponse {
  id: string;
  survey_id: string;
  session_id: string | null;
  answers: Array<{ question_id: string; value: string | number }>;
  submitted_at: string;
  page_url: string;
  replay_link: SurveyReplayLink | null;
  replay_url: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Linking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Link a survey response to a session recording.
 */
export function linkSurveyToSession(
  surveyResponseId: string,
  sessionId: string,
): SurveyReplayLink {
  return {
    id: `srl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    survey_response_id: surveyResponseId,
    session_id: sessionId,
    linked_at: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Retrieval                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Get the session replay link for a survey response.
 */
export function getSessionForResponse(
  responseId: string,
  links: SurveyReplayLink[],
): SurveyReplayLink | null {
  return links.find((l) => l.survey_response_id === responseId) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Enrichment                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Enrich survey responses with session replay links.
 */
export function enrichSurveyResponses(
  responses: Array<{
    id: string;
    survey_id: string;
    session_id: string | null;
    answers: Array<{ question_id: string; value: string | number }>;
    submitted_at: string;
    page_url: string;
  }>,
  links: SurveyReplayLink[],
): EnrichedSurveyResponse[] {
  return responses.map((r) => {
    const link = getSessionForResponse(r.id, links);
    const sessionId = link?.session_id ?? r.session_id;
    return {
      ...r,
      replay_link: link,
      replay_url: sessionId
        ? `/admin/session-replay?session=${sessionId}`
        : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

export function getDemoLinks(): SurveyReplayLink[] {
  return [
    {
      id: "srl-demo-1",
      survey_response_id: "resp-demo-1",
      session_id: "sess-abc123",
      linked_at: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      id: "srl-demo-2",
      survey_response_id: "resp-demo-3",
      session_id: "sess-def456",
      linked_at: new Date(Date.now() - 7200_000).toISOString(),
    },
  ];
}

export function getDemoEnrichedResponses(surveyId: string): EnrichedSurveyResponse[] {
  const links = getDemoLinks();
  const responses = [
    {
      id: "resp-demo-1",
      survey_id: surveyId,
      session_id: "sess-abc123",
      answers: [
        { question_id: "q1", value: 9 },
        { question_id: "q2", value: "Great experience, very helpful staff!" },
      ],
      submitted_at: new Date(Date.now() - 3600_000).toISOString(),
      page_url: "/inventory/2024-camry",
    },
    {
      id: "resp-demo-2",
      survey_id: surveyId,
      session_id: null,
      answers: [
        { question_id: "q1", value: 6 },
        { question_id: "q2", value: "Hard to find the financing page" },
      ],
      submitted_at: new Date(Date.now() - 7200_000).toISOString(),
      page_url: "/finance/calculator",
    },
    {
      id: "resp-demo-3",
      survey_id: surveyId,
      session_id: "sess-def456",
      answers: [
        { question_id: "q1", value: 10 },
        { question_id: "q2", value: "Love the photo comparison feature" },
      ],
      submitted_at: new Date(Date.now() - 10800_000).toISOString(),
      page_url: "/vdp/12345",
    },
  ];
  return enrichSurveyResponses(responses, links);
}
