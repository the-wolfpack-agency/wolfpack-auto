/**
 * Unit tests for src/lib/survey-replay-linker.ts
 *
 * Tests linking, retrieval, and enrichment.
 *
 * Run with: npx jest src/lib/__tests__/survey-replay-linker.test.ts
 */

import {
  linkSurveyToSession,
  getSessionForResponse,
  enrichSurveyResponses,
  getDemoLinks,
  getDemoEnrichedResponses,
  type SurveyReplayLink,
} from "../survey-replay-linker";

/* -------------------------------------------------------------------------- */
/*  Linking                                                                    */
/* -------------------------------------------------------------------------- */

describe("linkSurveyToSession", () => {
  it("creates a link with generated ID", () => {
    const link = linkSurveyToSession("resp-1", "sess-abc");
    expect(link.id).toMatch(/^srl-/);
    expect(link.survey_response_id).toBe("resp-1");
    expect(link.session_id).toBe("sess-abc");
    expect(link.linked_at).toBeDefined();
  });

  it("creates unique IDs for different calls", () => {
    const link1 = linkSurveyToSession("resp-1", "sess-1");
    const link2 = linkSurveyToSession("resp-2", "sess-2");
    expect(link1.id).not.toBe(link2.id);
  });
});

/* -------------------------------------------------------------------------- */
/*  Retrieval                                                                  */
/* -------------------------------------------------------------------------- */

describe("getSessionForResponse", () => {
  const links: SurveyReplayLink[] = [
    { id: "srl-1", survey_response_id: "resp-1", session_id: "sess-abc", linked_at: "2026-04-01T00:00:00Z" },
    { id: "srl-2", survey_response_id: "resp-3", session_id: "sess-def", linked_at: "2026-04-01T01:00:00Z" },
  ];

  it("finds link by response ID", () => {
    const link = getSessionForResponse("resp-1", links);
    expect(link).not.toBeNull();
    expect(link!.session_id).toBe("sess-abc");
  });

  it("returns null for unlinked response", () => {
    const link = getSessionForResponse("resp-2", links);
    expect(link).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Enrichment                                                                 */
/* -------------------------------------------------------------------------- */

describe("enrichSurveyResponses", () => {
  const links: SurveyReplayLink[] = [
    { id: "srl-1", survey_response_id: "resp-1", session_id: "sess-abc", linked_at: "2026-04-01T00:00:00Z" },
  ];

  const responses = [
    {
      id: "resp-1",
      survey_id: "survey-1",
      session_id: "sess-abc",
      answers: [{ question_id: "q1", value: 9 }],
      submitted_at: "2026-04-01T00:00:00Z",
      page_url: "/inventory",
    },
    {
      id: "resp-2",
      survey_id: "survey-1",
      session_id: null,
      answers: [{ question_id: "q1", value: 5 }],
      submitted_at: "2026-04-01T01:00:00Z",
      page_url: "/contact",
    },
  ];

  it("adds replay links to responses", () => {
    const enriched = enrichSurveyResponses(responses, links);
    expect(enriched).toHaveLength(2);

    // First response has link
    expect(enriched[0].replay_link).not.toBeNull();
    expect(enriched[0].replay_url).toContain("/admin/session-replay");
    expect(enriched[0].replay_url).toContain("sess-abc");

    // Second response has no link and no session
    expect(enriched[1].replay_link).toBeNull();
    expect(enriched[1].replay_url).toBeNull();
  });

  it("uses session_id from response when no link exists", () => {
    const responsesWithSession = [
      {
        id: "resp-5",
        survey_id: "survey-1",
        session_id: "sess-xyz",
        answers: [],
        submitted_at: "2026-04-01T00:00:00Z",
        page_url: "/",
      },
    ];
    const enriched = enrichSurveyResponses(responsesWithSession, []);
    expect(enriched[0].replay_url).toContain("sess-xyz");
  });

  it("handles empty responses", () => {
    const enriched = enrichSurveyResponses([], links);
    expect(enriched).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

describe("Demo data", () => {
  it("getDemoLinks returns valid links", () => {
    const links = getDemoLinks();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.id).toMatch(/^srl-/);
      expect(link.survey_response_id).toBeDefined();
      expect(link.session_id).toBeDefined();
    }
  });

  it("getDemoEnrichedResponses returns responses with replay info", () => {
    const responses = getDemoEnrichedResponses("survey-test");
    expect(responses.length).toBeGreaterThan(0);

    // At least one should have a replay URL
    const withReplay = responses.filter((r) => r.replay_url);
    expect(withReplay.length).toBeGreaterThan(0);

    // At least one should NOT have a replay URL
    const withoutReplay = responses.filter((r) => !r.replay_url);
    expect(withoutReplay.length).toBeGreaterThan(0);
  });
});
