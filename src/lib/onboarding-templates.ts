/**
 * Onboarding Templates — Pre-configured dealer profiles by type.
 *
 * Inspired by Notion's template-first approach: dealers never start from
 * blank. They pick their type and get industry-best-practice defaults
 * for branding, messaging, features, layout, and SEO.
 *
 * Each template feeds into the onboarding wizard (Step 1 template picker)
 * and pre-fills branding, tagline, features, and homepage layout.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DealerTemplate {
  /** Machine-readable identifier */
  id: DealerTemplateId;
  /** Human-readable label shown in the picker */
  label: string;
  /** Short description shown beneath the label */
  description: string;
  /** Default branding colors */
  branding: {
    primaryColor: string;
    accentColor: string;
  };
  /** Default tagline pre-filled in branding step */
  tagline: string;
  /** Featured platform features enabled by default */
  features: string[];
  /** Homepage section ordering */
  homepageLayout: string[];
  /** SEO seed keywords for meta tags and content generation */
  seoKeywords: string[];
}

export type DealerTemplateId =
  | "independent_used"
  | "franchise_new"
  | "luxury"
  | "truck_specialty"
  | "ev_focused";

/* ------------------------------------------------------------------ */
/*  Template definitions                                               */
/* ------------------------------------------------------------------ */

const templates: Record<DealerTemplateId, DealerTemplate> = {
  independent_used: {
    id: "independent_used",
    label: "Independent Used",
    description: "Budget-friendly messaging, trade-in focus, value deals",
    branding: {
      primaryColor: "#2563eb",
      accentColor: "#f59e0b",
    },
    tagline: "Quality Pre-Owned Vehicles at Prices You'll Love",
    features: [
      "trade_in_estimator",
      "payment_calculator",
      "vehicle_history",
      "budget_filter",
      "compare_tool",
    ],
    homepageLayout: [
      "hero_search",
      "featured_under_15k",
      "trade_in_cta",
      "recent_arrivals",
      "testimonials",
      "financing_options",
    ],
    seoKeywords: [
      "used cars",
      "pre-owned vehicles",
      "affordable cars",
      "trade in value",
      "buy here pay here",
      "certified pre-owned",
    ],
  },

  franchise_new: {
    id: "franchise_new",
    label: "New Car Franchise",
    description: "Brand compliance, OEM programs, new & certified inventory",
    branding: {
      primaryColor: "#1e40af",
      accentColor: "#dc2626",
    },
    tagline: "Your Authorized Dealer for New and Certified Vehicles",
    features: [
      "oem_incentives",
      "build_and_price",
      "certified_program",
      "service_scheduler",
      "loyalty_rewards",
    ],
    homepageLayout: [
      "hero_new_models",
      "current_offers",
      "build_and_price",
      "certified_inventory",
      "service_department",
      "oem_programs",
    ],
    seoKeywords: [
      "new cars",
      "dealer specials",
      "factory incentives",
      "certified pre-owned",
      "auto service",
      "OEM warranty",
    ],
  },

  luxury: {
    id: "luxury",
    label: "Luxury & Exotic",
    description: "Premium branding, concierge service, white-glove experience",
    branding: {
      primaryColor: "#18181b",
      accentColor: "#ca8a04",
    },
    tagline: "Exceptional Vehicles. Unparalleled Service.",
    features: [
      "concierge_delivery",
      "virtual_showroom",
      "private_viewing",
      "vehicle_provenance",
      "white_glove_service",
    ],
    homepageLayout: [
      "hero_cinematic",
      "curated_collection",
      "concierge_cta",
      "brand_story",
      "private_showings",
      "client_testimonials",
    ],
    seoKeywords: [
      "luxury cars",
      "exotic vehicles",
      "premium automobiles",
      "concierge auto",
      "high-end dealership",
      "collector cars",
    ],
  },

  truck_specialty: {
    id: "truck_specialty",
    label: "Truck & Off-Road",
    description: "Rugged branding, towing specs, payload features, lift kits",
    branding: {
      primaryColor: "#92400e",
      accentColor: "#065f46",
    },
    tagline: "Built Tough. Ready for Anything.",
    features: [
      "towing_calculator",
      "payload_specs",
      "lift_kit_options",
      "off_road_packages",
      "bed_liner_options",
    ],
    homepageLayout: [
      "hero_adventure",
      "trucks_by_capability",
      "towing_guide",
      "accessories_shop",
      "off_road_gallery",
      "customer_rigs",
    ],
    seoKeywords: [
      "trucks for sale",
      "lifted trucks",
      "diesel trucks",
      "towing capacity",
      "off road vehicles",
      "4x4 trucks",
    ],
  },

  ev_focused: {
    id: "ev_focused",
    label: "EV & Green",
    description: "Range calculator, charging info, tax credit guidance",
    branding: {
      primaryColor: "#059669",
      accentColor: "#0284c7",
    },
    tagline: "Drive Electric. Drive Forward.",
    features: [
      "range_calculator",
      "charging_map",
      "tax_credit_estimator",
      "energy_cost_savings",
      "home_charger_install",
    ],
    homepageLayout: [
      "hero_green",
      "ev_lineup",
      "range_comparison",
      "tax_credits_explainer",
      "charging_network",
      "cost_savings_calculator",
    ],
    seoKeywords: [
      "electric vehicles",
      "EV dealership",
      "electric cars",
      "EV tax credit",
      "charging stations",
      "zero emissions",
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** All template IDs in display order. */
export const TEMPLATE_IDS: DealerTemplateId[] = [
  "independent_used",
  "franchise_new",
  "luxury",
  "truck_specialty",
  "ev_focused",
];

/** Get all templates as an array (display order). */
export function getAllTemplates(): DealerTemplate[] {
  return TEMPLATE_IDS.map((id) => templates[id]);
}

/** Get a single template by ID. Returns undefined for unknown IDs. */
export function getTemplate(id: string): DealerTemplate | undefined {
  return templates[id as DealerTemplateId];
}

/** Get template defaults suitable for merging into OnboardingPayload.branding. */
export function getTemplateDefaults(id: string): {
  primaryColor: string;
  accentColor: string;
  tagline: string;
  features: string[];
  homepageLayout: string[];
  seoKeywords: string[];
} | undefined {
  const t = getTemplate(id);
  if (!t) return undefined;
  return {
    primaryColor: t.branding.primaryColor,
    accentColor: t.branding.accentColor,
    tagline: t.tagline,
    features: [...t.features],
    homepageLayout: [...t.homepageLayout],
    seoKeywords: [...t.seoKeywords],
  };
}

/**
 * Validate that a hex color string is well-formed (#RRGGBB).
 * Used by tests and the onboarding API for input validation.
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/* ------------------------------------------------------------------ */
/*  CSV parsing helpers for common dealer formats                      */
/* ------------------------------------------------------------------ */

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  format: "vinsolutions" | "dealertrack" | "generic";
  vehicleCount: number;
  errors: string[];
}

/**
 * Detect CSV format based on header row column names.
 * Supports VinSolutions, DealerTrack, and generic CSV formats.
 */
export function detectCsvFormat(
  headerRow: string,
): "vinsolutions" | "dealertrack" | "generic" {
  const lower = headerRow.toLowerCase();
  if (lower.includes("stock #") || lower.includes("stocknumber")) {
    return "vinsolutions";
  }
  if (lower.includes("deal_id") || lower.includes("bookvalue")) {
    return "dealertrack";
  }
  return "generic";
}

/**
 * Parse a raw CSV string into structured rows.
 * Handles common dealer CSV quirks: quoted fields, trailing commas,
 * BOM characters, and inconsistent line endings.
 */
export function parseDealerCsv(csvText: string): CsvParseResult {
  const errors: string[] = [];

  // Strip BOM
  const clean = csvText.replace(/^\uFEFF/, "");

  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      headers: [],
      rows: [],
      format: "generic",
      vehicleCount: 0,
      errors: ["CSV must have a header row and at least one data row"],
    };
  }

  const headerLine = lines[0];
  const format = detectCsvFormat(headerLine);
  const headers = parseCsvLine(headerLine);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ?? "";
      }
      rows.push(row);
    } catch {
      errors.push(`Row ${i + 1}: Failed to parse`);
    }
  }

  return {
    headers,
    rows,
    format,
    vehicleCount: rows.length,
    errors,
  };
}

