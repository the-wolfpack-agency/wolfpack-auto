/**
 * GET /api/admin/onboarding/status
 *
 * Returns the post-onboarding checklist status for the authenticated dealer.
 * Each step includes its ID, a plain-language label, completion flag, and
 * the admin page where the user can complete it.
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackChecklistProgress } from "@/lib/onboarding-analytics";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  link: string;
}

interface ChecklistResponse {
  steps: ChecklistStep[];
  progress: number;
  completed: boolean;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);

  // Shadow mode (no DB) — return all-unchecked except dealership
  if (!process.env.DATABASE_URL) {
    const steps = buildSteps({
      hasVehicles: false,
      hasBranding: false,
      hasTeamMembers: false,
      hasDms: false,
      hasVisitedAnalytics: false,
      hasNotificationPrefs: false,
    });
    const completedCount = steps.filter((s) => s.completed).length;
    return NextResponse.json({
      steps,
      progress: Math.round((completedCount / steps.length) * 100),
      completed: completedCount === steps.length,
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Run all checks in parallel for speed
    const [
      vehicleResult,
      brandingResult,
      teamResult,
      dmsResult,
      analyticsVisitResult,
      notificationResult,
    ] = await Promise.all([
      // 1. Has at least one vehicle?
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM vehicles WHERE dealer_id = $1`,
        [dealerId],
      ),

      // 2. Has customized branding (logo or non-default color)?
      query<{ has_branding: boolean }>(
        `SELECT (
           logo_url IS NOT NULL
           OR primary_color IS NOT NULL AND primary_color != '#0070c7'
         ) AS has_branding
         FROM dealers
         WHERE id = $1`,
        [dealerId],
      ),

      // 3. Has more than 1 team member (the owner + at least one invite)?
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM dealer_users WHERE dealer_id = $1`,
        [dealerId],
      ),

      // 4. Has DMS connected?
      query<{ has_dms: boolean }>(
        `SELECT (
           dms_provider IS NOT NULL
           AND dms_provider != ''
         ) AS has_dms
         FROM dealers
         WHERE id = $1`,
        [dealerId],
      ),

      // 5. Has visited the analytics page? (check analytics_events)
      query<{ visited: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM analytics_events
           WHERE (metadata->>'dealer_id') = $1
             AND page LIKE '%analytics%'
           LIMIT 1
         ) AS visited`,
        [dealerId],
      ),

      // 6. Has notification preferences set?
      query<{ has_prefs: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM dealer_settings
           WHERE dealer_id = $1
             AND (
               notify_new_lead = true
               OR notify_new_review = true
               OR notify_low_inventory = true
             )
         ) AS has_prefs`,
        [dealerId],
      ),
    ]);

    const hasVehicles = parseInt(vehicleResult.rows[0]?.count ?? "0", 10) > 0;
    const hasBranding = brandingResult.rows[0]?.has_branding ?? false;
    const hasTeamMembers =
      parseInt(teamResult.rows[0]?.count ?? "0", 10) > 1;
    const hasDms = dmsResult.rows[0]?.has_dms ?? false;
    const hasVisitedAnalytics =
      analyticsVisitResult.rows[0]?.visited ?? false;
    const hasNotificationPrefs =
      notificationResult.rows[0]?.has_prefs ?? false;

    const steps = buildSteps({
      hasVehicles,
      hasBranding,
      hasTeamMembers,
      hasDms,
      hasVisitedAnalytics,
      hasNotificationPrefs,
    });

    const completedCount = steps.filter((s) => s.completed).length;
    const progress = Math.round((completedCount / steps.length) * 100);
    const allDone = completedCount === steps.length;

    // Track this status check for engagement analytics (fire-and-forget)
    trackChecklistProgress(dealerId, completedCount, steps.length);

    return NextResponse.json({
      steps,
      progress,
      completed: allDone,
    });
  } catch (err) {
    console.error("[onboarding/status] Error:", err);
    return NextResponse.json(
      { error: "Failed to load onboarding status" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Step builder                                                       */
/* ------------------------------------------------------------------ */

interface StepFlags {
  hasVehicles: boolean;
  hasBranding: boolean;
  hasTeamMembers: boolean;
  hasDms: boolean;
  hasVisitedAnalytics: boolean;
  hasNotificationPrefs: boolean;
}

function buildSteps(flags: StepFlags): ChecklistStep[] {
  return [
    {
      id: "create_dealership",
      label: "Create your dealership",
      description: "Your dealership profile is set up and ready to go.",
      completed: true, // Always done if they finished onboarding
      link: "/admin/settings",
    },
    {
      id: "add_vehicle",
      label: "Add your first vehicle",
      description:
        "List at least one vehicle so customers can browse your inventory.",
      completed: flags.hasVehicles,
      link: "/admin/vehicles/new",
    },
    {
      id: "customize_branding",
      label: "Customize your branding",
      description:
        "Upload your logo and set your brand colors to match your dealership.",
      completed: flags.hasBranding,
      link: "/admin/settings",
    },
    {
      id: "invite_team",
      label: "Invite a team member",
      description:
        "Add your sales team, managers, or staff so they can access the admin panel.",
      completed: flags.hasTeamMembers,
      link: "/admin/team",
    },
    {
      id: "connect_dms",
      label: "Connect your DMS",
      description:
        "Link your dealer management system for automatic inventory and lead syncing.",
      completed: flags.hasDms,
      link: "/admin/settings",
    },
    {
      id: "review_analytics",
      label: "Check out your analytics",
      description:
        "See how visitors interact with your site and where your leads come from.",
      completed: flags.hasVisitedAnalytics,
      link: "/admin/analytics",
    },
    {
      id: "setup_notifications",
      label: "Set up notifications",
      description:
        "Choose how you want to be notified about new leads, reviews, and inventory alerts.",
      completed: flags.hasNotificationPrefs,
      link: "/admin/settings",
    },
  ];
}
