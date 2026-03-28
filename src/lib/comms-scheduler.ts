/**
 * Communication Scheduler — processes pending follow-up sequence steps.
 *
 * Checks for sequence steps that are due (delay_hours elapsed since enrollment),
 * renders the template variables, and queues the message for delivery.
 *
 * Called by:
 *   - Vercel cron job: GET /api/cron/process-sequences (every 15 minutes)
 *   - Manual trigger from the admin comms dashboard
 */

import { query } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SequenceProcessingResult {
  processed: number;
  skipped: number;
  errors: number;
  details: Array<{
    enrollment_id: string;
    step_order: number;
    channel: string;
    status: "sent" | "skipped" | "error";
    error_message?: string;
  }>;
}

interface DueStep {
  enrollment_id: string;
  sequence_id: string;
  step_order: number;
  delay_hours: number;
  channel: string;
  template_id: string;
  recipient_email: string;
  recipient_phone: string | null;
  recipient_name: string;
  dealer_id: string;
  enrolled_at: string;
}

/* -------------------------------------------------------------------------- */
/* Template rendering                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Render template variables. Replaces {{variable}} placeholders with values.
 */
function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? `{{${key}}}`;
  });
}

/* -------------------------------------------------------------------------- */
/* Process due steps                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Process all sequence steps that are due for delivery.
 *
 * @param limit - Maximum number of messages to process (default 50)
 * @returns Processing result with counts and per-step details
 */
export async function processDueSequenceSteps(
  limit: number = 50,
): Promise<SequenceProcessingResult> {
  const result: SequenceProcessingResult = {
    processed: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  if (!process.env.DATABASE_URL) {
    // Shadow mode: return mock processing stats
    return {
      processed: 3,
      skipped: 1,
      errors: 0,
      details: [
        { enrollment_id: "enr-mock-001", step_order: 2, channel: "email", status: "sent" },
        { enrollment_id: "enr-mock-002", step_order: 1, channel: "sms", status: "sent" },
        { enrollment_id: "enr-mock-003", step_order: 3, channel: "email", status: "sent" },
        { enrollment_id: "enr-mock-004", step_order: 2, channel: "sms", status: "skipped" },
      ],
    };
  }

  // Find enrollments with steps that are due
  // A step is due when: NOW() >= enrolled_at + (delay_hours * interval '1 hour')
  // and the step has not yet been sent for this enrollment
  const dueSteps = await query<DueStep>(
    `SELECT
       e.id AS enrollment_id,
       e.sequence_id,
       ss.step_order,
       ss.delay_hours,
       ss.channel,
       ss.template_id,
       e.recipient_email,
       e.recipient_phone,
       e.recipient_name,
       e.dealer_id,
       e.enrolled_at
     FROM sequence_enrollments e
     JOIN sequence_steps ss ON ss.sequence_id = e.sequence_id
     LEFT JOIN sequence_step_log sl
       ON sl.enrollment_id = e.id AND sl.step_order = ss.step_order
     WHERE e.status = 'active'
       AND sl.id IS NULL
       AND NOW() >= e.enrolled_at + (ss.delay_hours * interval '1 hour')
     ORDER BY ss.delay_hours ASC
     LIMIT $1`,
    [limit],
  );

  for (const step of dueSteps.rows) {
    try {
      // Look up the template
      const tplResult = await query<{ subject: string | null; body: string }>(
        `SELECT subject, body FROM message_templates WHERE id = $1`,
        [step.template_id],
      );

      const template = tplResult.rows[0];
      if (!template) {
        result.skipped++;
        result.details.push({
          enrollment_id: step.enrollment_id,
          step_order: step.step_order,
          channel: step.channel,
          status: "skipped",
          error_message: `Template ${step.template_id} not found`,
        });
        continue;
      }

      // Render template variables
      const variables: Record<string, string> = {
        first_name: step.recipient_name.split(" ")[0] ?? step.recipient_name,
        full_name: step.recipient_name,
        email: step.recipient_email,
      };

      const renderedBody = renderTemplate(template.body, variables);
      const renderedSubject = template.subject
        ? renderTemplate(template.subject, variables)
        : null;

      // Queue the message in message_log
      await query(
        `INSERT INTO message_log
           (id, dealer_id, channel, recipient_email, recipient_phone, subject, body, status, created_at, enrollment_id, step_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', NOW(), $8, $9)`,
        [
          `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          step.dealer_id,
          step.channel,
          step.recipient_email,
          step.channel === "sms" ? step.recipient_phone : null,
          renderedSubject,
          renderedBody,
          step.enrollment_id,
          step.step_order,
        ],
      );

      // Log that this step was processed
      await query(
        `INSERT INTO sequence_step_log (id, enrollment_id, step_order, sent_at, status)
         VALUES ($1, $2, $3, NOW(), 'sent')`,
        [
          `sl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          step.enrollment_id,
          step.step_order,
        ],
      );

      // Check if this was the last step — mark enrollment as completed
      const remainingSteps = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM sequence_steps ss
         LEFT JOIN sequence_step_log sl
           ON sl.enrollment_id = $1 AND sl.step_order = ss.step_order
         WHERE ss.sequence_id = $2 AND sl.id IS NULL AND ss.step_order > $3`,
        [step.enrollment_id, step.sequence_id, step.step_order],
      );

      if (parseInt(remainingSteps.rows[0]?.cnt ?? "0", 10) === 0) {
        await query(
          `UPDATE sequence_enrollments SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [step.enrollment_id],
        );
      }

      result.processed++;
      result.details.push({
        enrollment_id: step.enrollment_id,
        step_order: step.step_order,
        channel: step.channel,
        status: "sent",
      });
    } catch (err) {
      result.errors++;
      result.details.push({
        enrollment_id: step.enrollment_id,
        step_order: step.step_order,
        channel: step.channel,
        status: "error",
        error_message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