/**
 * Parse a single CSV line, handling quoted fields with commas inside.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());

  return result;
}

/* ------------------------------------------------------------------ */
/*  Onboarding progress persistence                                    */
/* ------------------------------------------------------------------ */

export interface OnboardingProgress {
  dealerId?: string;
  currentStep: number;
  completedSteps: number[];
  templateId?: DealerTemplateId;
  data: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
}

/**
 * Create a fresh onboarding progress record.
 */
export function createOnboardingProgress(
  dealerId?: string,
): OnboardingProgress {
  const now = new Date().toISOString();
  return {
    dealerId,
    currentStep: 0,
    completedSteps: [],
    data: {},
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Mark a step as completed and advance to the next step.
 * Returns a new progress object (immutable update).
 */
export function advanceOnboardingStep(
  progress: OnboardingProgress,
  stepIndex: number,
  stepData?: Record<string, unknown>,
): OnboardingProgress {
  const completedSteps = progress.completedSteps.includes(stepIndex)
    ? progress.completedSteps
    : [...progress.completedSteps, stepIndex].sort((a, b) => a - b);

  return {
    ...progress,
    currentStep: stepIndex + 1,
    completedSteps,
    data: stepData
      ? { ...progress.data, [`step_${stepIndex}`]: stepData }
      : progress.data,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Serialize progress for localStorage or API persistence.
 */
export function serializeProgress(progress: OnboardingProgress): string {
  return JSON.stringify(progress);
}

/**
 * Deserialize progress from localStorage or API response.
 * Returns null if the data is corrupt or missing.
 */
export function deserializeProgress(
  raw: string,
): OnboardingProgress | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.currentStep === "number" &&
      Array.isArray(parsed.completedSteps)
    ) {
      return parsed as OnboardingProgress;
    }
    return null;
  } catch {
    return null;
  }
}
