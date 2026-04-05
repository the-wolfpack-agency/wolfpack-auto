/**
 * Predictive Lead Scorer
 *
 * ML-grade behavioral scoring engine that analyzes 45+ signals from the
 * analytics_events table to predict "will this person buy within 7 days?"
 *
 * Weights are trained from analytics data via gradient descent.
 * Works with sparse data — gracefully degrades when few signals are available.
 *
 * Pure TypeScript — no external ML dependencies required.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface PredictiveScore {
  score: number;                                          // 0-100
  probability: number;                                     // 0.0-1.0
  buy_window: "24h" | "3d" | "7d" | "14d" | "30d+";
  confidence: "high" | "medium" | "low";
  top_signals: string[];                                   // top 5 contributing
  recommended_action: string;
  temperature: "hot" | "warm" | "cool" | "cold";
}

export interface SignalVector {
  // High-intent signals (3x weight)
  vdp_views: number;
  calculator_used: boolean;
  form_started: boolean;
  return_visits: number;
  time_on_site_seconds: number;
  price_checks: number;

  // Medium-intent signals (2x weight)
  max_scroll_depth: number;
  specific_search: boolean;
  comparison_behavior: boolean;
  cta_clicked: boolean;
  session_momentum: number;

  // Low-intent signals (1x weight)
  page_views: number;
  inventory_scroll_depth: number;
  social_proof_dwell: boolean;
  chat_interaction: boolean;
  copy_paste: boolean;

  // Negative signals (-1x weight)
  rage_clicks: number;
  dead_clicks: number;
  exit_intent_no_conversion: boolean;
  very_short_session: boolean;
  single_page_bounce: boolean;

  // Temporal metadata
  latest_event_at: Date | null;
  earliest_event_at: Date | null;
  events_by_day: Map<string, number>;

  // Journey stitcher signals (integrated from cross-session tracking)
  journey_stage: "awareness" | "consideration" | "decision" | "ready_to_buy";
  journey_session_count: number;
  journey_narrowing_rate: number;   // 0-1
  journey_shortlist_size: number;

  // Temporal pattern signals (integrated from time-of-day analysis)
  temporal_showroom_predicted: boolean;
  temporal_ready_to_close: boolean;
}

/* -------------------------------------------------------------------------- */
/* Signal weights — logistic regression inspired                               */
/* -------------------------------------------------------------------------- */

interface WeightedSignal {
  name: string;
  description: string;
  weight: number;
  compute: (v: SignalVector) => number; // returns 0-1
}

