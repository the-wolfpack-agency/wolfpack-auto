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
        event.split(".")[0],                          // module (e.g. "deal", "service")
        event,                                         // full event name (e.g. "deal.created")
        String(metadata.page ?? "(server)"),           // real page path, never the dealer UUID
        "server",                                      // server-side event
        "server",                                      // user_fingerprint (NOT NULL in schema)
        JSON.stringify({ dealer_id, ...metadata }),    // dealer_id lives here, not in page column
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
  | "service.tech_added"
  /* ---- recall + TSB awareness (migration 068) ----------------------- */
  /** Emitted every time an open NHTSA recall is surfaced for a vehicle. */
  | "service.recall_flagged"
  /** Emitted every time an applicable TSB is surfaced for a vehicle. */
  | "service.tsb_flagged"
  /** Emitted when a service advisor marks a recall resolved. */
  | "service.recall_resolved"
  /** Emitted when an owner declines / defers a recall in writing. */
  | "service.recall_dismissed";

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
  | "lead.converted"
  | "lead.note_added"
  | "lead.note_edited"
  | "lead.note_deleted"
  | "lead.intake_received"
  | "lead.enriched"
  | "lead.routed"
  | "lead.source_created"
  | "lead.source_updated";

export type SecurityEvent =
  | "security.scan_completed"
  | "security.finding_resolved"
  | "security.rate_limit_triggered"
  | "security.mfa_disabled"
  | "security.mfa_enabled"
  | "security.mfa_setup"
  | "security.mfa_verified"
  | "security.unauthorized_access_attempt";

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
  | "system.engagement_logged_durable"
  | "system.engagement_logged_shadow"
  | "system.good_faith_created"
  | "system.good_faith_created_durable"
  | "system.good_faith_created_shadow"
  | "system.error_resolution_persisted"
  | "system.error_resolution_persisted_shadow"
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
  | "system.onboarding_started"
  | "system.onboarding_step_completed"
  | "system.onboarding_team_invited"
  | "system.onboarding_completed"
  | "system.onboarding_banner_dismissed"
  | "system.onboarding_banner_shown"
  | "system.onboarding_sidebar_clicked"
  | "system.reward_given"
  | "system.integration_updated"
  | "system.notifications_updated"
  | "system.settings_updated"
  | "system.modules_updated"
  | "system.task_created"
  | "system.labor_insight_generated"
  | "system.labor_insight_viewed"
  | "system.openapi_fetched"
  | "team.user_created"
  | "team.user_invited"
  | "team.user_updated"
  | "team.user_deactivated"
  | "team.invite_rescinded"
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
  | "system.push_notification_broadcast"
  | "system.team_invite_sent"
  | "system.team_invite_accepted"
  | "system.notification_send_failed"
  | "system.inventory_csv_imported"
  /* ---- crypto-agility events ---------------------------------------- */
  /** Emitted every time signToken() produces a new token. */
  | "system.token_signed"
  /** Emitted every time verifyToken() accepts a valid token. */
  | "system.token_verified"
  /** Emitted when verifyToken() rejects a token (bad sig, expired, etc.). */
  | "system.token_verify_failed"
  /* ---- webhook-integrity events ------------------------------------- */
  /** Emitted by each webhook handler when the HMAC signature passes. */
  | "system.webhook_signature_verified"
  /** Emitted by each webhook handler when the HMAC signature fails. Tripwire. */
  | "system.webhook_signature_failed"
  /* ---- RLS / cross-tenant access events ----------------------------- */
  /**
   * Emitted by tenant guards when dealer-A tries to read/write dealer-B data.
   * Metadata: { attempted_dealer_id, actual_dealer_id, route, user_id }.
   * Tripwire-grade — goes straight into the learning system.
   */
  | "system.cross_tenant_access_blocked";

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
  | "background.performance_snapshot"
  | "background.local_removal_used"
  | "background.local_removal_fallback";

export type MarketingTemplateEvent =
  | "template.viewed"
  | "template.populated"
  | "template.exported_canva"
  | "template.exported_html"
  | "template.exported_image"
  | "template.used_in_campaign"
  | "template.performance_viewed";

export type EquityMiningEvent =
  | "equity.scan_started"
  | "equity.scan_completed"
  | "equity.scan_run"
  | "equity.opportunity_identified"
  | "equity.opportunity_contacted"
  | "equity.opportunity_converted"
  | "equity.appraisal_generated";

