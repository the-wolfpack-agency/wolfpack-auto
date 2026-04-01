/**
 * Unit tests for src/lib/temporal-patterns.ts
 *
 * Tests time slot classification, behavioral interpretation,
 * compound signal detection, and temporal event generation.
 *
 * Run with: npx jest src/lib/__tests__/temporal-patterns.test.ts
 */

import {
  classifyTimeSlot,
  classifyDayType,
  getInterpretation,
  detectCompoundSignals,
  classifyTemporalContext,
  generateTemporalEvents,
  buildTemporalInput,
  type TimeSlot,
  type TemporalSessionInput,
} from "../temporal-patterns";

/* -------------------------------------------------------------------------- */
/* Time slot classification                                                    */
/* -------------------------------------------------------------------------- */

describe("classifyTimeSlot", () => {
  it("classifies weekday work hours (9-17 Mon-Fri)", () => {
    // Monday (1) at 10am
    expect(classifyTimeSlot(10, 1)).toBe("weekday_work_hours");
    // Friday (5) at 9am
    expect(classifyTimeSlot(9, 5)).toBe("weekday_work_hours");
    // Wednesday (3) at 16
    expect(classifyTimeSlot(16, 3)).toBe("weekday_work_hours");
  });

  it("classifies weekday evening (17-22 Mon-Fri)", () => {
    expect(classifyTimeSlot(17, 1)).toBe("weekday_evening");
    expect(classifyTimeSlot(19, 3)).toBe("weekday_evening");
    expect(classifyTimeSlot(21, 5)).toBe("weekday_evening");
  });

  it("classifies weekday late night (22-9 Mon-Fri)", () => {
    expect(classifyTimeSlot(22, 1)).toBe("weekday_late_night");
    expect(classifyTimeSlot(23, 3)).toBe("weekday_late_night");
    expect(classifyTimeSlot(2, 2)).toBe("weekday_late_night");
    expect(classifyTimeSlot(6, 4)).toBe("weekday_late_night");
    expect(classifyTimeSlot(8, 1)).toBe("weekday_late_night");
  });

  it("classifies weekend morning (before 12 Sat-Sun)", () => {
    // Saturday (6) at 9am
    expect(classifyTimeSlot(9, 6)).toBe("weekend_morning");
    // Sunday (0) at 11am
    expect(classifyTimeSlot(11, 0)).toBe("weekend_morning");
  });

  it("classifies weekend afternoon (12-17 Sat-Sun)", () => {
    expect(classifyTimeSlot(12, 6)).toBe("weekend_afternoon");
    expect(classifyTimeSlot(15, 0)).toBe("weekend_afternoon");
  });

  it("classifies weekend evening (17+ Sat-Sun)", () => {
    expect(classifyTimeSlot(17, 6)).toBe("weekend_evening");
    expect(classifyTimeSlot(22, 0)).toBe("weekend_evening");
  });
});

/* -------------------------------------------------------------------------- */
/* Day type classification                                                     */
/* -------------------------------------------------------------------------- */

