/**
 * VDP Background Generator
 *
 * CSS-based vehicle photo background replacement system. Provides
 * preset backgrounds (showroom, outdoor, branded, seasonal) that
 * render via CSS gradients, filters, and blend modes -- no GPU or
 * image-processing service required for v1.
 *
 * Future: swap CSS approach for AI background removal (e.g. Replicate
 * remove-bg) when ready. The preset IDs and analytics stay the same.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type BackgroundPresetId =
  | "showroom_white"
  | "showroom_dark"
  | "outdoor_scenic"
  | "dealer_branded"
  | "urban_night"
  | "minimalist"
  | "seasonal_winter"
  | "seasonal_summer";

export type BackgroundCategory =
  | "studio"
  | "outdoor"
  | "branded"
  | "seasonal";

export interface BackgroundPreset {
  id: BackgroundPresetId;
  name: string;
  description: string;
  /** CSS class or inline style snippet for the thumbnail card */
  thumbnailCSS: string;
  category: BackgroundCategory;
}

export interface DealerColors {
  primary: string;
  secondary: string;
}

export interface VehicleForBackground {
  vin: string;
  color?: string;
  body_type?: string;
  price?: number;
  condition?: string;
}

export interface BatchBackgroundPlan {
  vin: string;
  recommended_preset: BackgroundPresetId;
  reason: string;
}

export interface PhotoEngagementData {
  views: number;
  avg_dwell_ms: number;
  clicks: number;
  leads_generated: number;
}

export interface BackgroundPerformanceRecord {
  vin: string;
  preset: BackgroundPresetId;
  engagement: PhotoEngagementData;
  recorded_at: string;
}

export interface BackgroundInsight {
  preset: BackgroundPresetId;
  total_views: number;
  avg_dwell_ms: number;
  total_clicks: number;
  total_leads: number;
  engagement_score: number;
  sample_size: number;
}

/* ------------------------------------------------------------------ */
/*  Preset definitions                                                 */
/* ------------------------------------------------------------------ */

const PRESETS: BackgroundPreset[] = [
  {
    id: "showroom_white",
    name: "White Showroom",
    description: "Clean white studio background with subtle shadow and reflection",
    thumbnailCSS:
      "background: linear-gradient(180deg, #ffffff 0%, #f0f0f0 70%, #e0e0e0 100%);",
    category: "studio",
  },
  {
    id: "showroom_dark",
    name: "Dark Showroom",
    description: "Premium dark studio with dramatic lighting accents",
    thumbnailCSS:
      "background: linear-gradient(180deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);",
    category: "studio",
  },
  {
    id: "outdoor_scenic",
    name: "Scenic Outdoor",
    description: "Blurred outdoor scene with mountains, road, and sky gradient",
    thumbnailCSS:
      "background: linear-gradient(180deg, #87CEEB 0%, #a8d8ea 40%, #6b8e4e 65%, #3d5a3e 100%);",
    category: "outdoor",
  },
  {
    id: "dealer_branded",
    name: "Dealer Branded",
    description: "Uses your dealership brand colors as a gradient backdrop",
    thumbnailCSS:
      "background: linear-gradient(135deg, var(--brand-600, #2563eb) 0%, var(--brand-800, #1e40af) 100%);",
    category: "branded",
  },
  {
    id: "urban_night",
    name: "Urban Night",
    description: "City lights bokeh background for a premium nighttime feel",
    thumbnailCSS:
      "background: linear-gradient(180deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b4e 100%);",
    category: "outdoor",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Solid color with subtle gradient matching the vehicle color",
    thumbnailCSS: "background: linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%);",
    category: "studio",
  },
  {
    id: "seasonal_winter",
    name: "Winter Scene",
    description: "Snowy landscape for winter campaigns and holiday promotions",
    thumbnailCSS:
      "background: linear-gradient(180deg, #d6e6f2 0%, #b8d4e3 50%, #f0f4f8 100%);",
    category: "seasonal",
  },
  {
    id: "seasonal_summer",
    name: "Summer Scene",
    description: "Sunny, bright scene for warm-weather marketing",
    thumbnailCSS:
      "background: linear-gradient(180deg, #fceabb 0%, #f8b500 40%, #87ceeb 100%);",
    category: "seasonal",
  },
];

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Return the full list of available background presets.
 */
