/**
 * Micro-Behavioral Signals — Novel Analytics Engine
 *
 * Five pioneering behavioral signals that no dealership platform captures today:
 *
 * 1. Photo Comparison Dwell — A/B vehicle preference strength from swipe timing
 * 2. Price Sensitivity Fingerprint — Budget ceiling from calculator interactions
 * 3. Decision Velocity — Impulse vs. comparison shopping from VDP→Lead timing
 * 4. Device Handoff Intent — Mobile→Desktop escalation as buying signal
 * 5. Night Owl Premium — Time-of-day patterns predicting purchase intent
 *
 * Each signal:
 *   - Reads from analytics_events (the single source of truth)
 *   - Produces a typed score/classification
 *   - Feeds back into the propensity model via learning views
 *   - Persists its computed signals as new analytics_events
 */

import {
  trackPhotoComparison,
  trackPriceSensitivity,
  trackDecisionVelocity,
  trackDeviceHandoff,
  trackNightOwl,
} from "@/lib/analytics-hooks";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PhotoComparisonSignal {
  customerId: string;
  vinA: string;
  vinB: string;
  dwellA_ms: number;
  dwellB_ms: number;
  preferredVin: string;
  preferenceStrength: number; // 0-1, higher = stronger preference
  comparisonCount: number;
}

export interface PriceSensitivitySignal {
  customerId: string;
  vin: string;
  stickerPrice: number;
  calculatorOpened: boolean;
  termsExplored: number[];     // e.g. [60, 72, 84]
  downPaymentsExplored: number[];
  estimatedCeiling: number;    // monthly payment ceiling
  sensitivityTier: "low" | "medium" | "high"; // low = price-insensitive
  bounced: boolean;
}

export interface DecisionVelocitySignal {
  customerId: string;
  vin: string;
  firstViewAt: string;
  leadSubmittedAt: string | null;
  returnVisits: number;
  uniqueVdpsViewed: number;
  velocityHours: number;       // hours from first VDP to lead submit
  classification: "impulse" | "fast" | "deliberate" | "comparison_shopper";
  urgencyScore: number;        // 0-100
}

export interface DeviceHandoffSignal {
  customerId: string;
  mobileSessionId: string;
  desktopSessionId: string;
  sharedVins: string[];
  handoffDirection: "mobile_to_desktop" | "desktop_to_mobile";
  timeBetweenMs: number;
  intentEscalation: boolean;   // true = serious buyer
  escalationScore: number;     // 0-100
}

export type TimeSegment =
  | "early_bird"       // 5am-8am
  | "business_hours"   // 8am-5pm
  | "evening"          // 5pm-9pm
  | "night_owl"        // 9pm-12am
  | "late_night";      // 12am-5am

export interface NightOwlSignal {
  customerId: string;
  sessionStartHour: number;
  timeSegment: TimeSegment;
  sessionDurationMinutes: number;
  vehiclesViewed: number;
  engagementDepth: number;     // pages per minute
  purchaseIntentMultiplier: number; // relative to business_hours baseline
}

export interface MicroSignalsSummary {
  dealerId: string;
  generatedAt: string;
  photoComparisons: PhotoComparisonSignal[];
  priceSensitivity: PriceSensitivitySignal[];
  decisionVelocity: DecisionVelocitySignal[];
  deviceHandoffs: DeviceHandoffSignal[];
  nightOwl: NightOwlSignal[];
  totalSignals: number;
}

/* ------------------------------------------------------------------ */
/*  1. Photo Comparison Dwell                                          */
/* ------------------------------------------------------------------ */

/**
 * Analyze photo comparison behavior from dwell events.
 * When a user swipes between two vehicles, longer dwell = preference.
 */
