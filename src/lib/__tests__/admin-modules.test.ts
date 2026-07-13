/**
 * Unit tests for the module-gating source of truth (src/lib/admin-modules.ts).
 * This is the single decision both the sidebar (client) and the API guard (server)
 * rely on, so it is pinned hard.
 */
import {
  moduleKeyForHref,
  isModuleVisible,
  canSeeAllModules,
  isKnownModuleKey,
  MODULE_CATALOG,
  ALL_MODULE_KEYS,
  CORE_MODULE_KEYS,
  AGENCY_ROLES,
} from "@/lib/admin-modules";

describe("moduleKeyForHref", () => {
  test.each([
    ["/admin", "dashboard"],
    ["/admin/", "dashboard"],
    ["/admin/payroll", "payroll"],
    ["/admin/inventory/backgrounds", "inventory-backgrounds"],
    ["/admin/vehicles/quick-add", "vehicles-quick-add"],
    ["/admin/compliance/checks", "compliance-checks"],
  ])("%s -> %s", (href, key) => {
    expect(moduleKeyForHref(href)).toBe(key);
  });

  test("every catalog key is unique", () => {
    expect(new Set(ALL_MODULE_KEYS).size).toBe(ALL_MODULE_KEYS.length);
  });
});

describe("isModuleVisible", () => {
  const AGENCY = "admin";
  const DEALER = "sub_dealer";

  test("agency roles always see every module, even with a restrictive allow-list", () => {
    for (const role of AGENCY_ROLES) {
      expect(isModuleVisible(role, ["payroll"], "leads")).toBe(true);
      expect(isModuleVisible(role, [], "payroll")).toBe(true);
    }
  });

  test("null allow-list means all modules (backward compatible)", () => {
    expect(isModuleVisible(DEALER, null, "leads")).toBe(true);
    expect(isModuleVisible(DEALER, undefined, "payroll")).toBe(true);
  });

  test("dealer roles see only enabled modules", () => {
    expect(isModuleVisible(DEALER, ["payroll", "accounting"], "payroll")).toBe(true);
    expect(isModuleVisible(DEALER, ["payroll", "accounting"], "leads")).toBe(false);
  });

  test("CORE modules are always visible to dealer roles, even if not listed", () => {
    for (const core of CORE_MODULE_KEYS) {
      expect(isModuleVisible(DEALER, [], core)).toBe(true);
      expect(isModuleVisible(DEALER, ["payroll"], core)).toBe(true);
    }
  });

  test("empty allow-list hides everything except CORE for a dealer", () => {
    expect(isModuleVisible(DEALER, [], "leads")).toBe(false);
    expect(isModuleVisible(DEALER, [], "dashboard")).toBe(true); // dashboard is CORE
  });

  test("an unknown/undefined role is treated as a gated dealer, not an agency bypass", () => {
    expect(canSeeAllModules(undefined)).toBe(false);
    expect(isModuleVisible(undefined, [], "leads")).toBe(false);
  });
});

describe("catalog integrity", () => {
  test("isKnownModuleKey accepts catalog keys and rejects junk", () => {
    expect(isKnownModuleKey("payroll")).toBe(true);
    expect(isKnownModuleKey("accounting")).toBe(true);
    expect(isKnownModuleKey("not-a-real-module")).toBe(false);
    expect(isKnownModuleKey("")).toBe(false);
  });

  test("every catalog entry has a key derived from its href", () => {
    for (const m of MODULE_CATALOG) {
      expect(m.key).toBe(moduleKeyForHref(m.href));
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.section.length).toBeGreaterThan(0);
    }
  });

  test("dashboard is in the catalog and is CORE", () => {
    expect(ALL_MODULE_KEYS).toContain("dashboard");
    expect(CORE_MODULE_KEYS.has("dashboard")).toBe(true);
  });
});