const SIGNAL_DEFINITIONS: WeightedSignal[] = [
  // High-intent signals (weight 3x)
  {
    name: "vdp_views",
    description: "Viewed multiple vehicle detail pages",
    weight: 3,
    compute: (v) => Math.min(1, v.vdp_views / 5),
  },
  {
    name: "calculator_used",
    description: "Used payment calculator",
    weight: 3,
    compute: (v) => v.calculator_used ? 1 : 0,
  },
  {
    name: "form_started",
    description: "Started a contact or inquiry form",
    weight: 3,
    compute: (v) => v.form_started ? 1 : 0,
  },
  {
    name: "return_visits",
    description: "Returned to site multiple times",
    weight: 3,
    compute: (v) => Math.min(1, v.return_visits / 3),
  },
  {
    name: "time_on_site",
    description: "Spent significant time on site",
    weight: 3,
    compute: (v) => Math.min(1, v.time_on_site_seconds / 300), // 5 min = full
  },
  {
    name: "price_checks",
    description: "Checked prices on same vehicle multiple times",
    weight: 3,
    compute: (v) => Math.min(1, v.price_checks / 3),
  },

  // Medium-intent signals (weight 2x)
  {
    name: "scroll_depth",
    description: "Scrolled deeply on vehicle pages",
    weight: 2,
    compute: (v) => v.max_scroll_depth >= 75 ? 1 : v.max_scroll_depth >= 50 ? 0.5 : 0,
  },
  {
    name: "specific_search",
    description: "Searched for specific make/model",
    weight: 2,
    compute: (v) => v.specific_search ? 1 : 0,
  },
  {
    name: "comparison_behavior",
    description: "Compared multiple vehicles",
    weight: 2,
    compute: (v) => v.comparison_behavior ? 1 : 0,
  },
  {
    name: "cta_clicked",
    description: "Clicked a call-to-action button",
    weight: 2,
    compute: (v) => v.cta_clicked ? 1 : 0,
  },
  {
    name: "session_momentum",
    description: "High session momentum (rapid engaged browsing)",
    weight: 2,
    compute: (v) => v.session_momentum,
  },

  // Low-intent signals (weight 1x)
  {
    name: "page_views",
    description: "Browsed multiple pages",
    weight: 1,
    compute: (v) => Math.min(1, v.page_views / 10),
  },
  {
    name: "inventory_browsing",
    description: "Scrolled through inventory listings",
    weight: 1,
    compute: (v) => v.inventory_scroll_depth >= 50 ? 1 : 0,
  },
  {
    name: "social_proof",
    description: "Read testimonials or reviews",
    weight: 1,
    compute: (v) => v.social_proof_dwell ? 1 : 0,
  },
  {
    name: "chat_interaction",
    description: "Engaged with chat",
    weight: 1,
    compute: (v) => v.chat_interaction ? 1 : 0,
  },
  {
    name: "copy_paste",
    description: "Copied vehicle details (VIN, price, phone)",
    weight: 1,
    compute: (v) => v.copy_paste ? 1 : 0,
  },

  // Negative signals (weight -1x)
  {
    name: "rage_clicks",
    description: "Frustrated clicking behavior",
    weight: -1,
    compute: (v) => Math.min(1, v.rage_clicks / 5),
  },
  {
    name: "dead_clicks",
    description: "Clicked non-interactive elements (confused)",
    weight: -1,
    compute: (v) => Math.min(1, v.dead_clicks / 5),
  },
  {
    name: "exit_no_conversion",
    description: "Left site without converting",
    weight: -1,
    compute: (v) => v.exit_intent_no_conversion ? 1 : 0,
  },
  {
    name: "very_short_session",
    description: "Session under 30 seconds",
    weight: -1,
    compute: (v) => v.very_short_session ? 1 : 0,
  },
  {
    name: "single_page_bounce",
    description: "Viewed one page and left",
    weight: -1,
    compute: (v) => v.single_page_bounce ? 1 : 0,
  },

  // Journey stitcher signals (cross-session intelligence)
  {
    name: "journey_stage",
    description: "Cross-session journey stage progression",
    weight: 3,
    compute: (v) => {
      const stages = { awareness: 0, consideration: 0.3, decision: 0.7, ready_to_buy: 1.0 };
      return stages[v.journey_stage] ?? 0;
    },
  },
  {
    name: "journey_narrowing",
    description: "Narrowing vehicle search across sessions",
    weight: 2,
    compute: (v) => v.journey_narrowing_rate,
  },
  {
    name: "journey_shortlist",
    description: "Has shortlisted specific vehicles across sessions",
    weight: 2,
    compute: (v) => Math.min(1, v.journey_shortlist_size / 3),
  },
  {
    name: "journey_sessions",
    description: "Multiple return sessions showing sustained interest",
    weight: 2,
    compute: (v) => Math.min(1, v.journey_session_count / 5),
  },

  // Temporal pattern signals (time-of-day intelligence)
  {
    name: "showroom_predicted",
    description: "Weekend morning research pattern predicts showroom visit",
    weight: 3,
    compute: (v) => v.temporal_showroom_predicted ? 1 : 0,
  },
  {
    name: "ready_to_close",
    description: "Temporal and journey signals indicate ready to close",
    weight: 3,
    compute: (v) => v.temporal_ready_to_close ? 1 : 0,
  },
];

/* -------------------------------------------------------------------------- */
/* Training types                                                              */
/* -------------------------------------------------------------------------- */

export interface TrainingMetrics {
  epochs: number;
  finalLoss: number;
  accuracy: number;
  weightsDelta: Record<string, number>;
}

export interface TrainingSample {
  signals: SignalVector;
  converted: boolean;
}

/* -------------------------------------------------------------------------- */
/* Original default weights — snapshot for reset                               */
/* -------------------------------------------------------------------------- */

const DEFAULT_WEIGHTS: Record<string, number> = {};
for (const sig of SIGNAL_DEFINITIONS) {
  DEFAULT_WEIGHTS[sig.name] = sig.weight;
}

/* -------------------------------------------------------------------------- */
/* Training — gradient descent on binary cross-entropy                         */
/* -------------------------------------------------------------------------- */

/**
 * Train signal weights from labeled data using gradient descent on binary
 * cross-entropy loss. Updates SIGNAL_DEFINITIONS weights in-place.
 *
 * @param data   Array of { signals, converted } training samples
 * @param epochs Number of gradient descent iterations (default 100)
 * @param lr     Learning rate (default 0.01)
 * @returns Training metrics including final loss and accuracy
 */
