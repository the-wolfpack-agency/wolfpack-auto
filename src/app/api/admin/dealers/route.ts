import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

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
  const authResult = await requireRole(["owner"]);
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

  // Generate a temp password for the auto-created admin
  const tempPassword = `Wp${Date.now().toString(36).slice(-6)}!`;

  if (!process.env.DATABASE_URL) {
    const id = `00000000-0000-4000-b000-${Date.now().toString(16).padStart(12, "0")}`;

    try {
      trackSystem("agency.dealer_created", id, { name, slug: cleanSlug });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({
      id,
      name,
      slug: cleanSlug,
      public_url: `/dealers/${cleanSlug}`,
      admin_url: `/admin?dealer=${cleanSlug}`,
      admin_credentials: {
        email: email ?? `admin@${cleanSlug}.com`,
        temp_password: tempPassword,
      },
    }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    // Check slug uniqueness
    const existing = await query( /* audit-safe: A4 reason="globally-unique dealer slug pre-create dedupe (owner role)" */`SELECT id FROM dealers WHERE slug = $1`, [cleanSlug]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `Slug "${cleanSlug}" is already taken` }, { status: 409 });
    }

    // Create the dealer
    const result = await query( /* audit-safe: A4 reason="creating-the-tenant-itself (owner role)" */
      `INSERT INTO dealers (name, slug, subdomain, phone, email, address, branding, sales_hours, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
       RETURNING id, name, slug`,
      [
        name,
        cleanSlug,
        cleanSlug,
        phone ?? "",
        email ?? "",
        JSON.stringify(address ?? {}),
        JSON.stringify(branding ?? {}),
        JSON.stringify(sales_hours ?? []),
      ],
    );

    const dealer = result.rows[0] as { id: string; name: string; slug: string };

    // ---- AUTO-ONBOARDING ----

    // 1. Create default admin user
    const adminEmail = (email ?? `admin@${cleanSlug}.com`).toLowerCase();
    let adminCredentials: { email: string; temp_password: string } | undefined;

    try {
      const { hash } = await import("bcryptjs");
      const passwordHash = await hash(tempPassword, 12);

      await query(
        `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'owner', true, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [dealer.id, adminEmail, `${name} Admin`, passwordHash],
      );

      adminCredentials = { email: adminEmail, temp_password: tempPassword };
    } catch (err) {
      console.error("[dealers] Failed to create default admin:", err);
    }

    // 2. Create default message templates
    try {
      const templates = [
        { name: "Welcome", subject: `Welcome to ${name}!`, body: `Thank you for your interest in ${name}. We're excited to help you find the perfect vehicle.` },
        { name: "Follow-Up", subject: `Following up from ${name}`, body: `We wanted to follow up on your recent inquiry. Please let us know if you have any questions.` },
        { name: "Appointment Reminder", subject: "Appointment Reminder", body: `This is a reminder of your upcoming appointment at ${name}.` },
      ];

      for (const t of templates) {
        await query(
          `INSERT INTO message_templates (dealer_id, name, subject, body, channel, created_at)
           VALUES ($1, $2, $3, $4, 'email', NOW())
           ON CONFLICT DO NOTHING`,
          [dealer.id, t.name, t.subject, t.body],
        ).catch(() => { /* table may not exist yet */ });
      }
    } catch {
      // Message templates table might not exist — that's OK
    }

    // 3. Create default webhook config placeholder
    try {
      await query(
        `INSERT INTO webhook_configs (dealer_id, url, secret, events, active, description, created_at, updated_at)
         VALUES ($1, '', $2, '{*}', false, 'Default webhook — configure URL to activate', NOW(), NOW())`,
        [dealer.id, `whsec_${Date.now().toString(36)}`],
      ).catch(() => { /* table may not exist yet */ });
    } catch {
      // Webhook configs table might not exist — that's OK
    }

    try {
      trackSystem("agency.dealer_created", dealer.id, { name, slug: cleanSlug });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({
      id: dealer.id,
      name: dealer.name,
      slug: dealer.slug,
      public_url: `/dealers/${dealer.slug}`,
      admin_url: `/admin?dealer=${dealer.slug}`,
      admin_credentials: adminCredentials,
    }, { status: 201 });
  } catch (err) {
    console.error("[dealers] Create error:", err);
    return NextResponse.json({ error: "Failed to create dealer" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireRole(["owner"]);
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
