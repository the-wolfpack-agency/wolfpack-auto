/**
 * Shared dealer-creation logic.
 *
 * Used by:
 *   - src/app/api/admin/dealers/route.ts        (existing dealer-owner flow)
 *   - src/app/api/operator/dealers/route.ts     (Wolfpack staff console)
 *
 * Keeps the auto-onboarding side effects (default admin user, default
 * message templates, default webhook config) in one place so both call
 * sites get identical behavior.
 */

import { trackSystem } from "@/lib/analytics-hooks";

export interface CreateDealerInput {
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: Record<string, string>;
  branding?: Record<string, string>;
  sales_hours?: unknown[];
}

export interface CreateDealerResult {
  ok: true;
  dealer: {
    id: string;
    name: string;
    slug: string;
  };
  public_url: string;
  admin_url: string;
  admin_credentials: {
    email: string;
    temp_password: string;
  };
}

export interface CreateDealerError {
  ok: false;
  status: number;
  error: string;
}

/**
 * Sanitize a free-form slug into URL-safe segments.
 */
export function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate a one-time temporary password for the auto-created admin.
 * Format: Wp<base36-time>! — meets the project's password validator.
 */
export function generateTempPassword(): string {
  const r = Math.random().toString(36).slice(-4);
  return `Wp${Date.now().toString(36).slice(-6)}${r}A1!`;
}

/**
 * Create a dealer + auto-onboard. Returns either a CreateDealerResult
 * (201-shaped) or a CreateDealerError (with appropriate HTTP status).
 *
 * Behavior:
 *   - Validates name + slug.
 *   - Sanitizes the slug.
 *   - Checks for slug uniqueness (returns 409 if taken).
 *   - Inserts the dealer row.
 *   - Creates a default 'owner' dealer_user with a generated temp password.
 *   - Best-effort: creates default message templates + webhook placeholder.
 *   - Emits agency.dealer_created analytics.
 *
 * When DATABASE_URL is not set, returns a shadow-mode success with a
 * deterministic-ish ID so dev / shadow flows still work.
 */
export async function createDealer(
  input: CreateDealerInput,
): Promise<CreateDealerResult | CreateDealerError> {
  const { name, phone, email, address, branding, sales_hours } = input;

  if (!name || !input.slug) {
    return { ok: false, status: 400, error: "name and slug are required" };
  }

  const cleanSlug = sanitizeSlug(input.slug);
  if (!cleanSlug) {
    return { ok: false, status: 400, error: "slug must contain at least one alphanumeric character" };
  }

  const tempPassword = generateTempPassword();
  const adminEmail = (email ?? `admin@${cleanSlug}.com`).toLowerCase();

  // --------------------------------------------------------------------
  // Shadow-mode (no DATABASE_URL) — return a synthetic dealer record.
  // --------------------------------------------------------------------
  if (!process.env.DATABASE_URL) {
    const id = `00000000-0000-4000-b000-${Date.now().toString(16).padStart(12, "0")}`;
    try {
      trackSystem("agency.dealer_created", id, { name, slug: cleanSlug });
    } catch { /* analytics never blocks */ }

    return {
      ok: true,
      dealer: { id, name, slug: cleanSlug },
      public_url: `/dealers/${cleanSlug}`,
      admin_url: `/admin?dealer=${cleanSlug}`,
      admin_credentials: { email: adminEmail, temp_password: tempPassword },
    };
  }

  try {
    const { query } = await import("@/lib/db");

    // Slug uniqueness pre-check (the unique constraint is a backstop).
    const existing = await query<{ id: string }>(
      `SELECT id FROM dealers WHERE slug = $1`,
      [cleanSlug],
    );
    if (existing.rows.length > 0) {
      return { ok: false, status: 409, error: `Slug "${cleanSlug}" is already taken` };
    }

    // Insert the dealer row.
    const result = await query<{ id: string; name: string; slug: string }>(
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

    const dealer = result.rows[0];

    // Auto-onboarding step 1: default admin user.
    try {
      const { hash } = await import("bcryptjs");
      const passwordHash = await hash(tempPassword, 12);
      await query(
        `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'owner', true, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [dealer.id, adminEmail, `${name} Admin`, passwordHash],
      );
    } catch (err) {
      console.error("[create-dealer] Failed to create default admin:", err);
    }

    // Auto-onboarding step 2: default message templates (best-effort).
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
    } catch { /* non-critical */ }

    // Auto-onboarding step 3: default webhook config (best-effort).
    try {
      await query(
        `INSERT INTO webhook_configs (dealer_id, url, secret, events, active, description, created_at, updated_at)
         VALUES ($1, '', $2, '{*}', false, 'Default webhook — configure URL to activate', NOW(), NOW())`,
        [dealer.id, `whsec_${Date.now().toString(36)}`],
      ).catch(() => { /* table may not exist yet */ });
    } catch { /* non-critical */ }

    try {
      trackSystem("agency.dealer_created", dealer.id, { name, slug: cleanSlug });
    } catch { /* analytics never blocks */ }

    return {
      ok: true,
      dealer,
      public_url: `/dealers/${dealer.slug}`,
      admin_url: `/admin?dealer=${dealer.slug}`,
      admin_credentials: { email: adminEmail, temp_password: tempPassword },
    };
  } catch (err) {
    console.error("[create-dealer] Failed:", err);
    return { ok: false, status: 500, error: "Failed to create dealer" };
  }
}
