import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * GET  /api/admin/dealers — list all dealers
 * POST /api/admin/dealers — create a new sub-dealer
 */

const MOCK_DEALERS = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Wolfpack Motors",
    slug: "wolfpack-motors",
    phone: "(919) 555-0100",
    email: "sales@wolfpackmotors.com",
    is_active: true,
    created_at: "2026-03-25T00:00:00Z",
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
      `SELECT id, name, slug, phone, email, is_active, created_at FROM dealers ORDER BY name`,
    );
    return NextResponse.json({ dealers: result.rows });
  } catch (err) {
    console.error("[dealers] DB error:", err);
    return NextResponse.json({ dealers: MOCK_DEALERS });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

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

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  // Sanitize slug
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

  if (!process.env.DATABASE_URL) {
    const id = `00000000-0000-4000-b000-${Date.now().toString(16).padStart(12, "0")}`;
    return NextResponse.json({
      id,
      name,
      slug: cleanSlug,
      public_url: `/dealers/${cleanSlug}`,
    }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    // Check slug uniqueness
    const existing = await query(`SELECT id FROM dealers WHERE slug = $1`, [cleanSlug]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `Slug "${cleanSlug}" is already taken` }, { status: 409 });
    }

    const result = await query(
      `INSERT INTO dealers (name, slug, phone, email, address, branding, sales_hours, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
       RETURNING id, name, slug`,
      [
        name,
        cleanSlug,
        phone ?? "",
        email ?? "",
        JSON.stringify(address ?? {}),
        JSON.stringify(branding ?? {}),
        JSON.stringify(sales_hours ?? []),
      ],
    );

    const dealer = result.rows[0] as { id: string; name: string; slug: string };

    try {
      trackSystem("system.health_check", dealer.id, { action: "dealer_created", name });
    } catch {}

    return NextResponse.json({
      id: dealer.id,
      name: dealer.name,
      slug: dealer.slug,
      public_url: `/dealers/${dealer.slug}`,
    }, { status: 201 });
  } catch (err) {
    console.error("[dealers] Create error:", err);
    return NextResponse.json({ error: "Failed to create dealer" }, { status: 500 });
  }
}
