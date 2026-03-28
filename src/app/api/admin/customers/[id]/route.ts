import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PurchaseRecord {
  id: string;
  date: string;
  vehicle: string;
  vin: string;
  sale_price: number;
  deal_type: string;
  salesperson: string;
}

interface ServiceRecord {
  id: string;
  date: string;
  vin: string;
  vehicle: string;
  description: string;
  cost: number;
  status: "completed" | "scheduled" | "in_progress";
}

interface CommRecord {
  id: string;
  date: string;
  channel: "email" | "sms" | "phone" | "in_person";
  subject: string;
  sent_by: string;
  status: string;
}

interface ActivitySignal {
  type: string;
  label: string;
  value: string | number;
  timestamp: string;
}

interface TimelineEntry {
  id: string;
  date: string;
  type: "lead" | "communication" | "appointment" | "purchase" | "service" | "activity";
  title: string;
  description: string;
}

interface Customer360 {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "active" | "prospect" | "inactive";
  customer_since: string;
  lead_score: number;
  lifetime_value: number;
  vehicles_purchased: number;
  last_visit: string;
  purchases: PurchaseRecord[];
  service_history: ServiceRecord[];
  communications: CommRecord[];
  activity: ActivitySignal[];
  timeline: TimelineEntry[];
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_CUSTOMER: Customer360 = {
  id: "cust-042",
  name: "Sarah Johnson",
  email: "sarah.johnson@email.com",
  phone: "(555) 234-5678",
  status: "active",
  customer_since: "2024-06-15",
  lead_score: 92,
  lifetime_value: 58225,
  vehicles_purchased: 2,
  last_visit: "2026-03-27",
  purchases: [
    {
      id: "sale-001",
      date: "2026-03-27",
      vehicle: "2024 Toyota Camry SE",
      vin: "4T1BF1FK5EU123456",
      sale_price: 29450,
      deal_type: "retail",
      salesperson: "Jake Martinez",
    },
    {
      id: "sale-prev-001",
      date: "2024-06-15",
      vehicle: "2019 Honda Civic LX",
      vin: "2HGFC2F59KH901234",
      sale_price: 22800,
      deal_type: "retail",
      salesperson: "Tom Bradley",
    },
  ],
  service_history: [
    {
      id: "svc-001",
      date: "2026-01-10",
      vin: "2HGFC2F59KH901234",
      vehicle: "2019 Honda Civic LX",
      description: "Oil change, tire rotation, multi-point inspection",
      cost: 89.99,
      status: "completed",
    },
    {
      id: "svc-002",
      date: "2025-08-22",
      vin: "2HGFC2F59KH901234",
      vehicle: "2019 Honda Civic LX",
      description: "30,000 mile service — transmission fluid, brake inspection, cabin filter",
      cost: 329.00,
      status: "completed",
    },
    {
      id: "svc-003",
      date: "2025-03-14",
      vin: "2HGFC2F59KH901234",
      vehicle: "2019 Honda Civic LX",
      description: "Oil change, tire rotation",
      cost: 79.99,
      status: "completed",
    },
    {
      id: "svc-004",
      date: "2026-06-15",
      vin: "4T1BF1FK5EU123456",
      vehicle: "2024 Toyota Camry SE",
      description: "5,000 mile complimentary service — oil change, inspection",
      cost: 0,
      status: "scheduled",
    },
  ],
  communications: [
    {
      id: "msg-001",
      date: "2026-03-27T14:30:00Z",
      channel: "email",
      subject: "Welcome to Wolfpack Auto, Sarah!",
      sent_by: "Jake Martinez",
      status: "opened",
    },
    {
      id: "msg-phone-001",
      date: "2026-03-26T11:00:00Z",
      channel: "phone",
      subject: "Discussed Camry pricing and financing options",
      sent_by: "Jake Martinez",
      status: "completed",
    },
    {
      id: "msg-sms-001",
      date: "2026-03-25T09:15:00Z",
      channel: "sms",
      subject: "Appointment confirmation for test drive",
      sent_by: "Jake Martinez",
      status: "delivered",
    },
    {
      id: "msg-email-prev",
      date: "2026-03-22T10:00:00Z",
      channel: "email",
      subject: "New 2024 Toyota Camry — special pricing for returning customers",
      sent_by: "System",
      status: "opened",
    },
  ],
  activity: [
    { type: "page_views", label: "Page Views (30d)", value: 47, timestamp: "2026-03-27T14:00:00Z" },
    { type: "vdp_views", label: "Vehicle Detail Pages", value: 12, timestamp: "2026-03-27T14:00:00Z" },
    { type: "time_on_site", label: "Avg Time on Site", value: "8m 42s", timestamp: "2026-03-27T14:00:00Z" },
    { type: "return_visits", label: "Return Visits (30d)", value: 8, timestamp: "2026-03-27T14:00:00Z" },
    { type: "last_search", label: "Last Search", value: "Toyota Camry 2024", timestamp: "2026-03-25T10:30:00Z" },
    { type: "trade_in_tool", label: "Trade-In Tool Used", value: "Yes — Honda Civic LX", timestamp: "2026-03-24T16:00:00Z" },
    { type: "financing_calc", label: "Finance Calculator", value: "3 sessions, $400-500/mo range", timestamp: "2026-03-24T16:15:00Z" },
  ],
  timeline: [
    { id: "tl-001", date: "2026-03-27T15:00:00Z", type: "purchase", title: "Purchased 2024 Toyota Camry SE", description: "Sale price $29,450. Trade-in: 2019 Honda Civic LX ($12,500)." },
    { id: "tl-002", date: "2026-03-27T14:30:00Z", type: "communication", title: "Welcome email sent", description: "Automated welcome email opened by customer." },
    { id: "tl-003", date: "2026-03-26T14:00:00Z", type: "appointment", title: "Test drive — Toyota Camry", description: "In-store test drive. Customer very interested, asked about financing." },
    { id: "tl-004", date: "2026-03-26T11:00:00Z", type: "communication", title: "Phone call with Jake", description: "Discussed pricing and financing options for the Camry." },
    { id: "tl-005", date: "2026-03-25T09:15:00Z", type: "communication", title: "SMS — Appointment confirmation", description: "Confirmed test drive for March 26." },
    { id: "tl-006", date: "2026-03-24T16:00:00Z", type: "activity", title: "Used trade-in estimator", description: "Submitted trade appraisal for 2019 Honda Civic LX online." },
    { id: "tl-007", date: "2026-03-22T10:00:00Z", type: "communication", title: "Promotional email opened", description: "Returning customer campaign — special pricing on 2024 Camry." },
    { id: "tl-008", date: "2026-03-20T12:00:00Z", type: "lead", title: "Lead created", description: "Submitted online inquiry about 2024 Toyota Camry SE." },
    { id: "tl-009", date: "2026-01-10T09:00:00Z", type: "service", title: "Service visit — Honda Civic", description: "Oil change, tire rotation, multi-point inspection. $89.99." },
    { id: "tl-010", date: "2024-06-15T14:00:00Z", type: "purchase", title: "Purchased 2019 Honda Civic LX", description: "First purchase at Wolfpack Auto. Sale price $22,800." },
  ],
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/customers/[id]                                               */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Customer base info
      const custResult = await query(
        `SELECT c.*, COALESCE(SUM(s.sale_price), 0) AS lifetime_value, COUNT(s.id) AS vehicles_purchased
         FROM customers c
         LEFT JOIN sales_log s ON s.customer_email = c.email AND s.dealer_id = c.dealer_id
         WHERE c.id = $1 AND c.dealer_id = $2
         GROUP BY c.id`,
        [id, DEALER_ID],
      );

      if ((custResult.rows as unknown[]).length === 0) {
        // Fall through to shadow data
        throw new Error("not found in db");
      }

      const cust = (custResult.rows as Record<string, unknown>[])[0];

      // Purchases
      const purchases = await query(
        `SELECT id, date, vehicle, vin, sale_price, deal_type, salesperson
         FROM sales_log WHERE customer_email = $1 AND dealer_id = $2 ORDER BY date DESC`,
        [cust.email, DEALER_ID],
      );

      // Service history
      const services = await query(
        `SELECT id, date, vin, vehicle, description, cost, status
         FROM service_records WHERE customer_id = $1 AND dealer_id = $2 ORDER BY date DESC`,
        [id, DEALER_ID],
      );

      // Communications
      const comms = await query(
        `SELECT m.id, m.sent_at AS date, m.channel, m.subject, u.name AS sent_by, m.status
         FROM message_log m
         LEFT JOIN dealer_users u ON u.id = m.sent_by
         WHERE m.lead_id IN (SELECT id FROM leads WHERE email = $1) AND m.dealer_id = $2
         ORDER BY m.sent_at DESC LIMIT 20`,
        [cust.email, DEALER_ID],
      );

      return NextResponse.json({
        customer: {
          ...cust,
          purchases: purchases.rows,
          service_history: services.rows,
          communications: comms.rows,
          activity: [],
          timeline: [],
        },
      });
    } catch (err) {
      console.error("[api/admin/customers/[id]] DB error:", err);
    }
  }

  // Shadow mode — return mock customer (always returns data for any ID)
  return NextResponse.json({ customer: { ...MOCK_CUSTOMER, id } });
}