export function getAvailableBackgrounds(): BackgroundPreset[] {
  return [...PRESETS];
}

/**
 * Look up a single preset by ID. Returns undefined if not found.
 */
export function getPresetById(id: string): BackgroundPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Generate a CSS string for a background preset.
 *
 * - `dealer_branded` uses dealerColors when provided.
 * - `minimalist` tints toward the vehicleColor when provided.
 * - All others return their static gradient.
 */
export function generateBackgroundCSS(
  preset: string,
  vehicleColor?: string,
  dealerColors?: DealerColors,
): string {
  switch (preset) {
    case "showroom_white":
      return "background: linear-gradient(180deg, #ffffff 0%, #f0f0f0 70%, #e0e0e0 100%); box-shadow: inset 0 -40px 60px -20px rgba(0,0,0,0.06);";

    case "showroom_dark":
      return "background: linear-gradient(180deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%); box-shadow: inset 0 0 120px rgba(255,255,255,0.03);";

    case "outdoor_scenic":
      return "background: linear-gradient(180deg, #87CEEB 0%, #a8d8ea 40%, #6b8e4e 65%, #3d5a3e 100%); filter: blur(0px);";

    case "dealer_branded": {
      const primary = dealerColors?.primary ?? "#2563eb";
      const secondary = dealerColors?.secondary ?? "#1e40af";
      return `background: linear-gradient(135deg, ${primary} 0%, ${secondary} 100%);`;
    }

    case "urban_night":
      return "background: linear-gradient(180deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b4e 100%); box-shadow: inset 0 0 200px rgba(138,43,226,0.05);";

    case "minimalist": {
      const base = vehicleColor ?? "#f5f5f5";
      return `background: linear-gradient(180deg, ${base}22 0%, ${base}11 100%);`;
    }

    case "seasonal_winter":
      return "background: linear-gradient(180deg, #d6e6f2 0%, #b8d4e3 50%, #f0f4f8 100%);";

    case "seasonal_summer":
      return "background: linear-gradient(180deg, #fceabb 0%, #f8b500 40%, #87ceeb 100%);";

    default:
      // Unknown preset — fall back to white showroom
      return "background: linear-gradient(180deg, #ffffff 0%, #f0f0f0 70%, #e0e0e0 100%);";
  }
}

/* ------------------------------------------------------------------ */
/*  Recommendation engine                                              */
/* ------------------------------------------------------------------ */

/** Luxury makes that look best on dark backgrounds */
const LUXURY_MAKES = new Set([
  "bmw", "mercedes-benz", "mercedes", "audi", "lexus", "porsche",
  "maserati", "bentley", "rolls-royce", "ferrari", "lamborghini",
  "mclaren", "aston martin", "genesis", "lucid", "rivian",
]);

/** Body types that suit outdoor/scenic backgrounds */
const OUTDOOR_BODIES = new Set([
  "truck", "pickup", "suv", "crossover", "off-road", "van",
]);

/**
 * Recommend the best background preset for a single vehicle based on
 * its attributes. Heuristic rules:
 *
 *   1. Luxury vehicles (by make or price >= $60 000) → showroom_dark
 *   2. Trucks / SUVs / crossovers → outdoor_scenic
 *   3. Used vehicles < $20 000 → showroom_white (clean presentation)
 *   4. New vehicles → minimalist
 *   5. Fallback → showroom_white
 */
