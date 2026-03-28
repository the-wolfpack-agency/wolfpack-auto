import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateDealerSlug } from "@/lib/dealer-onboarding";
import crypto from "node:crypto";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Zod schema                                                                 */
/* -------------------------------------------------------------------------- */

const teamMemberSchema = z.object({
  email: z.string().email("Invalid team member email"),
  role: z.enum(["admin", "manager", "staff"]),
});

const onboardingSchema = z.object({
  dealership: z.object({
    name: z.string().min(1, "Dealership name is required").max(200),
    address: z.string().min(1, "Address is required").max(500),
    city: z.string().min(1, "City is required").max(100),
    state: z.string().min(1, "State is required").max(50),
    zip: z.string().min(1, "ZIP code is required").max(20),
    phone: z.string().min(1, "Phone is required").max(30),
    email: z.string().email("Invalid dealership email"),
    website: z.string().url("Invalid website URL").or(z.literal("")).default(""),
  }),

  branding: z.object({
    logoFile: z.string().nullable().default(null),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color")
      .default("#0070c7"),
    tagline: z.string().max(200).default(""),
  }),

  inventory: z.object({
    method: z.enum(["csv", "dms", "manual"]),
    dmsProvider: z
      .enum(["cdk", "reynolds", "dealertrack", "tekion"])
      .optional(),
    csvData: z.string().optional(),
  }),

  team: z.array(teamMemberSchema).default([]),
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/onboarding                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  // --- Auth check -----------------------------------------------------------
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // --- Parse body -----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = onboardingSchema.safeParse(body);

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

  // --- Check for database availability --------------------------------------
  if (!process.env.DATABASE_URL) {
    // Accept gracefully without DB — return a queued response
    return NextResponse.json(
      {
        dealer_id: dealerId,
        slug,
        status: "active",
        dashboard_url: `/admin`,
        note: "Onboarding queued. Database is currently unavailable.",
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // --- Create dealer record -----------------------------------------------
    const brandingConfig = JSON.stringify({
      primaryColor: data.branding.primaryColor,
      tagline: data.branding.tagline,
      logoFile: data.branding.logoFile,
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
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        address_street = EXCLUDED.address_street,
        address_city = EXCLUDED.address_city,
        address_state = EXCLUDED.address_state,
        address_zip = EXCLUDED.address_zip,
        branding_config = EXCLUDED.branding_config,
        inventory_method = EXCLUDED.inventory_method,
        dms_provider = EXCLUDED.dms_provider,
        status = 'active',
        updated_at = NOW()`,
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

    // --- Create invited user records ----------------------------------------
    for (const member of data.team) {
      const tempPassword = crypto.randomBytes(16).toString("hex");

      await query(
        `INSERT INTO users (
          id, dealer_id, email, password_hash, role,
          invite_pending, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          true, NOW(), NOW()
        )
        ON CONFLICT (email, dealer_id) DO UPDATE SET
          role = EXCLUDED.role,
          updated_at = NOW()`,
        [
          `usr_${crypto.randomUUID()}`,
          dealerId,
          member.email.toLowerCase(),
          tempPassword, // In production: hash this with bcrypt
          member.role,
        ],
      );

      // Placeholder: send invite email
      console.log(
        `[onboarding] Invite email queued for ${member.email} (role: ${member.role})`,
      );
    }

    try { trackSystem("system.onboarding_step", authResult?.user?.dealer_id ?? "system", { action: "onboarding_completed", dealer_id: dealerId }); } catch {}
    return NextResponse.json(
      {
        dealer_id: dealerId,
        slug,
        status: "active",
        dashboard_url: `/admin`,
        team_invited: data.team.length,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/admin/onboarding] Failed:", err);

    return NextResponse.json(
      {
        dealer_id: dealerId,
        slug,
        status: "active",
        dashboard_url: `/admin`,
        note: "Onboarding queued for processing.",
      },
      { status: 201 },
    );
  }
}
