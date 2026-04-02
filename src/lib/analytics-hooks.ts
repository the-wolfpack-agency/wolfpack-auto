/**
 * Analytics Hooks — Typed event tracking for every DOS module.
 *
 * Every user action feeds into the analytics/learning system so the platform
 * compounds knowledge over time. All calls are fire-and-forget: analytics
 * must NEVER break the primary request flow.
 *
 * Usage from any API route:
 *   import { trackDeal, trackService, ... } from "@/lib/analytics-hooks";
 *   trackDeal("deal.created", dealerId, { deal_type: "retail", ... });
 */

import { trackServerEvent } from "@/lib/analytics";

/**
 * Persist an analytics event to the Postgres analytics_events table.
 * This is the PRIMARY storage — Plausible is secondary/optional.
 * If the DB write fails, log the error but never throw.
 */
async function persistEvent(
  event: string,
  dealer_id: string,
  metadata: Record<string, string | number | boolean>,
): Promise<void> {
  if (!process.env.DATABASE_URL) return; // shadow mode — skip DB write
  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO analytics_events (event_type, action, page, session_id, user_fingerprint, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        event.split(".")[0],      // module (e.g. "deal", "service")
        event,                     // full event name (e.g. "deal.created")
        dealer_id,                 // use page column for dealer_id
        "server",                  // server-side event
        "server",                  // user_fingerprint (NOT NULL in schema)
        JSON.stringify({ dealer_id, ...metadata }),
      ],
    );
  } catch (err) {
    console.error(`[analytics-hooks] Failed to persist event "${event}":`, err);
    // Never throw — analytics must not break the request
  }
}

/* ------------------------------------------------------------------ */
/*  Event type unions                                                   */
/* ------------------------------------------------------------------ */

export type DealEvent =
  | "deal.created"
  | "deal.presented"
  | "deal.accepted"
  | "deal.funded"
  | "deal.unwound"
  | "deal.signed"
  | "deal.fi_product_added"
  | "deal.fi_product_removed"
  | "deal.payment_calculated"
  | "deal.pricing_applied"
  | "deal.pricing_generated";

export type ServiceEvent =
  | "service.appointment_created"
  | "service.appointment_completed"
  | "service.appointment_no_show"
  | "service.self_scheduled"
  | "service.ro_created"
  | "service.ro_completed"
  | "service.part_ordered"
  | "service.part_low_stock"
  | "service.part_added"
  | "service.tech_added";

export type CommsEvent =
  | "comms.message_sent"
  | "comms.message_opened"
  | "comms.message_clicked"
  | "comms.message_bounced"
  | "comms.announcement_created"
  | "comms.sequence_started"
  | "comms.sequence_completed"
  | "comms.sequence_created"
  | "comms.sequence_step_processed"
  | "comms.template_created";

export type AccountingEvent =
  | "accounting.sale_logged"
  | "accounting.commission_paid"
  | "accounting.chart_updated"
  | "accounting.floor_plan_added"
  | "accounting.floor_plan_payoff"
  | "accounting.exported";

export type ReviewEvent =
  | "review.received"
  | "review.responded"
  | "review.flagged";

export type RetailEvent =
  | "retail.calculator_used"
  | "retail.credit_app_submitted"
  | "retail.credit_app_approved";

export type CustomerEvent =
  | "customer.viewed_360"
  | "customer.ltv_milestone";

export type LenderEvent =
  | "lender.created"
  | "lender.updated"
  | "deal.lender_submitted"
  | "deal.lender_response";

export type CreditEvent =
  | "credit.pulled"
  | "credit.consent_recorded";

export type ComplianceEvent =
  | "compliance.check_run"
  | "compliance.check_reviewed"
  | "compliance.check_overridden"
  | "compliance.check_completed"
  | "compliance.data_deletion"
  | "compliance.data_export";

export type DocumentEvent =
  | "document.uploaded"
  | "document.signed"
  | "document.deleted"
  | "document.analyzed"
  | "document.deal_jacket_analyzed";

export type KnowledgeEvent =
  | "knowledge.document_ingested"
  | "knowledge.queried";

export type LeadEvent =
  | "lead.created"
  | "lead.duplicate_detected"
  | "lead.scored"
  | "lead.predicted"
  | "lead.assigned"
  | "lead.updated"
  | "lead.bulk_action"
  | "lead.converted";

export type SecurityEvent =
  | "security.scan_completed"
  | "security.finding_resolved"
  | "security.rate_limit_triggered"
  | "security.mfa_disabled"
  | "security.mfa_enabled"
  | "security.mfa_setup"
  | "security.mfa_verified";