export function getRecommendedBackground(vehicleData: {
  color?: string;
  body_type?: string;
  price?: number;
  condition?: string;
  make?: string;
}): { preset: BackgroundPresetId; reason: string } {
  const {
    body_type = "",
    price = 0,
    condition = "used",
    make = "",
  } = vehicleData;

  const lowerBody = body_type.toLowerCase();
  const lowerMake = make.toLowerCase();

  // 1. Luxury
  if (LUXURY_MAKES.has(lowerMake) || price >= 60_000) {
    return {
      preset: "showroom_dark",
      reason: "Premium/luxury vehicle — dark showroom creates aspirational feel",
    };
  }

  // 2. Trucks & SUVs
  if (OUTDOOR_BODIES.has(lowerBody)) {
    return {
      preset: "outdoor_scenic",
      reason: "Truck/SUV — scenic outdoor backdrop highlights capability",
    };
  }

  // 3. Budget used
  if (condition === "used" && price > 0 && price < 20_000) {
    return {
      preset: "showroom_white",
      reason: "Affordable used vehicle — clean white studio builds trust",
    };
  }

  // 4. New
  if (condition === "new") {
    return {
      preset: "minimalist",
      reason: "New vehicle — minimalist backdrop lets the vehicle speak",
    };
  }

  // 5. Fallback
  return {
    preset: "showroom_white",
    reason: "Default — white showroom is universally appealing",
  };
}

/**
 * Generate a batch background plan for multiple vehicles at once.
 */
export function getBatchBackgroundPlan(
  vehicles: VehicleForBackground[],
): BatchBackgroundPlan[] {
  return vehicles.map((v) => {
    const rec = getRecommendedBackground({
      color: v.color,
      body_type: v.body_type,
      price: v.price,
      condition: v.condition,
    });
    return {
      vin: v.vin,
      recommended_preset: rec.preset,
      reason: rec.reason,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Performance tracking (in-memory for v1, Postgres later)            */
/* ------------------------------------------------------------------ */

const performanceStore: BackgroundPerformanceRecord[] = [];

/**
 * Record engagement data for a vehicle+preset combination.
 */
export function trackBackgroundPerformance(
  vin: string,
  preset: BackgroundPresetId,
  engagement: PhotoEngagementData,
): void {
  performanceStore.push({
    vin,
    preset,
    engagement,
    recorded_at: new Date().toISOString(),
  });
}

/**
 * Get all stored performance records. Useful for tests and the insights API.
 */
export function getPerformanceRecords(): BackgroundPerformanceRecord[] {
  return [...performanceStore];
}

/**
 * Clear the performance store (used in tests).
 */
export function clearPerformanceRecords(): void {
  performanceStore.length = 0;
}

/**
 * Aggregate engagement data by preset and return insights sorted by
 * engagement score (views * avg_dwell * clicks weighted).
 */
export function getBackgroundInsights(): BackgroundInsight[] {
  const byPreset = new Map<
    BackgroundPresetId,
    { views: number; dwell_sum: number; clicks: number; leads: number; count: number }
  >();

  for (const rec of performanceStore) {
    const existing = byPreset.get(rec.preset) ?? {
      views: 0,
      dwell_sum: 0,
      clicks: 0,
      leads: 0,
      count: 0,
    };
    existing.views += rec.engagement.views;
    existing.dwell_sum += rec.engagement.avg_dwell_ms * rec.engagement.views;
    existing.clicks += rec.engagement.clicks;
    existing.leads += rec.engagement.leads_generated;
    existing.count += 1;
    byPreset.set(rec.preset, existing);
  }

  const insights: BackgroundInsight[] = [];

  for (const [preset, data] of byPreset) {
    const avgDwell = data.views > 0 ? data.dwell_sum / data.views : 0;
    // Engagement score: weighted combination
    const score =
      data.views * 1 +
      avgDwell * 0.01 +
      data.clicks * 5 +
      data.leads * 50;

    insights.push({
      preset,
      total_views: data.views,
      avg_dwell_ms: Math.round(avgDwell),
      total_clicks: data.clicks,
      total_leads: data.leads,
      engagement_score: Math.round(score * 100) / 100,
      sample_size: data.count,
    });
  }

  // Sort descending by engagement score
  insights.sort((a, b) => b.engagement_score - a.engagement_score);

  return insights;
}
