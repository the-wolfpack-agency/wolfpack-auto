/**
 * Automated Email Drip Campaigns — Behavior-Triggered
 *
 * Define multi-step email sequences triggered by customer behavior.
 * Supports enrollment, step advancement, conversion tracking,
 * and unsubscribe handling.
 *
 * Persists to PostgreSQL (drip_campaigns + campaign_enrollments from migration 052).
 * Falls back to in-memory Maps when DATABASE_URL is not set (shadow mode).
 */

import { query } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DripTrigger =
  | "lead_created"
  | "vehicle_viewed_3x"
  | "form_abandoned"
  | "no_activity_7d"
  | "price_drop_on_viewed_vehicle";

export interface DripStep {
  stepNumber: number;
  subject: string;
  bodyTemplate: string;
  delayHours: number; // hours after previous step (or enrollment)
  condition?: string; // optional condition to check before sending
}

export interface DripCampaign {
  id: string;
  dealerId: string;
  name: string;
  trigger: DripTrigger;
  steps: DripStep[];
  active: boolean;
  createdAt: string;
  stats: CampaignStats;
}

export interface CampaignStats {
  totalEnrolled: number;
  totalConverted: number;
  totalUnsubscribed: number;
  emailsSent: number;
  conversionRate: number;
}

export type EnrollmentStatus = "active" | "completed" | "converted" | "unsubscribed";

export interface DripEnrollment {
  id: string;
  campaignId: string;
  leadId: string;
  email: string;
  currentStep: number;
  status: EnrollmentStatus;
  enrolledAt: string;
  lastEmailSentAt: string | null;
  nextEmailDueAt: string | null;
  convertedAt: string | null;
}

export interface BehaviorEvent {
  leadId: string;
  event: DripTrigger;
  metadata: Record<string, string | number | boolean>;
  timestamp: string;
}

export interface EmailToSend {
  enrollmentId: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  email: string;
  stepNumber: number;
  subject: string;
  body: string;
}

/* ------------------------------------------------------------------ */
/*  In-memory stores (shadow mode fallback)                            */
/* ------------------------------------------------------------------ */

const campaigns = new Map<string, DripCampaign>();
const enrollments = new Map<string, DripEnrollment>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(prefix: string = "drip"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function useDb(): boolean {
  return !!process.env.DATABASE_URL;
}

function rowToCampaign(row: Record<string, unknown>): DripCampaign {
  const steps = typeof row.steps === "string" ? JSON.parse(row.steps) : (row.steps as DripStep[]) ?? [];
  const stats = typeof row.stats === "string" ? JSON.parse(row.stats) : (row.stats as CampaignStats) ?? defaultStats();
  return {
    id: row.id as string,
    dealerId: row.dealer_id as string,
    name: row.name as string,
    trigger: row.trigger as DripTrigger,
    steps,
    active: row.active as boolean,
    createdAt: typeof row.created_at === "string" ? row.created_at : (row.created_at as Date).toISOString(),
    stats,
  };
}

function rowToEnrollment(row: Record<string, unknown>): DripEnrollment {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    leadId: row.lead_id as string,
    email: (row.email as string) ?? "",
    currentStep: row.current_step as number,
    status: row.status as EnrollmentStatus,
    enrolledAt: typeof row.enrolled_at === "string" ? row.enrolled_at : (row.enrolled_at as Date).toISOString(),
    lastEmailSentAt: row.last_sent_at ? (typeof row.last_sent_at === "string" ? row.last_sent_at : (row.last_sent_at as Date).toISOString()) : null,
    nextEmailDueAt: row.next_email_due_at ? (typeof row.next_email_due_at === "string" ? row.next_email_due_at : (row.next_email_due_at as Date).toISOString()) : null,
    convertedAt: row.converted_at ? (typeof row.converted_at === "string" ? row.converted_at : (row.converted_at as Date).toISOString()) : null,
  };
}

function defaultStats(): CampaignStats {
  return { totalEnrolled: 0, totalConverted: 0, totalUnsubscribed: 0, emailsSent: 0, conversionRate: 0 };
}

