/**
 * GET  /api/operator/dealers — list all dealers (operator visibility)
 * POST /api/operator/dealers — create a new dealer + auto-onboard
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { createDealer } from "@/lib/dealers/create-dealer";

interface DealerListRow {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  leads_count: number;
  inventory_count: number;
  user_count: number;
  last_activity_at: string | null;
}

const SHADOW_DEALERS: DealerListRow[] = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Demo Dealership",
    slug: "demo-dealership",
    phone: "(555) 555-0100",
    email: "sales@demo-dealer.example.com",
    is_active: true,
    created_at: "2026-03-25T00:00:00Z",
    leads_count: 42,
    inventory_count: 87,
    user_count: 3,
    last_activity_at: "2026-05-10T12:00:00Z",
  },
];

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status"); // active | suspended | onboarding | null

  if (!process.env.DATABASE_URL) {
    let rows = SHADOW_DEALERS;
    if (search) rows = rows.filter((d) => d.name.toLowerCase().includes(search) || d.slug.includes(search));
    if (status === "active") rows = rows.filter((d) => d.is_active);
    if (status === "suspended") rows = rows.filter((d) => !d.is_active);
    return NextResponse.json({
      dealers: rows.slice(offset, offset + limit),
      total: rows.length,
      pagination: { limit, offset },
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const params: unknown[] = [];
    const where: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(LOWER(d.name) LIKE $${params.length} OR LOWER(d.slug) LIKE $${params.length})`);
    }
    if (status === "active") where.push("d.is_active = true");
    if (status === "suspended") where.push("d.is_active = false");

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);
    params.push(offset);

    const result = await query<DealerListRow>(
      `SELECT
         d.id, d.name, d.slug, d.phone, d.email, d.is_active, d.created_at,
         COALESCE(l.cnt, 0)::int AS leads_count,
         COALESCE(v.cnt, 0)::int AS inventory_count,
         COALESCE(u.cnt, 0)::int AS user_count,
         u.last_activity_at
       FROM dealers d
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt FROM leads GROUP BY dealer_id) l ON l.dealer_id = d.id
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt FROM vehicles GROUP BY dealer_id) v ON v.dealer_id = d.id
       LEFT JOIN (
         SELECT dealer_id, COUNT(*)::int AS cnt, MAX(last_login) AS last_activity_at
           FROM dealer_users GROUP BY dealer_id
       ) u ON u.dealer_id = d.id::text
       ${whereClause}
       ORDER BY d.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const totalResult = await query<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM dealers d ${whereClause}`,
      params.slice(0, params.length - 2),
    );

    return NextResponse.json({
      dealers: result.rows,
      total: Number(totalResult.rows[0]?.cnt ?? 0),
      pagination: { limit, offset },
    });
  } catch (err) {
    console.error("[operator/dealers] GET error:", err);
    return NextResponse.json({ dealers: SHADOW_DEALERS, total: SHADOW_DEALERS.length, pagination: { limit, offset } });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, slug, phone, email, address, branding, sales_hours } = body as {
    name?: string;
    slug?: string;
    phone?: string;
    email?: string;
    address?: Record<string, string>;
    branding?: Record<string, string>;
    sales_hours?: unknown[];
  };

  const result = await createDealer({
    name: name ?? "",
    slug: slug ?? "",
    phone,
    email,
    address,
    branding,
    sales_hours,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logStaffAction({
    staffId: auth.staff.id,
    action: "operator.dealer_created",
    targetType: "dealer",
    targetId: result.dealer.id,
    metadata: { name: result.dealer.name, slug: result.dealer.slug },
    ipAddress: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    {
      id: result.dealer.id,
      name: result.dealer.name,
      slug: result.dealer.slug,
      public_url: result.public_url,
      admin_url: result.admin_url,
      admin_credentials: result.admin_credentials,
    },
    { status: 201 },
  );
}
