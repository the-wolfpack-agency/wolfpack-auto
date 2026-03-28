import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackComms } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SequenceStep {
  order: number;
  delay_hours: number;
  channel: "email" | "sms";
  template_id: string;
  template_name: string;
}

interface FollowUpSequence {
  id: string;
  name: string;
  trigger: string;
  steps: SequenceStep[];
  active: boolean;
  enrolled_count: number;
  completed_count: number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_SEQUENCES: FollowUpSequence[] = [
  {
    id: "seq-001",
    name: "New Lead — 5-Touch Sequence",
    trigger: "lead_created",
    steps: [
      { order: 1, delay_hours: 0, channel: "email", template_id: "tpl-001", template_name: "Welcome — New Lead" },
      { order: 2, delay_hours: 4, channel: "sms", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
      { order: 3, delay_hours: 48, channel: "email", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
      { order: 4, delay_hours: 120, channel: "sms", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
      { order: 5, delay_hours: 336, channel: "email", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
    ],
    active: true,
    enrolled_count: 134,
    completed_count: 89,
    created_at: "2026-02-15T09:00:00Z",
  },
  {
    id: "seq-002",
    name: "Post-Appointment Follow-Up",
    trigger: "appointment_completed",
    steps: [
      { order: 1, delay_hours: 2, channel: "sms", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
      { order: 2, delay_hours: 72, channel: "email", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
    ],
    active: true,
    enrolled_count: 67,
    completed_count: 52,
    created_at: "2026-02-20T10:00:00Z",
  },
  {
    id: "seq-003",
    name: "Post-Sale Nurture",
    trigger: "deal_closed",
    steps: [
      { order: 1, delay_hours: 1, channel: "email", template_id: "tpl-004", template_name: "Post-Sale Thank You" },
      { order: 2, delay_hours: 168, channel: "sms", template_id: "tpl-002", template_name: "Follow-Up — 48 Hour Check-In" },
      { order: 3, delay_hours: 2160, channel: "email", template_id: "tpl-005", template_name: "Service Reminder" },
    ],
    active: true,
    enrolled_count: 41,
    completed_count: 12,
    created_at: "2026-03-01T09:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/comms/sequences                                              */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT s.id, s.name, s.trigger, s.active, s.created_at, s.enrolled_count, s.completed_count,
                json_agg(json_build_object(
                  'order', st.step_order,
                  'delay_hours', st.delay_hours,
                  'channel', st.channel,
                  'template_id', st.template_id,
                  'template_name', t.name
                ) ORDER BY st.step_order) AS steps
         FROM follow_up_sequences s
         LEFT JOIN sequence_steps st ON st.sequence_id = s.id
         LEFT JOIN message_templates t ON t.id = st.template_id
         WHERE s.dealer_id = $1
         GROUP BY s.id
         ORDER BY s.created_at DESC`,
        [dealerId],
      );
      return NextResponse.json({ sequences: result.rows });
    } catch (err) {
      console.error("[api/admin/comms/sequences] DB error, falling back:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ sequences: MOCK_SEQUENCES });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/comms/sequences                                             */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: {
    name: string;
    trigger: string;
    steps: { delay_hours: number; channel: "email" | "sms"; template_id: string }[];
    active?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.trigger || !body.steps?.length) {
    return NextResponse.json(
      { error: "name, trigger, and at least one step are required" },
      { status: 400 },
    );
  }

  const newId = `seq-${Date.now()}`;
  const now = new Date().toISOString();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO follow_up_sequences (id, dealer_id, name, trigger, active, created_at, enrolled_count, completed_count)
         VALUES ($1,$2,$3,$4,$5,$6,0,0)`,
        [newId, dealerId, body.name, body.trigger, body.active !== false, now],
      );

      for (let i = 0; i < body.steps.length; i++) {
        const step = body.steps[i];
        await query(
          `INSERT INTO sequence_steps (id, sequence_id, step_order, delay_hours, channel, template_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [`step-${Date.now()}-${i}`, newId, i + 1, step.delay_hours, step.channel, step.template_id],
        );
      }

      try { trackComms("comms.sequence_created", authResult?.user?.dealer_id ?? "system", { action: "sequence_created", trigger: body.trigger }); } catch {}
      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/comms/sequences] POST DB error:", err);
    }
  }

  // Shadow mode
  try { trackComms("comms.sequence_created", authResult?.user?.dealer_id ?? "system", { action: "sequence_created", trigger: body.trigger }); } catch {}
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
