/**
 * Automated Email Drip Campaigns — Behavior-Triggered
 *
 * Define multi-step email sequences triggered by customer behavior.
 * Supports enrollment, step advancement, conversion tracking,
 * and unsubscribe handling.
 */

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
/*  In-memory stores (shadow mode)                                     */
/* ------------------------------------------------------------------ */

const campaigns = new Map<string, DripCampaign>();
const enrollments = new Map<string, DripEnrollment>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(prefix: string = "drip"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a new drip campaign.
 */
export function createCampaign(config: {
  dealerId: string;
  name: string;
  trigger: DripTrigger;
  steps: DripStep[];
}): DripCampaign {
  const campaign: DripCampaign = {
    id: generateId("camp"),
    dealerId: config.dealerId,
    name: config.name,
    trigger: config.trigger,
    steps: config.steps.map((s, i) => ({ ...s, stepNumber: i + 1 })),
    active: true,
    createdAt: new Date().toISOString(),
    stats: {
      totalEnrolled: 0,
      totalConverted: 0,
      totalUnsubscribed: 0,
      emailsSent: 0,
      conversionRate: 0,
    },
  };
  campaigns.set(campaign.id, campaign);
  return campaign;
}

/**
 * Evaluate trigger events against active campaigns and enroll
 * matching leads.
 */
export function evaluateTriggers(
  events: BehaviorEvent[],
  activeCampaigns?: DripCampaign[],
): DripEnrollment[] {
  const campaignList = activeCampaigns ?? [...campaigns.values()].filter((c) => c.active);
  const newEnrollments: DripEnrollment[] = [];

  for (const event of events) {
    for (const campaign of campaignList) {
      if (campaign.trigger !== event.event) continue;

      // Check if already enrolled
      const alreadyEnrolled = [...enrollments.values()].some(
        (e) =>
          e.campaignId === campaign.id &&
          e.leadId === event.leadId &&
          (e.status === "active" || e.status === "completed"),
      );
      if (alreadyEnrolled) continue;

      const enrollment = enrollLead(campaign.id, event.leadId, event.metadata.email as string ?? `${event.leadId}@example.com`);
      newEnrollments.push(enrollment);
    }
  }

  return newEnrollments;
}

/**
 * Enroll a lead in a campaign.
 */
export function enrollLead(
  campaignId: string,
  leadId: string,
  email: string,
): DripEnrollment {
  const campaign = campaigns.get(campaignId);
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
export function advanceEnrollments(
  now?: Date,
): EmailToSend[] {
  const currentTime = (now ?? new Date()).getTime();
  const emailsToSend: EmailToSend[] = [];

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
      // All steps completed
      enrollment.status = "completed";
      enrollment.nextEmailDueAt = null;
      continue;
    }

    // Prepare the email
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

    // Advance the enrollment
    enrollment.currentStep++;
    enrollment.lastEmailSentAt = new Date(currentTime).toISOString();
    campaign.stats.emailsSent++;

    // Schedule next step
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
export function getEnrollmentStatus(leadId: string): DripEnrollment[] {
  return [...enrollments.values()].filter((e) => e.leadId === leadId);
}

/**
 * Mark a lead as converted.
 */
export function markConverted(leadId: string, campaignId: string): DripEnrollment | null {
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
export function unsubscribe(leadId: string, campaignId: string): DripEnrollment | null {
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
export function getCampaign(campaignId: string): DripCampaign | null {
  return campaigns.get(campaignId) ?? null;
}

/**
 * List all campaigns for a dealer.
 */
export function listCampaigns(dealerId: string): DripCampaign[] {
  return [...campaigns.values()]
    .filter((c) => c.dealerId === dealerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Toggle campaign active state.
 */
export function toggleCampaign(campaignId: string): DripCampaign | null {
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function updateConversionRate(campaign: DripCampaign): void {
  campaign.stats.conversionRate =
    campaign.stats.totalEnrolled > 0
      ? Math.round((campaign.stats.totalConverted / campaign.stats.totalEnrolled) * 100)
      : 0;
}