export type DeskingEvent =
  | "desking.deal_created"
  | "desking.deal_structured"
  | "desking.deal_presented"
  | "desking.deal_negotiated"
  | "desking.deal_approved"
  | "desking.deal_signed"
  | "desking.deal_funded"
  | "desking.deal_unwound"
  | "desking.scenario_generated"
  | "desking.lender_matched"
  | "desking.lender_submitted"
  | "desking.lender_response"
  | "desking.fi_product_presented"
  | "desking.fi_product_accepted"
  | "desking.fi_product_declined"
  | "desking.profit_analyzed";

export type GLEvent =
  | "gl.journal_posted"
  | "gl.journal_voided"
  | "gl.journal_reversed"
  | "gl.period_opened"
  | "gl.period_closed"
  | "gl.trial_balance_generated"
  | "gl.pnl_generated"
  | "gl.balance_sheet_generated"
  | "gl.deal_auto_posted"
  | "gl.service_auto_posted"
  | "gl.account_created"
  | "gl.account_updated"
  | "gl.company_created"
  | "gl.company_updated"
  | "gl.intercompany_posted"
  | "gl.intercompany_eliminated"
  | "gl.consolidated_generated";

export type PaymentEvent =
  | "payment.created"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "payment.partially_refunded"
  | "payment.terminal_used"
  | "payment.reconciled"
  | "payment.discrepancy_found"
  | "payment.account_onboarded"
  | "payment.account_restricted";

export type PayrollEvent =
  | "payroll.employee_synced"
  | "payroll.time_entry_created"
  | "payroll.time_entry_approved"
  | "payroll.commission_calculated"
  | "payroll.commission_approved"
  | "payroll.commission_paid"
  | "payroll.period_summarized"
  | "payroll.sync_completed"
  | "payroll.sync_failed"
  | "payroll.provider_connected"
  | "payroll.provider_disconnected";

export type ReinsuranceEvent =
  | "reinsurance.program_created"
  | "reinsurance.program_updated"
  | "reinsurance.premium_calculated"
  | "reinsurance.claim_filed"
  | "reinsurance.claim_paid"
  | "reinsurance.report_generated"
  | "reinsurance.risk_assessed";

export type SessionReplayEvent =
  | "replay.recording_started"
  | "replay.recording_stopped"
  | "replay.viewed"
  | "replay.exported";

export type LeadIngestionEvent =
  | "lead_ingestion.batch_received"
  | "lead_ingestion.lead_parsed"
  | "lead_ingestion.duplicate_detected"
  | "lead_ingestion.lead_created";

export type SMSEvent =
  | "sms.sent"
  | "sms.received"
  | "sms.delivery_failed"
  | "sms.conversation_started";

export type ERatingEvent =
  | "erating.rates_requested"
  | "erating.rates_received"
  | "erating.product_selected"
  | "erating.comparison_viewed";

export type ErrorMonitorEvent =
  | "error.captured"
  | "error.correlated"
  | "error.resolved"
  | "error.resolved_durable"
  | "error.resolved_shadow"
  | "error.trend_detected";

export type SurveyEvent =
  | "survey.created"
  | "survey.updated"
  | "survey.deleted"
  | "survey.published"
  | "survey.response_received"
  | "survey.completed"
  | "survey.nps_calculated"
  | "survey.replay_linked"
  | "survey.replay_viewed";

export type UserTestEvent =
  | "usertest.created"
  | "usertest.updated"
  | "usertest.deleted"
  | "usertest.task_completed"
  | "usertest.task_failed"
  | "usertest.report_generated";

export type HeatmapEvent =
  | "heatmap.generated"
  | "heatmap.viewed"
  | "heatmap.exported"
  | "heatmap.page_analyzed";

export type HouseholdEvent =
  | "household.detected"
  | "household.created"
  | "household.merged"
  | "household.profile_viewed"
  | "household.opportunity_identified"
  | "household.ltv_calculated";

export type DataExportEvent =
  | "export.started"
  | "export.completed"
  | "export.failed"
  | "export.scheduled";

export type CohortEvent =
  | "cohort.analysis_generated"
  | "cohort.churn_risk_detected";

export type HeatmapCompareEvent =
  | "heatmap.comparison_generated"
  | "heatmap.diff_calculated";

export type DeliveryEvent =
  | "delivery.requested"
  | "delivery.confirmed"
  | "delivery.in_transit"
  | "delivery.completed"
  | "delivery.cancelled";

export type ReputationEvent =
  | "reputation.review_detected"
  | "reputation.score_calculated"
  | "reputation.alert_triggered"
  | "reputation.response_suggested";

export type OmnichannelEvent =
  | "omnichannel.handoff_created"
  | "omnichannel.handoff_scanned"
  | "omnichannel.timeline_viewed"
  | "omnichannel.channels_merged";

