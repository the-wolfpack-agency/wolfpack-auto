/**
 * Realistic dealer phrasings — used by the integration test for the
 * intent mapper. Every entry maps a free-text prompt to the action_slug
 * the mapper should pick as best_match, plus an optional minimum
 * confidence and optional expected_params.
 *
 * Coverage target: all 17 SEED_ACTIONS.
 * Vocabulary: dealership-native ("F&I" not "finance", "deals" not
 * "transactions", "lot" not "inventory display area").
 *
 * Pass rate target (integration test): 80%+ of phrasings must match
 * correctly (best_match.action_slug === expected_slug AND
 * confidence >= confidence_min).
 */

import type { AssistantRole } from "../../../types";

export interface DealerPhrasing {
  prompt: string;
  expected_slug: string;
  /** Optional minimum best_match confidence — defaults to 0.3. */
  confidence_min?: number;
  /** Optional expected extracted parameters (subset match). */
  expected_params?: Record<string, string | number | boolean>;
  /** Role for the matcher context; defaults to "admin". */
  role?: AssistantRole;
  /** Optional notes for humans reading the fixture. */
  notes?: string;
}

export const DEALER_PHRASINGS: ReadonlyArray<DealerPhrasing> = [
  // -------------------- leads.update_routing_rule (4) --------------------
  {
    prompt: "route the next 5 leads to maria",
    expected_slug: "leads.update_routing_rule",
    expected_params: { rep_name: "maria", count: 5 },
    role: "gm",
  },
  {
    prompt: "switch lead routing to round robin",
    expected_slug: "leads.update_routing_rule",
    expected_params: { strategy: "round_robin" },
    role: "sales_manager",
  },
  {
    prompt: "set up balanced lead distribution",
    expected_slug: "leads.update_routing_rule",
    expected_params: { strategy: "balanced" },
    role: "sales_manager",
  },
  {
    prompt: "change how leads get assigned to first available",
    expected_slug: "leads.update_routing_rule",
    expected_params: { strategy: "first_available" },
    role: "gm",
  },

  // -------------------- leads.assign_lead (2) --------------------
  {
    prompt: "assign this lead to dave",
    expected_slug: "leads.assign_lead",
    role: "bdc_agent",
  },
  {
    prompt: "give this prospect to the next salesperson",
    expected_slug: "leads.assign_lead",
    role: "sales_manager",
  },

  // -------------------- fi.reorder_product_menu (2) --------------------
  {
    prompt: "reorder the F&I menu so GAP is first",
    expected_slug: "fi.reorder_product_menu",
    expected_params: { product_slug: "gap" },
    role: "fi_manager",
  },
  {
    prompt: "promote tire and wheel up the menu",
    expected_slug: "fi.reorder_product_menu",
    expected_params: { product_slug: "tire_and_wheel" },
    role: "fi_manager",
  },

  // -------------------- fi.set_attach_target (3) --------------------
  {
    prompt: "set GAP attach target to 60%",
    expected_slug: "fi.set_attach_target",
    expected_params: { target_pct: 60, product_slug: "gap" },
    role: "fi_manager",
  },
  {
    prompt: "change service contract penetration target to 45 percent",
    expected_slug: "fi.set_attach_target",
    expected_params: { target_pct: 45, product_slug: "service_contract" },
    role: "fi_manager",
  },
  {
    prompt: "bump up the prepaid maintenance attach goal to 30%",
    expected_slug: "fi.set_attach_target",
    expected_params: { target_pct: 30 },
    role: "gm",
  },

  // -------------------- audit.run_fi_penetration (4) --------------------
  {
    prompt: "what's my F&I attach rate looking like",
    expected_slug: "audit.run_fi_penetration",
    role: "fi_manager",
    confidence_min: 0.4,
  },
  {
    prompt: "run an F&I penetration audit on last 30 days",
    expected_slug: "audit.run_fi_penetration",
    expected_params: { window_days: 30 },
    role: "fi_manager",
  },
  {
    prompt: "audit F&I performance over the past 90 days",
    expected_slug: "audit.run_fi_penetration",
    expected_params: { window_days: 90 },
    role: "gm",
  },
  {
    prompt: "check F I product penetration",
    expected_slug: "audit.run_fi_penetration",
    role: "fi_manager",
  },

  // -------------------- service.update_hours (3) --------------------
  {
    prompt: "update service hours for monday to 8am-6pm",
    expected_slug: "service.update_hours",
    expected_params: { day_of_week: "mon" },
    role: "service_manager",
  },
  {
    prompt: "change saturday service hours to open at 9am and close at 3pm",
    expected_slug: "service.update_hours",
    expected_params: { day_of_week: "sat" },
    role: "service_manager",
  },
  {
    prompt: "i need to update service hours for tomorrow",
    expected_slug: "service.update_hours",
    role: "service_manager",
    confidence_min: 0.4,
  },

  // -------------------- service.add_special_closure (2) --------------------
  {
    prompt: "add a service closure for 2026-12-25",
    expected_slug: "service.add_special_closure",
    expected_params: { date: "2026-12-25" },
    role: "service_manager",
  },
  {
    prompt: "schedule a holiday closure for thanksgiving",
    expected_slug: "service.add_special_closure",
    role: "service_manager",
  },

  // -------------------- inventory.feature_vehicle (3) --------------------
  {
    prompt: "feature this F-150 on the homepage",
    expected_slug: "inventory.feature_vehicle",
    role: "marketing",
  },
  {
    prompt: "put the Tahoe in the homepage hero",
    expected_slug: "inventory.feature_vehicle",
    role: "sales_manager",
  },
  {
    prompt: "promote the silverado on the lot to top spot",
    expected_slug: "inventory.feature_vehicle",
    role: "sales_manager",
  },

  // -------------------- inventory.adjust_price (3) --------------------
  {
    prompt: "drop the price on stock 12345 to $24,999",
    expected_slug: "inventory.adjust_price",
    expected_params: { new_price: 24999 },
    role: "sales_manager",
  },
  {
    prompt: "reprice the aged F-150 to $32500",
    expected_slug: "inventory.adjust_price",
    expected_params: { new_price: 32500 },
    role: "gm",
  },
  {
    prompt: "set new price on this vehicle to $19,750",
    expected_slug: "inventory.adjust_price",
    expected_params: { new_price: 19750 },
    role: "sales_manager",
  },

  // -------------------- email.draft_followup (3) --------------------
  {
    prompt: "draft an email to the customer who came in yesterday",
    expected_slug: "email.draft_followup",
    role: "salesperson",
  },
  {
    prompt: "write a follow up message to my last test drive lead",
    expected_slug: "email.draft_followup",
    role: "salesperson",
  },
  {
    prompt: "compose a service follow-up email for the customer",
    expected_slug: "email.draft_followup",
    role: "service_advisor",
  },

  // -------------------- notifications.mute_after_hours (3) --------------------
  {
    prompt: "stop notifying me after work hours",
    expected_slug: "notifications.mute_after_hours",
    role: "salesperson",
    confidence_min: 0.4,
  },
  {
    prompt: "don't ping me at night or on weekends",
    expected_slug: "notifications.mute_after_hours",
    role: "fi_manager",
  },
  {
    prompt: "mute notifications outside business hours",
    expected_slug: "notifications.mute_after_hours",
    role: "salesperson",
  },

  // -------------------- notifications.subscribe_alert (2) --------------------
  {
    prompt: "alert me when leads slow down via sms",
    expected_slug: "notifications.subscribe_alert",
    expected_params: { channel: "sms" },
    role: "sales_manager",
  },
  {
    prompt: "subscribe me to aged inventory alerts in email",
    expected_slug: "notifications.subscribe_alert",
    expected_params: { channel: "email" },
    role: "gm",
  },

  // -------------------- analytics.show_my_funnel (4) --------------------
  {
    prompt: "show me leads from this week",
    expected_slug: "analytics.show_my_funnel",
    role: "salesperson",
  },
  {
    prompt: "view my conversion funnel for the past 30 days",
    expected_slug: "analytics.show_my_funnel",
    expected_params: { window_days: 30 },
    role: "salesperson",
  },
  {
    prompt: "pull my lead funnel numbers",
    expected_slug: "analytics.show_my_funnel",
    role: "bdc_agent",
  },
  {
    prompt: "how are my leads converting",
    expected_slug: "analytics.show_my_funnel",
    role: "salesperson",
    confidence_min: 0.3,
  },

  // -------------------- analytics.compare_to_peer (3) --------------------
  {
    prompt: "compare my numbers to top performers",
    expected_slug: "analytics.compare_to_peer",
    role: "salesperson",
  },
  {
    prompt: "how do my deals stack up against my peers",
    expected_slug: "analytics.compare_to_peer",
    role: "salesperson",
  },
  {
    prompt: "benchmark my close rate against other reps",
    expected_slug: "analytics.compare_to_peer",
    role: "salesperson",
  },

  // -------------------- learning.suggest_training (3) --------------------
  {
    prompt: "suggest training to improve my close rate",
    expected_slug: "learning.suggest_training",
    role: "salesperson",
  },
  {
    prompt: "what course would help me sell more GAP",
    expected_slug: "learning.suggest_training",
    role: "fi_manager",
  },
  {
    prompt: "recommend coaching for my weakest metric",
    expected_slug: "learning.suggest_training",
    role: "salesperson",
  },

  // -------------------- learning.explain_metric (3) --------------------
  {
    prompt: "what is gross PVR",
    expected_slug: "learning.explain_metric",
    role: "salesperson",
  },
  {
    prompt: "explain the F&I attach rate metric to me",
    expected_slug: "learning.explain_metric",
    role: "fi_manager",
  },
  {
    prompt: "define what days-to-sale means",
    expected_slug: "learning.explain_metric",
    role: "salesperson",
  },

  // -------------------- general.update_my_profile (3) --------------------
  {
    prompt: "update my profile email to homyk@thewolfpack.agency",
    expected_slug: "general.update_my_profile",
    expected_params: { email: "homyk@thewolfpack.agency" },
    role: "salesperson",
  },
  {
    prompt: "change my phone number to 555-123-4567",
    expected_slug: "general.update_my_profile",
    expected_params: { phone: "555-123-4567" },
    role: "salesperson",
  },
  {
    prompt: "fix my display name in my profile",
    expected_slug: "general.update_my_profile",
    role: "salesperson",
  },
];

/**
 * Total fixture count exposed for the integration assertion.
 */
export const TOTAL_PHRASINGS = DEALER_PHRASINGS.length;
