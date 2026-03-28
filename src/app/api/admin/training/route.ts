import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CertStatus = "not_started" | "in_progress" | "completed" | "expired";

interface Certification {
  id: string;
  employee_name: string;
  program_name: string;
  oem_program_id: string | null;
  status: CertStatus;
  completed_date: string | null;
  expiry_date: string | null;
  score: number | null;
  required: boolean;
}

/* -------------------------------------------------------------------------- */
/* Shadow data                                                                 */
/* -------------------------------------------------------------------------- */

const SAMPLE_CERTIFICATIONS: Certification[] = [
  {
    id: "cert-001",
    employee_name: "Mike Reynolds",
    program_name: "Product Knowledge — EV Lineup",
    oem_program_id: "OEM-EV-2024",
    status: "completed",
    completed_date: "2026-01-15",
    expiry_date: "2027-01-15",
    score: 94,
    required: true,
  },
  {
    id: "cert-002",
    employee_name: "Mike Reynolds",
    program_name: "Finance & Insurance Compliance",
    oem_program_id: null,
    status: "in_progress",
    completed_date: null,
    expiry_date: "2026-06-30",
    score: null,
    required: true,
  },
  {
    id: "cert-003",
    employee_name: "Sarah Chen",
    program_name: "Product Knowledge — EV Lineup",
    oem_program_id: "OEM-EV-2024",
    status: "expired",
    completed_date: "2024-12-01",
    expiry_date: "2026-01-01",
    score: 88,
    required: true,
  },
  {
    id: "cert-004",
    employee_name: "Sarah Chen",
    program_name: "Customer Experience Excellence",
    oem_program_id: "OEM-CX-2025",
    status: "completed",
    completed_date: "2026-02-20",
    expiry_date: "2027-02-20",
    score: 97,
    required: true,
  },
  {
    id: "cert-005",
    employee_name: "James Kowalski",
    program_name: "Advanced Negotiation Techniques",
    oem_program_id: null,
    status: "not_started",
    completed_date: null,
    expiry_date: "2026-04-15",
    score: null,
    required: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function computeSummary(certs: Certification[]) {
  const required = certs.filter((c) => c.required);
  const completed = required.filter((c) => c.status === "completed");
  const completion_rate =
    required.length > 0
      ? Math.round((completed.length / required.length) * 100)
      : 0;

  const now = Date.now();
  const expiring_soon_count = certs.filter((c) => {
    if (!c.expiry_date) return false;
    const diff = new Date(c.expiry_date).getTime() - now;
    return diff > 0 && diff <= THIRTY_DAYS_MS;
  }).length;

  return { completion_rate, expiring_soon_count };
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/training                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealer_id = getDealerId(authResult);

  const oemId = request.headers.get("x-oem-id");

  // Try database first
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [dealer_id];

      if (oemId) {
        conditions.push(`(oem_program_id IS NULL OR oem_program_id LIKE $2)`);
        params.push(`${oemId}%`);
      }

      const result = await query<Certification>(
        `SELECT * FROM certifications WHERE ${conditions.join(" AND ")} ORDER BY employee_name, program_name`,
        params,
      );

      const certs = result.rows;
      const { completion_rate, expiring_soon_count } = computeSummary(certs);

      return NextResponse.json({ certifications: certs, completion_rate, expiring_soon_count });
    } catch (err) {
      console.error("[api/admin/training] DB error, falling back:", err);
    }
  }

  // Shadow fallback
  let certs = [...SAMPLE_CERTIFICATIONS];
  if (oemId) {
    certs = certs.filter(
      (c) => c.oem_program_id === null || c.oem_program_id.startsWith(oemId),
    );
  }

  const { completion_rate, expiring_soon_count } = computeSummary(certs);
  return NextResponse.json({ certifications: certs, completion_rate, expiring_soon_count });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/training                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealer_id = getDealerId(authResult);

  let body: {
    employee_name?: string;
    program_name?: string;
    oem_program_id?: string | null;
    status?: CertStatus;
    completed_date?: string | null;
    score?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { employee_name, program_name, status } = body;
  if (!employee_name || !program_name || !status) {
    return NextResponse.json(
      { error: "employee_name, program_name, and status are required" },
      { status: 400 },
    );
  }

  const VALID_STATUSES: CertStatus[] = ["not_started", "in_progress", "completed", "expired"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  // Analytics — non-throwing
  try {
    await trackServerEvent("certification_updated", {
      status,
      oem_program_id: body.oem_program_id ?? "",
      employee_name,
    });
  } catch {
    // never throw
  }

  // Try DB
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query<Certification>(
        `INSERT INTO certifications
           (dealer_id, employee_name, program_name, oem_program_id, status, completed_date, score, required, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
         ON CONFLICT (dealer_id, employee_name, program_name)
           DO UPDATE SET status=$5, completed_date=$6, score=$7, oem_program_id=$4, updated_at=NOW()
         RETURNING *`,
        [
          dealer_id,
          employee_name,
          program_name,
          body.oem_program_id ?? null,
          status,
          body.completed_date ?? null,
          body.score ?? null,
        ],
      );

      // Audit log
      try {
        await query(
          `INSERT INTO audit_log (dealer_id, action, actor, metadata, created_at)
           VALUES ($1,'certification_updated',$2,$3,NOW())`,
          [
            dealer_id,
            authResult.user.email,
            JSON.stringify({ employee_name, program_name, status }),
          ],
        );
      } catch {
        // never throw
      }

      return NextResponse.json({ certification: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/training] POST DB error:", err);
    }
  }

  // Shadow mode: return a synthesised cert
  const shadowCert: Certification = {
    id: `cert-shadow-${Date.now()}`,
    employee_name,
    program_name,
    oem_program_id: body.oem_program_id ?? null,
    status,
    completed_date: body.completed_date ?? null,
    expiry_date: null,
    score: body.score ?? null,
    required: true,
  };

  return NextResponse.json({ certification: shadowCert }, { status: 201 });
}
