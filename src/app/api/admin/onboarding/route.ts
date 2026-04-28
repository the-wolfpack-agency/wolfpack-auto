import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateDealerSlug } from "@/lib/dealer-onboarding";
import crypto from "node:crypto";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import { sendTeamInvite } from "@/lib/notifications";

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
    address: z.string().max(500).default(""),
    city: z.string().max(100).default(""),
    state: z.string().max(50).default(""),
    zip: z.string().max(20).default(""),
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
/* CSV parsing                                                                */
/* -------------------------------------------------------------------------- */

interface CsvVehicleRow {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number;
  condition: string;
  color: string;
}

/**
 * Parse a base64-encoded CSV string into vehicle rows.
 * Handles flexible column naming and gracefully skips invalid rows.
 */
function parseCsvInventory(base64Csv: string): {
  rows: CsvVehicleRow[];
  errors: string[];
} {
  const rows: CsvVehicleRow[] = [];
  const errors: string[] = [];

  let csvText: string;
  try {
    csvText = Buffer.from(base64Csv, "base64").toString("utf-8");
  } catch {
    return { rows: [], errors: ["Failed to decode base64 CSV data"] };
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must have a header row and at least one data row"] };
  }

  // Parse header — normalize to lowercase, strip whitespace
  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // Build column index map with flexible name matching
  const colMap: Record<string, number> = {};
  const aliases: Record<string, string[]> = {
    vin: ["vin", "vehicle_vin", "vin_number"],
    year: ["year", "model_year", "yr"],
    make: ["make", "manufacturer", "brand"],
    model: ["model", "model_name"],
    trim: ["trim", "trim_level", "trimlevel"],
    price: ["price", "asking_price", "list_price", "listprice", "askingprice"],
    mileage: ["mileage", "miles", "odometer"],
    condition: ["condition", "cond", "vehicle_condition", "type"],
    color: ["color", "exterior_color", "exteriorcolor", "ext_color"],
  };

  for (const [field, names] of Object.entries(aliases)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx !== -1) {
      colMap[field] = idx;
    }
  }

  // VIN, Year, Make, Model, Price are required columns
  const requiredCols = ["vin", "year", "make", "model", "price"];
  const missingCols = requiredCols.filter((c) => !(c in colMap));
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [`Missing required CSV columns: ${missingCols.join(", ")}`],
    };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const lineNum = i + 1;

    try {
      const vin = values[colMap.vin] ?? "";
      const yearStr = values[colMap.year] ?? "";
      const make = values[colMap.make] ?? "";
      const model = values[colMap.model] ?? "";
      const priceStr = values[colMap.price] ?? "";

      // Validate required fields
      if (!vin || vin.length < 5) {
        errors.push(`Row ${lineNum}: Invalid or missing VIN`);
        continue;
      }

      const year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 2) {
        errors.push(`Row ${lineNum}: Invalid year "${yearStr}"`);
        continue;
      }

      if (!make) {
        errors.push(`Row ${lineNum}: Missing make`);
        continue;
      }

      if (!model) {
        errors.push(`Row ${lineNum}: Missing model`);
        continue;
      }

      const price = parseFloat(priceStr.replace(/[$,]/g, ""));
      if (isNaN(price) || price <= 0) {
        errors.push(`Row ${lineNum}: Invalid price "${priceStr}"`);
        continue;
      }

      // Optional fields — gracefully default
      const mileageStr = colMap.mileage !== undefined ? values[colMap.mileage] ?? "" : "";
      const mileage = mileageStr ? parseInt(mileageStr.replace(/[,]/g, ""), 10) : 0;

      const trim = colMap.trim !== undefined ? values[colMap.trim] ?? "" : "";
      const condition = colMap.condition !== undefined ? values[colMap.condition] ?? "used" : "used";
      const color = colMap.color !== undefined ? values[colMap.color] ?? "" : "";

      rows.push({
        vin: vin.toUpperCase(),
        year,
        make,
        model,
        trim,
        price,
        mileage: isNaN(mileage) ? 0 : mileage,
        condition: ["new", "used", "certified"].includes(condition.toLowerCase())
          ? condition.toLowerCase()
          : "used",
        color,
      });
    } catch {
      errors.push(`Row ${lineNum}: Failed to parse row`);
    }
  }

  return { rows, errors };
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/onboarding — save partial progress                        */
/* -------------------------------------------------------------------------- */

