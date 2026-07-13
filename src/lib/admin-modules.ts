/**
 * Admin module catalog + per-dealer gating predicate — the single source of truth
 * shared by the sidebar (client render filter), the module-access API + guard
 * (server), and the Settings module picker (client).
 *
 * A "module" is one top-level admin nav item. A dealer's `dealers.enabled_modules`
 * (migration 085) is an allow-list of module KEYS; NULL means "all modules" so
 * existing dealers are unaffected. Agency roles (owner/admin/wolfpack_*) always see
 * everything so they can manage + scale a client up; dealer roles (manager / staff /
 * sub_dealer) see only the enabled set plus the always-on CORE modules.
 *
 * Pure data + pure functions only (no React, no DB) so it imports cleanly on both
 * the server and the client. The `admin-modules-drift.test.ts` guard asserts this
 * catalog stays 1:1 with the sidebar's NAV_SECTIONS, so the two never drift.
 */

/** Roles that bypass module gating entirely (agency operators who manage dealers). */
export const AGENCY_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "wolfpack_admin",
  "wolfpack_operator",
  "wolfpack_viewer",
]);

/** Modules that are always visible even to a gated dealer, so they always have a home. */
export const CORE_MODULE_KEYS: ReadonlySet<string> = new Set(["dashboard"]);

/** Stable module key for a nav href: "/admin" -> "dashboard", "/admin/payroll" ->
 *  "payroll", "/admin/inventory/backgrounds" -> "inventory-backgrounds". */