export type CallIntelligenceEvent =
  | "call.recorded"
  | "call.analyzed"
  | "call.outcome_classified"
  | "call.quality_scored";

export type WalkaroundEvent =
  | "walkaround.started"
  | "walkaround.segment_added"
  | "walkaround.published"
  | "walkaround.viewed";

export type PropensityEvent =
  | "propensity.model_trained"
  | "propensity.prediction_made"
  | "propensity.model_evaluated"
  | "propensity.ranking_generated";

export type I18nEvent =
  | "i18n.locale_detected"
  | "i18n.locale_switched";

export type VehiclePipelineEvent =
  | "vehicle_pipeline.milestone_updated"
  | "vehicle_pipeline.slow_mover_detected";

export type AnnotationEvent =
  | "annotation.created"
  | "annotation.deleted"
  | "annotation.viewed";

export type DripCampaignEvent =
  | "drip.campaign_created"
  | "drip.enrollment_started"
  | "drip.email_sent"
  | "drip.lead_converted"
  | "drip.lead_unsubscribed";

/* ------------------------------------------------------------------ */
/*  Novel micro-behavioral signal types                                */
/* ------------------------------------------------------------------ */

export type PhotoComparisonEvent =
  | "photo_compare.dwell_start"
  | "photo_compare.dwell_end"
  | "photo_compare.preference_detected"
  | "photo_compare.side_by_side_opened"
  | "photo_compare.winner_selected";

export type PriceSensitivityEvent =
  | "price_sensitivity.price_viewed"
  | "price_sensitivity.calculator_opened"
  | "price_sensitivity.term_adjusted"
  | "price_sensitivity.down_payment_adjusted"
  | "price_sensitivity.payment_ceiling_detected"
  | "price_sensitivity.sticker_shock_bounce"
  | "price_sensitivity.budget_fingerprint";

export type DecisionVelocityEvent =
  | "decision_velocity.first_vdp_view"
  | "decision_velocity.return_visit"
  | "decision_velocity.narrowing_detected"
  | "decision_velocity.lead_submitted"
  | "decision_velocity.velocity_classified";

export type DeviceHandoffEvent =
  | "device_handoff.cross_device_detected"
  | "device_handoff.mobile_to_desktop"
  | "device_handoff.desktop_to_mobile"
  | "device_handoff.same_vin_cross_device"
  | "device_handoff.intent_escalation";

export type NightOwlEvent =
  | "night_owl.late_session_start"
  | "night_owl.late_session_engagement"
  | "night_owl.time_segment_classified"
  | "night_owl.optimal_outreach_detected";

/**
 * Cryptographically-signed vehicle history (Carfax-killer) events.
 * Every provenance write or chain verification fans out one of these.
 */
export type ProvenanceEvent =
  | "provenance.event_recorded"
  | "provenance.chain_verified"
  | "provenance.chain_invalid_detected"
  | "provenance.anchor_created"
  | "provenance.attestation_recorded"
  | "provenance.public_verified";

/**
 * Customer-facing pre-qualification flow (migration 067).
 * Public `/pre-qual` page: identity -> soft credit -> income -> offers.
 */
export type PrequalEvent =
  | "prequal.started"
  | "prequal.credit_pulled"
  | "prequal.income_verified"
  | "prequal.offers_returned"
  | "prequal.completed"
  | "prequal.abandoned"
  // Stream B (migration 070): real-data routing to dealer's own lender stack
  // and BYO Plaid credentials for income verification.
  | "prequal.lender_packet_built"
  | "prequal.lender_packet_emailed"
  | "prequal.lender_route_failed"
  | "prequal.plaid_byo_income_pulled"
  | "prequal.plaid_byo_income_failed";

/**
 * Live inventory market intelligence events (migration 065 + 069).
 * Emitted by `src/lib/market-intel/*` on every refresh, by the
 * Vercel Cron `/api/cron/market-intel-refresh` target, and by the
 * BYO-credentials per-vehicle proxy routes (Carfax / AutoCheck / Edmunds
 * — migration 069) which feed real-world signals into the same surface.
 */
export type InventoryMarketIntelEvent =
  | "inventory.market_signal_generated"
  | "inventory.price_recommended"
  | "inventory.market_snapshot_captured"
  | "market_intel.edmunds_valuation_fetched"
  | "carfax.report_fetched"
  | "autocheck.report_fetched";

/**
 * BYO external-credentials lifecycle events (migration 069).
 * Emitted by `src/lib/external-credentials/*` whenever a dealer adds /
 * rotates / revokes an API credential for KBB / vAuto / MMR / Carfax /
 * AutoCheck / Plaid / Edmunds, or whenever the proxy route uses one.
 */
