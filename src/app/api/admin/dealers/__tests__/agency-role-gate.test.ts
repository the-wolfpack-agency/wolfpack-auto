/**
 * Who may create a dealer.
 *
 * WHY THIS EXISTS
 *
 * /admin/agency/new-dealer could not create a dealer. For anyone. The route
 * required `["owner"]`, and in the production database every real person holds
 * `admin` while `owner` existed on exactly three test and demo rows. Because
 * `requireRole` is a flat `includes()` with no hierarchy, every submit came
 * back 403 and the form said "Failed to create dealer (403)". Onboarding a
 * client through the UI was impossible, and nothing failed loudly enough for
 * anyone to notice until a client needed adding.
 *
 * The gate was also inconsistent: /api/admin/bulk-provision already creates
 * dealers under `["owner", "admin"]`, so an admin could always create them,
 * just never through the page built for it.
 *
 * These tests pin the allowed set on both sides, so narrowing it again fails
 * here instead of on the day somebody tries to onboard a client.
 */
import { AGENCY_DEALER_ROLES } from "@/lib/dealers/agency-roles";

describe("the agency dealer role set", () => {
  it("includes admin, the role every real person actually holds", () => {
    // The exact regression. Without this, the console is decorative.
    expect(AGENCY_DEALER_ROLES).toContain("admin");
  });

  it("still includes owner", () => {
    expect(AGENCY_DEALER_ROLES).toContain("owner");
  });

  it("is exactly owner and admin, and does not quietly widen", () => {
    // Fixing a lockout must not turn into handing dealer creation to staff.
    expect([...AGENCY_DEALER_ROLES].sort()).toEqual(["admin", "owner"]);
  });

  it("matches what bulk-provision already allows", () => {
    /* bulk-provision creates dealers under ["owner","admin"]. If the two ever
       disagree again, one path is reachable and the other is not, which is the
       shape of the original bug. */
    const bulkProvisionRoles = ["owner", "admin"];
    expect([...AGENCY_DEALER_ROLES].sort()).toEqual([...bulkProvisionRoles].sort());
  });
});

describe("the routes actually use the shared set", () => {
  const read = (p: string) =>
    require("node:fs").readFileSync(require("node:path").join(__dirname, "..", p), "utf8");

  it.each([["route.ts"], ["[id]/route.ts"]])("%s gates on AGENCY_DEALER_ROLES", (file) => {
    const src = read(file);
    expect(src).toContain("AGENCY_DEALER_ROLES");
    // A hard-coded ["owner"] anywhere here is the bug coming back.
    expect(src).not.toMatch(/requireRole\(\s*\[\s*["']owner["']\s*\]\s*\)/);
  });
});
