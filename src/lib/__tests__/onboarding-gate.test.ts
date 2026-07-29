import { shouldFunnelToOnboarding } from "@/lib/onboarding-gate";

describe("shouldFunnelToOnboarding", () => {
  it("redirects the dashboard landing pages when onboarding is incomplete", () => {
    expect(shouldFunnelToOnboarding("/admin", "false")).toBe(true);
    expect(shouldFunnelToOnboarding("/admin/dashboard", "false")).toBe(true);
  });

  it("does NOT trap the pages the onboarding checklist links to (the bug)", () => {
    // These were unreachable before the fix, so a dealer could never invite a
    // teammate, add a vehicle, or view analytics while onboarding was pending.
    for (const p of [
      "/admin/team",
      "/admin/vehicles/new",
      "/admin/analytics",
      "/admin/settings",
      "/admin/deals",
    ]) {
      expect(shouldFunnelToOnboarding(p, "false")).toBe(false);
    }
  });

  it("never redirects when onboarding is complete or the cookie is absent", () => {
    expect(shouldFunnelToOnboarding("/admin", "true")).toBe(false);
    expect(shouldFunnelToOnboarding("/admin", undefined)).toBe(false);
    expect(shouldFunnelToOnboarding("/admin/dashboard", "true")).toBe(false);
  });

  it("does not redirect the onboarding pages themselves", () => {
    expect(shouldFunnelToOnboarding("/admin/getting-started", "false")).toBe(false);
    expect(shouldFunnelToOnboarding("/admin/onboarding", "false")).toBe(false);
  });
});