export type CredentialsEvent =
  | "credentials.byo_added"
  | "credentials.byo_rotated"
  | "credentials.byo_revoked"
  | "credentials.byo_proxy_call_succeeded"
  | "credentials.byo_proxy_call_failed";

/**
 * DMS adapter lifecycle events (migration 079).
 *
 * Emitted by `src/lib/dms-adapters/*` whenever a dealer configures, rotates,
 * or revokes a DMS adapter credential, and whenever the assistant /
 * action-registry executes (or fails to execute) an adapter capability
 * against a dealer's DMS. Powers the overlay product's data moat — every
 * action becomes a learning signal.
 */
export type DMSAdapterEvent =
  | "dms_adapter.configured"
  | "dms_adapter.action_executed"
  | "dms_adapter.action_failed"
  | "dms_adapter.credential_rotated";

/**
 * E-commerce adapter lifecycle events (migration 082).
 *
 * Emitted by `src/lib/ecommerce-adapters/*` whenever a tenant configures,
 * rotates, or revokes an e-commerce adapter credential, and whenever the
 * assistant / action-registry executes (or fails to execute) an adapter
 * capability against a tenant's e-commerce stack (Shopify, BigCommerce,
 * Adobe Commerce, Klaviyo, Attentive, Meta Ads, Google Ads). Year-2 retail
 * vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`. Every action
 * becomes a learning signal — the data moat the overlay product relies on.
 */
export type EcommerceAdapterEvent =
  | "ecommerce_adapter.configured"
  | "ecommerce_adapter.action_executed"
  | "ecommerce_adapter.action_failed"
  | "ecommerce_adapter.credential_rotated";

/**
 * Analytics console view/drill events. Emitted whenever a Wolfpack admin
 * opens or drills into one of the operator-facing read-only analytics
 * surfaces (F&I product penetration heatmap, tech utilization grid, etc.).
 * Other streams should extend this union if they add a new view surface;
 * names stay `analytics.<noun>_<verb_past>`.
 */
export type AnalyticsViewEvent =
  | "analytics.fi_penetration_viewed"
  | "analytics.fi_penetration_drilled"
  | "analytics.tech_utilization_viewed"
  | "analytics.tech_utilization_drilled"
  // Stream C (migration 071) — trim-velocity + lead-source-ROI dashboards
  | "analytics.trim_velocity_viewed"
  | "analytics.trim_velocity_drilled"
  | "analytics.lead_source_roi_viewed"
  | "analytics.lead_source_roi_drilled";

/**
 * State title/lien lookup events (Stream E, migration 073).
 * Emitted by `src/lib/title-lien/*` on every lookup attempt.
 */
export type TitleLienEvent =
  | "title_lien.lookup_succeeded"
  | "title_lien.lookup_failed"
  | "title_lien.state_not_supported";

/**
 * USPS address-validation events (Stream E, migration 073).
 * Emitted on every lead-capture / dealer-settings address save attempt.
 */
export type AddressValidationEvent =
  | "address.validation_succeeded"
  | "address.validation_corrected"
  | "address.validation_failed";

/**
 * F&I Penetration Audit lead-magnet events (migration 074).
 * Emitted by the public `/audits/fi-penetration` flow on every state
 * transition — submission, generation, delivery, demo booking.
 */
export type FIAuditEvent =
  | "fi_audit.request_submitted"
  | "fi_audit.csv_uploaded"
  | "fi_audit.generated"
  | "fi_audit.delivered"
  | "fi_audit.delivery_failed"
  | "fi_audit.opened"
  | "fi_audit.demo_booked";

/**
 * Website Audit engagement-opener events (migration 078).
 * Emitted by the public `/audits/website` flow on every state transition.
 * Second engagement-opener artifact for the Dealer Excellence Program.
 */
export type WebsiteAuditEvent =
  | "website_audit.request_submitted"
  | "website_audit.scan_started"
  | "website_audit.scan_completed"
  | "website_audit.scan_failed"
  | "website_audit.pdf_generated"
  | "website_audit.delivered"
  | "website_audit.opened"
  | "website_audit.demo_booked";

/**
 * Dealership Literacy Ontology events (migration 075).
 * Emitted by `src/lib/literacy-ontology/*` and the
 * `/api/admin/literacy/*` authoring routes. Every concept / mapping /
 * translation / action mutation fans out one of these so the curated
 * ontology has a full audit history in analytics_events. Also covers the
 * rendering side: every time a translation gets shown to a dealer surface
 * or a recommended action gets emitted.
 */
