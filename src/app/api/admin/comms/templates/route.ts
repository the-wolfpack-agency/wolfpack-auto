import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackComms } from "@/lib/analytics-hooks";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MessageTemplate {
  id: string;
  name: string;
  channel: "email" | "sms";
  category: string;
  subject: string | null;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_TEMPLATES: MessageTemplate[] = [
  {
    id: "tpl-001",
    name: "Welcome — New Lead",
    channel: "email",
    category: "welcome",
    subject: "Welcome to {dealer_name}, {first_name}!",
    body: "Hi {first_name},\n\nThank you for your interest in {vehicle_interest}. My name is {salesperson} and I'll be your dedicated consultant at {dealer_name}.\n\nI'd love to help you find the perfect vehicle. When is a good time for a quick call or a visit?\n\nBest regards,\n{salesperson}",
    variables: ["{first_name}", "{vehicle_interest}", "{dealer_name}", "{salesperson}"],
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-15T10:00:00Z",
  },
  {
    id: "tpl-002",
    name: "Follow-Up — 48 Hour Check-In",
    channel: "sms",
    category: "follow_up",
    subject: null,
    body: "Hi {first_name}, this is {salesperson} from {dealer_name}. Just checking in about the {vehicle_interest} you were looking at. Still interested? I can set up a test drive anytime this week!",
    variables: ["{first_name}", "{vehicle_interest}", "{dealer_name}", "{salesperson}"],
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-10T14:00:00Z",
  },
  {
    id: "tpl-003",
    name: "Appointment Reminder",
    channel: "sms",
    category: "appointment",
    subject: null,
    body: "Hi {first_name}! Just a reminder about your appointment at {dealer_name} tomorrow. We have the {vehicle_interest} cleaned up and ready for your test drive. See you soon! - {salesperson}",
    variables: ["{first_name}", "{vehicle_interest}", "{dealer_name}", "{salesperson}"],
    created_at: "2026-03-05T08:00:00Z",
    updated_at: "2026-03-05T08:00:00Z",
  },
  {
    id: "tpl-004",
    name: "Post-Sale Thank You",
    channel: "email",
    category: "post_sale",
    subject: "Congratulations on your new {vehicle_interest}, {first_name}!",
    body: "Hi {first_name},\n\nCongratulations on your new {vehicle_interest}! It was a pleasure working with you.\n\nA few things to keep in mind:\n- Your first service appointment should be at 5,000 miles\n- Our service department is open Mon-Sat, 7 AM to 6 PM\n- Don't hesitate to reach out if you have any questions\n\nIf you had a great experience, we'd really appreciate a Google review. It helps other customers find us!\n\nEnjoy the ride,\n{salesperson}\n{dealer_name}",
    variables: ["{first_name}", "{vehicle_interest}", "{dealer_name}", "{salesperson}"],
    created_at: "2026-03-02T09:00:00Z",
    updated_at: "2026-03-18T12:00:00Z",
  },
  {
    id: "tpl-005",
    name: "Service Reminder",
    channel: "email",
    category: "service",
    subject: "Time for service on your {vehicle_interest}, {first_name}",
    body: "Hi {first_name},\n\nIt's been a while since your last visit to {dealer_name}. Based on your mileage and service history, your {vehicle_interest} may be due for routine maintenance.\n\nWe're currently offering 15% off all scheduled services this month. Book online or call us to schedule.\n\nSee you soon!\n{dealer_name} Service Team",
    variables: ["{first_name}", "{vehicle_interest}", "{dealer_name}"],
    created_at: "2026-03-08T11:00:00Z",
    updated_at: "2026-03-20T09:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/comms/templates                                              */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel");
  const category = searchParams.get("category");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (channel && ["email", "sms"].includes(channel)) {
        conditions.push(`channel = $${idx++}`);
        params.push(channel);
      }
      if (category) {
        conditions.push(`category = $${idx++}`);
        params.push(category);
      }
      const result = await query( /* audit-safe: A4 reason="dealer_id always pushed as first condition above" */
        `SELECT id, name, channel, category, subject, body, variables, created_at, updated_at
         FROM message_templates
         WHERE ${conditions.join(" AND ")}
         ORDER BY updated_at DESC
         LIMIT 100`,
        params,
      );

      return NextResponse.json({ templates: result.rows });
    } catch (err) {
      console.error("[api/admin/comms/templates] DB error, falling back:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_TEMPLATES];
  if (channel) {
    filtered = filtered.filter((t) => t.channel === channel);
  }
  if (category) {
    filtered = filtered.filter((t) => t.category === category);
  }

  return NextResponse.json({ templates: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/comms/templates                                             */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: {
    name: string;
    channel: "email" | "sms";
    category: string;
    subject?: string;
    body: string;
    variables?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.channel || !body.body) {
    return NextResponse.json(
      { error: "name, channel, and body are required" },
      { status: 400 },
    );
  }

  if (!["email", "sms"].includes(body.channel)) {
    return NextResponse.json({ error: "channel must be email or sms" }, { status: 400 });
  }

  const newId = `tpl-${Date.now()}`;
  const now = new Date().toISOString();
  const variables = body.variables ?? [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO message_templates (id, dealer_id, name, channel, category, subject, body, variables, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
        [newId, dealerId, body.name, body.channel, body.category ?? "general", body.subject ?? null, body.body, variables, now],
      );
      try { trackComms("comms.template_created", dealerId, { channel: body.channel, category: body.category ?? "general" }); } catch {}

      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/comms/templates] POST DB error:", err);
    }
  }

  try { trackComms("comms.template_created", dealerId, { channel: body.channel, category: body.category ?? "general" }); } catch {}

  // Shadow mode
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
