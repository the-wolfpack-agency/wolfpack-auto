/**
 * Onboarding-redirect decision, extracted so it is unit-testable in isolation
 * (the middleware itself does auth + tenant + CSP and is awkward to exercise).
 *
 * A dealer with incomplete onboarding is funneled to /admin/getting-started,
 * but ONLY from the dashboard landing pages. Deep admin routes — including the
 * very pages the onboarding checklist links to (/admin/team, /admin/vehicles/new,
 * /admin/analytics, /admin/settings) — must never redirect, or those steps are
 * impossible to reach. Trapping /admin/team is exactly what blocked inviting a
 * teammate.
 */
export function shouldFunnelToOnboarding(
  pathname: string,
  onboardingCompleteCookie: string | undefined,
): boolean {
  const isDashboardLanding =
    pathname === "/admin" || pathname === "/admin/dashboard";
  return isDashboardLanding && onboardingCompleteCookie === "false";
}