export type LiteracyEvent =
  | "literacy.concept_created"
  | "literacy.concept_updated"
  | "literacy.concept_deleted"
  | "literacy.mapping_created"
  | "literacy.mapping_deleted"
  | "literacy.metric_created"
  | "literacy.metric_updated"
  | "literacy.metric_deleted"
  | "literacy.translation_created"
  | "literacy.translation_updated"
  | "literacy.translation_deleted"
  | "literacy.translation_rendered"
  | "literacy.action_created"
  | "literacy.action_updated"
  | "literacy.action_deleted"
  | "literacy.action_recommended"
  | "literacy.outcome_recorded"
  /* ---- in-platform literacy layer (migration 076) -------------------- */
  /** Walkthrough lifecycle (curated + ai_proposed multi-step tours). */
  | "literacy.walkthrough_created"
  | "literacy.walkthrough_updated"
  | "literacy.walkthrough_deleted"
  | "walkthrough.viewed"
  | "walkthrough.step_completed"
  | "walkthrough.dismissed"
  | "walkthrough.completed"
  /** Tooltip lifecycle + render-side surface events. */
  | "literacy.tooltip_created"
  | "literacy.tooltip_updated"
  | "literacy.tooltip_deleted"
  | "tooltip.opened"
  | "tooltip.dismissed";

/**
 * Wolfpack Assistant lifecycle events (migration 077). Emitted by the
 * action registry, capability matcher, conversation logger, and the
 * /api/admin/assistant/* routes. The conversational layer (year-one
 * Q3-Q4) will additionally emit `assistant.action_proposed` and
 * `assistant.action_executed` for every LLM-mapped action.
 */
export type AssistantEvent =
  | "assistant.action_listed"
  | "assistant.chat_prompt_received"
  | "assistant.action_proposed"
  | "assistant.action_executed"
  | "assistant.action_rejected"
  | "assistant.dry_run_requested"
  | "assistant.conversation_started"
  | "assistant.conversation_ended"
  /** Intent mapper events (2026-05-12 NLP layer). */
  | "assistant.intent_matched"
  | "assistant.intent_ambiguous"
  | "assistant.intent_unmatched"
  | "assistant.parameter_extracted"
  /**
   * LLM tie-breaker events (2026-07-13 AI Gateway wiring). `_called` fires
   * when a real Gateway call is dispatched to disambiguate near-tie
   * candidates; `_resolved` fires once the tie is settled — carrying
   * whether the LLM's choice was used or we fell back to the deterministic
   * keyword result (timeout / error / injection / invalid choice).
   */
  | "assistant.intent_llm_tiebreak_called"
  | "assistant.intent_llm_tiebreak_resolved";

/**
 * Touchpoint lifecycle events (migration 081). Emitted by
 * `src/lib/touchpoints/dispatcher.ts` on every physical-world scan
 * (QR today; NFC/RFID/iBeacon year-2). Powers the admin recent-scans
 * dashboard + feeds the learning system so we can correlate physical
 * touchpoints with downstream conversion.
 */
export type TouchpointEvent =
  | "touchpoint.scanned"
  | "touchpoint.unknown_payload"
  | "touchpoint.action_triggered"
  | "touchpoint.duplicate_suppressed";

/**
 * Maintenance-rails intake events (maintenance-rails intake+telemetry layer).
 * Emitted by `src/lib/maintenance/intake-telemetry.ts` on every issue
 * lifecycle transition for a `maint-queue` GitHub issue (bug or feature).
 * Namespace is `maintenance.intake.*` so the module column resolves to
 * `maintenance` and the learning system can compute intake cycle-time and
 * backlog from analytics_events. Agency-internal telemetry: pass the
 * agency-scoped pseudo-dealer_id ("wolfpack-maintenance") when no dealer
 * tenancy applies.
 */
