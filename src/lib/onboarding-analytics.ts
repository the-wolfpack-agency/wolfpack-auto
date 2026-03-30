/**
 * Onboarding Analytics — tracks wizard completion, drop-off,
 * and post-onboarding checklist engagement.
 *
 * All events follow the platform's existing analytics structure
 * and persist via analytics_events in PostgreSQL.
 *
 * Usage from API routes / server actions:
 *   import { trackOnboardingStep, trackChecklistProgress } from "@/lib/onboarding-analytics";
 *   trackOnboardingStep(dealerId, 2, "branding", 14500);
 *
 * Usage from client (via EventCollector):
 *   track("onboarding", "step_viewed", { step_index: 2, step_name: "branding" });
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OnboardingEvent {
  event_type: string;
  dealer_id: string;
  timestamp: string;
  metadata: Record<string, string | number | boolean>;
}

export interface OnboardingFunnelStep {
  step_index: number;
  step_name: string;
  started_count: number;
  completed_count: number;
  avg_duration_ms: number;
  drop_off_rate: number;
}

export interface OnboardingFunnel {
  total_started: number;
  total_completed: number;
  completion_rate: number;
  avg_total_duration_ms: number;
  steps: OnboardingFunnelStep[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ONBOARDING_STEPS = [
  "dealership_info",
  "branding",
  "import_inventory",
  "team_setup",
  "review_launch",
] as const;

type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

/* ------------------------------------------------------------------ */
/*  Internal: persist event to PostgreSQL                              */
/* ------------------------------------------------------------------ */

async function persistOnboardingEvent(event: OnboardingEvent): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO analytics_events
         (event_type, action, page, session_id, user_fingerprint, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [
        "onboarding",
        event.event_type,
        event.dealer_id,
        "server",
        "server",
        JSON.stringify({ dealer_id: event.dealer_id, ...event.metadata }),
        event.timestamp,
      ],
    );
  } catch (err) {
    console.error(
      `[onboarding-analytics] Failed to persist "${event.event_type}":`,
      err,
    );
    // Never throw — analytics must not break the request flow
  }
}

/* ------------------------------------------------------------------ */
/*  Public tracking functions                                          */
/* ------------------------------------------------------------------ */

/**
 * Track a wizard step being viewed or completed.
 *
 * @param dealerId - The dealer's UUID
 * @param stepIndex - 0-based step index
 * @param stepName - Human-readable step name
 * @param durationMs - Time spent on the step in milliseconds (0 for step_viewed)
 */
export function trackOnboardingStep(
  dealerId: string,
  stepIndex: number,
  stepName: string,
  durationMs: number,
): void {
  const event: OnboardingEvent = {
    event_type: durationMs > 0 ? "onboarding.step_completed" : "onboarding.step_viewed",
    dealer_id: dealerId,
    timestamp: new Date().toISOString(),
    metadata: {
      step_index: stepIndex,
      step_name: stepName,
      duration_ms: durationMs,
      total_steps: ONBOARDING_STEPS.length,
    },
  };
  // Fire-and-forget
  void persistOnboardingEvent(event);
}

/**
 * Track onboarding wizard completion (all steps done + launched).
 *
 * @param dealerId - The dealer's UUID
 * @param totalDurationMs - Total time from first step to launch
 * @param teamSize - Number of team members invited
 * @param inventoryMethod - csv | dms | manual
 */
export function trackOnboardingComplete(
  dealerId: string,
  totalDurationMs: number,
  teamSize: number,
  inventoryMethod: string,
): void {
  const event: OnboardingEvent = {
    event_type: "onboarding.completed",
    dealer_id: dealerId,
    timestamp: new Date().toISOString(),
    metadata: {
      total_duration_ms: totalDurationMs,
      team_size: teamSize,
      inventory_method: inventoryMethod,
      steps_count: ONBOARDING_STEPS.length,
    },
  };
  void persistOnboardingEvent(event);
}

/**
 * Track drop-off — user abandoned onboarding at a specific step.
 *
 * @param dealerId - The dealer's UUID
 * @param lastStepIndex - The last step the user was on before abandoning
 * @param lastStepName - Name of the last step
 * @param totalDurationMs - Total time spent before abandoning
 */
export function trackOnboardingDropOff(
  dealerId: string,
  lastStepIndex: number,
  lastStepName: string,
  totalDurationMs: number,
): void {
  const event: OnboardingEvent = {
    event_type: "onboarding.drop_off",
    dealer_id: dealerId,
    timestamp: new Date().toISOString(),
    metadata: {
      last_step_index: lastStepIndex,
      last_step_name: lastStepName,
      total_duration_ms: totalDurationMs,
      completion_pct: Math.round(
        (lastStepIndex / ONBOARDING_STEPS.length) * 100,
      ),
    },
  };
  void persistOnboardingEvent(event);
}

/**
 * Track post-onboarding checklist progress.
 *
 * @param dealerId - The dealer's UUID
 * @param completedSteps - Number of completed checklist items
 * @param totalSteps - Total checklist items
 * @param justCompleted - The item ID that was just completed (if any)
 */