export function analyzePhotoComparison(
  events: Array<{ action: string; metadata: Record<string, unknown>; timestamp: string }>,
): PhotoComparisonSignal[] {
  const comparisons = new Map<string, { vinA: string; vinB: string; dwellA: number; dwellB: number; count: number; customerId: string }>();

  for (const e of events) {
    if (!e.action.startsWith("photo.dwell") && !e.action.startsWith("photo_compare.")) continue;

    const customerId = String(e.metadata.customer_id ?? e.metadata.session_id ?? "unknown");
    const vin = String(e.metadata.vin ?? "");
    const dwellMs = Number(e.metadata.dwell_ms ?? e.metadata.duration_ms ?? 0);
    const comparedVin = String(e.metadata.compared_vin ?? "");

    if (!vin || !dwellMs) continue;

    const key = customerId + ":" + [vin, comparedVin].sort().join("-");
    const existing = comparisons.get(key);

    if (existing) {
      if (vin === existing.vinA) existing.dwellA += dwellMs;
      else existing.dwellB += dwellMs;
      existing.count++;
    } else if (comparedVin) {
      comparisons.set(key, {
        vinA: vin, vinB: comparedVin,
        dwellA: dwellMs, dwellB: 0, count: 1, customerId,
      });
    }
  }

  return [...comparisons.values()]
    .filter((c) => c.dwellA > 0 || c.dwellB > 0)
    .map((c) => {
      const total = c.dwellA + c.dwellB;
      const preferredVin = c.dwellA >= c.dwellB ? c.vinA : c.vinB;
      const maxDwell = Math.max(c.dwellA, c.dwellB);
      const preferenceStrength = total > 0 ? Math.round((maxDwell / total) * 100) / 100 : 0.5;

      return {
        customerId: c.customerId,
        vinA: c.vinA,
        vinB: c.vinB,
        dwellA_ms: c.dwellA,
        dwellB_ms: c.dwellB,
        preferredVin,
        preferenceStrength,
        comparisonCount: c.count,
      };
    });
}

/* ------------------------------------------------------------------ */
/*  2. Price Sensitivity Fingerprint                                   */
/* ------------------------------------------------------------------ */

/**
 * Fingerprint price sensitivity from calculator interaction sequences.
 * Sequence: view price → open calculator → adjust terms → bounce or convert.
 */
export function analyzePriceSensitivity(
  events: Array<{ action: string; metadata: Record<string, unknown>; timestamp: string }>,
): PriceSensitivitySignal[] {
  // Group events by customer + VIN
  const sessions = new Map<string, {
    customerId: string; vin: string; stickerPrice: number;
    calculatorOpened: boolean; terms: Set<number>; downPayments: Set<number>;
    bounced: boolean; timestamps: string[];
  }>();

  for (const e of events) {
    const customerId = String(e.metadata.customer_id ?? e.metadata.session_id ?? "unknown");
    const vin = String(e.metadata.vin ?? "");
    if (!vin) continue;

    const key = `${customerId}:${vin}`;
    if (!sessions.has(key)) {
      sessions.set(key, {
        customerId, vin, stickerPrice: 0,
        calculatorOpened: false, terms: new Set(), downPayments: new Set(),
        bounced: false, timestamps: [],
      });
    }
    const s = sessions.get(key)!;
    s.timestamps.push(e.timestamp);

    if (e.action === "price_sensitivity.price_viewed" || e.action === "pricing.recommendation_viewed") {
      s.stickerPrice = Number(e.metadata.price ?? e.metadata.sticker_price ?? 0);
    } else if (e.action === "price_sensitivity.calculator_opened" || e.action === "retail.calculator_used") {
      s.calculatorOpened = true;
    } else if (e.action === "price_sensitivity.term_adjusted") {
      s.terms.add(Number(e.metadata.term_months ?? 0));
    } else if (e.action === "price_sensitivity.down_payment_adjusted") {
      s.downPayments.add(Number(e.metadata.down_payment ?? 0));
    } else if (e.action === "price_sensitivity.sticker_shock_bounce" || e.action === "exit.tab_switch") {
      s.bounced = true;
    }
  }

  return [...sessions.values()]
    .filter((s) => s.stickerPrice > 0 || s.calculatorOpened)
    .map((s) => {
      const termsArr = [...s.terms].sort((a, b) => a - b);
      const downArr = [...s.downPayments].sort((a, b) => a - b);

      // Estimate payment ceiling from highest term explored (longer term = tighter budget)
      const maxTerm = termsArr.length > 0 ? Math.max(...termsArr) : 60;
      const maxDown = downArr.length > 0 ? Math.max(...downArr) : 0;
      const estimatedCeiling = s.stickerPrice > 0
        ? Math.round((s.stickerPrice - maxDown) / maxTerm)
        : 0;

      // Sensitivity tier: explored many terms + long terms = high sensitivity
      let sensitivityTier: "low" | "medium" | "high" = "low";
      if (s.bounced || maxTerm >= 84) sensitivityTier = "high";
      else if (termsArr.length >= 2 || maxTerm >= 72) sensitivityTier = "medium";

      return {
        customerId: s.customerId,
        vin: s.vin,
        stickerPrice: s.stickerPrice,
        calculatorOpened: s.calculatorOpened,
        termsExplored: termsArr,
        downPaymentsExplored: downArr,
        estimatedCeiling,
        sensitivityTier,
        bounced: s.bounced,
      };
    });
}