export type MaintenanceIntakeEvent =
  | "maintenance.intake.opened"
  | "maintenance.intake.triaged"
  | "maintenance.intake.resolved";

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
  | DeskingEvent
  | GLEvent
  | PaymentEvent
  | PayrollEvent
  | ReinsuranceEvent
  | PhotoEngagementEvent
  | ExitDetectionEvent
  | WebhookEvent
  | JourneyEvent
  | TemporalEvent
  | PricingEvent
  | BackgroundEvent
  | MarketingTemplateEvent
  | EquityMiningEvent
  | SessionReplayEvent
  | SurveyEvent
  | UserTestEvent
  | HeatmapEvent
  | HouseholdEvent
  | LeadIngestionEvent
  | SMSEvent
  | ERatingEvent
  | ErrorMonitorEvent
  | DataExportEvent
  | CohortEvent
  | HeatmapCompareEvent
  | DeliveryEvent
  | ReputationEvent
  | OmnichannelEvent
  | CallIntelligenceEvent
  | WalkaroundEvent
  | PropensityEvent
  | I18nEvent
  | VehiclePipelineEvent
  | AnnotationEvent
  | DripCampaignEvent
  | PhotoComparisonEvent
  | PriceSensitivityEvent
  | DecisionVelocityEvent
  | DeviceHandoffEvent
  | NightOwlEvent
  | ProvenanceEvent
  | PrequalEvent
  | InventoryMarketIntelEvent
  | AnalyticsViewEvent
  | TitleLienEvent
  | AddressValidationEvent
  | CredentialsEvent
  | DMSAdapterEvent
  | EcommerceAdapterEvent
  | FIAuditEvent
  | WebsiteAuditEvent
  | LiteracyEvent
  | AssistantEvent
  | TouchpointEvent
  | MaintenanceIntakeEvent;

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
 * Track a vehicle-provenance event (signed history ledger).
 * Powers the Carfax-killer surface — every chain extension, anchor, and
 * verification flows through here so the learning system can score
 * dealer integrity over time.
 */
export function trackProvenance(
  event: ProvenanceEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "provenance", ...meta });
}

/**
 * Track a pre-qualification flow event. Public-facing soft-credit / income /
 * offers flow at `/pre-qual`. Every state transition fires so the analytics
 * brain can model funnel drop-off + cross-correlate with eventual deal close.
 */
export function trackPrequal(
  event: PrequalEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "prequal", ...meta });
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

/**
 * Track an F&I desking event (deal structuring, scenarios, lender matching, product menus).
 */
export function trackDesking(
  event: DeskingEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "desking", ...meta });
}

/**
 * Track a general ledger event (journal entries, period close, financial statements).
 */
export function trackGL(
  event: GLEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "general_ledger", ...meta });
}

/**
 * Track a payment processing event (Stripe payments, refunds, terminals, reconciliation).
 */
export function trackPayment(
  event: PaymentEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "payments", ...meta });
}

/**
 * Track a payroll integration event (employee sync, time entries, commissions).
 */
export function trackPayroll(
  event: PayrollEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "payroll", ...meta });
}

/**
 * Track an equity mining event (scans, opportunities, conversions).
 */
export function trackEquityMining(
  event: EquityMiningEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "equity_mining", ...meta });
}

/**
 * Track a reinsurance program event (program CRUD, premiums, claims, reports, risk).
 */
export function trackReinsurance(
  event: ReinsuranceEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "reinsurance", ...meta });
}

/**
 * Track a session replay event (recording start/stop, playback, export).
 */
export function trackSessionReplay(
  event: SessionReplayEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "session_replay", ...meta });
}

/**
 * Track a survey event (creation, publication, responses, NPS calculation).
 */
export function trackSurvey(
  event: SurveyEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "surveys", ...meta });
}

/**
 * Track a user testing event (test creation, task completion/failure, report generation).
 */
export function trackUserTest(
  event: UserTestEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "user_testing", ...meta });
}

/**
 * Track a heatmap visualization event (generation, viewing, export, page analysis).
 */
export function trackHeatmap(
  event: HeatmapEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "heatmaps", ...meta });
}

/**
 * Track a customer household grouping event (detection, creation, merging, profiling).
 */
export function trackHousehold(
  event: HouseholdEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "households", ...meta });
}

/**
 * Track a third-party lead ingestion event (batch receive, parse, dedup, create).
 */
export function trackLeadIngestion(
  event: LeadIngestionEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "lead_ingestion", ...meta });
}

/**
 * Track an SMS messaging event (send, receive, delivery failure, conversation start).
 */
export function trackSMS(
  event: SMSEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "sms", ...meta });
}

/**
 * Track an eRating event (rate request, rate received, product selected, comparison viewed).
 */
export function trackERating(
  event: ERatingEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "erating", ...meta });
}

/**
 * Track an error monitoring event (capture, correlate, resolve, trend detected).
 */
export function trackErrorMonitor(
  event: ErrorMonitorEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "error_monitor", ...meta });
}

/**
 * Track a data warehouse export event (start, complete, fail, schedule).
 */
export function trackDataExport(
  event: DataExportEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "data_export", ...meta });
}

/**
 * Track a retention cohort analysis event (analysis generated, churn risk detected).
 */
export function trackCohort(
  event: CohortEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "cohorts", ...meta });
}

/**
 * Track a heatmap comparison event (comparison generated, diff calculated).
 */
export function trackHeatmapCompare(
  event: HeatmapCompareEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "heatmap_compare", ...meta });
}

/**
 * Track a store-to-door delivery event (request, confirm, transit, deliver, cancel).
 */