function updateConversionRate(campaign: DripCampaign): void {
  campaign.stats.conversionRate =
    campaign.stats.totalEnrolled > 0
      ? Math.round((campaign.stats.totalConverted / campaign.stats.totalEnrolled) * 100)
      : 0;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a new drip campaign.
 */
export async function createCampaign(config: {
  dealerId: string;
  name: string;
  trigger: DripTrigger;
  steps: DripStep[];
}): Promise<DripCampaign> {
  const campaign: DripCampaign = {
    id: generateId("camp"),
    dealerId: config.dealerId,
    name: config.name,
    trigger: config.trigger,
    steps: config.steps.map((s, i) => ({ ...s, stepNumber: i + 1 })),
    active: true,
    createdAt: new Date().toISOString(),
    stats: defaultStats(),
  };

  if (useDb()) {
    try {
      await query(
        `INSERT INTO drip_campaigns (id, dealer_id, name, trigger, steps, active, stats, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [
          campaign.id,
          campaign.dealerId,
          campaign.name,
          campaign.trigger,
          JSON.stringify(campaign.steps),
          campaign.active,
          JSON.stringify(campaign.stats),
          campaign.createdAt,
        ],
      );
      return campaign;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB write failed, using in-memory:", (err as Error).message);
    }
  }

  campaigns.set(campaign.id, campaign);
  return campaign;
}

/**
 * Evaluate trigger events against active campaigns and enroll
 * matching leads.
 */
export async function evaluateTriggers(
  events: BehaviorEvent[],
  activeCampaigns?: DripCampaign[],
): Promise<DripEnrollment[]> {
  let campaignList: DripCampaign[];

  if (activeCampaigns) {
    campaignList = activeCampaigns;
  } else if (useDb()) {
    try {
      const result = await query(`SELECT * FROM drip_campaigns WHERE active = true`, []);
      campaignList = result.rows.map(rowToCampaign);
    } catch {
      campaignList = [...campaigns.values()].filter((c) => c.active);
    }
  } else {
    campaignList = [...campaigns.values()].filter((c) => c.active);
  }

  const newEnrollments: DripEnrollment[] = [];

  for (const event of events) {
    for (const campaign of campaignList) {
      if (campaign.trigger !== event.event) continue;

      // Check if already enrolled
      let alreadyEnrolled = false;
      if (useDb()) {
        try {
          const result = await query(
            `SELECT id FROM campaign_enrollments
             WHERE campaign_id = $1 AND lead_id = $2 AND status IN ('active', 'completed')
             LIMIT 1`,
            [campaign.id, event.leadId],
          );
          alreadyEnrolled = result.rows.length > 0;
        } catch {
          alreadyEnrolled = [...enrollments.values()].some(
            (e) =>
              e.campaignId === campaign.id &&
              e.leadId === event.leadId &&
              (e.status === "active" || e.status === "completed"),
          );
        }
      } else {
        alreadyEnrolled = [...enrollments.values()].some(
          (e) =>
            e.campaignId === campaign.id &&
            e.leadId === event.leadId &&
            (e.status === "active" || e.status === "completed"),
        );
      }
      if (alreadyEnrolled) continue;

      const enrollment = await enrollLead(campaign.id, event.leadId, event.metadata.email as string ?? `${event.leadId}@example.com`);
      newEnrollments.push(enrollment);
    }
  }

  return newEnrollments;
}

/**
 * Enroll a lead in a campaign.
 */
export async function enrollLead(
  campaignId: string,
  leadId: string,
  email: string,
): Promise<DripEnrollment> {
  let campaign: DripCampaign | null = null;

  if (useDb()) {
    try {
      const result = await query(`SELECT * FROM drip_campaigns WHERE id = $1`, [campaignId]);
      if (result.rows.length > 0) campaign = rowToCampaign(result.rows[0]);
    } catch {
      campaign = campaigns.get(campaignId) ?? null;
    }
  } else {
    campaign = campaigns.get(campaignId) ?? null;
  }

  const now = new Date();
  const firstStep = campaign?.steps[0];
  const delayHours = firstStep?.delayHours ?? 24;
  const nextDue = new Date(now.getTime() + delayHours * 60 * 60 * 1000);

  const enrollment: DripEnrollment = {
    id: generateId("enr"),
    campaignId,
    leadId,
    email,
    currentStep: 0,
    status: "active",
    enrolledAt: now.toISOString(),
    lastEmailSentAt: null,
    nextEmailDueAt: nextDue.toISOString(),
    convertedAt: null,
  };

  if (useDb()) {
    try {
      await query(
        `INSERT INTO campaign_enrollments (id, campaign_id, dealer_id, lead_id, email, current_step, status, enrolled_at, last_sent_at, next_email_due_at, converted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          enrollment.id,
          enrollment.campaignId,
          campaign?.dealerId ?? "",
          enrollment.leadId,
          enrollment.email,
          enrollment.currentStep,
          enrollment.status,
          enrollment.enrolledAt,
          enrollment.lastEmailSentAt,
          enrollment.nextEmailDueAt,
          enrollment.convertedAt,
        ],
      );

      // Update campaign stats
      if (campaign) {
        campaign.stats.totalEnrolled++;
        updateConversionRate(campaign);
        await query(
          `UPDATE drip_campaigns SET stats = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(campaign.stats), campaignId],
        ).catch(() => {});
      }

      return enrollment;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB enrollment write failed, using in-memory:", (err as Error).message);
    }
  }

  enrollments.set(enrollment.id, enrollment);
  if (campaign) {
    campaign.stats.totalEnrolled++;
    updateConversionRate(campaign);
  }

  return enrollment;
}

/**
 * Advance enrollments — find due emails and prepare them for sending.
 * Returns the list of emails that should be sent now.
 */
export async function advanceEnrollments(
  now?: Date,
): Promise<EmailToSend[]> {
  const currentTime = (now ?? new Date()).getTime();
  const emailsToSend: EmailToSend[] = [];

  if (useDb()) {
    try {
      const result = await query(
        `SELECT e.*, c.name as campaign_name, c.steps as campaign_steps
         FROM campaign_enrollments e
         JOIN drip_campaigns c ON c.id = e.campaign_id
         WHERE e.status = 'active' AND e.next_email_due_at IS NOT NULL AND e.next_email_due_at <= $1`,
        [new Date(currentTime).toISOString()],
      );

      for (const row of result.rows) {
        const enrollment = rowToEnrollment(row);
        const steps = typeof row.campaign_steps === "string" ? JSON.parse(row.campaign_steps as string) : (row.campaign_steps as DripStep[]);
        const step = steps[enrollment.currentStep];

        if (!step) {
          // All steps completed
          await query(
            `UPDATE campaign_enrollments SET status = 'completed', next_email_due_at = NULL WHERE id = $1`,
            [enrollment.id],
          );
          continue;
        }

        const body = step.bodyTemplate
          .replace(/\{\{lead_id\}\}/g, enrollment.leadId)
          .replace(/\{\{email\}\}/g, enrollment.email);

        emailsToSend.push({
          enrollmentId: enrollment.id,
          campaignId: enrollment.campaignId,
          campaignName: row.campaign_name as string,
          leadId: enrollment.leadId,
          email: enrollment.email,
          stepNumber: step.stepNumber,
          subject: step.subject,
          body,
        });

        // Advance enrollment
        const newStep = enrollment.currentStep + 1;
        const nextStep = steps[newStep];
        const nextDue = nextStep
          ? new Date(currentTime + nextStep.delayHours * 60 * 60 * 1000).toISOString()
          : null;
        const newStatus = nextStep ? "active" : "completed";

        await query(
          `UPDATE campaign_enrollments
           SET current_step = $1, last_sent_at = $2, next_email_due_at = $3, status = $4
           WHERE id = $5`,
          [newStep, new Date(currentTime).toISOString(), nextDue, newStatus, enrollment.id],
        );

        // Update campaign stats
        await query(
          `UPDATE drip_campaigns SET stats = jsonb_set(stats, '{emailsSent}', to_jsonb((stats->>'emailsSent')::int + 1)), updated_at = NOW() WHERE id = $1`,
          [enrollment.campaignId],
        ).catch(() => {});
      }

      return emailsToSend;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB advance failed, using in-memory:", (err as Error).message);
    }
  }

  // In-memory fallback
  for (const enrollment of enrollments.values()) {
    if (enrollment.status !== "active") continue;
    if (!enrollment.nextEmailDueAt) continue;

    const dueTime = new Date(enrollment.nextEmailDueAt).getTime();
    if (dueTime > currentTime) continue;

    const campaign = campaigns.get(enrollment.campaignId);
    if (!campaign) continue;

    const nextStepIndex = enrollment.currentStep;
    const step = campaign.steps[nextStepIndex];
    if (!step) {
      enrollment.status = "completed";
      enrollment.nextEmailDueAt = null;
      continue;
    }

    const body = step.bodyTemplate
      .replace(/\{\{lead_id\}\}/g, enrollment.leadId)
      .replace(/\{\{email\}\}/g, enrollment.email);

    emailsToSend.push({
      enrollmentId: enrollment.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      leadId: enrollment.leadId,
      email: enrollment.email,
      stepNumber: step.stepNumber,
      subject: step.subject,
      body,
    });

    enrollment.currentStep++;
    enrollment.lastEmailSentAt = new Date(currentTime).toISOString();
    campaign.stats.emailsSent++;

    const nextStep = campaign.steps[enrollment.currentStep];
    if (nextStep) {
      enrollment.nextEmailDueAt = new Date(
        currentTime + nextStep.delayHours * 60 * 60 * 1000,
      ).toISOString();
    } else {
      enrollment.status = "completed";
      enrollment.nextEmailDueAt = null;
    }
  }

  return emailsToSend;
}

/**
 * Get enrollment status for a lead across all campaigns.
 */
export async function getEnrollmentStatus(leadId: string): Promise<DripEnrollment[]> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM campaign_enrollments WHERE lead_id = $1`,
        [leadId],
      );
      return result.rows.map(rowToEnrollment);
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return [...enrollments.values()].filter((e) => e.leadId === leadId);
}

/**
 * Mark a lead as converted.
 */
export async function markConverted(leadId: string, campaignId: string): Promise<DripEnrollment | null> {
  if (useDb()) {
    try {
      const result = await query(
        `UPDATE campaign_enrollments
         SET status = 'converted', converted_at = NOW(), next_email_due_at = NULL
         WHERE lead_id = $1 AND campaign_id = $2
         RETURNING *`,
        [leadId, campaignId],
      );
      if (result.rows.length > 0) {
        // Update campaign stats
        await query(
          `UPDATE drip_campaigns SET stats = jsonb_set(
            jsonb_set(stats, '{totalConverted}', to_jsonb((stats->>'totalConverted')::int + 1)),
            '{conversionRate}',
            to_jsonb(CASE WHEN (stats->>'totalEnrolled')::int > 0
              THEN round(((stats->>'totalConverted')::int + 1)::numeric / (stats->>'totalEnrolled')::int * 100)
              ELSE 0 END)
          ), updated_at = NOW() WHERE id = $1`,
          [campaignId],
        ).catch(() => {});
        return rowToEnrollment(result.rows[0]);
      }
      return null;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB markConverted failed, using in-memory:", (err as Error).message);
    }
  }

  for (const enrollment of enrollments.values()) {
    if (enrollment.leadId === leadId && enrollment.campaignId === campaignId) {
      enrollment.status = "converted";
      enrollment.convertedAt = new Date().toISOString();
      enrollment.nextEmailDueAt = null;

      const campaign = campaigns.get(campaignId);
      if (campaign) {
        campaign.stats.totalConverted++;
        updateConversionRate(campaign);
      }
      return enrollment;
    }
  }
  return null;
}

/**
 * Unsubscribe a lead from a campaign.
 */
export async function unsubscribe(leadId: string, campaignId: string): Promise<DripEnrollment | null> {
  if (useDb()) {
    try {
      const result = await query(
        `UPDATE campaign_enrollments
         SET status = 'unsubscribed', next_email_due_at = NULL
         WHERE lead_id = $1 AND campaign_id = $2
         RETURNING *`,
        [leadId, campaignId],
      );
      if (result.rows.length > 0) {
        await query(
          `UPDATE drip_campaigns SET stats = jsonb_set(
            stats, '{totalUnsubscribed}', to_jsonb((stats->>'totalUnsubscribed')::int + 1)
          ), updated_at = NOW() WHERE id = $1`,
          [campaignId],
        ).catch(() => {});
        return rowToEnrollment(result.rows[0]);
      }
      return null;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB unsubscribe failed, using in-memory:", (err as Error).message);
    }
  }

  for (const enrollment of enrollments.values()) {
    if (enrollment.leadId === leadId && enrollment.campaignId === campaignId) {
      enrollment.status = "unsubscribed";
      enrollment.nextEmailDueAt = null;

      const campaign = campaigns.get(campaignId);
      if (campaign) {
        campaign.stats.totalUnsubscribed++;
        updateConversionRate(campaign);
      }
      return enrollment;
    }
  }
  return null;
}

/**
 * Get a campaign by ID.
 */
export async function getCampaign(campaignId: string): Promise<DripCampaign | null> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM drip_campaigns WHERE id = $1`,
        [campaignId],
      );
      if (result.rows.length > 0) return rowToCampaign(result.rows[0]);
      return null;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return campaigns.get(campaignId) ?? null;
}

/**
 * List all campaigns for a dealer.
 */
export async function listCampaigns(dealerId: string): Promise<DripCampaign[]> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM drip_campaigns WHERE dealer_id = $1 ORDER BY created_at DESC`,
        [dealerId],
      );
      return result.rows.map(rowToCampaign);
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return [...campaigns.values()]
    .filter((c) => c.dealerId === dealerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Toggle campaign active state.
 */
export async function toggleCampaign(campaignId: string): Promise<DripCampaign | null> {
  if (useDb()) {
    try {
      const result = await query(
        `UPDATE drip_campaigns SET active = NOT active, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [campaignId],
      );
      if (result.rows.length > 0) return rowToCampaign(result.rows[0]);
      return null;
    } catch (err: unknown) {
      console.warn("[drip-campaigns] DB toggle failed, using in-memory:", (err as Error).message);
    }
  }

  const campaign = campaigns.get(campaignId);
  if (!campaign) return null;
  campaign.active = !campaign.active;
  return campaign;
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  campaigns.clear();
  enrollments.clear();
}