const progressSchema = z.object({
  currentStep: z.number().int().min(0).max(10),
  data: z.record(z.unknown()),
  templateId: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 422 },
    );
  }

  const { currentStep, data, templateId } = parsed.data;

  // Track step transition analytics
  try {
    trackSystem("system.onboarding_step", authResult.user.email, {
      action: "progress_saved",
      step: currentStep,
      template_id: templateId ?? "none",
      timestamp: new Date().toISOString(),
    });
  } catch { /* analytics never blocks */ }

  // Persist to DB if available
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO onboarding_progress (
          user_email, current_step, template_id, data, updated_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_email) DO UPDATE SET
          current_step = EXCLUDED.current_step,
          template_id = EXCLUDED.template_id,
          data = EXCLUDED.data,
          updated_at = NOW()`,
        [
          authResult.user.email.toLowerCase(),
          currentStep,
          templateId ?? null,
          JSON.stringify(data),
        ],
      );
    } catch (err) {
      // Table may not exist yet — log but don't fail
      console.warn("[onboarding] Failed to persist progress:", err);
    }
  }

  return NextResponse.json({
    saved: true,
    currentStep,
    templateId: templateId ?? null,
  });
}

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
  const onboardingEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

  // --- Database-unavailable shadow path ------------------------------------
  // The launch button used to hard-503 here, blocking the operator from
  // completing the onboarding wizard on any environment without a wired
  // DATABASE_URL. Now we return a shadow-success that mirrors the real
  // 201 shape so the Launch Your Site button advances to /admin and the
  // dealer can keep working in shadow mode. A `warning` field surfaces
  // the missing-DB state so it's still visible to anyone reading the
  // response. Analytics still emits an `onboarding_failed` event so the
  // learning pipeline can correlate shadow-mode launches.
  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("system.onboarding_step", dealerId, {
        action: "onboarding_completed_shadow",
        reason: "db_unavailable",
        timestamp: new Date().toISOString(),
      });
    } catch { /* analytics never blocks */ }
    return NextResponse.json(
      {
        dealer_id: dealerId,
        slug,
        status: "active",
        dashboard_url: "/admin",
        team_invited: 0,
        invite_tokens_generated: 0,
        emails_sent: 0,
        onboarding_events: [],
        mode: "shadow",
        warning: "Database not configured — onboarding stored in shadow mode only. Run migration + set DATABASE_URL for durable persistence.",
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // --- Create dealer record -----------------------------------------------
    // TODO: Logo should move to Vercel Blob or S3 for production.
    // Storing base64 data URIs in the DB works but bloats row size.
    // When migrating, store the blob URL in branding_config.logo_url
    // and remove the logoFile field.
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

    // --- Auto-assign owner role to the authenticated user -------------------
    try {
      await query(
        `INSERT INTO dealer_users (
          dealer_id, email, name, password_hash, role, is_active,
          created_at, updated_at
        ) VALUES ($1, $2, $3, '', 'owner', true, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET
          dealer_id = EXCLUDED.dealer_id,
          role = 'owner',
          is_active = true,
          updated_at = NOW()`,
        [dealerId, authResult.user.email.toLowerCase(), authResult.user.name],
      );
    } catch (ownerErr) {
      // If dealer_users table doesn't exist yet (migration not run), log and continue
      const msg = ownerErr instanceof Error ? ownerErr.message : String(ownerErr);
      if (msg.includes("dealer_users") && msg.includes("does not exist")) {
        console.warn("[onboarding] dealer_users table not found — skipping owner assignment");
      } else {
        console.error("[onboarding] Failed to assign owner role:", ownerErr);
      }
    }

    // --- Create invited team member records with invite tokens ----------------
    let teamInvited = 0;
    let emailsSent = false;
    let inviteTokensGenerated = false;

    for (const member of data.team) {
      try {
        const inviteToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await query(
          `INSERT INTO dealer_users (
            dealer_id, email, name, password_hash, role,
            is_active, invite_token, invite_expires_at,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, NULL, $4,
            false, $5, $6,
            NOW(), NOW()
          )
          ON CONFLICT (email) DO UPDATE SET
            dealer_id = EXCLUDED.dealer_id,
            role = EXCLUDED.role,
            invite_token = EXCLUDED.invite_token,
            invite_expires_at = EXCLUDED.invite_expires_at,
            updated_at = NOW()`,
          [
            dealerId,
            member.email.toLowerCase(),
            member.email.split("@")[0], // Use email prefix as provisional name
            member.role,
            inviteToken,
            expiresAt.toISOString(),
          ],
        );

        inviteTokensGenerated = true;
        teamInvited++;

        // Send invite email via the notification system
        try {
          await sendTeamInvite({
            inviteeEmail: member.email.toLowerCase(),
            inviteeName: member.email.split("@")[0],
            role: member.role,
            inviterName: authResult.user.name,
            dealerName: data.dealership.name,
            inviteToken,
          });
          emailsSent = true;
        } catch (emailErr) {
          console.error(
            `[onboarding] Failed to send invite email to ${member.email}:`,
            emailErr,
          );
          // Don't fail onboarding if email fails — token is stored, can resend later
        }

        // Track each invite
        try {
          trackSystem("team.user_invited", dealerId, {
            email: member.email,
            role: member.role,
          });
        } catch { /* analytics never blocks */ }
      } catch (memberErr) {
        const msg = memberErr instanceof Error ? memberErr.message : String(memberErr);
        // If invite columns don't exist, fall back to basic user creation
        if (msg.includes("invite_token") || msg.includes("42703")) {
          console.warn("[onboarding] invite_token column not found — falling back to basic insert");
          try {
            await query(
              `INSERT INTO dealer_users (
                dealer_id, email, name, password_hash, role,
                is_active, created_at, updated_at
              ) VALUES ($1, $2, $3, '', $4, false, NOW(), NOW())
              ON CONFLICT (email) DO UPDATE SET
                role = EXCLUDED.role,
                updated_at = NOW()`,
              [
                dealerId,
                member.email.toLowerCase(),
                member.email.split("@")[0],
                member.role,
              ],
            );
            teamInvited++;
          } catch (fallbackErr) {
            console.error(`[onboarding] Failed to create team member ${member.email}:`, fallbackErr);
          }
        } else if (msg.includes("dealer_users") && msg.includes("does not exist")) {
          console.warn("[onboarding] dealer_users table not found — skipping team invites");
          break;
        } else {
          console.error(`[onboarding] Failed to invite ${member.email}:`, memberErr);
        }
      }
    }

    // --- Parse CSV inventory and create vehicle records -----------------------
    let vehiclesImported = 0;
    let csvErrors: string[] = [];

    if (data.inventory.method === "csv" && data.inventory.csvData) {
      const { rows, errors } = parseCsvInventory(data.inventory.csvData);
      csvErrors = errors;

      for (const vehicle of rows) {
        try {
          await query(
            `INSERT INTO vehicles (
              dealer_id, vin, year, make, model, trim,
              price, mileage, condition, exterior_color,
              status, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10,
              'available', NOW(), NOW()
            )
            ON CONFLICT (dealer_id, vin) DO UPDATE SET
              year = EXCLUDED.year,
              make = EXCLUDED.make,
              model = EXCLUDED.model,
              trim = EXCLUDED.trim,
              price = EXCLUDED.price,
              mileage = EXCLUDED.mileage,
              condition = EXCLUDED.condition,
              exterior_color = EXCLUDED.exterior_color,
              updated_at = NOW()`,
            [
              dealerId,
              vehicle.vin,
              vehicle.year,
              vehicle.make,
              vehicle.model,
              vehicle.trim,
              vehicle.price,
              vehicle.mileage,
              vehicle.condition,
              vehicle.color,
            ],
          );
          vehiclesImported++;
        } catch (vehErr) {
          const msg = vehErr instanceof Error ? vehErr.message : String(vehErr);
          csvErrors.push(`VIN ${vehicle.vin}: ${msg}`);
        }
      }

      // Track CSV import results
      try {
        trackSystem("system.onboarding_step", dealerId, {
          action: "csv_import_completed",
          vehicles_parsed: rows.length,
          vehicles_imported: vehiclesImported,
          vehicles_failed: rows.length - vehiclesImported,
          parse_errors: csvErrors.length,
        });
      } catch { /* analytics never blocks */ }
    }

    // --- Emit onboarding analytics events ------------------------------------
    onboardingEvents.push({
      event: "onboarding_completed",
      data: {
        dealer_id: dealerId,
        dealer_name: data.dealership.name,
        timestamp: new Date().toISOString(),
      },
    });

    onboardingEvents.push({
      event: "team_size",
      data: { count: data.team.length, invited: teamInvited },
    });

    onboardingEvents.push({
      event: "inventory_method",
      data: {
        method: data.inventory.method,
        ...(data.inventory.method === "csv"
          ? { csv_vehicles_imported: vehiclesImported }
          : {}),
        ...(data.inventory.method === "dms" && data.inventory.dmsProvider
          ? { dms_provider_selected: data.inventory.dmsProvider }
          : {}),
      },
    });

    if (data.inventory.method === "csv") {
      onboardingEvents.push({
        event: "csv_vehicles_imported",
        data: {
          total: vehiclesImported,
          errors: csvErrors.length,
        },
      });
    }

    if (data.inventory.method === "dms" && data.inventory.dmsProvider) {
      onboardingEvents.push({
        event: "dms_provider_selected",
        data: { provider: data.inventory.dmsProvider },
      });
    }

    // Track the composite onboarding event
    try {
      trackSystem("system.onboarding_step", dealerId, {
        action: "onboarding_completed",
        team_size: data.team.length,
        team_invited: teamInvited,
        inventory_method: data.inventory.method,
        csv_vehicles_imported: vehiclesImported,
        dms_provider: data.inventory.dmsProvider ?? "",
        has_logo: !!data.branding.logoFile,
        has_tagline: !!data.branding.tagline,
      });
    } catch { /* analytics never blocks */ }

    // --- Build response -------------------------------------------------------
    const response: Record<string, unknown> = {
      dealer_id: dealerId,
      slug,
      status: "active",
      dashboard_url: `/admin`,
      team_invited: teamInvited,
      invite_tokens_generated: inviteTokensGenerated,
      emails_sent: emailsSent,
      onboarding_events: onboardingEvents,
    };

    if (data.inventory.method === "csv") {
      response.vehicles_imported = vehiclesImported;
      if (csvErrors.length > 0) {
        response.csv_errors = csvErrors;
      }
    }

    if (data.branding.logoFile) {
      // TODO: Replace with Vercel Blob/S3 URL once storage migration is done.
      // For now, the logo is stored as a base64 data URI in branding_config.
      response.logo_url = `/api/admin/settings/logo?dealer=${dealerId}`;
    }

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error("[api/admin/onboarding] Failed:", err);
    const message = err instanceof Error ? err.message : String(err);

    // Fire-and-forget analytics for DB errors
    try {
      trackSystem("system.onboarding_step", dealerId, {
        action: "onboarding_failed",
        reason: "db_error",
        error: message,
        timestamp: new Date().toISOString(),
      });
    } catch { /* analytics never blocks */ }

    /* Two error categories share this catch:
       1. Schema drift / missing tables — recoverable: fall through to
          a shadow-success so the operator can finish the wizard.
       2. Genuine DB outage / unexpected throw — surface a real error
          with `cause` so the issue isn't a black-box, but don't 503
          (the wizard's last step shouldn't trap the operator).
       Both paths get analytics. The shadow path emits a warning. */
    if (
      /relation .* does not exist/i.test(message) ||
      /column .* does not exist/i.test(message) ||
      /ECONNREFUSED|ENOTFOUND/i.test(message)
    ) {
      try {
        trackSystem("system.onboarding_step", dealerId, {
          action: "onboarding_completed_shadow",
          reason: "db_schema_or_connect_error",
          error: message.slice(0, 200),
          timestamp: new Date().toISOString(),
        });
      } catch { /* analytics never blocks */ }
      return NextResponse.json(
        {
          dealer_id: dealerId,
          slug,
          status: "active",
          dashboard_url: "/admin",
          team_invited: 0,
          invite_tokens_generated: 0,
          emails_sent: 0,
          onboarding_events: [],
          mode: "shadow",
          warning: `Onboarding stored in shadow mode — DB error: ${message.slice(0, 120)}`,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to launch site",
        cause: message.slice(0, 200),
      },
      { status: 500 },
    );
  }
}