export function trackDelivery(
  event: DeliveryEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "delivery", ...meta });
}

/**
 * Track a reputation monitoring event (review detected, score calculated, alert, response).
 */
export function trackReputation(
  event: ReputationEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "reputation", ...meta });
}

/**
 * Track an omnichannel continuity event (handoff, timeline, channel merge).
 */
export function trackOmnichannel(
  event: OmnichannelEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "omnichannel", ...meta });
}

/**
 * Track a conversation intelligence event (call analysis, outcome, quality).
 */
export function trackCallIntelligence(
  event: CallIntelligenceEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "call_intelligence", ...meta });
}

/**
 * Track a video walkaround event (start, segment, publish, view).
 */
export function trackWalkaround(
  event: WalkaroundEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "walkarounds", ...meta });
}

/**
 * Track a propensity scoring event (train, predict, evaluate, rank).
 */
export function trackPropensity(
  event: PropensityEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "propensity", ...meta });
}

/**
 * Track an i18n locale event (detection, switching).
 */
export function trackI18n(
  event: I18nEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "i18n", ...meta });
}

/**
 * Track a vehicle delivery pipeline event (milestone update, slow mover alert).
 */
export function trackVehiclePipeline(
  event: VehiclePipelineEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "vehicle_pipeline", ...meta });
}

/**
 * Track a dashboard annotation event (create, delete, view).
 */
export function trackAnnotation(
  event: AnnotationEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "annotations", ...meta });
}

/**
 * Track a drip campaign event (create, enroll, send, convert, unsubscribe).
 */
export function trackDripCampaign(
  event: DripCampaignEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "drip_campaigns", ...meta });
}

/* ------------------------------------------------------------------ */
/*  Novel micro-behavioral signal trackers                             */
/* ------------------------------------------------------------------ */

/**
 * Track photo comparison dwell — A/B vehicle preference detection.
 */
export function trackPhotoComparison(
  event: PhotoComparisonEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "photo_comparison", ...meta });
}

/**
 * Track price sensitivity fingerprinting — budget ceiling detection.
 */
export function trackPriceSensitivity(
  event: PriceSensitivityEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "price_sensitivity", ...meta });
}

/**
 * Track decision velocity — impulse vs. comparison shopping classification.
 */
export function trackDecisionVelocity(
  event: DecisionVelocityEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "decision_velocity", ...meta });
}

/**
 * Track device handoff intent — mobile→desktop escalation signal.
 */
export function trackDeviceHandoff(
  event: DeviceHandoffEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "device_handoff", ...meta });
}

/**
 * Track night owl patterns — time-of-day purchase intent segmentation.
 */
export function trackNightOwl(
  event: NightOwlEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "night_owl", ...meta });
}

/**
 * Track inventory market-intel events — valuation snapshots, comparable
 * pulls, and pricing recommendations. Powers the dashboard market-intel
 * card and the nightly refresh cron.
 */
export function trackInventoryMarketIntel(
  event: InventoryMarketIntelEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "market_intel", ...meta });
}

/**
 * Track an analytics-console view/drill event. Read-only operator surfaces
 * emit this so the learning system can score which analytics views actually
 * drive dealer-operator action.
 */
export function trackAnalyticsView(
  event: AnalyticsViewEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "analytics_view", ...meta });
}

/**
 * Track a state title/lien lookup outcome (Stream E, migration 073).
 * Fires on every admin lookup attempt — success, failure, or unsupported.
 */
export function trackTitleLien(
  event: TitleLienEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "title_lien", ...meta });
}

/**
 * Track a USPS address-validation outcome (Stream E, migration 073).
 * Fires on every lead-capture / dealer-settings address save attempt.
 */
export function trackAddressValidation(
  event: AddressValidationEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "address_validation", ...meta });
}

/**
 * Track a BYO-credential lifecycle event (migration 069). Emitted by
 * `src/lib/external-credentials/*` whenever a dealer adds/rotates/revokes
 * a per-dealer API credential or when the proxy route makes a call.
 */
export function trackCredentials(
  event: CredentialsEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "credentials", ...meta });
}

/**
 * Track an F&I Penetration Audit lifecycle event (migration 074). Public
 * `/audits/fi-penetration` lead magnet — every state transition fires so
 * the BDC follow-up funnel + learning system get a complete view.
 *
 * `dealer_id` is the audit-run UUID here (these are pre-customer leads
 * with no dealer tenancy yet). Pass the row id so events correlate.
 */
export function trackFIAudit(
  event: FIAuditEvent,
  audit_run_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, audit_run_id, { module: "fi_audit", ...meta });
}

