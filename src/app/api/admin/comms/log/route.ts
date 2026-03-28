import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MessageLogEntry {
  id: string;
  channel: "email" | "sms";
  recipient: string;
  recipient_name: string;
  subject: string | null;
  body_preview: string;
  template_id: string | null;
  lead_id: string | null;
  status: "sent" | "delivered" | "opened" | "bounced" | "failed";
  sent_by: string;
  sent_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_LOG: MessageLogEntry[] = [
  {
    id: "msg-001",
    channel: "email",
    recipient: "sarah.johnson@email.com",
    recipient_name: "Sarah Johnson",
    subject: "Welcome to Wolfpack Auto, Sarah!",
    body_preview: "Hi Sarah, Thank you for your interest in the 2024 Toyota Camry SE...",
    template_id: "tpl-001",
    lead_id: "lead-042",
    status: "opened",
    sent_by: "Mike Reynolds",
    sent_at: "2026-03-27T14:30:00Z",
  },
  {
    id: "msg-002",
    channel: "sms",
    recipient: "+1 (555) 234-5678",
    recipient_name: "David Park",
    subject: null,
    body_preview: "Hi David, this is Jake from Wolfpack Auto. Just checking in about the Honda CR-V...",
    template_id: "tpl-002",
    lead_id: "lead-039",
    status: "delivered",
    sent_by: "Jake Martinez",
    sent_at: "2026-03-27T11:15:00Z",
  },
  {
    id: "msg-003",
    channel: "email",
    recipient: "michael.chen@company.com",
    recipient_name: "Michael Chen",
    subject: "Congratulations on your new Ford F-150, Michael!",
    body_preview: "Hi Michael, Congratulations on your new Ford F-150 XLT! It was a pleasure working...",
    template_id: "tpl-004",
    lead_id: "lead-031",
    status: "opened",
    sent_by: "Priya Patel",
    sent_at: "2026-03-26T16:00:00Z",
  },
  {
    id: "msg-004",
    channel: "sms",
    recipient: "+1 (555) 876-5432",
    recipient_name: "Jennifer Williams",
    subject: null,
    body_preview: "Hi Jennifer! Just a reminder about your appointment at Wolfpack Auto tomorrow...",
    template_id: "tpl-003",
    lead_id: "lead-044",
    status: "delivered",
    sent_by: "Tom Bradley",
    sent_at: "2026-03-26T09:00:00Z",
  },
  {
    id: "msg-005",
    channel: "email",
    recipient: "robert.garcia@email.com",
    recipient_name: "Robert Garcia",
    subject: "Time for service on your Chevrolet Equinox, Robert",
    body_preview: "Hi Robert, It's been a while since your last visit to Wolfpack Auto...",
    template_id: "tpl-005",
    lead_id: null,
    status: "sent",
    sent_by: "System",
    sent_at: "2026-03-25T08:00:00Z",
  },
  {
    id: "msg-006",
    channel: "sms",
    recipient: "+1 (555) 111-2233",
    recipient_name: "Amanda Torres",
    subject: null,
    body_preview: "Hi Amanda, this is Mike from Wolfpack Auto. We have a special offer on...",
    template_id: null,
    lead_id: "lead-048",
    status: "delivered",
    sent_by: "Mike Reynolds",
    sent_at: "2026-03-25T15:30:00Z",
  },
  {
    id: "msg-007",
    channel: "email",
    recipient: "kevin.smith@work.com",
    recipient_name: "Kevin Smith",
    subject: "Welcome to Wolfpack Auto, Kevin!",
    body_preview: "Hi Kevin, Thank you for your interest in the 2024 Hyundai Tucson...",
    template_id: "tpl-001",
    lead_id: "lead-050",
    status: "bounced",
    sent_by: "Jake Martinez",
    sent_at: "2026-03-24T10:45:00Z",
  },
  {
    id: "msg-008",
    channel: "email",
    recipient: "lisa.brown@email.com",
    recipient_name: "Lisa Brown",
    subject: "Follow-up on your visit — Wolfpack Auto",
    body_preview: "Hi Lisa, It was great meeting you at the dealership yesterday...",
    template_id: null,
    lead_id: "lead-037",
    status: "opened",
    sent_by: "Priya Patel",
    sent_at: "2026-03-24T08:30:00Z",
  },
  {
    id: "msg-009",
    channel: "sms",
    recipient: "+1 (555) 444-9876",
    recipient_name: "Carlos Mendez",
    subject: null,
    body_preview: "Hi Carlos, your trade-in appraisal for the 2021 Nissan Altima is ready...",
    template_id: null,
    lead_id: "lead-033",
    status: "delivered",
    sent_by: "Tom Bradley",
    sent_at: "2026-03-23T14:20:00Z",
  },
  {
    id: "msg-010",
    channel: "email",
    recipient: "emily.nguyen@email.com",
    recipient_name: "Emily Nguyen",
    subject: "Your financing options are ready, Emily",
    body_preview: "Hi Emily, Great news! We've secured several financing options for your...",
    template_id: null,
    lead_id: "lead-045",
    status: "failed",
    sent_by: "Mike Reynolds",
    sent_at: "2026-03-23T11:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/comms/log                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel");
  const status = searchParams.get("status");
  const leadId = searchParams.get("lead_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["m.dealer_id = $1"];
      const params: unknown[] = [DEALER_ID];
      let idx = 2;

      if (channel && ["email", "sms"].includes(channel)) {
        conditions.push(`m.channel = $${idx++}`);
        params.push(channel);
      }
      if (status) {
        conditions.push(`m.status = $${idx++}`);
        params.push(status);
      }
      if (leadId) {
        conditions.push(`m.lead_id = $${idx++}`);
        params.push(leadId);
      }
      if (from) {
        conditions.push(`m.sent_at >= $${idx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`m.sent_at <= $${idx++}`);
        params.push(to);
      }

      const result = await query(
        `SELECT m.id, m.channel, m.recipient, COALESCE(l.name, m.recipient) AS recipient_name,
                m.subject, LEFT(m.body, 100) AS body_preview, m.template_id, m.lead_id,
                m.status, u.name AS sent_by, m.sent_at
         FROM message_log m
         LEFT JOIN leads l ON l.id = m.lead_id
         LEFT JOIN dealer_users u ON u.id = m.sent_by
         WHERE ${conditions.join(" AND ")}
         ORDER BY m.sent_at DESC
         LIMIT 100`,
        params,
      );

      return NextResponse.json({ messages: result.rows });
    } catch (err) {
      console.error("[api/admin/comms/log] DB error, falling back:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_LOG];
  if (channel) filtered = filtered.filter((m) => m.channel === channel);
  if (status) filtered = filtered.filter((m) => m.status === status);
  if (leadId) filtered = filtered.filter((m) => m.lead_id === leadId);
  if (from) filtered = filtered.filter((m) => m.sent_at >= from);
  if (to) filtered = filtered.filter((m) => m.sent_at <= to);

  return NextResponse.json({ messages: filtered });
}