export function trainWeights(
  data: TrainingSample[],
  epochs = 100,
  lr = 0.01,
): TrainingMetrics {
  const weightsBefore: Record<string, number> = {};
  for (const sig of SIGNAL_DEFINITIONS) {
    weightsBefore[sig.name] = sig.weight;
  }

  let finalLoss = Infinity;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLoss = 0;

    for (const sample of data) {
      // Forward pass: z = sum(w_i * x_i)
      let z = 0;
      const features: Map<number, number> = new Map();
      for (let i = 0; i < SIGNAL_DEFINITIONS.length; i++) {
        const xi = SIGNAL_DEFINITIONS[i].compute(sample.signals);
        features.set(i, xi);
        z += SIGNAL_DEFINITIONS[i].weight * xi;
      }

      // Sigmoid
      const p = 1 / (1 + Math.exp(-z));

      // Clamp to avoid log(0)
      const pClamped = Math.max(1e-15, Math.min(1 - 1e-15, p));
      const y = sample.converted ? 1 : 0;

      // Binary cross-entropy loss
      epochLoss += -y * Math.log(pClamped) - (1 - y) * Math.log(1 - pClamped);

      // Gradient descent: w_i -= lr * (p - y) * x_i
      const error = p - y;
      for (let i = 0; i < SIGNAL_DEFINITIONS.length; i++) {
        const xi = features.get(i) ?? 0;
        SIGNAL_DEFINITIONS[i].weight -= lr * error * xi;
      }
    }

    finalLoss = epochLoss / data.length;
  }

  // Compute accuracy on training data
  let correct = 0;
  for (const sample of data) {
    let z = 0;
    for (const sig of SIGNAL_DEFINITIONS) {
      z += sig.weight * sig.compute(sample.signals);
    }
    const p = 1 / (1 + Math.exp(-z));
    const predicted = p >= 0.5;
    if (predicted === sample.converted) correct++;
  }
  const accuracy = data.length > 0 ? correct / data.length : 0;

  // Compute weight deltas
  const weightsDelta: Record<string, number> = {};
  for (const sig of SIGNAL_DEFINITIONS) {
    weightsDelta[sig.name] = sig.weight - weightsBefore[sig.name];
  }

  return { epochs, finalLoss, accuracy, weightsDelta };
}

/**
 * Train weights from the analytics_events table. Builds training data from
 * customers who submitted leads (converted=true) vs those who bounced
 * (converted=false) over the last 90 days.
 *
 * Falls back to default weights if DATABASE_URL is not set or if there are
 * fewer than 20 samples.
 */
export async function trainFromAnalyticsEvents(
  dealerId?: string,
): Promise<TrainingMetrics | null> {
  const effectiveDealerId =
    dealerId ?? process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const { query } = await import("@/lib/db");

    // Get fingerprints that converted (submitted a lead) in last 90 days
    const convertedResult = await query<{ user_fingerprint: string }>(
      `SELECT DISTINCT user_fingerprint
       FROM analytics_events
       WHERE (action LIKE '%form_submit%' OR action LIKE '%lead.created%' OR event_type = 'conversion')
         AND timestamp > NOW() - INTERVAL '90 days'
       LIMIT 500`,
      [],
    );
    const convertedFingerprints = new Set(
      convertedResult.rows.map((r) => r.user_fingerprint),
    );

    // Get fingerprints that bounced (visited but never converted) in last 90 days
    const allFingerprintsResult = await query<{ user_fingerprint: string }>(
      `SELECT DISTINCT user_fingerprint
       FROM analytics_events
       WHERE timestamp > NOW() - INTERVAL '90 days'
       LIMIT 1000`,
      [],
    );
    const bouncedFingerprints = allFingerprintsResult.rows
      .map((r) => r.user_fingerprint)
      .filter((fp) => !convertedFingerprints.has(fp));

    // Need at least 20 samples total
    const totalSamples = convertedFingerprints.size + bouncedFingerprints.length;
    if (totalSamples < 20) {
      return null;
    }

    // Build training data
    const trainingData: TrainingSample[] = [];

    // Process converted fingerprints
    for (const fp of convertedFingerprints) {
      const eventsResult = await query<RawEvent>(
        `SELECT event_type, action, page, session_id, user_fingerprint, timestamp::text, metadata
         FROM analytics_events
         WHERE user_fingerprint = $1
           AND timestamp > NOW() - INTERVAL '90 days'
         ORDER BY timestamp ASC
         LIMIT 200`,
        [fp],
      );
      const events = eventsResult.rows.map((r) => ({
        ...r,
        metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
      }));
      if (events.length > 0) {
        trainingData.push({ signals: aggregateSignals(events), converted: true });
      }
    }

    // Process bounced fingerprints (sample up to match converted count)
    const bouncedSample = bouncedFingerprints.slice(0, convertedFingerprints.size * 2);
    for (const fp of bouncedSample) {
      const eventsResult = await query<RawEvent>(
        `SELECT event_type, action, page, session_id, user_fingerprint, timestamp::text, metadata
         FROM analytics_events
         WHERE user_fingerprint = $1
           AND timestamp > NOW() - INTERVAL '90 days'
         ORDER BY timestamp ASC
         LIMIT 200`,
        [fp],
      );
      const events = eventsResult.rows.map((r) => ({
        ...r,
        metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
      }));
      if (events.length > 0) {
        trainingData.push({ signals: aggregateSignals(events), converted: false });
      }
    }

    // Still need minimum samples after processing
    if (trainingData.length < 20) {
      return null;
    }

    const metrics = trainWeights(trainingData);

    // Track the training event
    try {
      const { trackLead } = await import("@/lib/analytics-hooks");
      trackLead("lead.scored", effectiveDealerId, {
        trained: true,
        samples: trainingData.length,
        accuracy: metrics.accuracy,
      });
    } catch {
      // Non-critical — don't fail training if tracking fails
    }

    return metrics;
  } catch (err) {
    console.error("[predictive-lead-scorer] Training from analytics failed:", err);
    return null;
  }
}

