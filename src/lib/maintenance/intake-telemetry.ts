/**
 * Maintenance-rails intake telemetry.
 *
 * Single entry-point that maps a GitHub `maint-queue` issue lifecycle event
 * into the platform's existing data + learning mechanism. No data lost:
 *
 *   1. Analytics  — a typed `maintenance.intake.*` event via
 *      `@/lib/analytics-hooks` (persists to analytics_events, the learning
 *      system's source of truth; also fans out to Plausible + outbound
 *      webhooks through the shared tracker).
 *   2. Audit      — an append-only `audit_logs` row via `@/lib/audit-log`.
 *   3. Learning   — the derived cycle-time signal (opened -> resolved) rides
 *      in the analytics metadata on `resolved`, so `@/lib/learning-aggregator`
 *      can consume it (see `getMaintenanceIntakeInsights`). Same feed idiom
 *      every other producer uses: emit -> analytics_events -> aggregator reads.
 *
 * Every side-effect is wrapped so a secondary failure never throws from the
 * caller — this returns a typed {@link IntakeTelemetryResult} even on error,
 * matching the graceful-degradation contract of `@/lib/market-intel/persistence`
 * and `@/lib/touchpoints/dispatcher`.
 */

import {
  trackMaintenanceIntake,
  type MaintenanceIntakeEvent,
} from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";

/**
 * Agency-scoped pseudo-dealer_id used when a maintenance request has no dealer
 * tenancy (the common case — these are internal agency bug/feature requests).
 * Mirrors the `fi_audit` / `assistant` pseudo-tenant convention.
 */
export const MAINTENANCE_TENANT = "wolfpack-maintenance";

export type IntakeRequestType = "bug" | "feature";
export type IntakeAction = "opened" | "triaged" | "resolved";

/** Subsystems whose write can degrade without failing the whole call. */
export type IntakeSubsystem = "analytics" | "audit" | "learning";

/**
 * A GitHub issue lifecycle event for a `maint-queue` issue.
 */
export interface IntakeLifecycleEvent {
  /** GitHub issue number. */
  issueNumber: number;
  /** Whether the request is a bug or a feature. */
  type: IntakeRequestType;
  /** Area / module the request targets (from the issue-template dropdown). */
  category: string;
  /** Lifecycle transition being recorded. */
  action: IntakeAction;
  /** ISO-8601 timestamp the issue was opened. */
  openedAt: string;
  /** ISO-8601 timestamp the issue was resolved (required for `resolved`). */
  resolvedAt?: string;
  /** Severity (bug) or priority (feature) label, if known. */
  severity?: string;
  /** Optional dealer/tenant scope; defaults to the agency pseudo-tenant. */
  dealerId?: string;
  /** Optional actor (GitHub login / user id) for the audit row. */
  actorId?: string;
}

export interface IntakeTelemetryResult {
  /** True when no subsystem degraded. */
  ok: boolean;
  /** The full analytics event name that was emitted. */
  event: MaintenanceIntakeEvent;
  /** The tenant the telemetry was scoped to. */
  dealerId: string;
  /**
   * Derived learning signal: hours from openedAt -> resolvedAt.
   * Non-null only on a `resolved` event with a valid resolvedAt >= openedAt.
   */
  cycleTimeHours: number | null;
  /** Subsystems that failed to write (empty when fully healthy). */
  degraded: IntakeSubsystem[];
}

const ACTION_EVENT: Record<IntakeAction, MaintenanceIntakeEvent> = {
  opened: "maintenance.intake.opened",
  triaged: "maintenance.intake.triaged",
  resolved: "maintenance.intake.resolved",
};

/**
 * Compute cycle-time in hours from open to resolve. Returns null when the
 * inputs are missing or non-sensical (unparseable dates, resolved before
 * opened) so we never feed garbage into the learning signal.
 */
export function computeCycleTimeHours(
  openedAt: string,
  resolvedAt: string | undefined,
): number | null {
  if (!resolvedAt) return null;
  const opened = Date.parse(openedAt);
  const resolved = Date.parse(resolvedAt);
  if (Number.isNaN(opened) || Number.isNaN(resolved)) return null;
  if (resolved < opened) return null;
  return (resolved - opened) / 3_600_000;
}

/**
 * Record a maintenance-intake lifecycle event across analytics, audit, and the
 * learning feed. Never throws — inspect {@link IntakeTelemetryResult.degraded}
 * for partial failures.
 */
export async function recordIntakeEvent(
  evt: IntakeLifecycleEvent,
): Promise<IntakeTelemetryResult> {
  const dealerId = evt.dealerId ?? MAINTENANCE_TENANT;
  const event = ACTION_EVENT[evt.action];
  const degraded: IntakeSubsystem[] = [];

  const cycleTimeHours =
    evt.action === "resolved"
      ? computeCycleTimeHours(evt.openedAt, evt.resolvedAt)
      : null;

  // Shared metadata — flat, primitive-only (analytics contract).
  const meta: Record<string, string | number | boolean> = {
    issue_number: evt.issueNumber,
    request_type: evt.type,
    category: evt.category,
    action: evt.action,
    opened_at: evt.openedAt,
  };
  if (evt.severity) meta.severity = evt.severity;
  if (evt.resolvedAt) meta.resolved_at = evt.resolvedAt;
  // Derived learning signal — carried in analytics_events for the aggregator.
  if (cycleTimeHours !== null) meta.cycle_time_hours = cycleTimeHours;

  // 1. Analytics (primary — also feeds the learning source of truth).
  try {
    trackMaintenanceIntake(event, dealerId, meta);
  } catch (err) {
    console.error("[maintenance/intake-telemetry] analytics failed:", err);
    degraded.push("analytics");
    // The learning feed rides on the analytics write, so if analytics is
    // down the derived signal did not land either.
    if (cycleTimeHours !== null) degraded.push("learning");
  }

  // 2. Audit (append-only hash-chained log).
  try {
    await auditLog(
      event,
      {
        issue_number: evt.issueNumber,
        request_type: evt.type,
        category: evt.category,
        action: evt.action,
        severity: evt.severity ?? null,
        cycle_time_hours: cycleTimeHours,
      },
      evt.actorId,
      dealerId,
    );
  } catch (err) {
    console.error("[maintenance/intake-telemetry] audit failed:", err);
    degraded.push("audit");
  }

  return {
    ok: degraded.length === 0,
    event,
    dealerId,
    cycleTimeHours,
    degraded,
  };
}
