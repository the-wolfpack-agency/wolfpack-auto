/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for src/lib/journey-stitcher.ts
 *
 * Tests cross-session journey stitching: visitor ID persistence, session
 * counting, narrowing detection, stage classification, and shortlist tracking.
 *
 * Run with: npx jest src/lib/__tests__/journey-stitcher.test.ts
 */

import {
  getOrCreateVisitorId,
  startSession,
  recordVehicleView,
  recordCalculatorUsed,
  recordPageView,
  classifyJourneyStage,
  detectNarrowing,
  computeEngagementTrend,
  getJourneyState,
  type JourneyData,
  type SessionHistory,
} from "../journey-stitcher";

/* -------------------------------------------------------------------------- */
/* localStorage mock                                                           */
/* -------------------------------------------------------------------------- */

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: jest.fn((key: string) => store[key] ?? null),
      setItem: jest.fn((key: string, val: string) => {
        store[key] = val;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
      }),
    },
    writable: true,
    configurable: true,
  });
});

/* -------------------------------------------------------------------------- */
/* Visitor ID                                                                  */
/* -------------------------------------------------------------------------- */

describe("getOrCreateVisitorId", () => {
  it("creates a visitor ID on first call", () => {
    const id = getOrCreateVisitorId();
    expect(id).toMatch(/^vid_/);
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it("returns the same ID on subsequent calls", () => {
    const id1 = getOrCreateVisitorId();
    const id2 = getOrCreateVisitorId();
    expect(id1).toBe(id2);
  });
});

/* -------------------------------------------------------------------------- */
/* Session start                                                               */
/* -------------------------------------------------------------------------- */

describe("startSession", () => {
  it("creates a new journey on first session", () => {
    const { data, events } = startSession();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].session_number).toBe(1);

    // Should fire session_start event
    const sessionStart = events.find((e) => e.type === "journey.session_start");
    expect(sessionStart).toBeDefined();
    expect(sessionStart!.data.session_number).toBe(1);
    expect(sessionStart!.data.days_since_first_visit).toBe(0);
  });

  it("increments session count on subsequent starts", () => {
    startSession(); // session 1
    const { data, events } = startSession(); // session 2
    expect(data.sessions).toHaveLength(2);
    expect(data.sessions[1].session_number).toBe(2);

    // Should fire return_visit event
    const returnVisit = events.find((e) => e.type === "journey.return_visit");
    expect(returnVisit).toBeDefined();
    expect(returnVisit!.data.total_sessions).toBe(2);
  });

  it("does not fire return_visit on first session", () => {
    const { events } = startSession();
    const returnVisit = events.find((e) => e.type === "journey.return_visit");
    expect(returnVisit).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Vehicle view tracking                                                       */
/* -------------------------------------------------------------------------- */

describe("recordVehicleView", () => {
  it("tracks vehicles in the current session", () => {
    startSession();
    recordVehicleView("VIN001", "Toyota");
    recordVehicleView("VIN002", "Honda");

    const state = getJourneyState();
    expect(state.session_count).toBe(1);
  });

  it("fires shortlist_update when a vehicle is viewed 2+ times", () => {
    startSession();
    recordVehicleView("VIN001", "Toyota");
    const events = recordVehicleView("VIN001", "Toyota");

    const shortlistEvt = events.find((e) => e.type === "journey.shortlist_update");
    expect(shortlistEvt).toBeDefined();
    expect(shortlistEvt!.data.vins).toContain("VIN001");
    expect(shortlistEvt!.data.most_viewed_vin).toBe("VIN001");
  });

  it("tracks global view counts across sessions", () => {
    startSession();
    recordVehicleView("VIN001", "Toyota");

    startSession();
    recordVehicleView("VIN001", "Toyota"); // 2nd view across sessions

    const state = getJourneyState();
    expect(state.shortlisted_vins).toContain("VIN001");
  });
});

/* -------------------------------------------------------------------------- */
/* Narrowing detection                                                         */
/* -------------------------------------------------------------------------- */

describe("detectNarrowing", () => {
  it("returns not detected for fewer than 2 sessions", () => {
    const sessions: SessionHistory[] = [
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3"],
        categories_browsed: ["Toyota", "Honda", "Ford"],
        calculator_used: false,
        pages_viewed: 10,
      },
    ];

    const result = detectNarrowing(sessions);
    expect(result.detected).toBe(false);
    expect(result.rate).toBe(0);
  });

  it("detects narrowing when variety decreases", () => {
    const sessions: SessionHistory[] = [
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3", "V4", "V5"],
        categories_browsed: ["Toyota", "Honda", "Ford", "Chevy"],
        calculator_used: false,
        pages_viewed: 15,
      },
      {
        session_number: 2,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2"],
        categories_browsed: ["Toyota"],
        calculator_used: false,
        pages_viewed: 8,
      },
    ];

    const result = detectNarrowing(sessions);
    expect(result.detected).toBe(true);
    expect(result.rate).toBeGreaterThan(0.3);
    expect(result.currentVariety).toBeLessThan(result.previousVariety);
  });

  it("does not detect narrowing when variety is stable", () => {
    const sessions: SessionHistory[] = [
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3"],
        categories_browsed: ["Toyota", "Honda"],
        calculator_used: false,
        pages_viewed: 10,
      },
      {
        session_number: 2,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3"],
        categories_browsed: ["Toyota", "Honda"],
        calculator_used: false,
        pages_viewed: 10,
      },
    ];

    const result = detectNarrowing(sessions);
    expect(result.detected).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Journey stage classification                                                */
/* -------------------------------------------------------------------------- */

describe("classifyJourneyStage", () => {
  function makeJourneyData(sessions: SessionHistory[]): JourneyData {
    return {
      visitor_id: "test-vid",
      first_visit_at: new Date().toISOString(),
      last_visit_at: new Date().toISOString(),
      sessions,
      vehicle_view_counts: {},
      current_session_index: sessions.length - 1,
    };
  }

  it("returns awareness for first visit", () => {
    const data = makeJourneyData([
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3"],
        categories_browsed: ["Toyota", "Honda", "Ford"],
        calculator_used: false,
        pages_viewed: 10,
      },
    ]);

    expect(classifyJourneyStage(data)).toBe("awareness");
  });

  it("returns consideration for return visit", () => {
    const data = makeJourneyData([
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2"],
        categories_browsed: ["Toyota", "Honda"],
        calculator_used: false,
        pages_viewed: 10,
      },
      {
        session_number: 2,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1"],
        categories_browsed: ["Toyota"],
        calculator_used: false,
        pages_viewed: 5,
      },
    ]);

    expect(classifyJourneyStage(data)).toBe("consideration");
  });

  it("returns decision for 3+ visits with shortlisted vehicles", () => {
    const data = makeJourneyData([
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3"],
        categories_browsed: ["Toyota", "Honda", "Ford"],
        calculator_used: false,
        pages_viewed: 15,
      },
      {
        session_number: 2,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2"],
        categories_browsed: ["Toyota", "Honda"],
        calculator_used: false,
        pages_viewed: 8,
      },
      {
        session_number: 3,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1"],
        categories_browsed: ["Toyota"],
        calculator_used: false,
        pages_viewed: 5,
      },
    ]);
    data.vehicle_view_counts = { V1: 3, V2: 2 };

    expect(classifyJourneyStage(data)).toBe("decision");
  });

  it("returns ready_to_buy when calculator used + return + narrow", () => {
    const data = makeJourneyData([
      {
        session_number: 1,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1", "V2", "V3", "V4"],
        categories_browsed: ["Toyota", "Honda", "Ford"],
        calculator_used: false,
        pages_viewed: 15,
      },
      {
        session_number: 2,
        started_at: new Date().toISOString(),
        vehicles_viewed: ["V1"],
        categories_browsed: ["Toyota"],
        calculator_used: true,
        pages_viewed: 8,
      },
    ]);
    data.vehicle_view_counts = { V1: 3 };

    expect(classifyJourneyStage(data)).toBe("ready_to_buy");
  });
});

/* -------------------------------------------------------------------------- */
/* Engagement trend                                                            */
/* -------------------------------------------------------------------------- */

describe("computeEngagementTrend", () => {
  it("returns stable for single session", () => {
    expect(
      computeEngagementTrend([
        {
          session_number: 1,
          started_at: new Date().toISOString(),
          vehicles_viewed: [],
          categories_browsed: [],
          calculator_used: false,
          pages_viewed: 5,
        },
      ]),
    ).toBe("stable");
  });

  it("returns increasing when engagement grows", () => {
    expect(
      computeEngagementTrend([
        {
          session_number: 1,
          started_at: new Date().toISOString(),
          vehicles_viewed: [],
          categories_browsed: [],
          calculator_used: false,
          pages_viewed: 2,
        },
        {
          session_number: 2,
          started_at: new Date().toISOString(),
          vehicles_viewed: ["V1", "V2"],
          categories_browsed: [],
          calculator_used: false,
          pages_viewed: 10,
        },
      ]),
    ).toBe("increasing");
  });

  it("returns declining when engagement drops", () => {
    expect(
      computeEngagementTrend([
        {
          session_number: 1,
          started_at: new Date().toISOString(),
          vehicles_viewed: ["V1", "V2", "V3"],
          categories_browsed: [],
          calculator_used: false,
          pages_viewed: 15,
        },
        {
          session_number: 2,
          started_at: new Date().toISOString(),
          vehicles_viewed: [],
          categories_browsed: [],
          calculator_used: false,
          pages_viewed: 1,
        },
      ]),
    ).toBe("declining");
  });
});

/* -------------------------------------------------------------------------- */
/* Calculator recording                                                        */
/* -------------------------------------------------------------------------- */

describe("recordCalculatorUsed", () => {
  it("records calculator usage and may trigger stage change", () => {
    // Set up a return visitor
    startSession();
    recordVehicleView("VIN001", "Toyota");
    recordVehicleView("VIN001", "Toyota"); // shortlist

    startSession();
    recordVehicleView("VIN001", "Toyota");

    // Now use calculator — may trigger ready_to_buy
    const events = recordCalculatorUsed();
    // Should have recorded without error
    expect(Array.isArray(events)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Page view recording                                                         */
/* -------------------------------------------------------------------------- */

describe("recordPageView", () => {
  it("increments pages_viewed counter without error", () => {
    startSession();
    expect(() => recordPageView()).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* getJourneyState                                                             */
/* -------------------------------------------------------------------------- */

describe("getJourneyState", () => {
  it("returns sensible defaults when no journey exists", () => {
    const state = getJourneyState();
    expect(state.visitor_id).toMatch(/^vid_/);
    expect(state.session_count).toBe(0);
    expect(state.journey_stage).toBe("awareness");
    expect(state.days_in_journey).toBe(0);
    expect(state.shortlisted_vins).toEqual([]);
    expect(state.narrowing_rate).toBe(0);
    expect(state.predicted_buy_window).toBe("20+ days");
  });

  it("returns correct state after multiple sessions", () => {
    startSession();
    recordVehicleView("VIN001", "Toyota");
    recordVehicleView("VIN002", "Honda");
    recordVehicleView("VIN003", "Ford");

    startSession();
    recordVehicleView("VIN001", "Toyota");

    const state = getJourneyState();
    expect(state.session_count).toBe(2);
    expect(state.journey_stage).toBe("consideration");
    expect(state.shortlisted_vins).toContain("VIN001");
  });
});