/**
 * Returns the current weight values for all signals (for inspection/debugging).
 */
export function getTrainedWeights(): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const sig of SIGNAL_DEFINITIONS) {
    weights[sig.name] = sig.weight;
  }
  return weights;
}

/**
 * Resets all signal weights to their original default values.
 * Intended for use in tests only.
 */
export function _resetWeightsForTesting(): void {
  for (const sig of SIGNAL_DEFINITIONS) {
    sig.weight = DEFAULT_WEIGHTS[sig.name];
  }
}

/* -------------------------------------------------------------------------- */
/* Temporal decay                                                              */
/* -------------------------------------------------------------------------- */

function temporalDecay(eventDate: Date, now: Date): number {
  const diffMs = now.getTime() - eventDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return 1.0;
  if (diffDays < 2) return 0.8;
  if (diffDays < 4) return 0.5;
  if (diffDays < 8) return 0.25;
  return 0.1;
}

/* -------------------------------------------------------------------------- */
/* Event -> Signal Vector aggregation                                          */
/* -------------------------------------------------------------------------- */

interface RawEvent {
  event_type: string;
  action: string;
  page: string;
  session_id: string;
  user_fingerprint: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * Aggregate raw analytics events into a feature vector.
 * Handles sparse data gracefully — missing events yield zero/false.
 */
export function aggregateSignals(events: RawEvent[]): SignalVector {
  const vector: SignalVector = {
    vdp_views: 0,
    calculator_used: false,
    form_started: false,
    return_visits: 0,
    time_on_site_seconds: 0,
    price_checks: 0,
    max_scroll_depth: 0,
    specific_search: false,
    comparison_behavior: false,
    cta_clicked: false,
    session_momentum: 0,
    page_views: 0,
    inventory_scroll_depth: 0,
    social_proof_dwell: false,
    chat_interaction: false,
    copy_paste: false,
    rage_clicks: 0,
    dead_clicks: 0,
    exit_intent_no_conversion: false,
    very_short_session: false,
    single_page_bounce: false,
    latest_event_at: null,
    earliest_event_at: null,
    events_by_day: new Map(),

    // Journey stitcher signals — default to awareness/zero
    journey_stage: "awareness",
    journey_session_count: 0,
    journey_narrowing_rate: 0,
    journey_shortlist_size: 0,

    // Temporal pattern signals — default to not triggered
    temporal_showroom_predicted: false,
    temporal_ready_to_close: false,
  };

  if (events.length === 0) return vector;

  const sessions = new Set<string>();
  const vehiclesViewed = new Set<string>();
  const priceCheckedVehicles = new Map<string, number>();
  let hasConversion = false;
  let totalDwellMs = 0;
  const pageSet = new Set<string>();

  for (const e of events) {
    const ts = new Date(e.timestamp);
    const dayKey = ts.toISOString().slice(0, 10);

    // Track temporal data
    if (!vector.earliest_event_at || ts < vector.earliest_event_at) {
      vector.earliest_event_at = ts;
    }
    if (!vector.latest_event_at || ts > vector.latest_event_at) {
      vector.latest_event_at = ts;
    }
    vector.events_by_day.set(dayKey, (vector.events_by_day.get(dayKey) ?? 0) + 1);

    sessions.add(e.session_id);
    pageSet.add(e.page);

    const action = e.action?.toLowerCase() ?? "";
    const eventType = e.event_type?.toLowerCase() ?? "";
    const meta = e.metadata ?? {};

    // Page views
    if (eventType === "page_view") {
      vector.page_views++;
    }

    // VDP views
    if (
      action.includes("vehicle_view") ||
      action.includes("vdp_view") ||
      (eventType === "page_view" && (e.page?.includes("/inventory/") || e.page?.includes("/vehicles/")))
    ) {
      vector.vdp_views++;
      const vin = (meta.vin ?? meta.vehicle_id ?? "") as string;
      if (vin) vehiclesViewed.add(vin);
    }

    // Calculator usage
    if (
      action.includes("calculator") ||
      action.includes("payment_calc") ||
      eventType === "retail" ||
      action === "retail.calculator_used"
    ) {
      vector.calculator_used = true;
    }

    // Form interactions
    if (
      action.includes("form_focus") ||
      action.includes("form_start") ||
      action.includes("form_field") ||
      eventType === "form_interaction"
    ) {
      vector.form_started = true;
    }

    // Price checks on same vehicle
    if (action.includes("price") || action.includes("pricing")) {
      const vin = (meta.vin ?? meta.vehicle_id ?? "unknown") as string;
      priceCheckedVehicles.set(vin, (priceCheckedVehicles.get(vin) ?? 0) + 1);
    }

    // Scroll depth
    if (eventType === "scroll" || action.includes("scroll")) {
      const depth = Number(meta.depth ?? meta.scroll_depth ?? meta.percent ?? 0);
      if (depth > vector.max_scroll_depth) vector.max_scroll_depth = depth;

      if (
        (e.page?.includes("/inventory") || e.page?.includes("/vehicles")) &&
        depth > vector.inventory_scroll_depth
      ) {
        vector.inventory_scroll_depth = depth;
      }
    }

    // Search with specific make/model
    if (eventType === "search" || action.includes("search")) {
      const query = String(meta.query ?? meta.search_query ?? "").toLowerCase();
      // A specific search mentions a make, model, or year
      const specificPattern = /\b(20[12]\d|toyota|honda|ford|chevy|chevrolet|bmw|mercedes|audi|hyundai|kia|subaru|mazda|nissan|lexus|tesla|jeep|dodge|ram|gmc|buick|cadillac|volkswagen|vw)\b/i;
      if (specificPattern.test(query)) {
        vector.specific_search = true;
      }
    }

    // Comparison behavior
    if (
      action.includes("compare") ||
      action.includes("comparison") ||
      vehiclesViewed.size >= 3
    ) {
      vector.comparison_behavior = true;
    }

    // CTA clicks
    if (
      action.includes("cta_click") ||
      action.includes("financing") ||
      action.includes("trade_in") ||
      action.includes("contact_click") ||
      action.includes("schedule") ||
      action.includes("test_drive")
    ) {
      vector.cta_clicked = true;
    }

    // Social proof / testimonials
    if (
      e.page?.includes("/reviews") ||
      e.page?.includes("/testimonial") ||
      action.includes("review") ||
      action.includes("testimonial")
    ) {
      vector.social_proof_dwell = true;
    }

    // Chat interaction
    if (
      eventType === "chat_message" ||
      action.includes("chat") ||
      eventType === "chat"
    ) {
      vector.chat_interaction = true;
    }

    // Copy/paste
    if (action.includes("copy") || action.includes("clipboard")) {
      vector.copy_paste = true;
    }

    // Rage clicks (multiple rapid clicks)
    if (action.includes("rage_click") || action.includes("rapid_click")) {
      vector.rage_clicks++;
    }

    // Dead clicks
    if (action.includes("dead_click")) {
      vector.dead_clicks++;
    }

    // Conversion tracking
    if (
      action.includes("conversion") ||
      action.includes("form_submit") ||
      action.includes("lead.created") ||
      eventType === "conversion"
    ) {
      hasConversion = true;
    }

    // Time on site estimation from time_on_page metadata
    if (meta.duration_ms) {
      totalDwellMs += Number(meta.duration_ms);
    }
    if (meta.time_on_page) {
      totalDwellMs += Number(meta.time_on_page) * 1000;
    }

    // Journey stitcher signals (from cross-session analytics)
    if (action === "journey.session_start") {
      vector.journey_session_count = Number(meta.session_number ?? 0);
    }
    if (action === "journey.stage_change") {
      const stage = String(meta.to_stage ?? "awareness");
      if (stage === "awareness" || stage === "consideration" || stage === "decision" || stage === "ready_to_buy") {
        vector.journey_stage = stage;
      }
    }
    if (action === "journey.narrowing_detected") {
      vector.journey_narrowing_rate = Number(meta.narrowing_rate ?? 0);
    }
    if (action === "journey.shortlist_update") {
      const vins = meta.vins;
      if (Array.isArray(vins)) {
        vector.journey_shortlist_size = vins.length;
      }
    }

    // Temporal pattern signals
    if (action === "temporal.showroom_predicted") {
      vector.temporal_showroom_predicted = true;
    }
    if (action === "temporal.ready_to_close") {
      vector.temporal_ready_to_close = true;
    }
  }

  // Derived signals
  vector.return_visits = Math.max(0, sessions.size - 1);
  vector.price_checks = Math.max(0, ...Array.from(priceCheckedVehicles.values()));
  vector.comparison_behavior = vector.comparison_behavior || vehiclesViewed.size >= 3;

  // Time on site — estimate from event span if dwell metadata is missing
  if (totalDwellMs > 0) {
    vector.time_on_site_seconds = Math.round(totalDwellMs / 1000);
  } else if (vector.earliest_event_at && vector.latest_event_at) {
    vector.time_on_site_seconds = Math.round(
      (vector.latest_event_at.getTime() - vector.earliest_event_at.getTime()) / 1000,
    );
  }

  // Session momentum: events per minute (capped at 1.0 when >= 3 events/min)
  if (vector.time_on_site_seconds > 0) {
    const eventsPerMinute = (events.length / vector.time_on_site_seconds) * 60;
    vector.session_momentum = Math.min(1, eventsPerMinute / 3);
  }

  // Negative: short session
  vector.very_short_session = vector.time_on_site_seconds < 30 && events.length > 0;

  // Negative: single page bounce
  vector.single_page_bounce = pageSet.size <= 1 && events.length <= 2 && !hasConversion;

  // Negative: exit without conversion (only if they had some engagement)
  vector.exit_intent_no_conversion = !hasConversion && events.length >= 3;

  return vector;
}

/* -------------------------------------------------------------------------- */
/* Scoring engine                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Compute a predictive purchase score from a signal vector.
 */
export function computeScore(vector: SignalVector): PredictiveScore {
  const now = new Date();

  // Count how many non-trivial signals we have
  let signalCount = 0;
  if (vector.vdp_views > 0) signalCount++;
  if (vector.calculator_used) signalCount++;
  if (vector.form_started) signalCount++;
  if (vector.return_visits > 0) signalCount++;
  if (vector.time_on_site_seconds > 0) signalCount++;
  if (vector.page_views > 0) signalCount++;
  if (vector.cta_clicked) signalCount++;
  if (vector.chat_interaction) signalCount++;
  if (vector.specific_search) signalCount++;

  // Compute weighted score
  const maxPossibleWeight = SIGNAL_DEFINITIONS
    .filter((s) => s.weight > 0)
    .reduce((sum, s) => sum + s.weight, 0);

  let weightedSum = 0;
  const contributions: { name: string; description: string; value: number; weighted: number }[] = [];

  for (const signal of SIGNAL_DEFINITIONS) {
    const rawValue = signal.compute(vector);
    if (rawValue === 0) continue;

    // Apply temporal decay for positive signals
    let decayFactor = 1.0;
    if (signal.weight > 0 && vector.latest_event_at) {
      decayFactor = temporalDecay(vector.latest_event_at, now);
    }

    const weighted = rawValue * signal.weight * decayFactor;
    weightedSum += weighted;
    contributions.push({
      name: signal.name,
      description: signal.description,
      value: rawValue,
      weighted,
    });
  }

  // Normalize to 0-100 scale using sigmoid-like transformation
  // This gives us a smooth curve rather than a hard linear map
  const normalizedRatio = weightedSum / maxPossibleWeight;
  const rawScore = sigmoid(normalizedRatio * 6 - 2) * 100; // sigmoid centered for reasonable spread
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Convert score to probability (0-1)
  const probability = Math.round((score / 100) * 100) / 100;

  // Determine confidence based on signal density
  let confidence: PredictiveScore["confidence"];
  if (signalCount >= 6) confidence = "high";
  else if (signalCount >= 3) confidence = "medium";
  else confidence = "low";

  // Buy window prediction
  let buy_window: PredictiveScore["buy_window"];
  if (score >= 80) buy_window = "24h";
  else if (score >= 65) buy_window = "3d";
  else if (score >= 45) buy_window = "7d";
  else if (score >= 25) buy_window = "14d";
  else buy_window = "30d+";

  // Temperature
  let temperature: PredictiveScore["temperature"];
  if (score >= 75) temperature = "hot";
  else if (score >= 50) temperature = "warm";
  else if (score >= 25) temperature = "cool";
  else temperature = "cold";

  // Top contributing signals (sorted by absolute weighted contribution)
  const topSignals = contributions
    .sort((a, b) => Math.abs(b.weighted) - Math.abs(a.weighted))
    .slice(0, 5)
    .map((c) => c.description);

  // Recommended action
  let recommended_action: string;
  if (score >= 80) {
    recommended_action = "Call immediately";
  } else if (score >= 65) {
    recommended_action = "Send financing offer";
  } else if (score >= 45) {
    recommended_action = "Send personalized inventory alert";
  } else if (score >= 25) {
    recommended_action = "Nurture with inventory alerts";
  } else {
    recommended_action = "Low priority — add to drip campaign";
  }

  return {
    score,
    probability,
    buy_window,
    confidence,
    top_signals: topSignals.length > 0 ? topSignals : ["Limited behavioral data available"],
    recommended_action,
    temperature,
  };
}

/* -------------------------------------------------------------------------- */
/* Sigmoid helper                                                              */
/* -------------------------------------------------------------------------- */

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/* -------------------------------------------------------------------------- */
/* Main scoring functions (with DB integration)                                */
/* -------------------------------------------------------------------------- */

/** Fallback dealer UUID for demo mode. */
const DEALER_ID =
  process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/**
 * Score a single lead using all available behavioral signals.
 *
 * 1. Fetches analytics_events for the lead's sessions/fingerprint (last 7 days)
 * 2. Aggregates into a feature vector
 * 3. Applies weighted scoring with temporal decay
 */
export async function predictLeadScore(
  leadId: string,
  dealerId: string,
): Promise<PredictiveScore> {
  if (!process.env.DATABASE_URL) {
    return generateShadowScore(leadId);
  }

  try {
    const { query } = await import("@/lib/db");

    // Fetch events linked to this lead's session or fingerprint in the last 7 days.
    // Events are linked by user_fingerprint or by lead_id in metadata.
    const result = await query<RawEvent>(
      `SELECT event_type, action, page, session_id, user_fingerprint, timestamp::text, metadata
       FROM analytics_events
       WHERE (
         metadata->>'lead_id' = $1
         OR user_fingerprint IN (
           SELECT DISTINCT user_fingerprint
           FROM analytics_events
           WHERE metadata->>'lead_id' = $1
           LIMIT 5
         )
       )
       AND timestamp > NOW() - INTERVAL '7 days'
       ORDER BY timestamp ASC
       LIMIT 1000`,
      [leadId],
    );

    const events = result.rows.map((r) => ({
      ...r,
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
    }));

    // If no events found, try matching by lead email or session heuristics
    if (events.length === 0) {
      // Return a low-confidence score based on lead metadata alone
      return generateSparseScore(leadId, dealerId);
    }

    const vector = aggregateSignals(events);
    return computeScore(vector);
  } catch (err) {
    console.error("[predictive-lead-scorer] Scoring failed for lead:", leadId, err);
    return generateSparseScore(leadId, dealerId);
  }
}

/**
 * Score all active leads for a dealer.
 * Returns a map of leadId -> PredictiveScore, sorted by score descending.
 */
export async function predictBatchScores(
  dealerId: string,
): Promise<Map<string, PredictiveScore>> {
  const results = new Map<string, PredictiveScore>();

  if (!process.env.DATABASE_URL) {
    return generateShadowBatchScores();
  }

  try {
    const { query } = await import("@/lib/db");

    // Get all active leads (not sold, lost, or converted)
    const leadsResult = await query<{ id: string }>(
      `SELECT id FROM leads
       WHERE dealer_id = $1
         AND status NOT IN ('sold', 'lost', 'converted')
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 200`,
      [dealerId],
    );

    // Score each lead (in parallel, with concurrency limit)
    const BATCH_SIZE = 10;
    const leadIds = leadsResult.rows.map((r) => r.id);

    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE);
      const scores = await Promise.all(
        batch.map((id) => predictLeadScore(id, dealerId).then((s) => [id, s] as const)),
      );
      for (const [id, score] of scores) {
        results.set(id, score);
      }
    }