export function trackChecklistProgress(
  dealerId: string,
  completedSteps: number,
  totalSteps: number,
  justCompleted?: string,
): void {
  const event: OnboardingEvent = {
    event_type: "onboarding.checklist_progress",
    dealer_id: dealerId,
    timestamp: new Date().toISOString(),
    metadata: {
      completed_steps: completedSteps,
      total_steps: totalSteps,
      progress_pct: Math.round((completedSteps / totalSteps) * 100),
      ...(justCompleted ? { just_completed: justCompleted } : {}),
      all_done: completedSteps >= totalSteps,
    },
  };
  void persistOnboardingEvent(event);
}

/**
 * Track milestone events (first vehicle added, first lead, etc.).
 *
 * @param dealerId - The dealer's UUID
 * @param milestone - Milestone name
 * @param timeSinceOnboardingMs - Milliseconds since onboarding was completed
 */
export function trackOnboardingMilestone(
  dealerId: string,
  milestone: string,
  timeSinceOnboardingMs: number,
): void {
  const event: OnboardingEvent = {
    event_type: "onboarding.milestone",
    dealer_id: dealerId,
    timestamp: new Date().toISOString(),
    metadata: {
      milestone,
      time_since_onboarding_ms: timeSinceOnboardingMs,
      time_since_onboarding_hours: Math.round(
        timeSinceOnboardingMs / 3_600_000,
      ),
    },
  };
  void persistOnboardingEvent(event);
}

/* ------------------------------------------------------------------ */
/*  Funnel aggregation (server-side)                                   */
/* ------------------------------------------------------------------ */

/**
 * Build an onboarding funnel report from stored analytics events.
 *
 * Queries the analytics_events table for all onboarding events and
 * aggregates them into a funnel showing drop-off at each step.
 */
export async function getOnboardingFunnel(): Promise<OnboardingFunnel> {
  const emptyFunnel: OnboardingFunnel = {
    total_started: 0,
    total_completed: 0,
    completion_rate: 0,
    avg_total_duration_ms: 0,
    steps: ONBOARDING_STEPS.map((name, index) => ({
      step_index: index,
      step_name: name,
      started_count: 0,
      completed_count: 0,
      avg_duration_ms: 0,
      drop_off_rate: 0,
    })),
  };

  if (!process.env.DATABASE_URL) return emptyFunnel;

  try {
    const { query } = await import("@/lib/db");

    // Get step-level metrics
    const stepResult = await query<{
      step_name: string;
      step_index: number;
      started: string;
      completed: string;
      avg_duration: string;
    }>(
      `SELECT
         (metadata->>'step_name')::text AS step_name,
         (metadata->>'step_index')::int AS step_index,
         COUNT(*) FILTER (WHERE action = 'onboarding.step_viewed')::text AS started,
         COUNT(*) FILTER (WHERE action = 'onboarding.step_completed')::text AS completed,
         COALESCE(
           AVG((metadata->>'duration_ms')::numeric)
             FILTER (WHERE action = 'onboarding.step_completed'),
           0
         )::text AS avg_duration
       FROM analytics_events
       WHERE event_type = 'onboarding'
         AND action IN ('onboarding.step_viewed', 'onboarding.step_completed')
       GROUP BY step_name, step_index
       ORDER BY step_index`,
    );

    // Get completion metrics
    const completionResult = await query<{
      total_started: string;
      total_completed: string;
      avg_total_duration: string;
    }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE action = 'onboarding.step_viewed'
             AND (metadata->>'step_index')::int = 0
         )::text AS total_started,
         COUNT(*) FILTER (
           WHERE action = 'onboarding.completed'
         )::text AS total_completed,
         COALESCE(
           AVG((metadata->>'total_duration_ms')::numeric)
             FILTER (WHERE action = 'onboarding.completed'),
           0
         )::text AS avg_total_duration
       FROM analytics_events
       WHERE event_type = 'onboarding'`,
    );

    const totals = completionResult.rows[0];
    const totalStarted = parseInt(totals?.total_started ?? "0", 10);
    const totalCompleted = parseInt(totals?.total_completed ?? "0", 10);

    const steps: OnboardingFunnelStep[] = ONBOARDING_STEPS.map(
      (name, index) => {
        const row = stepResult.rows.find((r) => r.step_index === index);
        const started = parseInt(row?.started ?? "0", 10);
        const completed = parseInt(row?.completed ?? "0", 10);

        return {
          step_index: index,
          step_name: name,
          started_count: started,
          completed_count: completed,
          avg_duration_ms: Math.round(parseFloat(row?.avg_duration ?? "0")),
          drop_off_rate:
            started > 0
              ? Math.round(((started - completed) / started) * 100)
              : 0,
        };
      },
    );

    return {
      total_started: totalStarted,
      total_completed: totalCompleted,
      completion_rate:
        totalStarted > 0
          ? Math.round((totalCompleted / totalStarted) * 100)
          : 0,
      avg_total_duration_ms: Math.round(
        parseFloat(totals?.avg_total_duration ?? "0"),
      ),
      steps,
    };
  } catch (err) {
    console.error("[onboarding-analytics] Failed to build funnel:", err);
    return emptyFunnel;
  }
}
