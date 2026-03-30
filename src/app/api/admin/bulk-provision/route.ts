import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import { generateDealerSlug } from "@/lib/dealer-onboarding";
import crypto from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Zod schemas                                                                */
/* -------------------------------------------------------------------------- */

const teamMemberSchema = z.object({
  email: z.string().email("Invalid team member email"),
  role: z.enum(["admin", "manager", "staff"]),
});

const dealerSchema = z.object({
  name: z.string().min(1, "Dealership name is required").max(200),
  address: z.string().min(1, "Address is required").max(500),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State is required").max(50),
  zip: z.string().min(1, "ZIP code is required").max(20),
  phone: z.string().min(1, "Phone is required").max(30),
  email: z.string().email("Invalid dealership email"),
  website: z.string().url().or(z.literal("")).default(""),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0070c7"),
  inventory_method: z.enum(["csv", "dms", "manual"]).default("manual"),
  dms_provider: z
    .enum(["cdk", "reynolds", "dealertrack", "tekion"])
    .optional(),
  team: z.array(teamMemberSchema).default([]),
});

const bulkProvisionSchema = z.object({
  dealers: z
    .array(dealerSchema)
    .min(1, "At least one dealer is required")
    .max(50, "Maximum 50 dealers per request"),
});

/* -------------------------------------------------------------------------- */
/* Agency auth helper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Verify agency-level access: either an authenticated owner/admin user,
 * or a valid agency API key in the Authorization header.
 */
async function requireAgencyAuth(
  request: NextRequest,
): Promise<{ authorized: boolean; source: string } | NextResponse> {
  // Check for API key first (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer wpak_")) {
    const apiKey = authHeader.slice(7); // Remove "Bearer "

    if (!process.env.DATABASE_URL) {
      // Shadow mode: accept any wpak_ prefixed key
      return { authorized: true, source: "api_key" };
    }

    try {
      const { query } = await import("@/lib/db");
      const { createHash } = await import("node:crypto");
      const keyHash = createHash("sha256").update(apiKey).digest("hex");

      const result = await query(
        `SELECT id FROM agency_api_keys WHERE key_hash = $1 AND active = true LIMIT 1`,
        [keyHash],
      );

      if (result.rows.length > 0) {
        // Update last_used_at
        await query(
          `UPDATE agency_api_keys SET last_used_at = NOW() WHERE id = $1`,
          [result.rows[0].id],
        ).catch(() => { /* non-critical */ });

        return { authorized: true, source: "api_key" };
      }
    } catch (err) {
      console.error("[bulk-provision] API key check error:", err);
    }

    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 },
    );
  }

  // Fall back to session-based auth with owner/admin role
  const authResult = await requireRole(["owner", "admin"]);
  if (!isAuthenticated(authResult)) return authResult;

  return { authorized: true, source: "session" };
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/bulk-provision — Bulk create dealers                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const agencyAuth = await requireAgencyAuth(request);
  if (agencyAuth instanceof NextResponse) return agencyAuth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bulkProvisionSchema.safeParse(body);
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

  const { dealers } = parsed.data;
  const results: Array<{
    name: string;
    dealer_id: string;
    slug: string;
    status: "created" | "error";
    team_invited: number;
    error?: string;
  }> = [];

  if (!process.env.DATABASE_URL) {
    // Shadow mode: return mock results for all dealers
    for (const dealer of dealers) {
      const slug = generateDealerSlug(dealer.name);
      const dealerId = `dlr_${slug}_${Date.now().toString(36)}`;
      results.push({
        name: dealer.name,
        dealer_id: dealerId,
        slug,
        status: "created",
        team_invited: dealer.team.length,
      });
    }

    try {
      trackSystem("agency.dealer_created", "system", {
        action: "bulk_provision",
        dealer_count: dealers.length,
        auth_source: agencyAuth.source,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        total: dealers.length,
        created: dealers.length,
        failed: 0,
        results,
      },
      { status: 201 },
    );
  }

  // Production: create each dealer in sequence (within error boundaries)
  const { query } = await import("@/lib/db");
  let created = 0;
  let failed = 0;

  for (const dealer of dealers) {
    const slug = generateDealerSlug(dealer.name);
    const dealerId = `dlr_${slug}_${Date.now().toString(36)}`;

    try {
      const brandingConfig = JSON.stringify({
        primaryColor: dealer.primary_color,
      });

      // Check slug uniqueness
      const existing = await query(
        `SELECT id FROM dealers WHERE slug = $1`,
        [slug],
      );
      if (existing.rows.length > 0) {
        results.push({
          name: dealer.name,
          dealer_id: "",
          slug,
          status: "error",
          team_invited: 0,
          error: `Slug "${slug}" already exists`,
        });
        failed++;
        continue;
      }

      // Create dealer record
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
          dealer.name,
          dealer.phone,
          dealer.email,
          dealer.website || null,
          dealer.address,
          dealer.city,
          dealer.state,
          dealer.zip,
          brandingConfig,
          dealer.inventory_method,
          dealer.dms_provider ?? null,
        ],
      );

      // Create invited user records with invite tokens
      for (const member of dealer.team) {
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
      }

      results.push({
        name: dealer.name,
        dealer_id: dealerId,
        slug,
        status: "created",
        team_invited: dealer.team.length,
      });
      created++;
    } catch (err) {
      console.error(`[bulk-provision] Failed to create dealer "${dealer.name}":`, err);
      results.push({
        name: dealer.name,
        dealer_id: "",
        slug,
        status: "error",
        team_invited: 0,
        error: "Internal error during creation",
      });
      failed++;
    }
  }

  try {
    trackSystem("agency.dealer_created", "system", {
      action: "bulk_provision",
      dealer_count: dealers.length,
      created_count: created,
      failed_count: failed,
      auth_source: agencyAuth.source,
    });
  } catch { /* analytics never blocks */ }

  return NextResponse.json(
    {
      total: dealers.length,
      created,
      failed,
      results,
    },
    { status: created > 0 ? 201 : 422 },
  );
}
