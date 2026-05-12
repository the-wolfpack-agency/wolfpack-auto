/**
 * GET /api/admin/analytics/fi-penetration
 *
 * Read-only operator surface. Returns the heatmap-shaped result from
 * `v_fi_penetration` (migration 072). 200 with cells + headline + axes; 401
 * if unauthenticated. Filters honored: monthFrom, monthTo, fiManagerId,
 * productType, drilled (boolean — when true, fires the `_drilled` event in
 * addition to `_viewed`).
 *
 * Shadow mode (no DATABASE_URL): returns honest demo data so the UI can be
 * developed against the real shape.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackAnalyticsView } from "@/lib/analytics-hooks";
import {
  FI_PRODUCT_TYPES,
  type FIProductType,
  type FIPenetrationFilters,
} from "@/lib/analytics-engine/fi-penetration";

function parseProductType(v: string | null): FIProductType | undefined {
  if (!v) return undefined;
  return (FI_PRODUCT_TYPES as readonly string[]).includes(v)
    ? (v as FIProductType)
    : undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const sp = new URL(request.url).searchParams;
  const filters: FIPenetrationFilters = {};

  const monthFrom = sp.get("monthFrom");
  const monthTo = sp.get("monthTo");
  if (monthFrom && ISO_DATE.test(monthFrom)) filters.monthFrom = monthFrom;
  if (monthTo && ISO_DATE.test(monthTo)) filters.monthTo = monthTo;

  const fiManagerId = sp.get("fiManagerId");
  if (fiManagerId) filters.fiManagerId = fiManagerId;

  const productType = parseProductType(sp.get("productType"));
  if (productType) filters.productType = productType;

  const drilled = sp.get("drilled") === "true";

  if (!process.env.DATABASE_URL) {
    const { demoPenetration } = await import(
      "@/lib/analytics-engine/fi-penetration"
    );
    const result = demoPenetration();
    trackAnalyticsView("analytics.fi_penetration_viewed", dealerId, {
      shadow: true,
      filter_count: Object.keys(filters).length,
    });
    if (drilled) {
      trackAnalyticsView("analytics.fi_penetration_drilled", dealerId, {
        shadow: true,
      });
    }
    return NextResponse.json({ ...result, shadow: true, dealerId });
  }

  const { getFIPenetration } = await import(
    "@/lib/analytics-engine/fi-penetration"
  );
  const result = await getFIPenetration(dealerId, filters);

  trackAnalyticsView("analytics.fi_penetration_viewed", dealerId, {
    filter_count: Object.keys(filters).length,
    cell_count: result.cells.length,
  });
  if (drilled) {
    trackAnalyticsView("analytics.fi_penetration_drilled", dealerId, {
      filter_count: Object.keys(filters).length,
      manager: filters.fiManagerId ?? "",
      product: filters.productType ?? "",
    });
  }
  return NextResponse.json({ ...result, dealerId });
}
