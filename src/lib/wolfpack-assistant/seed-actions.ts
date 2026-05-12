/**
 * Starter Action Registry — 17 hand-curated actions across the platform.
 *
 * Authored deterministically from docs/wolfpack-assistant-integration-
 * 2026-05-12.md. The CLI seeder at scripts/seed-assistant-actions.ts
 * upserts these into the assistant_actions table.
 *
 * Adding an action: append below + bump the test count expectations in
 * src/lib/wolfpack-assistant/__tests__/seed-actions.test.ts.
 *
 * Naming convention: `<category>.<verb>_<object>` — lowercase + dots + underscores.
 * Side-effect class drives the safety gate; choose carefully.
 */

import type { CreateActionInput } from "./types";

export const SEED_ACTIONS: ReadonlyArray<CreateActionInput> = [
  // -------------------- leads --------------------
  {
    slug: "leads.update_routing_rule",
    display_name: "Update lead routing rule",
    description:
      "Change which sales rep gets which new leads. Set up round-robin, first-available, or balanced routing across the team.",
    parameter_schema: {
      type: "object",
      properties: {
        strategy: { type: "string", enum: ["round_robin", "first_available", "balanced", "manual"] },
        rep_ids: { type: "array", items: { type: "string" } },
      },
      required: ["strategy"],
    },
    allowed_roles: ["gm", "sales_manager", "marketing", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "leads",
  },
  {
    slug: "leads.assign_lead",
    display_name: "Assign a lead to a salesperson",
    description: "Manually assign a new or existing lead to a specific salesperson.",
    parameter_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        salesperson_id: { type: "string" },
      },
      required: ["lead_id", "salesperson_id"],
    },
    allowed_roles: ["bdc_agent", "sales_manager", "gm", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "leads",
  },

  // -------------------- F&I --------------------
  {
    slug: "fi.reorder_product_menu",
    display_name: "Reorder the F&I product menu",
    description: "Reorder the F&I product menu — promote or demote products like tire-and-wheel, GAP, or service contracts.",
    parameter_schema: {
      type: "object",
      properties: {
        ordered_product_slugs: { type: "array", items: { type: "string" } },
      },
      required: ["ordered_product_slugs"],
    },
    allowed_roles: ["fi_manager", "gm", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "fi",
  },
  {
    slug: "fi.set_attach_target",
    display_name: "Set an F&I attach-rate target",
    description: "Set an attach-rate target for an F&I product so the dashboard surfaces progress toward it.",
    parameter_schema: {
      type: "object",
      properties: {
        product_slug: { type: "string" },
        target_pct: { type: "number", minimum: 0, maximum: 100 },
      },
      required: ["product_slug", "target_pct"],
    },
    allowed_roles: ["fi_manager", "gm", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "fi",
  },
  {
    slug: "audit.run_fi_penetration",
    display_name: "Run an F&I penetration audit",
    description: "Run an F&I penetration audit on recent deals and surface where attach gaps are leaking gross profit.",
    parameter_schema: {
      type: "object",
      properties: {
        window_days: { type: "number", minimum: 1, maximum: 365 },
      },
    },
    allowed_roles: ["fi_manager", "gm", "owner", "admin"],
    side_effect: "read",
    dry_run_supported: false,
    category: "audit",
  },

  // -------------------- service --------------------
  {
    slug: "service.update_hours",
    display_name: "Update service department hours",
    description: "Update the service department operating hours used by online booking and customer comms.",
    parameter_schema: {
      type: "object",
      properties: {
        day_of_week: {
          type: "string",
          enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        },
        open_time: { type: "string" },
        close_time: { type: "string" },
      },
      required: ["day_of_week", "open_time", "close_time"],
    },
    allowed_roles: ["service_manager", "gm", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "service",
  },
  {
    slug: "service.add_special_closure",
    display_name: "Add a special service closure",
    description: "Add a special closure date for service — holidays, weather, training. Blocks online booking automatically.",
    parameter_schema: {
      type: "object",
      properties: {
        date: { type: "string", format: "date" },
        reason: { type: "string" },
      },
      required: ["date"],
    },
    allowed_roles: ["service_manager", "gm", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "service",
  },

  // -------------------- inventory --------------------
  {
    slug: "inventory.feature_vehicle",
    display_name: "Feature a vehicle on the homepage",
    description: "Move a vehicle to the homepage hero rotation so it gets top-of-fold visibility.",
    parameter_schema: {
      type: "object",
      properties: {
        vehicle_id: { type: "string" },
        position: { type: "number", minimum: 1, maximum: 10 },
      },
      required: ["vehicle_id"],
    },
    allowed_roles: ["sales_manager", "gm", "marketing", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "inventory",
  },
  {
    slug: "inventory.adjust_price",
    display_name: "Adjust a vehicle price",
    description: "Reprice a vehicle on the lot. Most useful for aged inventory or competitive market shifts.",
    parameter_schema: {
      type: "object",
      properties: {
        vehicle_id: { type: "string" },
        new_price: { type: "number", minimum: 0 },
      },
      required: ["vehicle_id", "new_price"],
    },
    allowed_roles: ["sales_manager", "gm", "owner", "admin"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "inventory",
  },

  // -------------------- comms / email --------------------
  {
    slug: "email.draft_followup",
    display_name: "Draft a customer follow-up email",
    description: "Draft a follow-up email for a customer interaction — test drive, trade-in evaluation, or service visit.",
    parameter_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        interaction_type: {
          type: "string",
          enum: ["test_drive", "trade_in", "service", "general"],
        },
      },
      required: ["interaction_type"],
    },
    allowed_roles: ["salesperson", "bdc_agent", "fi_manager", "service_advisor", "admin"],
    side_effect: "read",
    dry_run_supported: false,
    category: "marketing",
  },

  // -------------------- notifications --------------------
  {
    slug: "notifications.mute_after_hours",
    display_name: "Stop after-hours notifications",
    description: "Stop notifying me after working hours so I'm not pinged at night and on weekends.",
    parameter_schema: {
      type: "object",
      properties: {
        start_hour: { type: "number", minimum: 0, maximum: 23 },
        end_hour: { type: "number", minimum: 0, maximum: 23 },
        days: { type: "array", items: { type: "string" } },
      },
    },
    allowed_roles: ["any"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "notifications",
  },
  {
    slug: "notifications.subscribe_alert",
    display_name: "Subscribe to a specific alert",
    description: "Sign up for a specific dashboard alert — slow leads, aged inventory, missed F&I attach targets.",
    parameter_schema: {
      type: "object",
      properties: {
        alert_slug: { type: "string" },
        channel: { type: "string", enum: ["email", "sms", "in_app"] },
      },
      required: ["alert_slug", "channel"],
    },
    allowed_roles: ["any"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "notifications",
  },

  // -------------------- analytics --------------------
  {
    slug: "analytics.show_my_funnel",
    display_name: "Show my lead conversion funnel",
    description: "Show me how my leads are converting — from inquiry to test drive to deal — over the last 30 days.",
    parameter_schema: {
      type: "object",
      properties: {
        window_days: { type: "number", minimum: 1, maximum: 365 },
      },
    },
    allowed_roles: ["salesperson", "bdc_agent", "fi_manager", "sales_manager", "gm", "admin"],
    side_effect: "read",
    dry_run_supported: false,
    category: "analytics",
  },
  {
    slug: "analytics.compare_to_peer",
    display_name: "Compare my numbers to top performers",
    description: "How am I doing compared to top performers in my role — anonymized peer benchmarks.",
    parameter_schema: {
      type: "object",
      properties: {
        metric: { type: "string" },
      },
    },
    allowed_roles: ["any"],
    side_effect: "read",
    dry_run_supported: false,
    category: "analytics",
  },

  // -------------------- learning --------------------
  {
    slug: "learning.suggest_training",
    display_name: "Suggest training to improve my numbers",
    description: "What training would help me improve my numbers — short courses tied to my weakest metric.",
    parameter_schema: {
      type: "object",
      properties: {
        focus_area: { type: "string" },
      },
    },
    allowed_roles: ["any"],
    side_effect: "read",
    dry_run_supported: false,
    category: "learning",
  },
  {
    slug: "learning.explain_metric",
    display_name: "Explain a metric in dealership language",
    description: "Explain what a dashboard metric means in plain dealership language — what it is, why it matters, what to do.",
    parameter_schema: {
      type: "object",
      properties: {
        metric_slug: { type: "string" },
      },
      required: ["metric_slug"],
    },
    allowed_roles: ["any"],
    side_effect: "read",
    dry_run_supported: false,
    category: "learning",
  },

  // -------------------- general / admin --------------------
  {
    slug: "general.update_my_profile",
    display_name: "Update my profile",
    description: "Update my display name, email, or phone number on the platform.",
    parameter_schema: {
      type: "object",
      properties: {
        display_name: { type: "string" },
        email: { type: "string", format: "email" },
        phone: { type: "string" },
      },
    },
    allowed_roles: ["any"],
    side_effect: "mutating",
    dry_run_supported: true,
    category: "general",
  },
];

export interface AssistantSeedResult {
  actions: number;
}

/**
 * Idempotent seeder. Upserts every SEED_ACTIONS entry by slug.
 * Re-running produces the same end state, no duplicates.
 */
export async function seedAssistantActions(): Promise<AssistantSeedResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed assistant actions");
  }
  const { upsertActionBySlug } = await import("./action-registry");
  for (const seed of SEED_ACTIONS) {
    await upsertActionBySlug(seed);
  }
  return { actions: SEED_ACTIONS.length };
}
