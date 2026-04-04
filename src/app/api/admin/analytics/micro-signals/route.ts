import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";
import {
  generateMicroSignals,
  type MicroSignalsSummary,
} from "@/lib/micro-behavioral-signals";

/* -------------------------------------------------------------------------- */
/*  Demo data (shadow mode)                                                    */
/* -------------------------------------------------------------------------- */

function getDemoSignals(dealerId: string): MicroSignalsSummary {
  return {
    dealerId,
    generatedAt: new Date().toISOString(),
    photoComparisons: [
      { customerId: "cust-001", vinA: "VIN-A", vinB: "VIN-B", dwellA_ms: 4200, dwellB_ms: 1800, preferredVin: "VIN-A", preferenceStrength: 0.7, comparisonCount: 3 },
    ],
    priceSensitivity: [
      { customerId: "cust-002", vin: "VIN-C", stickerPrice: 42000, calculatorOpened: true, termsExplored: [60, 72], downPaymentsExplored: [5000], estimatedCeiling: 514, sensitivityTier: "medium", bounced: false },
    ],
    decisionVelocity: [
      { customerId: "cust-003", vin: "VIN-D", firstViewAt: "2026-04-01T10:00:00Z", leadSubmittedAt: "2026-04-01T10:45:00Z", returnVisits: 0, uniqueVdpsViewed: 2, velocityHours: 0.75, classification: "impulse", urgencyScore: 95 },
    ],
    deviceHandoffs: [
      { customerId: "cust-004", mobileSessionId: "mob-001", desktopSessionId: "desk-001", sharedVins: ["VIN-E"], handoffDirection: "mobile_to_desktop", timeBetweenMs: 3600000, intentEscalation: true, escalationScore: 75 },
    ],
    nightOwl: [
      { customerId: "cust-005", sessionStartHour: 22, timeSegment: "night_owl", sessionDurationMinutes: 25, vehiclesViewed: 4, engagementDepth: 2.4, purchaseIntentMultiplier: 1.61 },
    ],
    totalSignals: 5,
  };
}

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/analytics/micro-signals                                     */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    const demo = getDemoSignals(dealerId);
    trackSystem("system.analytics_queried", dealerId, { module: "micro_signals", mode: "shadow", total: demo.totalSignals });
    return NextResponse.json(demo);
  }

  // Live mode — fetch recent events and compute signals
  try {
    const { query } = await import("@/lib/db");

    const result = await query(
      `SELECT action, metadata, timestamp
       FROM analytics_events
       WHERE page = $1
         AND timestamp > NOW() - INTERVAL '30 days'
         AND (
           action LIKE 'photo.%' OR action LIKE 'photo_compare.%'
           OR action LIKE 'price_sensitivity.%' OR action LIKE 'pricing.%' OR action LIKE 'retail.%'
           OR action LIKE 'decision_velocity.%' OR action LIKE 'journey.%' OR action LIKE 'lead.%'
           OR action LIKE 'device_handoff.%'
           OR action LIKE 'night_owl.%'
           OR action LIKE 'exit.%'
         )
       ORDER BY timestamp ASC
       LIMIT 10000`,
      [dealerId],
    );

    const events = result.rows.map((row: Record<string, unknown>) => ({
      action: row.action as string,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata as string) : (row.metadata as Record<string, unknown>),
      timestamp: typeof row.timestamp === "string" ? row.timestamp : (row.timestamp as Date).toISOString(),
    }));

    const signals = await generateMicroSignals(dealerId, events);

    trackSystem("system.analytics_queried", dealerId, {
      module: "micro_signals",
      total: signals.totalSignals,
      photo_comparisons: signals.photoComparisons.length,
      price_signals: signals.priceSensitivity.length,
      velocity_signals: signals.decisionVelocity.length,
      handoffs: signals.deviceHandoffs.length,
      night_owl_sessions: signals.nightOwl.length,
    });

    return NextResponse.json(signals);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      const demo = getDemoSignals(dealerId);
      trackSystem("system.analytics_queried", dealerId, { module: "micro_signals", mode: "fallback", total: demo.totalSignals });
      return NextResponse.json(demo);
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
