/**
 * Temporal Pattern Analyzer
 *
 * Analyzes time-of-day and day-of-week behavior patterns to generate
 * compound behavioral insights. Uses local time (not server time) so
 * the analysis reflects the visitor's actual context.
 *
 * Time slot classification:
 *  - weekday_work_hours: 9-17 Mon-Fri
 *  - weekday_evening: 17-22 Mon-Fri
 *  - weekday_late_night: 22-06 Mon-Fri (or Sun 22 - Mon 06, etc.)
 *  - weekend_morning: Sat-Sun before 12
 *  - weekend_afternoon: Sat-Sun 12-17
 *  - weekend_evening: Sat-Sun 17+
 *
 * Behavioral interpretations are evidence-based heuristics from
 * automotive retail research patterns.
 */

import type { JourneyState } from "./journey-stitcher";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type TimeSlot =
  | "weekday_work_hours"
  | "weekday_evening"
  | "weekday_late_night"
  | "weekend_morning"
  | "weekend_afternoon"
  | "weekend_evening";

export type DayType = "weekday" | "weekend";

export interface TemporalContext {
  time_slot: TimeSlot;
  day_type: DayType;
  behavioral_interpretation: string;
  compound_signals: CompoundSignal[];
}

export interface CompoundSignal {
  signal_type: string;
  confidence: number;     // 0-1
  contributing_signals: string[];
  interpretation: string;
  recommended_action: string;
}

export interface TemporalEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface TemporalSessionInput {
  local_hour: number;             // 0-23
  local_day_of_week: number;      // 0=Sun, 6=Sat
  is_return_visit: boolean;
  journey_stage?: string;
  calculator_used?: boolean;
  shortlist_size?: number;
  session_count?: number;
}

/* -------------------------------------------------------------------------- */
/* Time slot classification                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Classify the current local time into a behavioral time slot.
 */
export function classifyTimeSlot(hour: number, dayOfWeek: number): TimeSlot {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
    if (hour < 12) return "weekend_morning";
    if (hour < 17) return "weekend_afternoon";
    return "weekend_evening";
  }

  // Weekday
  if (hour >= 9 && hour < 17) return "weekday_work_hours";
  if (hour >= 17 && hour < 22) return "weekday_evening";
  return "weekday_late_night"; // 22-8 on weekdays
}

/**
 * Determine if the day is a weekday or weekend.
 */
export function classifyDayType(dayOfWeek: number): DayType {
  return dayOfWeek === 0 || dayOfWeek === 6 ? "weekend" : "weekday";
}

/* -------------------------------------------------------------------------- */
/* Behavioral interpretation                                                   */
/* -------------------------------------------------------------------------- */

const BEHAVIORAL_INTERPRETATIONS: Record<TimeSlot, string> = {
  weekday_work_hours:
    "Browsing during business hours — likely employed, researching during breaks or downtime",
  weekday_evening:
    "Evening browsing — prime decision-making time, often involves spouse or partner discussion",
  weekday_late_night:
    "Late-night browsing — early-stage exploration or insomnia-driven dreaming about next vehicle",
  weekend_morning:
    "Weekend morning browsing — potential showroom visitor today, high purchase intent window",
  weekend_afternoon:
    "Weekend afternoon — active shopping mode, likely comparing options or visiting dealers",
  weekend_evening:
    "Weekend evening — reflecting on weekend visits, consolidating preferences",
};

/**
 * Get a behavioral interpretation for a time slot.
 */
export function getInterpretation(slot: TimeSlot): string {
  return BEHAVIORAL_INTERPRETATIONS[slot];
}

/* -------------------------------------------------------------------------- */
/* Compound signal detection                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Detect compound signals by combining temporal context with journey data.
 * Each compound signal combines 2+ independent signals to produce an insight
 * that neither signal alone would justify.
 */