export function moduleKeyForHref(href: string): string {
  const rest = href.replace(/^\/admin\/?/, "");
  return rest === "" ? "dashboard" : rest.replace(/\//g, "-");
}

export function canSeeAllModules(role: string | undefined | null): boolean {
  return role != null && AGENCY_ROLES.has(role);
}

/**
 * The one gating decision, used by BOTH the sidebar and the server guard.
 * `enabledModules` is the dealer's allow-list, or null/undefined for "all".
 */
export function isModuleVisible(
  role: string | undefined | null,
  enabledModules: readonly string[] | null | undefined,
  moduleKey: string,
): boolean {
  if (canSeeAllModules(role)) return true;
  if (enabledModules == null) return true; // NULL = all modules (backward compatible)
  return CORE_MODULE_KEYS.has(moduleKey) || enabledModules.includes(moduleKey);
}

export interface ModuleCatalogEntry {
  key: string;
  href: string;
  label: string;
  section: string;
}

// [section, href, label] — MUST mirror NAV_SECTIONS in components/AdminSidebar.tsx.
// The admin-modules-drift.test.ts guard fails CI if they diverge.
const RAW_MODULES: ReadonlyArray<readonly [string, string, string]> = [
  // Dashboard
  ["dashboard", "/admin", "Dashboard"],
  ["dashboard", "/admin/alerts", "Engagement Alerts"],
  ["dashboard", "/admin/analytics", "Analytics"],
  ["dashboard", "/admin/session-replay", "Session Replay"],
  ["dashboard", "/admin/heatmaps", "Heatmaps"],
  ["dashboard", "/admin/surveys", "Surveys"],
  ["dashboard", "/admin/user-testing", "User Testing"],
  ["dashboard", "/admin/funnel-health", "Funnel Health"],
  ["dashboard", "/admin/analytics-brain", "Brain"],
  ["dashboard", "/admin/market-intelligence", "Market Intelligence"],
  ["dashboard", "/admin/reports", "Reports"],
  // Sales
  ["sales", "/admin/leads", "Leads"],
  ["sales", "/admin/lead-ingestion", "Lead Ingestion"],
  ["sales", "/admin/engagement-reports", "Engagement Reports"],
  ["sales", "/admin/good-faith", "Good Faith"],
  ["sales", "/admin/desking", "F&I Desking"],
  ["sales", "/admin/erating", "F&I eRating"],
  ["sales", "/admin/deals", "Deal Desking"],
  ["sales", "/admin/fi-products", "F&I Products"],
  ["sales", "/admin/digital-retail", "Digital Retail"],
  ["sales", "/admin/econtracting", "eContracting"],
  ["sales", "/admin/pricing", "Pricing"],
  ["sales", "/admin/equity-mining", "Equity Mining"],
  ["sales", "/admin/propensity", "Propensity Scoring"],
  ["sales", "/admin/drip-campaigns", "Drip Campaigns"],
  ["sales", "/admin/call-intelligence", "Call Intelligence"],
  // Inventory
  ["inventory", "/admin/inventory", "Inventory"],
  ["inventory", "/admin/inventory/backgrounds", "Photo Backgrounds"],
  ["inventory", "/admin/vehicles/quick-add", "Quick Add"],
  ["inventory", "/admin/vehicles/new", "Add Vehicle"],
  ["inventory", "/admin/intake", "Intake"],
  ["inventory", "/admin/trade-in", "Trade-Ins"],
  ["inventory", "/admin/floor-plan", "Floor Plan"],
  ["inventory", "/admin/vehicle-history", "Vehicle History"],
  ["inventory", "/admin/syndication", "Syndication"],
  ["inventory", "/admin/deliveries", "Deliveries"],
  ["inventory", "/admin/walkarounds", "Walkarounds"],
  ["inventory", "/admin/vehicle-pipeline", "Vehicle Pipeline"],
  // Finance
  ["finance", "/admin/lenders", "Lenders"],
  ["finance", "/admin/lender-routing", "Lender Routing"],
  ["finance", "/admin/credit", "Credit Bureau"],
  ["finance", "/admin/accounting", "Accounting"],
  ["finance", "/admin/payments", "Payments"],
  ["finance", "/admin/payroll", "Payroll"],
  ["finance", "/admin/reinsurance", "Reinsurance"],
  // Service
  ["service", "/admin/service", "Service & Parts"],
  // Customers
  ["customers", "/admin/customers", "Customers"],
  ["customers", "/admin/comms", "Comms"],
  ["customers", "/admin/sms", "SMS Messaging"],
  ["customers", "/admin/reviews", "Reviews"],
  ["customers", "/admin/rewards", "Rewards"],
  ["customers", "/admin/marketing", "Marketing"],
  ["customers", "/admin/competitive", "Competitive Intel"],
  ["customers", "/admin/reputation", "Reputation"],
  ["customers", "/admin/households", "Households"],
  ["customers", "/admin/omnichannel", "Omnichannel"],
  // Operations
  ["operations", "/admin/documents", "Documents"],
  ["operations", "/admin/knowledge", "Knowledge Base"],
  ["operations", "/admin/compliance", "Compliance"],
  ["operations", "/admin/compliance/checks", "Compliance Checks"],
  ["operations", "/admin/ofac", "OFAC Screening"],
  ["operations", "/admin/tasks", "Tasks"],
  ["operations", "/admin/change-management", "Change Management"],
  ["operations", "/admin/training", "Training"],
  ["operations", "/admin/resources", "Resources"],
  // Admin
  ["admin", "/admin/settings", "Settings"],
  ["admin", "/admin/team", "Team"],
  ["admin", "/admin/security", "Security"],
  ["admin", "/admin/system", "System Health"],
  ["admin", "/admin/error-monitor", "Error Monitor"],
  ["admin", "/admin/billing", "Billing"],
  ["admin", "/admin/webhooks", "Webhooks"],
  ["admin", "/admin/onboarding", "Onboarding"],
  ["admin", "/admin/oem", "OEM Network"],
  ["admin", "/admin/agency", "Agency"],
  ["admin", "/admin/data-export", "Data Export"],
  ["admin", "/admin/privacy", "Privacy"],
];

/** Every gate-able admin module, in nav order. */
export const MODULE_CATALOG: ReadonlyArray<ModuleCatalogEntry> = RAW_MODULES.map(
  ([section, href, label]) => ({ key: moduleKeyForHref(href), href, label, section }),
);

export const ALL_MODULE_KEYS: ReadonlyArray<string> = MODULE_CATALOG.map((m) => m.key);

const KEY_SET = new Set(ALL_MODULE_KEYS);
export function isKnownModuleKey(key: string): boolean {
  return KEY_SET.has(key);
}

/** Section id -> its modules, for grouped rendering in the Settings picker. */
export function modulesBySection(): Record<string, ModuleCatalogEntry[]> {
  const out: Record<string, ModuleCatalogEntry[]> = {};
  for (const m of MODULE_CATALOG) (out[m.section] ??= []).push(m);
  return out;
}
