import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackCallIntelligence } from "@/lib/analytics-hooks";
import {
  analyzeCallTranscript,
  aggregateCallMetrics,
  type CallAnalysis,
} from "@/lib/conversation-intelligence";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_CALLS: CallAnalysis[] = [
  analyzeCallTranscript("call-001", "Thank you for calling Wolfpack Auto. My name is Mike. How can I help you today? I'm interested in the 2025 Toyota RAV4. Can you tell me more about the features? Absolutely, it has great safety features and excellent MPG. Would you like to schedule a test drive this weekend?"),
  analyzeCallTranscript("call-002", "Hi, I'm calling about the Honda Accord you have listed. The price seems too expensive compared to other dealers. I need to think about it. Can you come down on price?"),
  analyzeCallTranscript("call-003", "Good afternoon, welcome to Wolfpack Auto. I saw the truck online and I'm ready to buy. Let's do it. Can we schedule a time to come in and sign me up? I'll take it."),
];

const DEMO_METRICS = aggregateCallMetrics(DEMO_CALLS);

/* -------------------------------------------------------------------------- */
/* GET /api/admin/call-intelligence                                            */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    trackCallIntelligence("call.analyzed", dealerId, {
      call_count: DEMO_CALLS.length,
    });
    return NextResponse.json({
      calls: DEMO_CALLS,
      metrics: DEMO_METRICS,
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<{
      id: string;
      transcript: string;
    }>(
      `SELECT id, transcript FROM call_recordings
       WHERE dealer_id = $1
       ORDER BY recorded_at DESC LIMIT 50`,
      [dealerId],
    );

    const analyses = result.rows.map((r) =>
      analyzeCallTranscript(r.id, r.transcript),
    );
    const metrics = aggregateCallMetrics(analyses);

    trackCallIntelligence("call.analyzed", dealerId, {
      call_count: analyses.length,
    });

    return NextResponse.json({ calls: analyses, metrics });
  } catch (err) {
    console.error("[call-intelligence] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load call intelligence data" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/call-intelligence                                           */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: { transcript?: string; callId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.transcript) {
    return NextResponse.json(
      { error: "transcript is required" },
      { status: 400 },
    );
  }

  const callId = body.callId ?? `call-${Date.now()}`;
  const analysis = analyzeCallTranscript(callId, body.transcript);

  trackCallIntelligence("call.analyzed", dealerId, {
    call_id: callId,
    outcome: analysis.outcome,
    sentiment: analysis.sentiment.label,
    quality_score: analysis.qualityScore.overall,
  });

  trackCallIntelligence("call.outcome_classified", dealerId, {
    call_id: callId,
    outcome: analysis.outcome,
  });

  trackCallIntelligence("call.quality_scored", dealerId, {
    call_id: callId,
    quality_score: analysis.qualityScore.overall,
  });

  return NextResponse.json({ analysis });
}
