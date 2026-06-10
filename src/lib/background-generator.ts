/**
 * Vehicle Background Studio — Enterprise-Grade Background System
 *
 * Full-featured vehicle photo background management:
 *  - 8 built-in CSS presets (showroom, scenic, branded, seasonal, etc.)
 *  - Custom dealer-uploaded image backgrounds (stored in R2)
 *  - AI background removal via Replicate (rembg model)
 *  - Server-side compositing via Sharp (vehicle cutout + background)
 *  - Smart recommendations based on vehicle attributes + engagement data
 *  - Batch processing for entire inventory
 *  - Full analytics integration — every action feeds the learning system
 *  - Performance tracking with A/B comparison insights
 *
 * Architecture:
 *  - This module: types, presets, recommendations, scoring
 *  - background-removal.ts: AI provider abstraction (Replicate/remove.bg)
 *  - image-compositor.ts: Sharp compositing pipeline (cutout + bg + effects)
 *  - API routes: CRUD, upload, remove-bg, composite, batch
 *  - DB: custom_backgrounds, vehicle_background_assignments, background_jobs
 */

import { sanitizeForLog } from "@/lib/log-sanitize";

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
  | "seasonal"
  | "lifestyle"
  | "custom";

export type BackgroundType = "preset" | "custom" | "composite";

export type AppliedMethod =
  | "manual"
  | "auto_recommended"
  | "batch"
  | "ai_composite";

export type JobStatus =
  | "queued"
  | "removing_bg"
  | "compositing"
  | "optimizing"
  | "uploading"
  | "completed"
  | "failed";

export interface BackgroundPreset {
  id: BackgroundPresetId;
  name: string;
  description: string;
  thumbnailCSS: string;
  category: BackgroundCategory;
}

export interface CustomBackground {
  id: string;
  dealer_id: string;
  name: string;
  description: string;
  category: BackgroundCategory;
  tags: string[];
  original_url: string;
  optimized_url: string | null;
  thumbnail_url: string | null;
  width: number;
  height: number;
  file_size: number;
  position: string;
  fit: string;
  overlay_opacity: number;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  times_applied: number;
  engagement_score: number;
  created_at: string;
}

export interface BackgroundAssignment {
  id: string;
  dealer_id: string;
  vehicle_id: string;
  vin: string;
  background_type: BackgroundType;
  preset_id: string | null;
  custom_bg_id: string | null;
  composite_url: string | null;
  cutout_url: string | null;
  css_override: string | null;
  applied_method: AppliedMethod;
  views: number;
  clicks: number;
  leads_generated: number;
  avg_dwell_ms: number;
  created_at: string;
}

export interface BackgroundJob {
  id: string;
  dealer_id: string;
  vin: string;
  source_photo_url: string;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  cutout_url: string | null;
  composite_url: string | null;
  ai_provider: string;
  processing_ms: number | null;
  cost_cents: number;
  batch_id: string | null;
  created_at: string;
  completed_at: string | null;
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
  make?: string;
}

export interface BackgroundRecommendation {
  vin: string;
  recommended_preset: BackgroundPresetId;
  reason: string;
  confidence: number;
  alternative_preset: BackgroundPresetId | null;
}

export interface PhotoEngagementData {
  views: number;
  avg_dwell_ms: number;
  clicks: number;
  leads_generated: number;
}

export interface BackgroundInsight {
  background_type: BackgroundType;
  preset_id: string | null;
  custom_bg_id: string | null;
  name: string;
  total_views: number;
  avg_dwell_ms: number;
  total_clicks: number;
  total_leads: number;
  ctr: number;
  lead_rate: number;
  engagement_score: number;
  sample_size: number;
}

export interface BatchPlan {
  vin: string;
  recommended_preset: BackgroundPresetId;
  reason: string;
  confidence: number;
}

export interface CompositeRequest {
  vin: string;
  vehicle_id: string;
  source_photo_url: string;
  background_type: "preset" | "custom";
  preset_id?: BackgroundPresetId;
  custom_bg_id?: string;
  dealer_colors?: DealerColors;
  options?: CompositeOptions;
}

export interface CompositeOptions {
  add_shadow: boolean;
  add_reflection: boolean;
  shadow_opacity: number;
  reflection_opacity: number;
  vehicle_scale: number;
  vehicle_position: "center" | "left" | "right";
  output_width: number;
  output_height: number;
  output_format: "webp" | "png" | "jpeg";
  output_quality: number;
}