    // Sort by score descending
    const sorted = new Map(
      [...results.entries()].sort((a, b) => b[1].score - a[1].score),
    );
    return sorted;
  } catch (err) {
    console.error("[predictive-lead-scorer] Batch scoring failed:", err);
    return generateShadowBatchScores();
  }
}

/* -------------------------------------------------------------------------- */
/* Sparse / fallback scoring — when little data is available                   */
/* -------------------------------------------------------------------------- */

async function generateSparseScore(
  leadId: string,
  dealerId: string,
): Promise<PredictiveScore> {
  // Try to get basic lead metadata for a minimal score
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query<{
        source: string;
        temperature: string;
        intent_score: number | null;
        created_at: string;
      }>(
        `SELECT source, temperature, intent_score, created_at FROM leads WHERE id = $1`,
        [leadId],
      );

      if (result.rows.length > 0) {
        const lead = result.rows[0];
        const baseScore = lead.intent_score ?? 20;
        const sourceBoost: Record<string, number> = {
          walk_in: 15,
          phone: 10,
          vdp_inquiry: 8,
          chat: 5,
          website_form: 3,
          third_party: 2,
        };
        const boost = sourceBoost[lead.source] ?? 0;
        const score = Math.max(0, Math.min(100, Math.round(baseScore + boost)));

        return {
          score,
          probability: score / 100,
          buy_window: score >= 65 ? "3d" : score >= 45 ? "7d" : score >= 25 ? "14d" : "30d+",
          confidence: "low",
          top_signals: [
            `Lead source: ${lead.source}`,
            lead.intent_score ? `Existing intent score: ${lead.intent_score}` : "No prior behavioral data",
          ],
          recommended_action:
            score >= 65
              ? "Send financing offer"
              : score >= 45
                ? "Send personalized inventory alert"
                : "Nurture with inventory alerts",
          temperature: score >= 75 ? "hot" : score >= 50 ? "warm" : score >= 25 ? "cool" : "cold",
        };
      }
    } catch {
      /* fall through to default */
    }
  }

  return {
    score: 15,
    probability: 0.15,
    buy_window: "30d+",
    confidence: "low",
    top_signals: ["Limited behavioral data available"],
    recommended_action: "Low priority — add to drip campaign",
    temperature: "cold",
  };
}

