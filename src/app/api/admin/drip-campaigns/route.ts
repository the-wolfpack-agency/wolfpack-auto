import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackDripCampaign } from "@/lib/analytics-hooks";
import {
  createCampaign,
  listCampaigns,
  advanceEnrollments,
  type DripTrigger,
  type DripStep,
} from "@/lib/drip-campaigns";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_CAMPAIGNS = [
  {
    id: "camp-demo-001",
    dealerId: "demo",
    name: "New Lead Welcome Series",
    trigger: "lead_created" as const,
    steps: [
      { stepNumber: 1, subject: "Welcome to {{dealer}}!", bodyTemplate: "Thanks for your interest...", delayHours: 1 },
      { stepNumber: 2, subject: "Top picks for you", bodyTemplate: "Based on your browsing...", delayHours: 48 },
      { stepNumber: 3, subject: "Special financing available", bodyTemplate: "For a limited time...", delayHours: 120 },
    ],
    active: true,
    createdAt: "2026-03-01T10:00:00Z",
    stats: { totalEnrolled: 145, totalConverted: 23, totalUnsubscribed: 8, emailsSent: 312, conversionRate: 16 },
  },
  {
    id: "camp-demo-002",
    dealerId: "demo",
    name: "Price Drop Alert",
    trigger: "price_drop_on_viewed_vehicle" as const,
    steps: [
      { stepNumber: 1, subject: "Price dropped on a vehicle you viewed!", bodyTemplate: "Great news! The {{vehicle}} you looked at...", delayHours: 0 },
      { stepNumber: 2, subject: "Still interested? This deal won't last", bodyTemplate: "The price on {{vehicle}} is still reduced...", delayHours: 72 },
    ],
    active: true,
    createdAt: "2026-03-10T10:00:00Z",
    stats: { totalEnrolled: 67, totalConverted: 12, totalUnsubscribed: 3, emailsSent: 98, conversionRate: 18 },
  },
  {
    id: "camp-demo-003",
    dealerId: "demo",
    name: "Re-engagement (7 Day Inactive)",
    trigger: "no_activity_7d" as const,
    steps: [
      { stepNumber: 1, subject: "We miss you!", bodyTemplate: "It's been a while since...", delayHours: 0 },
      { stepNumber: 2, subject: "New arrivals you might like", bodyTemplate: "Check out what's new...", delayHours: 168 },
    ],
    active: false,
    createdAt: "2026-02-15T10:00:00Z",
    stats: { totalEnrolled: 234, totalConverted: 18, totalUnsubscribed: 45, emailsSent: 380, conversionRate: 8 },
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/drip-campaigns                                               */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      campaigns: DEMO_CAMPAIGNS,
      totalEnrolled: DEMO_CAMPAIGNS.reduce((s, c) => s + c.stats.totalEnrolled, 0),
      totalConverted: DEMO_CAMPAIGNS.reduce((s, c) => s + c.stats.totalConverted, 0),
      overallConversionRate: 13,
    });
  }

  try {
    const campaignList = listCampaigns(dealerId);
    const totalEnrolled = campaignList.reduce((s, c) => s + c.stats.totalEnrolled, 0);
    const totalConverted = campaignList.reduce((s, c) => s + c.stats.totalConverted, 0);

    return NextResponse.json({
      campaigns: campaignList,
      totalEnrolled,
      totalConverted,
      overallConversionRate: totalEnrolled > 0 ? Math.round((totalConverted / totalEnrolled) * 100) : 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({
        campaigns: DEMO_CAMPAIGNS,
        totalEnrolled: 0,
        totalConverted: 0,
        overallConversionRate: 0,
      });
    }
    console.error("[drip-campaigns] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load drip campaigns" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/drip-campaigns                                              */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: {
    action?: "create" | "advance";
    name?: string;
    trigger?: DripTrigger;
    steps?: DripStep[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "advance") {
      const emails = advanceEnrollments();
      for (const email of emails) {
        trackDripCampaign("drip.email_sent", dealerId, {
          campaign_id: email.campaignId,
          lead_id: email.leadId,
          step: email.stepNumber,
        });
      }
      return NextResponse.json({ emailsSent: emails.length, emails });
    }

    // Default: create
    if (!body.name || !body.trigger || !body.steps?.length) {
      return NextResponse.json(
        { error: "name, trigger, and steps are required" },
        { status: 400 },
      );
    }

    const campaign = createCampaign({
      dealerId,
      name: body.name,
      trigger: body.trigger,
      steps: body.steps,
    });

    trackDripCampaign("drip.campaign_created", dealerId, {
      campaign_id: campaign.id,
      trigger: campaign.trigger,
      step_count: campaign.steps.length,
    });

    return NextResponse.json({ campaign });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ emailsSent: 0, emails: [] });
    }
    console.error("[drip-campaigns] POST error:", err);
    return NextResponse.json(
      { error: "Failed to process drip campaign action" },
      { status: 500 },
    );
  }
}