export const DEFAULT_COMPOSITE_OPTIONS: CompositeOptions = {
  add_shadow: true,
  add_reflection: true,
  shadow_opacity: 0.3,
  reflection_opacity: 0.15,
  vehicle_scale: 0.85,
  vehicle_position: "center",
  output_width: 1920,
  output_height: 1080,
  output_format: "webp",
  output_quality: 90,
};

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

const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

export function getAvailableBackgrounds(): BackgroundPreset[] {
  return [...PRESETS];
}

export function getPresetById(id: string): BackgroundPreset | undefined {
  return PRESET_MAP.get(id as BackgroundPresetId);
}

export function isValidPresetId(id: string): id is BackgroundPresetId {
  return PRESET_MAP.has(id as BackgroundPresetId);
}

export function getPresetsByCategory(category: BackgroundCategory): BackgroundPreset[] {
  return PRESETS.filter((p) => p.category === category);
}

/* ------------------------------------------------------------------ */
/*  CSS generation                                                     */
/* ------------------------------------------------------------------ */

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
      return "background: linear-gradient(180deg, #ffffff 0%, #f0f0f0 70%, #e0e0e0 100%);";
  }
}

/* ------------------------------------------------------------------ */
/*  Recommendation engine                                              */
/* ------------------------------------------------------------------ */

const LUXURY_MAKES = new Set([
  "bmw", "mercedes-benz", "mercedes", "audi", "lexus", "porsche",
  "maserati", "bentley", "rolls-royce", "ferrari", "lamborghini",
  "mclaren", "aston martin", "genesis", "lucid", "rivian",
]);

const OUTDOOR_BODIES = new Set([
  "truck", "pickup", "suv", "crossover", "off-road", "van",
]);

const SPORT_BODIES = new Set([
  "coupe", "convertible", "roadster", "sports car", "hatchback",
]);

/**
 * Recommend the best background preset for a vehicle, with confidence
 * scoring and an alternative suggestion.
 *
 * Heuristic rules (in priority order):
 *   1. Luxury vehicles (by make or price >= $60k) -> showroom_dark (0.9)
 *   2. Sports cars / coupes -> urban_night (0.85)
 *   3. Trucks / SUVs / crossovers -> outdoor_scenic (0.85)
 *   4. Used vehicles < $20k -> showroom_white (0.8)
 *   5. New vehicles -> minimalist (0.75)
 *   6. Fallback -> showroom_white (0.6)
 */
export function getRecommendedBackground(vehicleData: {
  color?: string;
  body_type?: string;
  price?: number;
  condition?: string;
  make?: string;
}): BackgroundRecommendation & { preset: BackgroundPresetId; reason: string } {
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
      vin: "",
      preset: "showroom_dark",
      recommended_preset: "showroom_dark",
      reason: "Premium/luxury vehicle. Dark showroom creates aspirational feel",
      confidence: 0.9,
      alternative_preset: "urban_night",
    };
  }

  // 2. Sports
  if (SPORT_BODIES.has(lowerBody)) {
    return {
      vin: "",
      preset: "urban_night",
      recommended_preset: "urban_night",
      reason: "Sports/performance vehicle. Urban night backdrop highlights sleek lines",
      confidence: 0.85,
      alternative_preset: "showroom_dark",
    };
  }

  // 3. Trucks & SUVs
  if (OUTDOOR_BODIES.has(lowerBody)) {
    return {
      vin: "",
      preset: "outdoor_scenic",
      recommended_preset: "outdoor_scenic",
      reason: "Truck/SUV. Scenic outdoor backdrop highlights capability",
      confidence: 0.85,
      alternative_preset: "showroom_white",
    };
  }

  // 4. Budget used
  if (condition === "used" && price > 0 && price < 20_000) {
    return {
      vin: "",
      preset: "showroom_white",
      recommended_preset: "showroom_white",
      reason: "Affordable used vehicle. Clean white studio builds trust",
      confidence: 0.8,
      alternative_preset: "minimalist",
    };
  }

  // 5. New
  if (condition === "new") {
    return {
      vin: "",
      preset: "minimalist",
      recommended_preset: "minimalist",
      reason: "New vehicle. Minimalist backdrop lets the vehicle speak",
      confidence: 0.75,
      alternative_preset: "showroom_white",
    };
  }

  // 6. Fallback
  return {
    vin: "",
    preset: "showroom_white",
    recommended_preset: "showroom_white",
    reason: "Default. White showroom is universally appealing",
    confidence: 0.6,
    alternative_preset: "minimalist",
  };
}

