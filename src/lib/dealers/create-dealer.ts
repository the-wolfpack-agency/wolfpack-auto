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

import { randomBytes } from "crypto";
import { trackSystem } from "@/lib/analytics-hooks";
import { sendTeamInvite } from "@/lib/notifications";

export interface CreateDealerInput {
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: Record<string, string>;
  branding?: Record<string, string>;
  sales_hours?: unknown[];
  /**
   * Logo as a base64 data URL, matching how /api/admin/settings/logo already
   * stores it in dealers.logo_url. A data URL is what lets the new-dealer form
   * carry a logo at all: the file is chosen before the dealer exists, so there
   * is no row to attach an upload to yet.
   */
  logo_url?: string;
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
  /**
   * The invite sent to the new dealer's admin.
   *
   * Creating a dealer used to mint a temp password and print it on screen for
   * somebody to relay by hand. Every other product here (Instinct, the Porsche
   * Experience OS) emails an invite link and lets the person set their own
   * password, and this now does the same through the same sendTeamInvite path
   * the onboarding wizard already uses.
   *
   * `accept_url` is returned either way. When no mailbox is configured the send
   * is skipped rather than faked, and the operator gets a link to pass on.
   */
  invite: {
    email: string;
    accept_url: string;
    delivered: boolean;
    reason?: string;
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

/** Same limits the upload endpoint enforces, so both paths agree. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

/**
 * Accept a logo data URL only if it is one, of an allowed type, and small enough.
 *
 * The value arrives from a browser, so the client-side checks are a convenience
 * and this is the one that counts. Returns null for anything unusable rather
 * than throwing: a bad logo must not stop a dealer being created.
 */
export function validateLogoDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  const m = /^data:([a-z+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!m) return null;
  if (!LOGO_TYPES.includes(m[1].toLowerCase())) return null;
  // 4 base64 chars per 3 bytes; ignore padding.
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > LOGO_MAX_BYTES) return null;
  return value;
}

/**
 * Generate a one-time temporary password for the auto-created admin.
 * Format: Wp<base36-time>! — meets the project's password validator.
 */
export function generateTempPassword(): string {
  // CSPRNG-backed: 6 random bytes → base36-ish suffix (security-sensitive credential).
  const r = randomBytes(6).toString("base64url").slice(0, 8);
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
  const logoUrl = validateLogoDataUrl(input.logo_url);

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
      invite: { email: adminEmail, accept_url: "", delivered: false, reason: "shadow_mode" },
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
      `INSERT INTO dealers (name, slug, subdomain, phone, email, address, branding, sales_hours, logo_url, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
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
        logoUrl,
      ],
    );

    const dealer = result.rows[0];

    /* Auto-onboarding step 1: the dealer's admin, invited rather than issued a
       password. The row starts inactive with an invite token; accepting it at
       /admin/accept-invite is what sets a password and activates the account.
       Same shape the onboarding wizard writes, so one accept flow serves both. */
    const inviteToken = randomBytes(32).toString("hex");
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    /* False when the address already had an account, which DO NOTHING leaves
       untouched. No invite is sent in that case: the token was never stored,
       so a link would not work, and claiming one was sent is worse than
       saying plainly that the person already has an account. */
    let adminRowCreated = false;
    try {
      const adminInsert = await query(
        /* DO NOTHING, never DO UPDATE.
       *
       * This used to set dealer_id = EXCLUDED.dealer_id and role = 'owner' on
       * conflict. When the address already belonged to somebody, creating a
       * dealer silently MOVED that person to the new dealer and changed their
       * role. A real account was pulled out of its own workspace by somebody
       * onboarding a client with their address, and they signed in to an empty
       * tenant. Creating a dealer must never touch an account that already
       * exists. */
      `INSERT INTO dealer_users (dealer_id, email, name, password_hash, role, is_active,
                                   invite_token, invite_expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, 'owner', false, $4, $5, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [dealer.id, adminEmail, `${name} Admin`, inviteToken, inviteExpiresAt.toISOString()],
      );
      adminRowCreated = (adminInsert.rowCount ?? 0) > 0;
    } catch (err) {
      console.error("[create-dealer] Failed to create default admin:", err);
    }

    /* Send it. A failed send must never fail the dealer: the token is stored,
       the link comes back in the response, and it can be resent. */
    let invite = {
      email: adminEmail,
      accept_url: "",
      delivered: false,
      reason: "send_failed" as string | undefined,
    };
    if (!adminRowCreated) {
      /* The address already had an account, so nothing was created and no token
         was stored. Say so rather than reporting an invite that does not exist. */
      invite = {
        email: adminEmail,
        accept_url: "",
        delivered: false,
        reason: "account_exists",
      };
    } else try {
      const res = await sendTeamInvite({
        inviteeEmail: adminEmail,
        inviteeName: `${name} Admin`,
        role: "owner",
        inviterName: "Wolfpack Auto",
        dealerName: name,
        inviteToken,
        dealerId: dealer.id,
      });
      invite = {
        email: adminEmail,
        accept_url: res.acceptUrl,
        delivered: Boolean(res.delivered),
        reason: res.delivered ? undefined : res.reason,
      };
    } catch (err) {
      console.error("[create-dealer] Failed to send invite email:", err);
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
      invite,
    };
  } catch (err) {
    console.error("[create-dealer] Failed:", err);
    return { ok: false, status: 500, error: "Failed to create dealer" };
  }
}
