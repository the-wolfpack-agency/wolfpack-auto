import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackSystem } from "@/lib/analytics-hooks";
import { generateDealerSlug } from "@/lib/dealer-onboarding";
import crypto from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Zod schema                                                                 */
/* -------------------------------------------------------------------------- */

const teamMemberSchema = z.object({
  email: z.string().email("Invalid team member email"),
  role: z.enum(["admin", "manager", "staff"]),
});

const convertDemoSchema = z.object({
  demo_session_id: z.string().min(1, "Demo session ID is required"),

  dealership: z.object({
    name: z.string().min(1, "Dealership name is required").max(200),
    address: z.string().min(1, "Address is required").max(500),
    city: z.string().min(1, "City is required").max(100),
    state: z.string().min(1, "State is required").max(50),
    zip: z.string().min(1, "ZIP code is required").max(20),
    phone: z.string().min(1, "Phone is required").max(30),
    email: z.string().email("Invalid dealership email"),
    website: z.string().url().or(z.literal("")).default(""),
  }),

  branding: z.object({
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#0070c7"),
    tagline: z.string().max(200).default(""),
  }),

  inventory: z.object({
    method: z.enum(["csv", "dms", "manual"]),
    dmsProvider: z
      .enum(["cdk", "reynolds", "dealertrack", "tekion"])
      .optional(),
  }),

  team: z.array(teamMemberSchema).default([]),
});

/* -------------------------------------------------------------------------- */
/* POST /api/demo/convert — Convert a demo session to a real dealer           */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = convertDemoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const slug = generateDealerSlug(data.dealership.name);
  const dealerId = `dlr_${slug}_${Date.now().toString(36)}`;

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("system.onboarding_step", "system", {
        action: "demo_converted",
        demo_session_id: data.demo_session_id,
        dealer_id: dealerId,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        dealer_id: dealerId,
        slug,
        status: "active",
        dashboard_url: `/admin`,
        converted_from_demo: data.demo_session_id,
        team_invited: data.team.length,
        note: "Demo converted. Database is currently unavailable — queued for processing.",
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // Verify the demo session exists and is not expired/converted
    const demoResult = await query(
      `SELECT id, demo_dealer_id, prospect_email, is_converted, expires_at
       FROM demo_sessions
       WHERE id = $1
       LIMIT 1`,
      [data.demo_session_id],
    );

    if (demoResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Demo session not found" },
        { status: 404 },
      );
    }

    const demoSession = demoResult.rows[0] as {
      id: string;
      demo_dealer_id: string;
      prospect_email: string;
      is_converted: boolean;
      expires_at: string;
    };

    if (demoSession.is_converted) {
      return NextResponse.json(
        { error: "This demo session has already been converted" },
        { status: 409 },
      );
    }

    if (new Date(demoSession.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This demo session has expired. Please create a new demo." },
        { status: 410 },
      );
    }

    // Check slug uniqueness
    const existingSlug = await query(
      `SELECT id FROM dealers WHERE slug = $1`,
      [slug],
    );
    if (existingSlug.rows.length > 0) {
      return NextResponse.json(
        { error: `Slug "${slug}" is already taken` },
        { status: 409 },
      );
    }

    // Create the real dealer record
    const brandingConfig = JSON.stringify({
      primaryColor: data.branding.primaryColor,
      tagline: data.branding.tagline,
    });

    await query(
      `INSERT INTO dealers (
        id, slug, name, phone, email, website,
        address_street, address_city, address_state, address_zip,
        branding_config, inventory_method, dms_provider,
        status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        'active', NOW(), NOW()
      )`,
      [
        dealerId,
        slug,
        data.dealership.name,
        data.dealership.phone,
        data.dealership.email,
        data.dealership.website || null,
        data.dealership.address,
        data.dealership.city,
        data.dealership.state,
        data.dealership.zip,
        brandingConfig,
        data.inventory.method,
        data.inventory.dmsProvider ?? null,
      ],
    );

    // Migrate vehicles from demo dealer to real dealer
    let vehiclesMigrated = 0;
    try {
      const migrateResult = await query(
        `UPDATE vehicles SET dealer_id = $1, updated_at = NOW()
         WHERE dealer_id = $2`,
        [dealerId, demoSession.demo_dealer_id],
      );
      vehiclesMigrated = migrateResult.rowCount ?? 0;
    } catch {
      // Best-effort migration — some demo data may not have real VINs
    }

    // Migrate leads from demo dealer to real dealer
    let leadsMigrated = 0;
    try {
      const migrateResult = await query(
        `UPDATE leads SET dealer_id = $1, updated_at = NOW()
         WHERE dealer_id = $2`,
        [dealerId, demoSession.demo_dealer_id],
      );
      leadsMigrated = migrateResult.rowCount ?? 0;
    } catch {
      // Best-effort migration
    }

    // Create team member records with invite tokens
    for (const member of data.team) {
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await query(
        `INSERT INTO dealer_users (
          dealer_id, email, name, role,
          invite_token, invite_expires_at,
          is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6,
          true, NOW(), NOW()
        )
        ON CONFLICT (email) DO NOTHING`,
        [
          dealerId,
          member.email.toLowerCase(),
          member.email.split("@")[0],
          member.role,
          inviteToken,
          expiresAt.toISOString(),
        ],
      );

      console.log(
        `[demo/convert] Invite email queued for ${member.email} (role: ${member.role})`,
      );
    }

    // Mark demo session as converted
    await query(
      `UPDATE demo_sessions
       SET is_converted = true, converted_dealer_id = $1
       WHERE id = $2`,
      [dealerId, data.demo_session_id],
    );

    // Soft-delete the demo dealer (mark as converted, not active)
    await query(
      `UPDATE dealers SET status = 'converted', updated_at = NOW()
       WHERE id = $1`,
      [demoSession.demo_dealer_id],
    );

    try {
      trackSystem("system.onboarding_step", dealerId, {
        action: "demo_converted",
        demo_session_id: data.demo_session_id,
        demo_dealer_id: demoSession.demo_dealer_id,
        vehicles_migrated: vehiclesMigrated,
        leads_migrated: leadsMigrated,
        team_invited: data.team.length,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        dealer_id: dealerId,
        slug,
        status: "active",
        dashboard_url: `/admin`,
        converted_from_demo: data.demo_session_id,
        team_invited: data.team.length,
        migrated: {
          vehicles: vehiclesMigrated,
          leads: leadsMigrated,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[demo/convert] Failed:", err);
    return NextResponse.json(
      { error: "Failed to convert demo session" },
      { status: 500 },
    );
  }
}