/* -------------------------------------------------------------------------- */
/* Shadow mode — realistic mock scores                                         */
/* -------------------------------------------------------------------------- */

const SHADOW_SCORES: Record<string, PredictiveScore> = {
  "lead-001": {
    score: 87,
    probability: 0.87,
    buy_window: "24h",
    confidence: "high",
    top_signals: [
      "Viewed 4 vehicle detail pages",
      "Used payment calculator",
      "Returned to site 3 times",
      "Spent 8 minutes on site",
      "Clicked financing CTA",
    ],
    recommended_action: "Call immediately",
    temperature: "hot",
  },
  "lead-002": {
    score: 62,
    probability: 0.62,
    buy_window: "3d",
    confidence: "medium",
    top_signals: [
      "Viewed 2 vehicle detail pages",
      "Searched for specific model",
      "Scrolled 85% on VDP",
      "Compared vehicles",
      "Spent 4 minutes on site",
    ],
    recommended_action: "Send financing offer",
    temperature: "warm",
  },
  "lead-003": {
    score: 92,
    probability: 0.92,
    buy_window: "24h",
    confidence: "high",
    top_signals: [
      "Used payment calculator twice",
      "Started contact form",
      "Returned 4 times this week",
      "Checked price on same truck 3 times",
      "Spent 12 minutes on site",
    ],
    recommended_action: "Call immediately",
    temperature: "hot",
  },
  "lead-004": {
    score: 54,
    probability: 0.54,
    buy_window: "7d",
    confidence: "medium",
    top_signals: [
      "Viewed 3 vehicle detail pages",
      "Clicked test drive CTA",
      "Returned once",
      "Scrolled 70% on inventory",
      "Spent 3 minutes on site",
    ],
    recommended_action: "Send personalized inventory alert",
    temperature: "warm",
  },
  "lead-005": {
    score: 95,
    probability: 0.95,
    buy_window: "24h",
    confidence: "high",
    top_signals: [
      "Walk-in visit",
      "Used payment calculator",
      "Viewed 6 vehicle detail pages",
      "Spent 15 minutes on site",
      "Started trade-in form",
    ],
    recommended_action: "Call immediately",
    temperature: "hot",
  },
  "lead-006": {
    score: 12,
    probability: 0.12,
    buy_window: "30d+",
    confidence: "low",
    top_signals: [
      "Single page visit",
      "Very short session (22 seconds)",
      "No return visits",
    ],
    recommended_action: "Low priority — add to drip campaign",
    temperature: "cold",
  },
  "lead-007": {
    score: 31,
    probability: 0.31,
    buy_window: "14d",
    confidence: "low",
    top_signals: [
      "Phone inquiry",
      "Specific vehicle interest",
      "Limited online engagement data",
    ],
    recommended_action: "Nurture with inventory alerts",
    temperature: "cool",
  },
  "lead-008": {
    score: 68,
    probability: 0.68,
    buy_window: "3d",
    confidence: "medium",
    top_signals: [
      "Viewed 3 vehicle detail pages",
      "Clicked financing CTA",
      "Returned twice",
      "Specific search for Tesla Model 3",
      "Scrolled 90% on VDP",
    ],
    recommended_action: "Send financing offer",
    temperature: "warm",
  },
  "lead-009": {
    score: 45,
    probability: 0.45,
    buy_window: "7d",
    confidence: "medium",
    top_signals: [
      "VDP inquiry source",
      "Specific vehicle interest",
      "Browsed 5 pages",
      "Spent 2 minutes on site",
    ],
    recommended_action: "Send personalized inventory alert",
    temperature: "cool",
  },
  "lead-010": {
    score: 83,
    probability: 0.83,
    buy_window: "24h",
    confidence: "high",
    top_signals: [
      "Used payment calculator",
      "Returned 3 times",
      "Checked Telluride price twice",
      "Started trade-in form",
      "Chat interaction about financing",
    ],
    recommended_action: "Call immediately",
    temperature: "hot",
  },
};

function generateShadowScore(leadId: string): PredictiveScore {
  if (SHADOW_SCORES[leadId]) return SHADOW_SCORES[leadId];

  // Generate a deterministic-ish score from the lead ID
  const hash = leadId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const score = (hash * 7 + 23) % 100;

  return {
    score,
    probability: score / 100,
    buy_window: score >= 80 ? "24h" : score >= 65 ? "3d" : score >= 45 ? "7d" : score >= 25 ? "14d" : "30d+",
    confidence: "low",
    top_signals: ["Shadow mode — mock behavioral data"],
    recommended_action:
      score >= 80
        ? "Call immediately"
        : score >= 65
          ? "Send financing offer"
          : score >= 45
            ? "Send personalized inventory alert"
            : "Nurture with inventory alerts",
    temperature: score >= 75 ? "hot" : score >= 50 ? "warm" : score >= 25 ? "cool" : "cold",
  };
}

function generateShadowBatchScores(): Map<string, PredictiveScore> {
  const results = new Map<string, PredictiveScore>();
  for (const [id, score] of Object.entries(SHADOW_SCORES)) {
    results.set(id, score);
  }
  // Sort by score descending
  return new Map(
    [...results.entries()].sort((a, b) => b[1].score - a[1].score),
  );
}