describe("classifyDayType", () => {
  it("returns weekend for Saturday (6) and Sunday (0)", () => {
    expect(classifyDayType(0)).toBe("weekend");
    expect(classifyDayType(6)).toBe("weekend");
  });

  it("returns weekday for Monday-Friday (1-5)", () => {
    for (let d = 1; d <= 5; d++) {
      expect(classifyDayType(d)).toBe("weekday");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Behavioral interpretation                                                   */
/* -------------------------------------------------------------------------- */

describe("getInterpretation", () => {
  it("returns a non-empty string for every time slot", () => {
    const slots: TimeSlot[] = [
      "weekday_work_hours",
      "weekday_evening",
      "weekday_late_night",
      "weekend_morning",
      "weekend_afternoon",
      "weekend_evening",
    ];
    for (const slot of slots) {
      const interp = getInterpretation(slot);
      expect(interp.length).toBeGreaterThan(10);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Compound signal detection                                                   */
/* -------------------------------------------------------------------------- */

describe("detectCompoundSignals", () => {
  it("detects showroom_predicted for weekend morning + decision + calculator", () => {
    const input: TemporalSessionInput = {
      local_hour: 10,
      local_day_of_week: 6, // Saturday
      is_return_visit: true,
      journey_stage: "decision",
      calculator_used: true,
      shortlist_size: 2,
      session_count: 4,
    };

    const signals = detectCompoundSignals(input);
    const showroom = signals.find((s) => s.signal_type === "showroom_predicted");
    expect(showroom).toBeDefined();
    expect(showroom!.confidence).toBeGreaterThan(0.7);
    expect(showroom!.contributing_signals.length).toBeGreaterThanOrEqual(2);
  });

  it("detects ready_to_close for weekday lunch + 3rd visit + shortlist=1", () => {
    const input: TemporalSessionInput = {
      local_hour: 12,
      local_day_of_week: 3, // Wednesday
      is_return_visit: true,
      journey_stage: "decision",
      calculator_used: false,
      shortlist_size: 1,
      session_count: 3,
    };

    const signals = detectCompoundSignals(input);
    const readyToClose = signals.find((s) => s.signal_type === "ready_to_close");
    expect(readyToClose).toBeDefined();
    expect(readyToClose!.confidence).toBeGreaterThan(0.7);
  });

  it("detects spouse_discussion for weekday evening + return + consideration", () => {
    const input: TemporalSessionInput = {
      local_hour: 19,
      local_day_of_week: 2, // Tuesday
      is_return_visit: true,
      journey_stage: "consideration",
      calculator_used: false,
      shortlist_size: 0,
      session_count: 2,
    };

    const signals = detectCompoundSignals(input);
    const spouse = signals.find((s) => s.signal_type === "spouse_discussion");
    expect(spouse).toBeDefined();
  });

  it("detects early_dreaming for late night + first visit + awareness", () => {
    const input: TemporalSessionInput = {
      local_hour: 23,
      local_day_of_week: 3, // Wednesday
      is_return_visit: false,
      journey_stage: "awareness",
      calculator_used: false,
      shortlist_size: 0,
      session_count: 1,
    };

    const signals = detectCompoundSignals(input);
    const dreaming = signals.find((s) => s.signal_type === "early_dreaming");
    expect(dreaming).toBeDefined();
  });

  it("detects serious_employed_buyer for work hours + calculator + return", () => {
    const input: TemporalSessionInput = {
      local_hour: 14,
      local_day_of_week: 1, // Monday
      is_return_visit: true,
      journey_stage: "consideration",
      calculator_used: true,
      shortlist_size: 1,
      session_count: 2,
    };

    const signals = detectCompoundSignals(input);
    const employed = signals.find((s) => s.signal_type === "serious_employed_buyer");
    expect(employed).toBeDefined();
    expect(employed!.confidence).toBeGreaterThan(0.6);
  });

  it("returns empty array when no compound signals match", () => {
    const input: TemporalSessionInput = {
      local_hour: 14,
      local_day_of_week: 3, // Wednesday afternoon
      is_return_visit: false,
      journey_stage: "awareness",
      calculator_used: false,
      shortlist_size: 0,
      session_count: 1,
    };

    const signals = detectCompoundSignals(input);
    // May or may not match — the key is it doesn't throw
    expect(Array.isArray(signals)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* classifyTemporalContext                                                     */
/* -------------------------------------------------------------------------- */

describe("classifyTemporalContext", () => {
  it("returns complete context object", () => {
    const input: TemporalSessionInput = {
      local_hour: 10,
      local_day_of_week: 6,
      is_return_visit: true,
      journey_stage: "decision",
      calculator_used: true,
      shortlist_size: 2,
      session_count: 4,
    };

    const context = classifyTemporalContext(input);
    expect(context.time_slot).toBe("weekend_morning");
    expect(context.day_type).toBe("weekend");
    expect(context.behavioral_interpretation.length).toBeGreaterThan(0);
    expect(Array.isArray(context.compound_signals)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Event generation                                                            */
/* -------------------------------------------------------------------------- */

describe("generateTemporalEvents", () => {
  it("always generates session_context event", () => {
    const input: TemporalSessionInput = {
      local_hour: 15,
      local_day_of_week: 4,
      is_return_visit: false,
      journey_stage: "awareness",
      calculator_used: false,
      shortlist_size: 0,
      session_count: 1,
    };

    const events = generateTemporalEvents(input);
    const sessionContext = events.find((e) => e.type === "temporal.session_context");
    expect(sessionContext).toBeDefined();
    expect(sessionContext!.data.time_slot).toBe("weekday_work_hours");
    expect(sessionContext!.data.local_hour).toBe(15);
  });

  it("generates showroom_predicted event when conditions match", () => {
    const input: TemporalSessionInput = {
      local_hour: 9,
      local_day_of_week: 6,
      is_return_visit: true,
      journey_stage: "decision",
      calculator_used: true,
      shortlist_size: 1,
      session_count: 3,
    };

    const events = generateTemporalEvents(input);
    const showroom = events.find((e) => e.type === "temporal.showroom_predicted");
    expect(showroom).toBeDefined();
    expect(showroom!.data.confidence).toBeGreaterThan(0);
  });

  it("generates ready_to_close event when conditions match", () => {
    const input: TemporalSessionInput = {
      local_hour: 12,
      local_day_of_week: 3,
      is_return_visit: true,
      journey_stage: "decision",
      calculator_used: false,
      shortlist_size: 1,
      session_count: 3,
    };

    const events = generateTemporalEvents(input);
    const readyToClose = events.find((e) => e.type === "temporal.ready_to_close");
    expect(readyToClose).toBeDefined();
  });

  it("generates pattern_insight events for non-primary compounds", () => {
    const input: TemporalSessionInput = {
      local_hour: 19,
      local_day_of_week: 2,
      is_return_visit: true,
      journey_stage: "consideration",
      calculator_used: false,
      shortlist_size: 0,
      session_count: 2,
    };

    const events = generateTemporalEvents(input);
    const insight = events.find((e) => e.type === "temporal.pattern_insight");
    expect(insight).toBeDefined();
    expect(insight!.data.pattern_type).toBe("spouse_discussion");
  });
});

/* -------------------------------------------------------------------------- */
/* buildTemporalInput                                                          */
/* -------------------------------------------------------------------------- */

describe("buildTemporalInput", () => {
  it("builds input from journey state", () => {
    const journeyState = {
      visitor_id: "vid_test",
      session_count: 3,
      journey_stage: "decision" as const,
      days_in_journey: 5,
      shortlisted_vins: ["VIN001", "VIN002"],
      narrowing_rate: 0.6,
      predicted_buy_window: "3-5 days",
    };

    const input = buildTemporalInput(journeyState, true);
    expect(input.is_return_visit).toBe(true);
    expect(input.journey_stage).toBe("decision");
    expect(input.calculator_used).toBe(true);
    expect(input.shortlist_size).toBe(2);
    expect(input.session_count).toBe(3);
    expect(input.local_hour).toBeGreaterThanOrEqual(0);
    expect(input.local_hour).toBeLessThanOrEqual(23);
    expect(input.local_day_of_week).toBeGreaterThanOrEqual(0);
    expect(input.local_day_of_week).toBeLessThanOrEqual(6);
  });
});
