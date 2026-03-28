import { NextRequest, NextResponse } from "next/server";
import type { Lead, LeadStatus, LeadTemperature } from "@/types/lead";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

const TEAM_MEMBERS = [
  "Mike Reynolds",
  "Sarah Chen",
  "James Kowalski",
  "Priya Patel",
  "Tom Bradley",
];

/* -------------------------------------------------------------------------- */
/* Sample data (used when DATABASE_URL is not set)                            */
/* -------------------------------------------------------------------------- */

const SAMPLE_LEADS: Lead[] = [
  {
    id: "lead-001",
    dealer_id: DEALER_ID,
    first_name: "Marcus",
    last_name: "Johnson",
    email: "marcus.johnson@email.com",
    phone: "+15551234567",
    vehicle_id: null,
    vehicle_interest: "2024 Toyota Camry SE",
    source: "website_form",
    status: "new",
    temperature: "hot",
    notes: "",
    structured_notes: [
      { id: "n1", text: "Came in through homepage banner ad.", author: "System", created_at: "2026-03-24T10:00:00Z" },
    ],
    assigned_to: null,
    message: "I'm interested in the Camry SE you have listed. Can I schedule a test drive this weekend?",
    follow_up_date: "2026-03-27T14:00:00Z",
    activity: [
      { id: "a1", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-24T10:00:00Z" },
    ],
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "spring-sale",
    referrer_url: "https://www.google.com",
    created_at: "2026-03-24T10:00:00Z",
    updated_at: "2026-03-24T10:00:00Z",
  },
  {
    id: "lead-002",
    dealer_id: DEALER_ID,
    first_name: "Emily",
    last_name: "Nakamura",
    email: "emily.n@outlook.com",
    phone: "+15559876543",
    vehicle_id: null,
    vehicle_interest: "2025 Honda CR-V Hybrid",
    source: "vdp_inquiry",
    status: "contacted",
    temperature: "warm",
    notes: "",
    structured_notes: [
      { id: "n2", text: "Called back, interested but comparing prices.", author: "Sarah Chen", created_at: "2026-03-23T14:30:00Z" },
      { id: "n3", text: "Sent comparison sheet via email.", author: "Sarah Chen", created_at: "2026-03-23T16:00:00Z" },
    ],
    assigned_to: "Sarah Chen",
    message: "What is your best price on the CR-V Hybrid? I have a trade-in.",
    follow_up_date: "2026-03-26T10:00:00Z",
    activity: [
      { id: "a2", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-22T09:00:00Z" },
      { id: "a3", type: "assignment", description: "Assigned to Sarah Chen", author: "Mike Reynolds", created_at: "2026-03-22T09:15:00Z" },
      { id: "a4", type: "status_change", description: "Status changed from New to Contacted", author: "Sarah Chen", created_at: "2026-03-23T14:30:00Z" },
    ],
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_url: "https://www.autotrader.com",
    created_at: "2026-03-22T09:00:00Z",
    updated_at: "2026-03-23T16:00:00Z",
  },
  {
    id: "lead-003",
    dealer_id: DEALER_ID,
    first_name: "Robert",
    last_name: "Garcia",
    email: "rgarcia@gmail.com",
    phone: "+15554567890",
    vehicle_id: null,
    vehicle_interest: "2024 Ford F-150 XLT",
    source: "chat",
    status: "qualified",
    temperature: "hot",
    notes: "",
    structured_notes: [
      { id: "n4", text: "Has pre-approval from credit union. Ready to buy this week.", author: "James Kowalski", created_at: "2026-03-21T11:00:00Z" },
    ],
    assigned_to: "James Kowalski",
    message: "I need a truck for work. Already approved for financing. When can I come in?",
    follow_up_date: "2026-03-26T09:00:00Z",
    activity: [
      { id: "a5", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-20T15:00:00Z" },
      { id: "a6", type: "assignment", description: "Assigned to James Kowalski", author: "Mike Reynolds", created_at: "2026-03-20T15:10:00Z" },
      { id: "a7", type: "status_change", description: "Status changed from New to Contacted", author: "James Kowalski", created_at: "2026-03-20T16:00:00Z" },
      { id: "a8", type: "status_change", description: "Status changed from Contacted to Qualified", author: "James Kowalski", created_at: "2026-03-21T11:00:00Z" },
    ],
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_url: null,
    created_at: "2026-03-20T15:00:00Z",
    updated_at: "2026-03-21T11:00:00Z",
  },
  {
    id: "lead-004",
    dealer_id: DEALER_ID,
    first_name: "Aisha",
    last_name: "Williams",
    email: "aisha.w@yahoo.com",
    phone: null,
    vehicle_id: null,
    vehicle_interest: "2025 Hyundai Tucson",
    source: "third_party",
    status: "appointment_set",
    temperature: "warm",
    notes: "",
    structured_notes: [
      { id: "n5", text: "Appointment scheduled for Saturday 10 AM.", author: "Priya Patel", created_at: "2026-03-22T13:00:00Z" },
    ],
    assigned_to: "Priya Patel",
    message: "Saw this on Cars.com. Is it still available?",
    follow_up_date: "2026-03-29T10:00:00Z",
    activity: [
      { id: "a9", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-19T08:00:00Z" },
      { id: "a10", type: "status_change", description: "Status changed to Appointment Set", author: "Priya Patel", created_at: "2026-03-22T13:00:00Z" },
    ],
    utm_source: "cars_com",
    utm_medium: "listing",
    utm_campaign: null,
    referrer_url: "https://www.cars.com",
    created_at: "2026-03-19T08:00:00Z",
    updated_at: "2026-03-22T13:00:00Z",
  },
  {
    id: "lead-005",
    dealer_id: DEALER_ID,
    first_name: "David",
    last_name: "Kim",
    email: "david.k@email.com",
    phone: "+15553456789",
    vehicle_id: null,
    vehicle_interest: "2023 BMW 3 Series",
    source: "walk_in",
    status: "sold",
    temperature: "hot",
    notes: "",
    structured_notes: [
      { id: "n6", text: "Deal closed at $38,500. Customer very happy.", author: "Tom Bradley", created_at: "2026-03-18T17:00:00Z" },
    ],
    assigned_to: "Tom Bradley",
    message: "",
    follow_up_date: null,
    activity: [
      { id: "a11", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-15T10:00:00Z" },
      { id: "a12", type: "status_change", description: "Status changed to Sold", author: "Tom Bradley", created_at: "2026-03-18T17:00:00Z" },
    ],
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_url: null,
    created_at: "2026-03-15T10:00:00Z",
    updated_at: "2026-03-18T17:00:00Z",
  },
  {
    id: "lead-006",
    dealer_id: DEALER_ID,
    first_name: "Jessica",
    last_name: "Martinez",
    email: "jmartinez@protonmail.com",
    phone: "+15552345678",
    vehicle_id: null,
    vehicle_interest: "2024 Chevrolet Equinox",
    source: "website_form",
    status: "lost",
    temperature: "cold",
    notes: "",
    structured_notes: [
      { id: "n7", text: "Bought from competitor. Price was $2K lower.", author: "Sarah Chen", created_at: "2026-03-17T10:00:00Z" },
    ],
    assigned_to: "Sarah Chen",
    message: "Looking for an Equinox under $30K.",
    follow_up_date: null,
    activity: [
      { id: "a13", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-10T14:00:00Z" },
      { id: "a14", type: "status_change", description: "Status changed to Lost", author: "Sarah Chen", created_at: "2026-03-17T10:00:00Z" },
    ],
    utm_source: "google",
    utm_medium: "organic",
    utm_campaign: null,
    referrer_url: "https://www.google.com",
    created_at: "2026-03-10T14:00:00Z",
    updated_at: "2026-03-17T10:00:00Z",
  },
  {
    id: "lead-007",
    dealer_id: DEALER_ID,
    first_name: "Tyler",
    last_name: "Brooks",
    email: "tbrooks@icloud.com",
    phone: "+15558765432",
    vehicle_id: null,
    vehicle_interest: "2025 Subaru Outback",
    source: "phone",
    status: "new",
    temperature: "cool",
    notes: "",
    structured_notes: [],
    assigned_to: null,
    message: "Called asking about the Outback. Wants AWD for winter driving.",
    follow_up_date: null,
    activity: [
      { id: "a15", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-25T11:30:00Z" },
    ],
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_url: null,
    created_at: "2026-03-25T11:30:00Z",
    updated_at: "2026-03-25T11:30:00Z",
  },
  {
    id: "lead-008",
    dealer_id: DEALER_ID,
    first_name: "Lauren",
    last_name: "Okafor",
    email: "lauren.okafor@gmail.com",
    phone: "+15551112233",
    vehicle_id: null,
    vehicle_interest: "2024 Tesla Model 3",
    source: "website_form",
    status: "contacted",
    temperature: "warm",
    notes: "",
    structured_notes: [
      { id: "n8", text: "Interested in EV tax credits. Sent info packet.", author: "Mike Reynolds", created_at: "2026-03-24T09:00:00Z" },
    ],
    assigned_to: "Mike Reynolds",
    message: "Do you have any Model 3s in stock? What about the tax credit?",
    follow_up_date: "2026-03-28T14:00:00Z",
    activity: [
      { id: "a16", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-23T16:00:00Z" },
      { id: "a17", type: "assignment", description: "Assigned to Mike Reynolds", author: "System", created_at: "2026-03-23T16:05:00Z" },
      { id: "a18", type: "status_change", description: "Status changed from New to Contacted", author: "Mike Reynolds", created_at: "2026-03-24T09:00:00Z" },
    ],
    utm_source: "facebook",
    utm_medium: "social",
    utm_campaign: "ev-promo",
    referrer_url: "https://www.facebook.com",
    created_at: "2026-03-23T16:00:00Z",
    updated_at: "2026-03-24T09:00:00Z",
  },
  {
    id: "lead-009",
    dealer_id: DEALER_ID,
    first_name: "Chen",
    last_name: "Wei",
    email: "chen.wei@outlook.com",
    phone: "+15554443322",
    vehicle_id: null,
    vehicle_interest: "2025 Mazda CX-5",
    source: "vdp_inquiry",
    status: "new",
    temperature: "warm",
    notes: "",
    structured_notes: [],
    assigned_to: null,
    message: "Can you send more photos of the CX-5 Carbon Edition?",
    follow_up_date: null,
    activity: [
      { id: "a19", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-25T14:00:00Z" },
    ],
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_url: null,
    created_at: "2026-03-25T14:00:00Z",
    updated_at: "2026-03-25T14:00:00Z",
  },
  {
    id: "lead-010",
    dealer_id: DEALER_ID,
    first_name: "Patricia",
    last_name: "Hernandez",
    email: "p.hernandez@email.com",
    phone: "+15556667788",
    vehicle_id: null,
    vehicle_interest: "2024 Kia Telluride SX",
    source: "chat",
    status: "qualified",
    temperature: "hot",
    notes: "",
    structured_notes: [
      { id: "n9", text: "Trading in 2020 Highlander. Wants third-row seating.", author: "Priya Patel", created_at: "2026-03-24T15:00:00Z" },
      { id: "n10", text: "Credit check done, approved for $52K.", author: "Priya Patel", created_at: "2026-03-25T09:00:00Z" },
    ],
    assigned_to: "Priya Patel",
    message: "Need a big SUV for the family. What do you have with third-row seating?",
    follow_up_date: "2026-03-27T11:00:00Z",
    activity: [
      { id: "a20", type: "status_change", description: "Lead created with status New", author: "System", created_at: "2026-03-23T11:00:00Z" },
      { id: "a21", type: "assignment", description: "Assigned to Priya Patel", author: "Mike Reynolds", created_at: "2026-03-23T11:15:00Z" },
      { id: "a22", type: "status_change", description: "Status changed to Qualified", author: "Priya Patel", created_at: "2026-03-25T09:00:00Z" },
    ],
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_url: null,
    created_at: "2026-03-23T11:00:00Z",
    updated_at: "2026-03-25T09:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "appointment_set", "sold", "lost"];
const VALID_TEMPS: LeadTemperature[] = ["hot", "warm", "cool", "cold"];
const VALID_SORT = ["date", "temperature", "status", "name"];

function temperatureRank(t: LeadTemperature): number {
  return { hot: 3, warm: 2, cool: 1, cold: 0 }[t];
}

function statusRank(s: LeadStatus): number {
  return { new: 0, contacted: 1, qualified: 2, appointment_set: 3, sold: 4, lost: 5 }[s];
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/leads                                                       */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);

  const statusFilter = searchParams.get("status") as LeadStatus | null;
  const tempFilter = searchParams.get("temperature") as LeadTemperature | null;
  const assignedFilter = searchParams.get("assigned_to");
  const search = searchParams.get("search")?.toLowerCase();
  const sort = searchParams.get("sort") ?? "date";
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("page_size") ?? "25", 10)));

  // Try database first
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const conditions: string[] = ["dealer_id = $1"];
      const params: unknown[] = [DEALER_ID];
      let idx = 2;

      if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
        conditions.push(`status = $${idx++}`);
        params.push(statusFilter);
      }
      if (tempFilter && VALID_TEMPS.includes(tempFilter)) {
        conditions.push(`temperature = $${idx++}`);
        params.push(tempFilter);
      }
      if (assignedFilter) {
        conditions.push(`assigned_to = $${idx++}`);
        params.push(assignedFilter);
      }
      if (search) {
        conditions.push(
          `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`,
        );
        params.push(`%${search}%`);
        idx++;
      }

      const where = conditions.join(" AND ");

      const orderCol: Record<string, string> = {
        date: "created_at",
        temperature: "temperature",
        status: "status",
        name: "last_name",
      };
      const col = orderCol[sort] ?? "created_at";

      const [dataResult, countResult] = await Promise.all([
        query(
          `SELECT * FROM leads WHERE ${where} ORDER BY ${col} ${sortDir} LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, pageSize, (page - 1) * pageSize],
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM leads WHERE ${where}`,
          params,
        ),
      ]);

      return NextResponse.json({
        leads: dataResult.rows,
        total: parseInt((countResult.rows as any[])[0]?.count ?? "0", 10),
        page,
        page_size: pageSize,
        team_members: TEAM_MEMBERS,
      });
    } catch (err) {
      console.error("[api/admin/leads] DB query failed, falling back to sample data:", err);
    }
  }

  // Fallback: filter/sort sample data in memory
  let filtered = [...SAMPLE_LEADS];

  if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
    filtered = filtered.filter((l) => l.status === statusFilter);
  }
  if (tempFilter && VALID_TEMPS.includes(tempFilter)) {
    filtered = filtered.filter((l) => l.temperature === tempFilter);
  }
  if (assignedFilter) {
    filtered = filtered.filter((l) => l.assigned_to === assignedFilter);
  }
  if (search) {
    filtered = filtered.filter(
      (l) =>
        l.first_name.toLowerCase().includes(search) ||
        l.last_name.toLowerCase().includes(search) ||
        l.email.toLowerCase().includes(search) ||
        (l.phone && l.phone.includes(search)),
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "temperature":
        cmp = temperatureRank(a.temperature) - temperatureRank(b.temperature);
        break;
      case "status":
        cmp = statusRank(a.status) - statusRank(b.status);
        break;
      case "name":
        cmp = a.last_name.localeCompare(b.last_name);
        break;
      default:
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    leads: paged,
    total,
    page,
    page_size: pageSize,
    team_members: TEAM_MEMBERS,
  });
}
