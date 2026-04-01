/**
 * Cross-Session Journey Stitcher
 *
 * Stitches multiple browser sessions into a coherent buying journey using
 * a persistent visitor_id stored in localStorage (survives cookie clearing).
 *
 * Tracks:
 *  - Session counting and timing across visits
 *  - Vehicle narrowing behavior (broad → narrow browsing = buying signal)
 *  - Journey stage classification (awareness → consideration → decision → ready_to_buy)
 *  - Vehicle shortlist (VINs viewed 2+ times across sessions)
 *  - Predicted buy window based on journey velocity
 *
 * All state is stored in localStorage under `wolfpack_journey_*` keys.
 * No cookies, no PII, no server-side dependencies for core stitching.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type JourneyStage = "awareness" | "consideration" | "decision" | "ready_to_buy";

export type EngagementTrend = "increasing" | "stable" | "declining";

export interface JourneyState {
  visitor_id: string;
  session_count: number;
  journey_stage: JourneyStage;
  days_in_journey: number;
  shortlisted_vins: string[];
  narrowing_rate: number;           // 0-1: how quickly variety is shrinking
  predicted_buy_window: string;     // e.g. "3-5 days"
}

export interface SessionHistory {
  session_number: number;
  started_at: string;               // ISO timestamp
  vehicles_viewed: string[];        // VINs
  categories_browsed: string[];     // make/type buckets
  calculator_used: boolean;
  pages_viewed: number;
}

export interface JourneyData {
  visitor_id: string;
  first_visit_at: string;
  last_visit_at: string;
  sessions: SessionHistory[];
  vehicle_view_counts: Record<string, number>;  // VIN -> total view count
  current_session_index: number;
}

export interface JourneyEvent {
  type: string;
  data: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Storage keys                                                                */
/* -------------------------------------------------------------------------- */

const VISITOR_ID_KEY = "wolfpack_journey_visitor_id";
const JOURNEY_DATA_KEY = "wolfpack_journey_data";

/* -------------------------------------------------------------------------- */
/* Visitor ID management                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Get or create a persistent visitor ID in localStorage.
 * Unlike cookies, localStorage persists through cookie clearing.
 */