export type SystemEvent =
  | "system.circuit_breaker_opened"
  | "system.circuit_breaker_closed"
  | "system.health_check"
  | "system.health_degraded"
  | "system.health_critical"
  | "system.auto_rollback"
  | "system.canary_passed"
  | "system.canary_failed"
  | "system.analytics_queried"
  | "system.change_recorded"
  | "system.competitive_updated"
  | "system.domain_updated"
  | "system.engagement_logged"
  | "system.good_faith_created"
  | "system.intake_processed"
  | "system.vehicle_updated"
  | "system.vehicle_added"
  | "system.vehicle_created"
  | "system.vehicle_quick_added"
  | "system.vehicles_indexed"
  | "system.listing_generated"
  | "system.campaign_created"
  | "system.calibration_run"
  | "system.onboarding_step"
  | "system.reward_given"
  | "system.integration_updated"
  | "system.notifications_updated"
  | "system.settings_updated"
  | "system.task_created"
  | "team.user_created"
  | "team.user_invited"
  | "team.user_updated"
  | "team.user_deactivated"
  | "team.invite_accepted"
  | "team.password_reset"
  | "team.password_reset_requested"
  | "agency.dealer_created"
  | "agency.dealer_toggled"
  | "agency.dealer_switched"
  | "agency.api_key_created"
  | "agency.bulk_provision"
  | "demo.created"
  | "demo.validated"
  | "demo.converted"
  | "location.created"
  | "location.updated"
  | "location.deleted"
  | "system.syndication_configured"
  | "system.syndication_exported"
  | "system.syndication_synced"
  | "system.syndication_error"
  | "system.econtracting_sent"
  | "system.vehicle_history_pulled"
  | "system.vehicle_history_attached"
  | "system.vehicle_history_expired"
  | "system.inventory_exported"
  | "system.vehicle_photo_uploaded"
  | "document.buyers_guide_generated"
  | "system.email_delivered"
  | "system.email_opened"
  | "system.email_clicked"
  | "system.email_bounced"
  | "system.email_complained"
  | "system.recommendation_served"
  | "system.ab_test_created"
  | "system.push_subscription_added"
  | "system.push_notification_sent"
  | "system.push_notification_broadcast";

export type SearchIntentEvent =
  | "search_intent.classified"
  | "search_intent.updated";

export type ScrollBehaviorEvent =
  | "scroll.hesitation"
  | "scroll.revisit"
  | "scroll.velocity_profile"
  | "scroll.fast_skip";

export type PhotoEngagementEvent =
  | "photo.dwell"
  | "photo.swipe_speed"
  | "photo.interest_profile"
  | "photo.buyer_type"
  | "photo.zoom"
  | "photo.first_clicked";

export type ExitDetectionEvent =
  | "exit.tab_switch"
  | "exit.clipboard_copy"
  | "exit.competitor_check"
  | "exit.rage_compare";

export type WebhookEvent =
  | "webhook.delivered"
  | "webhook.failed"
  | "webhook.config_created"
  | "webhook.config_updated"
  | "webhook.test_sent";

export type JourneyEvent =
  | "journey.session_start"
  | "journey.stage_change"
  | "journey.narrowing_detected"
  | "journey.shortlist_update"
  | "journey.return_visit";

export type TemporalEvent =
  | "temporal.session_context"
  | "temporal.showroom_predicted"
  | "temporal.ready_to_close"
  | "temporal.pattern_insight";

export type PricingEvent =
  | "pricing.recommendation_viewed"
  | "pricing.recommendation_accepted"
  | "pricing.recommendation_rejected"
  | "pricing.price_changed"
  | "pricing.lot_report_viewed"
  | "pricing.recommendations_generated"
  | "pricing.lot_report_generated"
  | "pricing.optimization_requested";

export type BackgroundEvent =
  | "background.applied"
  | "background.batch_applied"
  | "background.auto_recommended"
  | "background.engagement_compared"
  | "background.insights_viewed"
  | "background.custom_uploaded"
  | "background.custom_deleted"
  | "background.custom_updated"
  | "background.removal_started"
  | "background.removal_completed"
  | "background.removal_failed"
  | "background.composite_started"
  | "background.composite_completed"
  | "background.composite_failed"
  | "background.batch_composite_started"
  | "background.batch_composite_completed"
  | "background.preview_generated"
  | "background.assignment_created"
  | "background.assignment_removed"
  | "background.performance_snapshot";

export type MarketingTemplateEvent =
  | "template.viewed"
  | "template.populated"
  | "template.exported_canva"
  | "template.exported_html"
  | "template.exported_image"
  | "template.used_in_campaign"
  | "template.performance_viewed";

export type PlatformEvent =
  | DealEvent
  | ServiceEvent
  | CommsEvent
  | AccountingEvent
  | ReviewEvent
  | RetailEvent
  | CustomerEvent
  | LenderEvent
  | LeadEvent
  | CreditEvent
  | ComplianceEvent
  | DocumentEvent
  | KnowledgeEvent
  | SecurityEvent
  | SystemEvent
  | SearchIntentEvent
  | ScrollBehaviorEvent
  | PhotoEngagementEvent
  | ExitDetectionEvent
  | WebhookEvent
  | JourneyEvent
  | TemporalEvent
  | PricingEvent
  | BackgroundEvent
  | MarketingTemplateEvent;