/* ------------------------------------------------------------------ */
/*  3. Decision Velocity                                               */
/* ------------------------------------------------------------------ */

/**
 * Classify purchase decision speed from VDP view → lead submit timing.
 */
export function analyzeDecisionVelocity(
  events: Array<{ action: string; metadata: Record<string, unknown>; timestamp: string }>,
): DecisionVelocitySignal[] {
  const customers = new Map<string, {
    customerId: string; firstViews: Map<string, string>; leadSubmits: Map<string, string>;
    returnVisits: number; vdpsViewed: Set<string>;
  }>();

  for (const e of events) {
    const customerId = String(e.metadata.customer_id ?? e.metadata.session_id ?? "unknown");
    const vin = String(e.metadata.vin ?? "");

    if (!customers.has(customerId)) {
      customers.set(customerId, {
        customerId, firstViews: new Map(), leadSubmits: new Map(),
        returnVisits: 0, vdpsViewed: new Set(),
      });
    }
    const c = customers.get(customerId)!;

    if ((e.action === "decision_velocity.first_vdp_view" || e.action === "journey.session_start") && vin) {
      if (!c.firstViews.has(vin)) c.firstViews.set(vin, e.timestamp);
      c.vdpsViewed.add(vin);
    } else if (e.action === "decision_velocity.lead_submitted" || e.action === "lead.created") {
      if (vin) c.leadSubmits.set(vin, e.timestamp);
    } else if (e.action === "decision_velocity.return_visit" || e.action === "journey.return_visit") {
      c.returnVisits++;
    }
  }

  const results: DecisionVelocitySignal[] = [];

  for (const c of customers.values()) {
    for (const [vin, firstView] of c.firstViews) {
      const leadSubmit = c.leadSubmits.get(vin);
      const velocityHours = leadSubmit
        ? (new Date(leadSubmit).getTime() - new Date(firstView).getTime()) / (1000 * 60 * 60)
        : -1;

      let classification: DecisionVelocitySignal["classification"];
      let urgencyScore: number;

      if (velocityHours < 0) {
        // No lead submitted — classify by browsing behavior
        classification = c.vdpsViewed.size > 5 ? "comparison_shopper" : "deliberate";
        urgencyScore = c.returnVisits > 3 ? 40 : 20;
      } else if (velocityHours <= 1) {
        classification = "impulse";
        urgencyScore = 95;
      } else if (velocityHours <= 24) {
        classification = "fast";
        urgencyScore = 80;
      } else if (velocityHours <= 72) {
        classification = "deliberate";
        urgencyScore = 55;
      } else {
        classification = "comparison_shopper";
        urgencyScore = 35;
      }

      results.push({
        customerId: c.customerId,
        vin,
        firstViewAt: firstView,
        leadSubmittedAt: leadSubmit ?? null,
        returnVisits: c.returnVisits,
        uniqueVdpsViewed: c.vdpsViewed.size,
        velocityHours: velocityHours >= 0 ? Math.round(velocityHours * 10) / 10 : -1,
        classification,
        urgencyScore,
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  4. Device Handoff Intent                                           */
/* ------------------------------------------------------------------ */

/**
 * Detect cross-device browsing as a buying signal.
 * Same customer viewing same VINs on mobile then desktop = serious intent.
 */
export function analyzeDeviceHandoff(
  events: Array<{ action: string; metadata: Record<string, unknown>; timestamp: string }>,
): DeviceHandoffSignal[] {
  // Group sessions by customer fingerprint
  const sessions = new Map<string, Array<{
    sessionId: string; device: string; vins: Set<string>; timestamp: string;
  }>>();

  for (const e of events) {
    const customerId = String(e.metadata.customer_id ?? e.metadata.user_fingerprint ?? "unknown");
    const sessionId = String(e.metadata.session_id ?? "");
    const device = String(e.metadata.device_type ?? (
      String(e.metadata.user_agent ?? "").includes("Mobile") ? "mobile" : "desktop"
    ));
    const vin = String(e.metadata.vin ?? "");

    if (!customerId || customerId === "unknown") continue;

    if (!sessions.has(customerId)) sessions.set(customerId, []);
    const customerSessions = sessions.get(customerId)!;

    let session = customerSessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      session = { sessionId, device, vins: new Set(), timestamp: e.timestamp };
      customerSessions.push(session);
    }
    if (vin) session.vins.add(vin);
  }

  const results: DeviceHandoffSignal[] = [];

  for (const [customerId, customerSessions] of sessions) {
    if (customerSessions.length < 2) continue;

    // Find cross-device pairs
    for (let i = 0; i < customerSessions.length - 1; i++) {
      for (let j = i + 1; j < customerSessions.length; j++) {
        const a = customerSessions[i];
        const b = customerSessions[j];

        if (a.device === b.device) continue; // Same device, skip

        const sharedVins = [...a.vins].filter((v) => b.vins.has(v));
        if (sharedVins.length === 0) continue; // No shared VINs, skip

        const timeBetween = Math.abs(
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        const direction: DeviceHandoffSignal["handoffDirection"] =
          a.device === "mobile" ? "mobile_to_desktop" : "desktop_to_mobile";

        // Intent escalation: mobile→desktop with shared VINs within 48h is strong
        const intentEscalation = direction === "mobile_to_desktop" &&
          timeBetween < 48 * 60 * 60 * 1000 && sharedVins.length >= 1;

        // Escalation score: more shared VINs + shorter gap = higher score
        const vinScore = Math.min(sharedVins.length * 25, 50);
        const timeScore = timeBetween < 3600000 ? 50 : timeBetween < 86400000 ? 35 : 15;
        const escalationScore = Math.min(vinScore + timeScore, 100);

        results.push({
          customerId,
          mobileSessionId: a.device === "mobile" ? a.sessionId : b.sessionId,
          desktopSessionId: a.device === "desktop" ? a.sessionId : b.sessionId,
          sharedVins,
          handoffDirection: direction,
          timeBetweenMs: timeBetween,
          intentEscalation,
          escalationScore,
        });
      }
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  5. Night Owl Premium                                               */
/* ------------------------------------------------------------------ */

/**
 * Classify sessions by time-of-day and calculate intent multiplier.
 * Late-night browsing correlates differently with purchase intent.
 */
export function classifyTimeSegment(hour: number): TimeSegment {
  if (hour >= 5 && hour < 8) return "early_bird";
  if (hour >= 8 && hour < 17) return "business_hours";
  if (hour >= 17 && hour < 21) return "evening";
  if (hour >= 21 || (hour >= 0 && hour < 1)) return "night_owl";
  return "late_night"; // 1am-5am
}

// Baseline multipliers — derived from automotive industry conversion data
const TIME_SEGMENT_MULTIPLIERS: Record<TimeSegment, number> = {
  early_bird: 1.1,       // Before work = motivated
  business_hours: 1.0,   // Baseline
  evening: 1.2,          // After work = active shopping
  night_owl: 1.4,        // Can't sleep thinking about it = high intent
  late_night: 0.8,       // Likely casual/bored browsing
};

export function analyzeNightOwl(
  events: Array<{ action: string; metadata: Record<string, unknown>; timestamp: string }>,
): NightOwlSignal[] {
  // Group by customer + session
  const sessions = new Map<string, {
    customerId: string; startTime: Date; endTime: Date;
    vehiclesViewed: Set<string>; pageCount: number;
  }>();

  for (const e of events) {
    const customerId = String(e.metadata.customer_id ?? e.metadata.session_id ?? "unknown");
    const sessionId = String(e.metadata.session_id ?? customerId);
    const vin = String(e.metadata.vin ?? "");
    const key = `${customerId}:${sessionId}`;
    const ts = new Date(e.timestamp);

    if (!sessions.has(key)) {
      sessions.set(key, {
        customerId, startTime: ts, endTime: ts,
        vehiclesViewed: new Set(), pageCount: 0,
      });
    }
    const s = sessions.get(key)!;
    if (ts < s.startTime) s.startTime = ts;
    if (ts > s.endTime) s.endTime = ts;
    if (vin) s.vehiclesViewed.add(vin);
    s.pageCount++;
  }

  return [...sessions.values()].map((s) => {
    const hour = s.startTime.getHours();
    const timeSegment = classifyTimeSegment(hour);
    const durationMinutes = Math.max(1, (s.endTime.getTime() - s.startTime.getTime()) / 60000);
    const engagementDepth = Math.round((s.pageCount / durationMinutes) * 100) / 100;

    // Adjust multiplier by engagement depth — high engagement in off-hours = even stronger signal
    let multiplier = TIME_SEGMENT_MULTIPLIERS[timeSegment];
    if (engagementDepth > 2 && (timeSegment === "night_owl" || timeSegment === "evening")) {
      multiplier *= 1.15; // Bonus for deep engagement in high-signal time slots
    }

    return {
      customerId: s.customerId,
      sessionStartHour: hour,
      timeSegment,
      sessionDurationMinutes: Math.round(durationMinutes),
      vehiclesViewed: s.vehiclesViewed.size,
      engagementDepth,
      purchaseIntentMultiplier: Math.round(multiplier * 100) / 100,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Combined analysis + persistence                                    */
/* ------------------------------------------------------------------ */

/**
 * Run all 5 micro-behavioral signal analyses and persist results.
 * Reads from analytics_events, produces scored signals, writes signals
 * back as new analytics events for the learning views to consume.
 */
export async function generateMicroSignals(
  dealerId: string,
  events: Array<{ action: string; metadata: Record<string, unknown>; timestamp: string }>,
): Promise<MicroSignalsSummary> {
  const photoComparisons = analyzePhotoComparison(events);
  const priceSensitivity = analyzePriceSensitivity(events);
  const decisionVelocity = analyzeDecisionVelocity(events);
  const deviceHandoffs = analyzeDeviceHandoff(events);
  const nightOwl = analyzeNightOwl(events);

  // Persist computed signals back into the analytics stream
  for (const pc of photoComparisons) {
    trackPhotoComparison("photo_compare.preference_detected", dealerId, {
      customer_id: pc.customerId,
      preferred_vin: pc.preferredVin,
      strength: pc.preferenceStrength,
      comparisons: pc.comparisonCount,
    });
  }

  for (const ps of priceSensitivity) {
    trackPriceSensitivity("price_sensitivity.budget_fingerprint", dealerId, {
      customer_id: ps.customerId,
      vin: ps.vin,
      ceiling: ps.estimatedCeiling,
      tier: ps.sensitivityTier,
      bounced: ps.bounced,
    });
  }

  for (const dv of decisionVelocity) {
    trackDecisionVelocity("decision_velocity.velocity_classified", dealerId, {
      customer_id: dv.customerId,
      vin: dv.vin,
      classification: dv.classification,
      urgency: dv.urgencyScore,
      hours: dv.velocityHours,
    });
  }

  for (const dh of deviceHandoffs) {
    trackDeviceHandoff("device_handoff.intent_escalation", dealerId, {
      customer_id: dh.customerId,
      direction: dh.handoffDirection,
      shared_vins: dh.sharedVins.length,
      escalation: dh.escalationScore,
      intent: dh.intentEscalation,
    });
  }

  for (const no of nightOwl) {
    trackNightOwl("night_owl.time_segment_classified", dealerId, {
      customer_id: no.customerId,
      segment: no.timeSegment,
      multiplier: no.purchaseIntentMultiplier,
      depth: no.engagementDepth,
    });
  }

  return {
    dealerId,
    generatedAt: new Date().toISOString(),
    photoComparisons,
    priceSensitivity,
    decisionVelocity,
    deviceHandoffs,
    nightOwl,
    totalSignals: photoComparisons.length + priceSensitivity.length +
      decisionVelocity.length + deviceHandoffs.length + nightOwl.length,
  };
}