/**
 * Generate a batch background plan for multiple vehicles at once.
 */
export function getBatchBackgroundPlan(
  vehicles: VehicleForBackground[],
): BatchPlan[] {
  return vehicles.map((v) => {
    const rec = getRecommendedBackground({
      color: v.color,
      body_type: v.body_type,
      price: v.price,
      condition: v.condition,
      make: v.make,
    });
    return {
      vin: v.vin,
      recommended_preset: rec.preset,
      reason: rec.reason,
      confidence: rec.confidence,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Engagement scoring                                                 */
/* ------------------------------------------------------------------ */

/**
 * Calculate engagement score from raw metrics.
 * Weighted formula: views * 1 + dwell * 0.01 + clicks * 5 + leads * 50
 */
export function calculateEngagementScore(data: PhotoEngagementData): number {
  return Math.round(
    (data.views * 1 +
      data.avg_dwell_ms * 0.01 +
      data.clicks * 5 +
      data.leads_generated * 50) *
      100,
  ) / 100;
}

/**
 * Calculate click-through rate (clicks / views).
 */
export function calculateCTR(views: number, clicks: number): number {
  if (views === 0) return 0;
  return Math.round((clicks / views) * 10000) / 10000;
}

/**
 * Calculate lead conversion rate (leads / views).
 */
export function calculateLeadRate(views: number, leads: number): number {
  if (views === 0) return 0;
  return Math.round((leads / views) * 10000) / 10000;
}

/* ------------------------------------------------------------------ */
/*  In-memory performance tracking (fallback when DB unavailable)      */
/* ------------------------------------------------------------------ */

const performanceStore: {
  vin: string;
  preset: BackgroundPresetId;
  engagement: PhotoEngagementData;
  recorded_at: string;
}[] = [];

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

export function getPerformanceRecords() {
  return [...performanceStore];
}

export function clearPerformanceRecords(): void {
  performanceStore.length = 0;
}

export function getBackgroundInsights(): BackgroundInsight[] {
  const byPreset = new Map<
    string,
    { views: number; dwell_sum: number; clicks: number; leads: number; count: number }
  >();

  for (const rec of performanceStore) {
    const existing = byPreset.get(rec.preset) ?? {
      views: 0, dwell_sum: 0, clicks: 0, leads: 0, count: 0,
    };
    existing.views += rec.engagement.views;
    existing.dwell_sum += rec.engagement.avg_dwell_ms * rec.engagement.views;
    existing.clicks += rec.engagement.clicks;
    existing.leads += rec.engagement.leads_generated;
    existing.count += 1;
    byPreset.set(rec.preset, existing);
  }

  const insights: BackgroundInsight[] = [];

  for (const [presetId, data] of byPreset) {
    const avgDwell = data.views > 0 ? data.dwell_sum / data.views : 0;
    const score = calculateEngagementScore({
      views: data.views,
      avg_dwell_ms: avgDwell,
      clicks: data.clicks,
      leads_generated: data.leads,
    });

    const preset = getPresetById(presetId);

    insights.push({
      background_type: "preset",
      preset_id: presetId,
      custom_bg_id: null,
      name: preset?.name ?? presetId,
      total_views: data.views,
      avg_dwell_ms: Math.round(avgDwell),
      total_clicks: data.clicks,
      total_leads: data.leads,
      ctr: calculateCTR(data.views, data.clicks),
      lead_rate: calculateLeadRate(data.views, data.leads),
      engagement_score: score,
      sample_size: data.count,
    });
  }

  insights.sort((a, b) => b.engagement_score - a.engagement_score);
  return insights;
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

const VALID_CATEGORIES: BackgroundCategory[] = [
  "studio", "outdoor", "branded", "seasonal", "lifestyle", "custom",
];

const VALID_POSITIONS = [
  "center", "top", "bottom", "left", "right",
  "top left", "top right", "bottom left", "bottom right",
];

const VALID_FITS = ["cover", "contain", "fill", "none"];

export function isValidCategory(c: string): c is BackgroundCategory {
  return VALID_CATEGORIES.includes(c as BackgroundCategory);
}

export function isValidPosition(p: string): boolean {
  return VALID_POSITIONS.includes(p);
}

export function isValidFit(f: string): boolean {
  return VALID_FITS.includes(f);
}

export function validateCustomBackgroundInput(input: {
  name?: string;
  category?: string;
  position?: string;
  fit?: string;
  overlay_opacity?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length === 0) {
    errors.push("Name is required");
  }
  if (input.name && input.name.length > 100) {
    errors.push("Name must be 100 characters or fewer");
  }
  if (input.category && !isValidCategory(input.category)) {
    errors.push(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (input.position && !isValidPosition(input.position)) {
    errors.push(`Invalid position. Must be one of: ${VALID_POSITIONS.join(", ")}`);
  }
  if (input.fit && !isValidFit(input.fit)) {
    errors.push(`Invalid fit. Must be one of: ${VALID_FITS.join(", ")}`);
  }
  if (
    input.overlay_opacity !== undefined &&
    (input.overlay_opacity < 0 || input.overlay_opacity > 1)
  ) {
    errors.push("Overlay opacity must be between 0 and 1");
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  Auto-enqueue for DMS ingest                                        */
/* ------------------------------------------------------------------ */

/**
 * Enqueue a background-generation job for a vehicle photo.
 *
 * Idempotent: skipped when the source_photo_url already has a queued or
 * completed job for the same vehicle. Designed to be called fire-and-forget
 * from DMS ingest pipelines so failures here never sink the ingest.
 *
 * Behaviour:
 *  - If DATABASE_URL is unset (shadow mode) -> log + return.
 *  - If FAL_API_KEY / FAL_KEY is unset      -> log + return without inserting.
 *  - If the same source photo URL is already queued / processing / completed
 *    for this vehicle, skip.
 *  - Otherwise insert a row in background_jobs with status 'queued'.
 *
 * Returns the new job id, "skipped" when no-op, or null on error.
 */
export async function generateBackground(input: {
  dealer_id: string;
  vehicle_id: string | null;
  vin: string;
  source_photo_url: string;
}): Promise<string | "skipped" | null> {
  const { dealer_id, vehicle_id, vin, source_photo_url } = input;

  // No source photo -> nothing to do.
  if (!source_photo_url || source_photo_url.trim().length === 0) {
    return "skipped";
  }

  // No DB -> nothing to persist.
  if (!process.env.DATABASE_URL) {
    console.log(
      `[background] DATABASE_URL not set; skipping background queue for ${sanitizeForLog(vin)}`,
    );
    return "skipped";
  }

  // Respect missing fal.ai credentials -> log + skip silently.
  const hasFal = !!(process.env.FAL_API_KEY ?? process.env.FAL_KEY);
  if (!hasFal) {
    console.log(
      `[background] FAL_API_KEY not set; skipping background queue for ${sanitizeForLog(vin)}`,
    );
    return "skipped";
  }

  try {
    const { query } = await import("@/lib/db");

    // De-dupe: if any active / completed job for the same vehicle already
    // references this exact source photo, skip — prevents infinite-loop
    // re-queue on idempotent DMS feeds.
    if (vehicle_id) {
      const existing = await query<{ id: string }>(
        `SELECT id FROM background_jobs
          WHERE dealer_id = $1
            AND vehicle_id = $2::uuid
            AND source_photo_url = $3
            AND status IN ('queued', 'removing_bg', 'compositing',
                           'optimizing', 'uploading', 'completed')
          LIMIT 1`,
        [dealer_id, vehicle_id, source_photo_url],
      );
      if (existing.rows.length > 0) {
        return "skipped";
      }
    }

    const { rows } = await query<{ id: string }>(
      `INSERT INTO background_jobs
         (dealer_id, vehicle_id, vin, source_photo_url, status, ai_provider)
       VALUES ($1, $2::uuid, $3, $4, 'queued', 'fal')
       RETURNING id`,
      [dealer_id, vehicle_id, vin, source_photo_url],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error(
      "[background] Failed to enqueue background job for %s:",
      sanitizeForLog(vin),
      err,
    );
    return null;
  }
}
