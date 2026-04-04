import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackOmnichannel } from "@/lib/analytics-hooks";
import {
  createHandoff,
  getOmnichannelProfile,
  getOmnichannelTimeline,
  recordTouchpoint,
  type TouchpointType,
} from "@/lib/omnichannel";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_PROFILE = {
  customerId: "cust-demo-001",
  dealerId: "demo",
  touchpoints: [
    { id: "tp-1", channel: "online", timestamp: "2026-03-28T10:00:00Z", summary: "Browsed SUV inventory", metadata: { pages: 5 } },
    { id: "tp-2", channel: "online", timestamp: "2026-03-29T14:30:00Z", summary: "Viewed 2025 Toyota RAV4 XLE", metadata: { vin: "JTMAB3FV0ND000001" } },
    { id: "tp-3", channel: "phone", timestamp: "2026-03-30T11:00:00Z", summary: "Called about RAV4 availability", metadata: { duration_minutes: 8 } },
    { id: "tp-4", channel: "email", timestamp: "2026-03-31T09:00:00Z", summary: "Opened financing options email", metadata: { campaign: "spring-sale" } },
    { id: "tp-5", channel: "in_store", timestamp: "2026-04-01T15:00:00Z", summary: "Test drove RAV4 XLE", metadata: { rep: "Mike R." } },
  ],
  channels: ["online", "phone", "email", "in_store"],
  firstContact: "2026-03-28T10:00:00Z",
  lastContact: "2026-04-01T15:00:00Z",
  totalInteractions: 5,
  preferredChannel: "online",
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/omnichannel?customerId=xxx                                   */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;
  const customerId = request.nextUrl.searchParams.get("customerId");

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    trackOmnichannel("omnichannel.timeline_viewed", dealerId, {
      customer_id: customerId ?? "demo",
    });

    if (customerId) {
      return NextResponse.json({
        profile: { ...DEMO_PROFILE, customerId },
      });
    }
    return NextResponse.json({ profile: DEMO_PROFILE });
  }

  try {
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId query parameter is required" },
        { status: 400 },
      );
    }

    const profile = await getOmnichannelProfile(customerId, dealerId);
    trackOmnichannel("omnichannel.timeline_viewed", dealerId, {
      customer_id: customerId,
      touchpoint_count: profile.totalInteractions,
    });

    return NextResponse.json({ profile });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ profile: DEMO_PROFILE });
    }
    console.error("[omnichannel] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load omnichannel profile" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/omnichannel                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: {
    action: "create_handoff" | "record_touchpoint";
    customerId: string;
    fromChannel?: TouchpointType;
    toChannel?: TouchpointType;
    channel?: TouchpointType;
    summary?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    if (body.action === "create_handoff") {
      const handoff = await createHandoff(
        body.customerId,
        body.fromChannel ?? "online",
        body.toChannel ?? "in_store",
        dealerId,
      );
      trackOmnichannel("omnichannel.handoff_created", dealerId, {
        customer_id: body.customerId,
        from_channel: body.fromChannel ?? "online",
        to_channel: body.toChannel ?? "in_store",
      });
      return NextResponse.json({ handoff });
    }

    if (body.action === "record_touchpoint") {
      const tp = await recordTouchpoint(
        body.customerId,
        body.channel ?? "online",
        body.summary ?? "Customer interaction",
      );
      trackOmnichannel("omnichannel.channels_merged", dealerId, {
        customer_id: body.customerId,
        channel: body.channel ?? "online",
        mode: "shadow",
      });
      return NextResponse.json({ touchpoint: tp });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    if (body.action === "create_handoff") {
      const handoff = await createHandoff(
        body.customerId,
        body.fromChannel ?? "online",
        body.toChannel ?? "in_store",
        dealerId,
      );
      trackOmnichannel("omnichannel.handoff_created", dealerId, {
        customer_id: body.customerId,
        from_channel: body.fromChannel ?? "online",
        to_channel: body.toChannel ?? "in_store",
      });
      return NextResponse.json({ handoff });
    }

    if (body.action === "record_touchpoint") {
      const tp = await recordTouchpoint(
        body.customerId,
        body.channel ?? "online",
        body.summary ?? "Customer interaction",
        body.metadata ?? {},
        dealerId,
      );
      trackOmnichannel("omnichannel.channels_merged", dealerId, {
        customer_id: body.customerId,
        channel: body.channel ?? "online",
      });
      return NextResponse.json({ touchpoint: tp });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ profile: DEMO_PROFILE });
    }
    console.error("[omnichannel] POST error:", err);
    return NextResponse.json(
      { error: "Failed to process omnichannel action" },
      { status: 500 },
    );
  }
}