export function detectCompoundSignals(
  input: TemporalSessionInput,
): CompoundSignal[] {
  const signals: CompoundSignal[] = [];
  const slot = classifyTimeSlot(input.local_hour, input.local_day_of_week);

  // Compound 1: Weekend morning + decision stage + calculator = showroom predicted
  if (
    slot === "weekend_morning" &&
    input.journey_stage === "decision" &&
    input.calculator_used
  ) {
    signals.push({
      signal_type: "showroom_predicted",
      confidence: 0.82,
      contributing_signals: [
        "weekend_morning_browsing",
        "journey_stage_decision",
        "calculator_used",
      ],
      interpretation:
        "Weekend morning research with calculator at decision stage — very likely visiting a showroom today",
      recommended_action: "Send immediate appointment invite with specific vehicle details",
    });
  }

  // Compound 2: Weekend morning + specific vehicle + calculator (any stage)
  if (
    slot === "weekend_morning" &&
    input.calculator_used &&
    input.shortlist_size !== undefined &&
    input.shortlist_size >= 1
  ) {
    signals.push({
      signal_type: "showroom_predicted",
      confidence: 0.75,
      contributing_signals: [
        "weekend_morning_browsing",
        "calculator_used",
        "has_shortlisted_vehicle",
      ],
      interpretation:
        "Weekend morning with calculator usage and specific vehicle interest — showroom visit likely",
      recommended_action: "Proactively reach out with availability and appointment offer",
    });
  }

  // Compound 3: Weekday lunch + 3rd+ return visit + shortlist size 1 = ready to close
  if (
    slot === "weekday_work_hours" &&
    input.local_hour >= 11 &&
    input.local_hour <= 13 &&
    input.session_count !== undefined &&
    input.session_count >= 3 &&
    input.shortlist_size === 1
  ) {
    signals.push({
      signal_type: "ready_to_close",
      confidence: 0.78,
      contributing_signals: [
        "weekday_lunch_browsing",
        "3rd_plus_return_visit",
        "shortlist_size_1",
      ],
      interpretation:
        "Lunchtime check-in on a single vehicle after multiple visits — this buyer has decided and needs a push",
      recommended_action: "Call immediately with a specific offer or incentive",
    });
  }

  // Compound 4: Weekday evening + return visit = spouse discussion
  if (
    slot === "weekday_evening" &&
    input.is_return_visit &&
    input.journey_stage === "consideration"
  ) {
    signals.push({
      signal_type: "spouse_discussion",
      confidence: 0.65,
      contributing_signals: [
        "weekday_evening_browsing",
        "return_visit",
        "consideration_stage",
      ],
      interpretation:
        "Evening return visit during consideration — likely discussing options with spouse or family",
      recommended_action: "Send comparison summary or side-by-side feature sheet",
    });
  }

  // Compound 5: Late night + broad browsing = early dreaming
  if (
    slot === "weekday_late_night" &&
    !input.is_return_visit &&
    input.journey_stage === "awareness"
  ) {
    signals.push({
      signal_type: "early_dreaming",
      confidence: 0.6,
      contributing_signals: [
        "late_night_browsing",
        "first_visit",
        "awareness_stage",
      ],
      interpretation:
        "Late-night first visit with broad browsing — early-stage dreamer, not ready to buy yet",
      recommended_action: "Add to nurture campaign with lifestyle-focused content",
    });
  }

  // Compound 6: Work hours + calculator + return visit = serious employed buyer
  if (
    slot === "weekday_work_hours" &&
    input.calculator_used &&
    input.is_return_visit
  ) {
    signals.push({
      signal_type: "serious_employed_buyer",
      confidence: 0.72,
      contributing_signals: [
        "weekday_work_hours",
        "calculator_used",
        "return_visit",
      ],
      interpretation:
        "Using calculator during work hours on a return visit — employed buyer doing serious financial planning",
      recommended_action: "Send pre-approved financing options or payment scenarios",
    });
  }

  // Compound 7: Weekend afternoon + decision + return visit = actively shopping
  if (
    slot === "weekend_afternoon" &&
    input.journey_stage === "decision" &&
    input.is_return_visit
  ) {
    signals.push({
      signal_type: "active_shopping",
      confidence: 0.7,
      contributing_signals: [
        "weekend_afternoon",
        "decision_stage",
        "return_visit",
      ],
      interpretation:
        "Weekend afternoon in decision stage — actively comparing dealerships, may have visited competitors",
      recommended_action: "Highlight unique value props: warranty, trade-in bonus, or limited-time offer",
    });
  }

  return signals;
}

/* -------------------------------------------------------------------------- */
/* Main classification function                                                */
/* -------------------------------------------------------------------------- */

/**
 * Classify the temporal context for the current session.
 * Combines time slot, behavioral interpretation, and compound signals.
 */
export function classifyTemporalContext(
  input: TemporalSessionInput,
): TemporalContext {
  const slot = classifyTimeSlot(input.local_hour, input.local_day_of_week);
  const dayType = classifyDayType(input.local_day_of_week);
  const interpretation = getInterpretation(slot);
  const compoundSignals = detectCompoundSignals(input);

  return {
    time_slot: slot,
    day_type: dayType,
    behavioral_interpretation: interpretation,
    compound_signals: compoundSignals,
  };
}

/* -------------------------------------------------------------------------- */
/* Event generation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Generate temporal events for the current session.
 * Called on session start to emit temporal.session_context and any
 * compound signal events.
 */
export function generateTemporalEvents(
  input: TemporalSessionInput,
): TemporalEvent[] {
  const events: TemporalEvent[] = [];
  const context = classifyTemporalContext(input);

  // Always fire session context
  events.push({
    type: "temporal.session_context",
    data: {
      time_slot: context.time_slot,
      day_type: context.day_type,
      local_hour: input.local_hour,
      is_return_visit: input.is_return_visit,
    },
  });

  // Fire compound signal events
  for (const signal of context.compound_signals) {
    if (signal.signal_type === "showroom_predicted") {
      events.push({
        type: "temporal.showroom_predicted",
        data: {
          confidence: signal.confidence,
          contributing_signals: signal.contributing_signals,
        },
      });
    } else if (signal.signal_type === "ready_to_close") {
      events.push({
        type: "temporal.ready_to_close",
        data: {
          confidence: signal.confidence,
          journey_data: {
            session_count: input.session_count,
            shortlist_size: input.shortlist_size,
            journey_stage: input.journey_stage,
          },
        },
      });
    } else {
      events.push({
        type: "temporal.pattern_insight",
        data: {
          pattern_type: signal.signal_type,
          interpretation: signal.interpretation,
          recommended_action: signal.recommended_action,
        },
      });
    }
  }

  return events;
}

/* -------------------------------------------------------------------------- */
/* Integration helper: build input from current browser state + journey        */
/* -------------------------------------------------------------------------- */

/**
 * Build a TemporalSessionInput from the current browser time and journey state.
 * Convenience function for use in EventCollector.
 */
export function buildTemporalInput(
  journeyState: JourneyState,
  calculatorUsed = false,
): TemporalSessionInput {
  const now = new Date();
  return {
    local_hour: now.getHours(),
    local_day_of_week: now.getDay(),
    is_return_visit: journeyState.session_count > 1,
    journey_stage: journeyState.journey_stage,
    calculator_used: calculatorUsed,
    shortlist_size: journeyState.shortlisted_vins.length,
    session_count: journeyState.session_count,
  };
}