export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return `vid_${Date.now()}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Journey data persistence                                                    */
/* -------------------------------------------------------------------------- */

function loadJourneyData(): JourneyData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JOURNEY_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JourneyData;
  } catch {
    return null;
  }
}

function saveJourneyData(data: JourneyData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(JOURNEY_DATA_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — degrade gracefully
  }
}

/* -------------------------------------------------------------------------- */
/* Session start                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Initialize a new session within the journey.
 * Returns session metadata and any events to fire.
 */
export function startSession(): {
  data: JourneyData;
  events: JourneyEvent[];
} {
  const events: JourneyEvent[] = [];
  const visitorId = getOrCreateVisitorId();
  const now = new Date().toISOString();

  let journeyData = loadJourneyData();

  if (!journeyData) {
    // First visit ever
    journeyData = {
      visitor_id: visitorId,
      first_visit_at: now,
      last_visit_at: now,
      sessions: [],
      vehicle_view_counts: {},
      current_session_index: 0,
    };
  }

  const sessionNumber = journeyData.sessions.length + 1;
  const daysSinceFirst = daysBetween(journeyData.first_visit_at, now);
  const daysSinceLast = daysBetween(journeyData.last_visit_at, now);

  // Create new session entry
  const newSession: SessionHistory = {
    session_number: sessionNumber,
    started_at: now,
    vehicles_viewed: [],
    categories_browsed: [],
    calculator_used: false,
    pages_viewed: 0,
  };

  journeyData.sessions.push(newSession);
  journeyData.current_session_index = journeyData.sessions.length - 1;
  journeyData.last_visit_at = now;

  // Fire session start event
  events.push({
    type: "journey.session_start",
    data: {
      visitor_id: visitorId,
      session_number: sessionNumber,
      days_since_first_visit: daysSinceFirst,
      days_since_last_visit: daysSinceLast,
    },
  });

  // Fire return visit event if applicable
  if (sessionNumber > 1) {
    const trend = computeEngagementTrend(journeyData.sessions);
    events.push({
      type: "journey.return_visit",
      data: {
        days_since_last: daysSinceLast,
        total_sessions: sessionNumber,
        engagement_trend: trend,
      },
    });
  }

  saveJourneyData(journeyData);
  return { data: journeyData, events };
}

/* -------------------------------------------------------------------------- */
/* Vehicle tracking                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Record a vehicle view within the current session.
 * Returns any triggered events (narrowing, shortlist update, stage change).
 */
export function recordVehicleView(
  vin: string,
  category: string,
): JourneyEvent[] {
  const events: JourneyEvent[] = [];
  const journeyData = loadJourneyData();
  if (!journeyData) return events;

  const session = journeyData.sessions[journeyData.current_session_index];
  if (!session) return events;

  // Track in current session
  if (!session.vehicles_viewed.includes(vin)) {
    session.vehicles_viewed.push(vin);
  }
  if (category && !session.categories_browsed.includes(category)) {
    session.categories_browsed.push(category);
  }

  // Track global view counts
  journeyData.vehicle_view_counts[vin] =
    (journeyData.vehicle_view_counts[vin] ?? 0) + 1;

  // Check for shortlist update (vehicles viewed 2+ times across sessions)
  const shortlisted = Object.entries(journeyData.vehicle_view_counts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a);

  if (shortlisted.length > 0 && journeyData.vehicle_view_counts[vin] === 2) {
    const mostViewed = shortlisted[0];
    events.push({
      type: "journey.shortlist_update",
      data: {
        vins: shortlisted.map(([v]) => v),
        view_counts: Object.fromEntries(shortlisted),
        most_viewed_vin: mostViewed[0],
      },
    });
  }

  // Check for narrowing detection
  const narrowingResult = detectNarrowing(journeyData.sessions);
  if (narrowingResult.detected) {
    events.push({
      type: "journey.narrowing_detected",
      data: {
        previous_variety: narrowingResult.previousVariety,
        current_variety: narrowingResult.currentVariety,
        narrowing_rate: narrowingResult.rate,
      },
    });
  }

  // Check for stage transition
  const previousStage = classifyJourneyStage(journeyData, true);
  saveJourneyData(journeyData);
  const newStage = classifyJourneyStage(journeyData, false);

  if (previousStage !== newStage) {
    events.push({
      type: "journey.stage_change",
      data: {
        from_stage: previousStage,
        to_stage: newStage,
        session_count: journeyData.sessions.length,
        trigger: "vehicle_view",
      },
    });
  }

  return events;
}

/**
 * Record calculator usage in the current session.
 */
export function recordCalculatorUsed(): JourneyEvent[] {
  const events: JourneyEvent[] = [];
  const journeyData = loadJourneyData();
  if (!journeyData) return events;

  const session = journeyData.sessions[journeyData.current_session_index];
  if (!session) return events;

  const previousStage = classifyJourneyStage(journeyData, false);
  session.calculator_used = true;
  saveJourneyData(journeyData);
  const newStage = classifyJourneyStage(journeyData, false);

  if (previousStage !== newStage) {
    events.push({
      type: "journey.stage_change",
      data: {
        from_stage: previousStage,
        to_stage: newStage,
        session_count: journeyData.sessions.length,
        trigger: "calculator_used",
      },
    });
  }

  return events;
}

/**
 * Record a page view in the current session.
 */
export function recordPageView(): void {
  const journeyData = loadJourneyData();
  if (!journeyData) return;

  const session = journeyData.sessions[journeyData.current_session_index];
  if (!session) return;

  session.pages_viewed++;
  saveJourneyData(journeyData);
}

/* -------------------------------------------------------------------------- */
/* Journey stage classification                                                */
/* -------------------------------------------------------------------------- */

/**
 * Classify the current journey stage based on all accumulated signals.
 *
 * Stages:
 *  - awareness: first visit, broad browsing
 *  - consideration: return visit, narrower browsing
 *  - decision: 3+ visits, specific vehicles
 *  - ready_to_buy: calculator used + return visit + narrow focus
 */
export function classifyJourneyStage(
  data: JourneyData,
  excludeCurrentSession = false,
): JourneyStage {
  const sessions = excludeCurrentSession
    ? data.sessions.slice(0, -1)
    : data.sessions;

  if (sessions.length === 0) return "awareness";

  const sessionCount = sessions.length;
  const hasReturnVisit = sessionCount >= 2;
  const hasMultipleReturns = sessionCount >= 3;

  // Check narrowing: latest session has fewer categories than earlier ones
  const narrowing = detectNarrowing(sessions);
  const isNarrow = narrowing.rate > 0.4;

  // Check calculator usage in any session
  const calculatorUsed = sessions.some((s) => s.calculator_used);

  // Check shortlist (vehicles with 2+ views)
  const shortlistSize = Object.values(data.vehicle_view_counts).filter(
    (c) => c >= 2,
  ).length;

  // ready_to_buy: calculator + return visit + narrow focus
  if (calculatorUsed && hasReturnVisit && (isNarrow || shortlistSize >= 1)) {
    return "ready_to_buy";
  }

  // decision: 3+ visits and specific vehicles
  if (hasMultipleReturns && (shortlistSize >= 1 || isNarrow)) {
    return "decision";
  }

  // consideration: return visit with some narrowing
  if (hasReturnVisit) {
    return "consideration";
  }

  return "awareness";
}

/* -------------------------------------------------------------------------- */
/* Narrowing detection                                                         */
/* -------------------------------------------------------------------------- */

interface NarrowingResult {
  detected: boolean;
  previousVariety: number;
  currentVariety: number;
  rate: number; // 0-1: how much narrowing occurred
}

/**
 * Detect whether the visitor is narrowing their browsing across sessions.
 * Compares the variety (unique categories or vehicles) of recent sessions
 * against earlier sessions.
 */
export function detectNarrowing(sessions: SessionHistory[]): NarrowingResult {
  if (sessions.length < 2) {
    return { detected: false, previousVariety: 0, currentVariety: 0, rate: 0 };
  }

  // Compare the latest session against the average of previous sessions
  const previous = sessions.slice(0, -1);
  const current = sessions[sessions.length - 1];

  const prevAvgCategories =
    previous.reduce((sum, s) => sum + s.categories_browsed.length, 0) /
    previous.length;
  const prevAvgVehicles =
    previous.reduce((sum, s) => sum + s.vehicles_viewed.length, 0) /
    previous.length;

  // Use the larger of category variety or vehicle variety as the measure
  const prevVariety = Math.max(prevAvgCategories, prevAvgVehicles);
  const currVariety = Math.max(
    current.categories_browsed.length,
    current.vehicles_viewed.length,
  );

  if (prevVariety <= 0) {
    return { detected: false, previousVariety: 0, currentVariety: currVariety, rate: 0 };
  }

  const rate = Math.max(0, Math.min(1, 1 - currVariety / prevVariety));
  const detected = rate > 0.3 && currVariety < prevVariety;

  return {
    detected,
    previousVariety: Math.round(prevVariety * 10) / 10,
    currentVariety: currVariety,
    rate: Math.round(rate * 100) / 100,
  };
}

/* -------------------------------------------------------------------------- */
/* Engagement trend                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compute whether engagement is increasing, stable, or declining
 * by looking at pages_viewed and vehicles_viewed across recent sessions.
 */
export function computeEngagementTrend(
  sessions: SessionHistory[],
): EngagementTrend {
  if (sessions.length < 2) return "stable";

  // Look at the last 3 sessions (or all if fewer)
  const recent = sessions.slice(-3);
  if (recent.length < 2) return "stable";

  const engagementScores = recent.map(
    (s) => s.pages_viewed + s.vehicles_viewed.length * 2,
  );

  // Simple linear trend
  const first = engagementScores[0];
  const last = engagementScores[engagementScores.length - 1];

  if (last > first * 1.2) return "increasing";
  if (last < first * 0.7) return "declining";
  return "stable";
}

/* -------------------------------------------------------------------------- */
/* Predicted buy window                                                        */
/* -------------------------------------------------------------------------- */

function predictBuyWindow(data: JourneyData): string {
  const stage = classifyJourneyStage(data, false);
  const daysInJourney = daysBetween(data.first_visit_at, new Date().toISOString());
  const sessionCount = data.sessions.length;

  if (stage === "ready_to_buy") {
    if (daysInJourney <= 3) return "1-2 days";
    return "3-5 days";
  }

  if (stage === "decision") {
    if (sessionCount >= 5) return "3-5 days";
    return "5-10 days";
  }

  if (stage === "consideration") {
    return "10-20 days";
  }

  return "20+ days";
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Get the full journey state for the current visitor.
 * Safe to call from any component — returns sensible defaults if no data.
 */
export function getJourneyState(): JourneyState {
  const visitorId = getOrCreateVisitorId();
  const journeyData = loadJourneyData();

  if (!journeyData || journeyData.sessions.length === 0) {
    return {
      visitor_id: visitorId,
      session_count: 0,
      journey_stage: "awareness",
      days_in_journey: 0,
      shortlisted_vins: [],
      narrowing_rate: 0,
      predicted_buy_window: "20+ days",
    };
  }

  const narrowing = detectNarrowing(journeyData.sessions);
  const shortlisted = Object.entries(journeyData.vehicle_view_counts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([vin]) => vin);

  return {
    visitor_id: visitorId,
    session_count: journeyData.sessions.length,
    journey_stage: classifyJourneyStage(journeyData, false),
    days_in_journey: daysBetween(
      journeyData.first_visit_at,
      new Date().toISOString(),
    ),
    shortlisted_vins: shortlisted,
    narrowing_rate: narrowing.rate,
    predicted_buy_window: predictBuyWindow(journeyData),
  };
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.max(0, Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24)));
}
