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

/* ------------------------------------------------------------------ */
/*  Event type unions                                                   */
/* ------------------------------------------------------------------ */

export type DealEvent =
  | "deal.created"
  | "deal.presented"
  | "deal.accepted"
  | "deal.funded"
  | "deal.unwound"
  | "deal.fi_product_added"
  | "deal.fi_product_removed"
  | "deal.payment_calculated";

export type ServiceEvent =
  | "service.appointment_created"
  | "service.appointment_completed"
  | "service.appointment_no_show"
  | "service.ro_created"
  | "service.ro_completed"
  | "service.part_ordered"
  | "service.part_low_stock";

export type CommsEvent =
  | "comms.message_sent"
  | "comms.message_opened"
  | "comms.message_clicked"
  | "comms.message_bounced"
  | "comms.sequence_started"
  | "comms.sequence_completed"
  | "comms.template_created";

export type AccountingEvent =
  | "accounting.sale_logged"
  | "accounting.commission_paid";

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

export type PlatformEvent =
  | DealEvent
  | ServiceEvent
  | CommsEvent
  | AccountingEvent
  | ReviewEvent
  | RetailEvent
  | CustomerEvent;

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
    // Fire and forget - do not await
    trackServerEvent(event, props).catch(() => {
      /* swallow — analytics must never throw */
    });
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
