/**
 * Who may manage dealers from the agency console.
 *
 * This was `["owner"]` on /api/admin/dealers, and it made
 * /admin/agency/new-dealer unusable for everybody. Every real person on the
 * account holds `admin`; `owner` existed only on three test and demo rows.
 * `requireRole` is a flat `includes()` with no hierarchy, so `admin` was
 * refused, the form reported "Failed to create dealer (403)", and no client
 * could be onboarded through the page built for onboarding clients.
 *
 * Widening it is not a loosening. /api/admin/bulk-provision already creates
 * dealers under `["owner", "admin"]`, so an admin could always create them,
 * just not through the supported UI. The narrow gate blocked the reviewed path
 * while leaving the bulk one open, which is the worst of both arrangements.
 *
 * One definition, imported by every dealer-management route, so the console and
 * its endpoints cannot disagree about who is allowed to use them again.
 */
export const AGENCY_DEALER_ROLES: string[] = ["owner", "admin"];