/* ------------------------------------------------------------------ */
/*  Core tracking helper (internal)                                     */
/* ------------------------------------------------------------------ */

function track(
  event: PlatformEvent,
  dealer_id: string,
  metadata: Record<string, string | number | boolean>,
): void {
  try {
    const props = {
      ...metadata,
      dealer_id,
      ts: new Date().toISOString(),
    };
    // PRIMARY: persist to Postgres (the learning system reads from here)
    persistEvent(event, dealer_id, props).catch(() => {
      /* swallow — analytics must never throw */
    });
    // SECONDARY: send to Plausible (optional external analytics)
    trackServerEvent(event, props).catch(() => {
      /* swallow — analytics must never throw */
    });
    // TERTIARY: dispatch to outbound webhooks (CRM integrations)
    import("@/lib/webhook-outbound")
      .then(({ dispatchWebhooks }) =>
        dispatchWebhooks(event, dealer_id, props).catch(() => {}),
      )
      .catch(() => {});
  } catch {
    /* swallow — analytics must never throw */
  }
}

/* ------------------------------------------------------------------ */
/*  Module-specific typed helpers                                       */
/* ------------------------------------------------------------------ */

/**
 * Track a deal-related event.
 */
export function trackDeal(
  event: DealEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "deals", ...meta });
}

/**
 * Track a service department event.
 */
export function trackService(
  event: ServiceEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "service", ...meta });
}

/**
 * Track a communications event.
 */
export function trackComms(
  event: CommsEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "comms", ...meta });
}

/**
 * Track an accounting event.
 */
export function trackAccounting(
  event: AccountingEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "accounting", ...meta });
}

/**
 * Track a review/reputation event.
 */
export function trackReview(
  event: ReviewEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "reviews", ...meta });
}

/**
 * Track a digital retail event.
 */
export function trackRetail(
  event: RetailEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "digital_retail", ...meta });
}

/**
 * Track a customer lifecycle event.
 */
export function trackCustomer(
  event: CustomerEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "customer", ...meta });
}

/**
 * Track a lead lifecycle event (creation, dedup, scoring, assignment).
 */
export function trackLead(
  event: LeadEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "leads", ...meta });
}

/**
 * Track a lender portal event.
 */
export function trackLender(
  event: LenderEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "lender", ...meta });
}

/**
 * Track a credit bureau event.
 */
export function trackCredit(
  event: CreditEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "credit", ...meta });
}

/**
 * Track a compliance / red-flags / OFAC event.
 */
export function trackCompliance(
  event: ComplianceEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "compliance", ...meta });
}

/**
 * Track a document vault event.
 */
export function trackDocument(
  event: DocumentEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "documents", ...meta });
}

/**
 * Track a knowledge base event.
 */
export function trackKnowledge(
  event: KnowledgeEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "knowledge", ...meta });
}

/**
 * Track a security-related event (scans, findings, rate limit triggers).
 */
export function trackSecurity(
  event: SecurityEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "security", ...meta });
}

/**
 * Track a system infrastructure event (circuit breaker, health, rollback).
 */
export function trackSystem(
  event: SystemEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "system", ...meta });
}

/**
 * Track a webhook outbound event (delivery, failure, config changes).
 */
export function trackWebhook(
  event: WebhookEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "webhook", ...meta });
}

/**
 * Track a search intent classification event (source, UTM, intent category).
 */
export function trackSearchIntent(
  event: SearchIntentEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "search_intent", ...meta });
}

/**
 * Track a scroll behavior event (hesitation, revisit, velocity profile).
 */
export function trackScrollBehavior(
  event: ScrollBehaviorEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "scroll_behavior", ...meta });
}

/**
 * Track a photo engagement event (dwell, swipe speed, interest profile, buyer type).
 */
export function trackPhotoEngagement(
  event: PhotoEngagementEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "photo_engagement", ...meta });
}

/**
 * Track a competitive exit detection event (tab switch, clipboard copy, competitor check).
 */
export function trackExitDetection(
  event: ExitDetectionEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "exit_detection", ...meta });
}

/**
 * Track a cross-session journey event (session start, stage change, narrowing, shortlist).
 */
export function trackJourney(
  event: JourneyEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "journey", ...meta });
}

/**
 * Track a temporal pattern event (session context, showroom predicted, ready to close).
 */
export function trackTemporal(
  event: TemporalEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "temporal", ...meta });
}

/**
 * Track a pricing recommendation engine event (recommendations, optimization, price changes).
 */
export function trackPricing(
  event: PricingEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "pricing", ...meta });
}

/**
 * Track a VDP background generator event (apply, recommend, insights).
 */
export function trackBackground(
  event: BackgroundEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "backgrounds", ...meta });
}

/**
 * Track a marketing template event (view, populate, export, campaign usage).
 */
export function trackTemplate(
  event: MarketingTemplateEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "marketing_templates", ...meta });
}
