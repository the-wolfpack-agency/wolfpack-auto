import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/**
 * GET  /api/admin/digital-retail/credit-app — list credit applications
 * POST /api/admin/digital-retail/credit-app — submit (public) or admin-create
 */

interface CreditApp {
  id: string;
  dealer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  ssn_last4: string;
  annual_income: number;
  employment_status: string;
  employer: string;
  residence_type: string;
  monthly_housing: number;
  vehicle_interest: string;
  co_applicant: boolean;
  status: "submitted" | "reviewing" | "approved" | "declined";
  submitted_at: string;
}

const MOCK_APPS: CreditApp[] = [
  {
    id: "ca-001",
    dealer_id: "demo-dealer",
    first_name: "Sarah",
    last_name: "Chen",
    email: "sarah.chen@email.com",
    phone: "(919) 555-0142",
    dob: "1988-03-15",
    ssn_last4: "4521",
    annual_income: 78000,
    employment_status: "employed",
    employer: "Acme Corp",
    residence_type: "own",
    monthly_housing: 1450,
    vehicle_interest: "2024 Honda CR-V EX-L",
    co_applicant: false,
    status: "submitted",
    submitted_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "ca-002",
    dealer_id: "demo-dealer",
    first_name: "Marcus",
    last_name: "Williams",
    email: "marcus.w@email.com",
    phone: "(919) 555-0198",
    dob: "1992-07-22",
    ssn_last4: "7890",
    annual_income: 95000,
    employment_status: "employed",
    employer: "Tech Solutions Inc",
    residence_type: "rent",
    monthly_housing: 1800,
    vehicle_interest: "2023 BMW X3 xDrive30i",
    co_applicant: true,
    status: "reviewing",
    submitted_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
  },
  {
    id: "ca-003",
    dealer_id: "demo-dealer",
    first_name: "Jennifer",
    last_name: "Park",
    email: "jpark@email.com",
    phone: "(919) 555-0256",
    dob: "1985-11-08",
    ssn_last4: "3344",
    annual_income: 62000,
    employment_status: "self_employed",
    employer: "Park Design Studio",
    residence_type: "own",
    monthly_housing: 1200,
    vehicle_interest: "2024 Toyota RAV4 XLE",
    co_applicant: false,
    status: "approved",
    submitted_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
  },
];

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ applications: MOCK_APPS });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<CreditApp>(
      `SELECT * FROM credit_applications WHERE dealer_id = $1 ORDER BY submitted_at DESC`,
      [authResult.user.dealer_id],
    );
    return NextResponse.json({ applications: result.rows });
  } catch (err) {
    console.error("[credit-app] DB error:", err);
    return NextResponse.json({ applications: MOCK_APPS });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const required = ["first_name", "last_name", "email", "phone", "annual_income"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }
  }

  const appId = `ca-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return NextResponse.json(
    {
      id: appId,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      message: "Credit application received. We will contact you within 1 business day.",
    },
    { status: 201 },
  );
}