/**
 * Track a Website Audit event (migration 078). Emitted by the public
 * `/audits/website` flow on every state transition: submission, scan
 * lifecycle, PDF generation, delivery, demo booking.
 *
 * `dealer_id` is the audit-run UUID here (these are pre-customer leads
 * with no dealer tenancy yet). Pass the row id so events correlate.
 */
export function trackWebsiteAudit(
  event: WebsiteAuditEvent,
  audit_run_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, audit_run_id, { module: "website_audit", ...meta });
}

/**
 * Track a Dealership Literacy Ontology event (migration 075). Emitted by
 * `src/lib/literacy-ontology/*` mutating helpers and by the
 * `/api/admin/literacy/*` authoring routes.
 *
 * For curated-ontology lifecycle events (concept/mapping/metric/translation/
 * action created/updated/deleted) the curated tables are agency-shared, so
 * pass an agency-scoped pseudo-dealer_id ("wolfpack-ontology" works) as the
 * `dealer_id` argument — these events aren't per-dealer telemetry. For
 * render-side events (`translation_rendered`, `action_recommended`,
 * `outcome_recorded`) pass the real dealer_id so the learning loop can
 * correlate the rendered translation back to outcome rows.
 */
export function trackLiteracy(
  event: LiteracyEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "literacy", ...meta });
}

/**
 * Track a Wolfpack Assistant event (migration 077). Emitted by the
 * action registry, capability matcher, conversation logger, and the
 * `/api/admin/assistant/*` routes.
 *
 * For action-registry lifecycle events (action_listed) where the action
 * registry is agency-shared, pass an agency-scoped pseudo-dealer_id
 * ("wolfpack-assistant" works) as the `dealer_id` argument. For
 * conversation events (chat_prompt_received, action_proposed,
 * action_executed, action_rejected, dry_run_requested,
 * conversation_started, conversation_ended) pass the real dealer_id so
 * the learning loop can correlate the conversation back to dealer
 * outcomes.
 */
export function trackAssistant(
  event: AssistantEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "assistant", ...meta });
}

/**
 * Track a DMS adapter lifecycle event (migration 079).
 *
 * Fired by `src/lib/dms-adapters/adapter-registry.ts` whenever a dealer
 * configures, rotates, or revokes a DMS adapter credential, and whenever
 * the adapter executes (or fails to execute) a capability call. Every
 * action becomes a learning signal — the data moat the overlay product
 * relies on.
 */
export function trackDMSAdapter(
  event: DMSAdapterEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "dms_adapter", ...meta });
}

/**
 * Track an e-commerce adapter lifecycle event (migration 082).
 *
 * Fired by `src/lib/ecommerce-adapters/adapter-registry.ts` whenever a
 * tenant configures, rotates, or revokes an e-commerce adapter credential
 * (Shopify, BigCommerce, Adobe Commerce, Klaviyo, Attentive, Meta Ads,
 * Google Ads), and whenever the adapter executes (or fails to execute) a
 * capability call. Year-2 retail-vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`. Every action
 * becomes a learning signal — the data moat the overlay product relies on.
 *
 * `tenant_id` is passed through the legacy `dealer_id` analytics column
 * (vertical-agnostic tenancy reuses the same column to avoid a schema
 * fork). Retail tenants pass their tenant UUID; auto dealers continue to
 * pass `dealer_id`.
 */
export function trackEcommerceAdapter(
  event: EcommerceAdapterEvent,
  tenant_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, tenant_id, { module: "ecommerce_adapter", ...meta });
}

/**
 * Track a touchpoint lifecycle event (migration 081).
 *
 * Emitted by `src/lib/touchpoints/dispatcher.ts` on every physical-world
 * scan -- QR today; NFC / RFID / iBeacon year-two. The dealer_id is the
 * tenant scanning context (route layer resolves it from the
 * registration table or the public route's tenant-by-host helper).
 */
export function trackTouchpoint(
  event: TouchpointEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "touchpoint", ...meta });
}

/**
 * Track a maintenance-rails intake event. Emitted by
 * `src/lib/maintenance/intake-telemetry.ts` on every `maint-queue` issue
 * lifecycle transition (opened / triaged / resolved). The derived
 * `cycle_time_hours` signal rides in the metadata on `resolved` so the
 * learning aggregator can consume it from analytics_events.
 *
 * Agency-internal telemetry: pass the agency-scoped pseudo-dealer_id
 * ("wolfpack-maintenance") when no dealer tenancy applies.
 */
export function trackMaintenanceIntake(
  event: MaintenanceIntakeEvent,
  dealer_id: string,
  meta: Record<string, string | number | boolean>,
): void {
  track(event, dealer_id, { module: "maintenance_intake", ...meta });
}
