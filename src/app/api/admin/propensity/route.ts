import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackPropensity } from "@/lib/analytics-hooks";
import {
  extractFeatures,
  predictPurchaseProbability,
  rankCustomersByPropensity,
  trainModel,
  getFeatureImportance,
  isModelTrained,
  type TrainingDataPoint,
} from "@/lib/propensity-model";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_CUSTOMERS = [
  extractFeatures("cust-001", { visitFrequency: 12, recencyDays: 1, pagesViewed: 45, vehiclesViewed: 8, timeOnSiteMinutes: 120, chatUsed: true, formInteractions: 3, emailOpens: 5, pastPurchases: 1 }),
  extractFeatures("cust-002", { visitFrequency: 8, recencyDays: 3, pagesViewed: 30, vehiclesViewed: 5, timeOnSiteMinutes: 60, chatUsed: false, formInteractions: 2, emailOpens: 3, pastPurchases: 0 }),
  extractFeatures("cust-003", { visitFrequency: 2, recencyDays: 14, pagesViewed: 8, vehiclesViewed: 2, timeOnSiteMinutes: 10, chatUsed: false, formInteractions: 0, emailOpens: 1, pastPurchases: 0 }),
  extractFeatures("cust-004", { visitFrequency: 15, recencyDays: 0, pagesViewed: 60, vehiclesViewed: 12, timeOnSiteMinutes: 200, chatUsed: true, formInteractions: 5, emailOpens: 8, pastPurchases: 2 }),
  extractFeatures("cust-005", { visitFrequency: 1, recencyDays: 30, pagesViewed: 3, vehiclesViewed: 1, timeOnSiteMinutes: 5, chatUsed: false, formInteractions: 0, emailOpens: 0, pastPurchases: 0 }),
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/propensity                                                   */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  // Shadow mode — return demo predictions
  if (!process.env.DATABASE_URL) {
    const ranked = rankCustomersByPropensity(DEMO_CUSTOMERS);
    const importance = getFeatureImportance();

    trackPropensity("propensity.ranking_generated", dealerId, {
      customer_count: ranked.length,
    });

    return NextResponse.json({
      ranked,
      featureImportance: importance,
      modelTrained: isModelTrained(),
      customerCount: ranked.length,
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Pull behavioral features from analytics events
    const result = await query<{
      customer_id: string;
      visit_count: number;
      days_since_last: number;
      pages: number;
      vehicles: number;
      time_minutes: number;
      chat_used: boolean;
      forms: number;
      email_opens: number;
      purchases: number;
    }>(
      `SELECT
         customer_id,
         COUNT(DISTINCT DATE(timestamp)) AS visit_count,
         EXTRACT(DAY FROM NOW() - MAX(timestamp))::int AS days_since_last,
         COUNT(*) AS pages,
         COUNT(DISTINCT metadata->>'vin') FILTER (WHERE metadata->>'vin' IS NOT NULL) AS vehicles,
         COALESCE(SUM((metadata->>'duration_minutes')::numeric), 0)::int AS time_minutes,
         BOOL_OR(action LIKE 'chat.%') AS chat_used,
         COUNT(*) FILTER (WHERE action LIKE 'form.%') AS forms,
         COUNT(*) FILTER (WHERE action LIKE 'email.opened%') AS email_opens,
         0 AS purchases
       FROM analytics_events
       WHERE page = $1
         AND timestamp > NOW() - INTERVAL '30 days'
       GROUP BY customer_id
       LIMIT 200`,
      [dealerId],
    );

    const features = result.rows.map((r) =>
      extractFeatures(r.customer_id, {
        visitFrequency: r.visit_count,
        recencyDays: r.days_since_last,
        pagesViewed: r.pages,
        vehiclesViewed: r.vehicles,
        timeOnSiteMinutes: r.time_minutes,
        chatUsed: r.chat_used,
        formInteractions: r.forms,
        emailOpens: r.email_opens,
        pastPurchases: r.purchases,
      }),
    );

    const ranked = rankCustomersByPropensity(features);
    const importance = getFeatureImportance();

    trackPropensity("propensity.ranking_generated", dealerId, {
      customer_count: ranked.length,
    });

    return NextResponse.json({
      ranked,
      featureImportance: importance,
      modelTrained: isModelTrained(),
      customerCount: ranked.length,
    });
  } catch (err) {
    console.error("[propensity] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load propensity data" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/propensity                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: { action: "train" | "predict"; data?: TrainingDataPoint[]; customerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "train") {
    // In shadow mode, generate synthetic training data
    const trainingData: TrainingDataPoint[] = body.data ?? [
      { features: DEMO_CUSTOMERS[0], purchased: true },
      { features: DEMO_CUSTOMERS[1], purchased: true },
      { features: DEMO_CUSTOMERS[2], purchased: false },
      { features: DEMO_CUSTOMERS[3], purchased: true },
      { features: DEMO_CUSTOMERS[4], purchased: false },
    ];

    const metrics = trainModel(trainingData);

    trackPropensity("propensity.model_trained", dealerId, {
      training_size: trainingData.length,
      accuracy: metrics.accuracy,
      auc: metrics.auc,
    });

    return NextResponse.json({ metrics, featureImportance: getFeatureImportance() });
  }

  if (body.action === "predict") {
    const features = extractFeatures(body.customerId ?? "unknown");
    const prediction = predictPurchaseProbability(features);

    trackPropensity("propensity.prediction_made", dealerId, {
      customer_id: body.customerId ?? "unknown",
      probability: prediction.probability,
      tier: prediction.tier,
    });

    return NextResponse.json({ prediction });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
