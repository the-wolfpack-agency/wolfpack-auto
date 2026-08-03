import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import { createDealer } from "@/lib/dealers/create-dealer";
import { AGENCY_DEALER_ROLES } from "@/lib/dealers/agency-roles";

/**
 * GET   /api/admin/dealers — list all dealers
 * POST  /api/admin/dealers — create a new sub-dealer (with auto-onboarding)
 * PATCH /api/admin/dealers — toggle active/inactive for a dealer
 */

const MOCK_DEALERS = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Demo Dealership",
    slug: "demo-dealership",
    phone: "(555) 555-0100",
    email: "sales@demo-dealer.example.com",
    is_active: true,
    leads_count: 42,
    inventory_count: 87,
    created_at: "2026-03-25T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    name: "Triangle Auto Group",
    slug: "triangle-auto",
    phone: "(919) 555-0200",
    email: "info@triangleauto.com",
    is_active: true,
    leads_count: 28,
    inventory_count: 53,
    created_at: "2026-03-20T00:00:00Z",
  },
];

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ dealers: MOCK_DEALERS });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT d.id, d.name, d.slug, d.phone, d.email, d.is_active, d.created_at,
              COALESCE(l.cnt, 0) AS leads_count,
              COALESCE(v.cnt, 0) AS inventory_count
       FROM dealers d
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt FROM leads GROUP BY dealer_id) l ON l.dealer_id = d.id::text
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt FROM vehicles GROUP BY dealer_id) v ON v.dealer_id = d.id::text
       ORDER BY d.name`,
    );
    return NextResponse.json({ dealers: result.rows });
  } catch (err) {
    console.error("[dealers] DB error:", err);
    return NextResponse.json({ dealers: MOCK_DEALERS });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireRole(AGENCY_DEALER_ROLES);
  if (!isAuthenticated(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, slug, phone, email, address, branding, sales_hours, logo_url } = body as {
    name?: string;
    slug?: string;
    phone?: string;
    email?: string;
    address?: Record<string, string>;
    branding?: Record<string, string>;
    sales_hours?: unknown[];
    logo_url?: string;
  };

  // Shared dealer-create logic lives in src/lib/dealers/create-dealer.ts
  // so the operator console can call the same path without duplicating
  // the auto-onboarding side effects.
  const created = await createDealer({
    name: name ?? "",
    slug: slug ?? "",
    phone,
    email,
    address,
    branding,
    sales_hours,
    logo_url,
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  return NextResponse.json({
    id: created.dealer.id,
    name: created.dealer.name,
    slug: created.dealer.slug,
    public_url: created.public_url,
    admin_url: created.admin_url,
    admin_credentials: created.admin_credentials,
  }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireRole(AGENCY_DEALER_ROLES);
  if (!isAuthenticated(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, is_active } = body as { id?: string; is_active?: boolean };

  if (!id || is_active === undefined) {
    return NextResponse.json({ error: "id and is_active are required" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("agency.dealer_toggled", id, { is_active });
    } catch { /* analytics never blocks */ }
    return NextResponse.json({ success: true, id, is_active });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query( /* audit-safe: A4 reason="agency-level dealer-active toggle (owner role required above)" */
      `UPDATE dealers SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, is_active`,
      [is_active, id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    try {
      trackSystem("agency.dealer_toggled", id, { is_active });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ success: true, dealer: result.rows[0] });
  } catch (err) {
    console.error("[dealers] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update dealer" }, { status: 500 });
  }
}
