/**
 * Natural Language Search — Zero-LLM Query Parser
 *
 * Parses natural language car shopping queries into structured inventory
 * filters using keyword extraction and pattern matching.
 *
 * Examples:
 *   "reliable SUV under 20K"        → { body_type: "SUV", max_price: 20000 }
 *   "truck that can tow"            → { body_type: "Truck", towing: true }
 *   "good first car for teenager"   → { max_price: 15000, body_type: ["Sedan", "Hatchback"] }
 *   "red convertible"               → { color: "Red", body_type: "Convertible" }
 *   "2020 Honda Civic"              → { year_min: 2020, year_max: 2020, make: "Honda", model: "Civic" }
 *
 * Every raw query is stored for SEO content generation insights.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ParsedFilters {
  make?: string;
  model?: string;
  body_type?: string | string[];
  min_price?: number;
  max_price?: number;
  year_min?: number;
  year_max?: number;
  color?: string;
  fuel_type?: string;
  drivetrain?: string;
  features?: string[];
  use_case?: string;
  condition?: string;
  towing?: boolean;
}

export interface NLSearchResult {
  raw_query: string;
  parsed_filters: ParsedFilters;
  intent_category: string;
  keywords_used: string[];
}

/* ------------------------------------------------------------------ */
/*  Lookup tables                                                      */
/* ------------------------------------------------------------------ */

const BODY_TYPES: Record<string, string> = {
  suv: "SUV",
  "sport utility": "SUV",
  crossover: "SUV",
  truck: "Truck",
  pickup: "Truck",
  sedan: "Sedan",
  car: "Sedan",
  van: "Van",
  minivan: "Van",
  convertible: "Convertible",
  coupe: "Coupe",
  hatchback: "Hatchback",
  wagon: "Wagon",
  "station wagon": "Wagon",
};

const COLORS: Record<string, string> = {
  red: "Red",
  blue: "Blue",
  black: "Black",
  white: "White",
  silver: "Silver",
  gray: "Gray",
  grey: "Gray",
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  brown: "Brown",
  gold: "Gold",
  beige: "Beige",
  burgundy: "Burgundy",
  maroon: "Burgundy",
  tan: "Tan",
};

const FUEL_TYPES: Record<string, string> = {
  electric: "electric",
  ev: "electric",
  hybrid: "hybrid",
  diesel: "diesel",
  gas: "gasoline",
  gasoline: "gasoline",
  "plug-in": "plug_in_hybrid",
  "plug in": "plug_in_hybrid",
  phev: "plug_in_hybrid",
};

const DRIVETRAIN_KEYWORDS: Record<string, string> = {
  awd: "awd",
  "all wheel": "awd",
  "all-wheel": "awd",
  "4wd": "4wd",
  "four wheel": "4wd",
  "four-wheel": "4wd",
  "4x4": "4wd",
  fwd: "fwd",
  "front wheel": "fwd",
  "front-wheel": "fwd",
  rwd: "rwd",
  "rear wheel": "rwd",
  "rear-wheel": "rwd",
};

const FEATURE_KEYWORDS: Record<string, string> = {
  leather: "leather",
  sunroof: "sunroof",
  moonroof: "sunroof",
  "nav ": "navigation",
  navigation: "navigation",
  bluetooth: "bluetooth",
  "backup camera": "backup_camera",
  "rear camera": "backup_camera",
  "heated seats": "heated_seats",
  "heated seat": "heated_seats",
  "apple carplay": "apple_carplay",
  carplay: "apple_carplay",
  "android auto": "android_auto",
  "third row": "third_row",
  "3rd row": "third_row",
  "tow package": "tow_package",
  "roof rack": "roof_rack",
};

const TOWING_KEYWORDS = ["tow", "towing", "haul", "hauling", "pull", "trailer"];

const MAKES: string[] = [
  "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick",
  "Cadillac", "Chevrolet", "Chevy", "Chrysler", "Dodge", "Ferrari", "Fiat",
  "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep",
  "Kia", "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Lucid", "Maserati",
  "Mazda", "McLaren", "Mercedes", "Mercedes-Benz", "Mini", "Mitsubishi",
  "Nissan", "Polestar", "Porsche", "Ram", "Rivian", "Rolls-Royce", "Subaru",
  "Suzuki", "Tesla", "Toyota", "Volkswagen", "VW", "Volvo",
];

// Normalize alternate make names
const MAKE_ALIASES: Record<string, string> = {
  chevy: "Chevrolet",
  vw: "Volkswagen",
  "mercedes-benz": "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
};

// Common models to extract (subset — just the most searched)
const MODELS: Record<string, string[]> = {
  Honda: ["Civic", "Accord", "CR-V", "Pilot", "HR-V", "Odyssey", "Ridgeline", "Passport", "Fit"],
  Toyota: ["Camry", "Corolla", "RAV4", "Highlander", "Tacoma", "Tundra", "4Runner", "Prius", "Sienna"],
  Ford: ["F-150", "Mustang", "Explorer", "Escape", "Bronco", "Ranger", "Edge", "Expedition", "Maverick"],
  Chevrolet: ["Silverado", "Equinox", "Malibu", "Tahoe", "Traverse", "Blazer", "Camaro", "Corvette", "Suburban"],
  Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Gladiator", "Renegade"],
  Nissan: ["Altima", "Rogue", "Sentra", "Pathfinder", "Frontier", "Murano", "Kicks", "Titan"],
  Hyundai: ["Tucson", "Santa Fe", "Elantra", "Sonata", "Kona", "Palisade", "Ioniq"],
  Kia: ["Sportage", "Sorento", "Telluride", "Forte", "K5", "Soul", "Seltos", "EV6"],
  BMW: ["3 Series", "5 Series", "X3", "X5", "X1", "X7", "7 Series", "M3", "M5"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"],
  Subaru: ["Outback", "Forester", "Crosstrek", "Impreza", "WRX", "Ascent", "Legacy"],
  Ram: ["1500", "2500", "3500"],
};

// Use-case based filter presets
const USE_CASE_PRESETS: Record<string, Partial<ParsedFilters>> = {
  family: { body_type: ["SUV", "Van"], features: ["third_row"] },
  teenager: { max_price: 15000, body_type: ["Sedan", "Hatchback"] },
  "first car": { max_price: 15000, body_type: ["Sedan", "Hatchback"] },
  commute: { fuel_type: "hybrid" },
  commuter: { fuel_type: "hybrid" },
  "off-road": { drivetrain: "4wd", body_type: ["SUV", "Truck"] },
  offroad: { drivetrain: "4wd", body_type: ["SUV", "Truck"] },
  luxury: { min_price: 40000 },
  sport: { body_type: ["Coupe", "Convertible"] },
  sporty: { body_type: ["Coupe", "Convertible"] },
  "fuel efficient": { fuel_type: "hybrid" },
  "gas saver": { fuel_type: "hybrid" },
  "work truck": { body_type: "Truck", towing: true },
  camping: { drivetrain: "awd", body_type: "SUV" },
  winter: { drivetrain: "awd" },
  snow: { drivetrain: "awd" },
};

/* ------------------------------------------------------------------ */
/*  Price parser                                                       */
/* ------------------------------------------------------------------ */

function parsePrice(query: string): { min_price?: number; max_price?: number } {
  const result: { min_price?: number; max_price?: number } = {};
  const lower = query.toLowerCase();

  // "under $20,000" / "below 20k" / "less than 25000" / "max 30k"
  const underMatch = lower.match(
    /(?:under|below|less\s+than|max|at\s+most|up\s+to|no\s+more\s+than|budget\s+(?:of\s+)?)\s*\$?\s*([\d,]+)\s*(?:k|thousand|grand)?/,
  );
  if (underMatch) {
    let val = parseFloat(underMatch[1].replace(/,/g, ""));
    if (val < 1000) val *= 1000; // "20k" → 20000
    result.max_price = val;
  }

  // "over $30,000" / "above 25k" / "more than 20000" / "min 15k" / "starting at 20k"
  const overMatch = lower.match(
    /(?:over|above|more\s+than|min|at\s+least|starting\s+at|from)\s*\$?\s*([\d,]+)\s*(?:k|thousand|grand)?/,
  );
  if (overMatch) {
    let val = parseFloat(overMatch[1].replace(/,/g, ""));
    if (val < 1000) val *= 1000;
    result.min_price = val;
  }

  // "around $25,000" / "about 30k" / "roughly 20k"
  const aroundMatch = lower.match(
    /(?:around|about|roughly|approximately|near)\s*\$?\s*([\d,]+)\s*(?:k|thousand|grand)?/,
  );
  if (aroundMatch && !underMatch && !overMatch) {
    let val = parseFloat(aroundMatch[1].replace(/,/g, ""));
    if (val < 1000) val *= 1000;
    result.min_price = Math.round(val * 0.8);
    result.max_price = Math.round(val * 1.2);
  }

  // "$15,000 - $25,000" / "15k to 25k" / "between 20 and 30 thousand"
  const rangeMatch = lower.match(
    /\$?\s*([\d,]+)\s*(?:k|thousand)?\s*(?:to|-|and|through)\s*\$?\s*([\d,]+)\s*(?:k|thousand)?/,
  );
  if (rangeMatch && !underMatch && !overMatch && !aroundMatch) {
    let low = parseFloat(rangeMatch[1].replace(/,/g, ""));
    let high = parseFloat(rangeMatch[2].replace(/,/g, ""));
    if (low < 1000) low *= 1000;
    if (high < 1000) high *= 1000;
    if (low < high) {
      result.min_price = low;
      result.max_price = high;
    }
  }

  // "cheap" / "affordable" / "budget"
  if (/\b(?:cheap|affordable|budget|inexpensive|economical)\b/.test(lower) && !result.max_price) {
    result.max_price = 15000;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Year parser                                                        */
/* ------------------------------------------------------------------ */

function parseYear(query: string): { year_min?: number; year_max?: number } {
  const result: { year_min?: number; year_max?: number } = {};
  const lower = query.toLowerCase();
  const currentYear = new Date().getFullYear();

  // Exact year: "2020 Honda" or "a 2022"
  const exactYear = query.match(/\b(20[0-2]\d|19[89]\d)\b/);
  if (exactYear) {
    const year = parseInt(exactYear[1], 10);
    result.year_min = year;
    result.year_max = year;
  }

  // "2020+" or "2020 or newer"
  const yearPlus = query.match(/\b(20[0-2]\d)\s*(?:\+|or\s+newer|and\s+up|and\s+newer)/);
  if (yearPlus) {
    result.year_min = parseInt(yearPlus[1], 10);
    delete result.year_max;
  }

  // "2020 or older" / "before 2020"
  const yearBefore = lower.match(/(?:before|prior\s+to|older\s+than|pre[-\s]?)\s*(20[0-2]\d|19[89]\d)/);
  if (yearBefore) {
    result.year_max = parseInt(yearBefore[1], 10);
    delete result.year_min;
  }

  // "newer" / "latest" / "recent"
  if (/\b(?:newer|newest|latest|recent|new model|current)\b/.test(lower) && !result.year_min) {
    result.year_min = currentYear - 3;
  }

  // "older" but not "older than YYYY"
  if (/\b(?:older|classic|vintage)\b/.test(lower) && !result.year_max && !yearBefore) {
    result.year_max = currentYear - 10;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Condition parser                                                   */
/* ------------------------------------------------------------------ */

function parseCondition(query: string): string | undefined {
  const lower = query.toLowerCase();
  if (/\b(?:brand\s+new|factory\s+new|new)\b/.test(lower)) return "new";
  if (/\b(?:used|pre-owned|preowned|pre owned|second\s+hand)\b/.test(lower)) return "used";
  if (/\b(?:certified|cpo|certified\s+pre-owned)\b/.test(lower)) return "certified";
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Intent classifier                                                  */
/* ------------------------------------------------------------------ */

function classifyIntent(query: string, filters: ParsedFilters): string {
  const lower = query.toLowerCase();

  if (filters.use_case) return `use_case:${filters.use_case}`;
  if (filters.towing) return "capability:towing";
  if (filters.make && filters.model) return "specific_vehicle";
  if (filters.make) return "brand_search";
  if (filters.body_type) return "body_type_search";
  if (filters.max_price || filters.min_price) return "budget_search";
  if (filters.fuel_type === "electric") return "ev_search";
  if (filters.color) return "attribute_search";
  if (/\b(?:best|top|recommended|popular)\b/.test(lower)) return "recommendation";
  return "general_browse";
}

/* ------------------------------------------------------------------ */
/*  Main parser                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse a natural language car shopping query into structured filters.
 * Pure function, no LLM, no side effects.
 */
export function parseNaturalQuery(query: string): NLSearchResult {
  const lower = query.toLowerCase().trim();
  const filters: ParsedFilters = {};
  const keywordsUsed: string[] = [];

  // 1. Price
  const priceFilters = parsePrice(query);
  if (priceFilters.min_price !== undefined) {
    filters.min_price = priceFilters.min_price;
    keywordsUsed.push("price");
  }
  if (priceFilters.max_price !== undefined) {
    filters.max_price = priceFilters.max_price;
    keywordsUsed.push("price");
  }

  // 2. Year
  const yearFilters = parseYear(query);
  if (yearFilters.year_min !== undefined) {
    filters.year_min = yearFilters.year_min;
    keywordsUsed.push("year");
  }
  if (yearFilters.year_max !== undefined) {
    filters.year_max = yearFilters.year_max;
    keywordsUsed.push("year");
  }

  // 3. Make
  for (const make of MAKES) {
    if (lower.includes(make.toLowerCase())) {
      const normalized = MAKE_ALIASES[make.toLowerCase()] || make;
      filters.make = normalized;
      keywordsUsed.push("make");
      break;
    }
  }
  // Check aliases
  if (!filters.make) {
    for (const [alias, normalized] of Object.entries(MAKE_ALIASES)) {
      if (lower.includes(alias)) {
        filters.make = normalized;
        keywordsUsed.push("make");
        break;
      }
    }
  }

  // 4. Model (only if make found)
  if (filters.make) {
    const makeModels = MODELS[filters.make];
    if (makeModels) {
      for (const model of makeModels) {
        if (lower.includes(model.toLowerCase())) {
          filters.model = model;
          keywordsUsed.push("model");
          break;
        }
      }
    }
  }

  // 5. Body type
  for (const [keyword, bodyType] of Object.entries(BODY_TYPES)) {
    if (lower.includes(keyword)) {
      filters.body_type = bodyType;
      keywordsUsed.push("body_type");
      break;
    }
  }

  // 6. Color
  for (const [keyword, color] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${keyword}\\b`).test(lower)) {
      filters.color = color;
      keywordsUsed.push("color");
      break;
    }
  }

  // 7. Fuel type
  for (const [keyword, fuelType] of Object.entries(FUEL_TYPES)) {
    if (lower.includes(keyword)) {
      filters.fuel_type = fuelType;
      keywordsUsed.push("fuel_type");
      break;
    }
  }

  // 8. Drivetrain
  for (const [keyword, drivetrain] of Object.entries(DRIVETRAIN_KEYWORDS)) {
    if (lower.includes(keyword)) {
      filters.drivetrain = drivetrain;
      keywordsUsed.push("drivetrain");
      break;
    }
  }

  // 9. Features
  const features: string[] = [];
  for (const [keyword, feature] of Object.entries(FEATURE_KEYWORDS)) {
    if (lower.includes(keyword)) {
      features.push(feature);
      keywordsUsed.push("feature");
    }
  }
  if (features.length > 0) filters.features = features;

  // 10. Towing
  for (const keyword of TOWING_KEYWORDS) {
    if (lower.includes(keyword)) {
      filters.towing = true;
      keywordsUsed.push("towing");
      break;
    }
  }

  // 11. Condition
  const condition = parseCondition(query);
  if (condition) {
    filters.condition = condition;
    keywordsUsed.push("condition");
  }

  // 12. Use case (apply presets AFTER other parsing so explicit filters win)
  for (const [keyword, preset] of Object.entries(USE_CASE_PRESETS)) {
    if (lower.includes(keyword)) {
      filters.use_case = keyword;
      keywordsUsed.push("use_case");

      // Only apply preset values that were not explicitly set
      if (preset.body_type && !filters.body_type) filters.body_type = preset.body_type;
      if (preset.max_price && !filters.max_price) filters.max_price = preset.max_price;
      if (preset.min_price && !filters.min_price) filters.min_price = preset.min_price;
      if (preset.fuel_type && !filters.fuel_type) filters.fuel_type = preset.fuel_type;
      if (preset.drivetrain && !filters.drivetrain) filters.drivetrain = preset.drivetrain;
      if (preset.towing && !filters.towing) filters.towing = preset.towing;
      if (preset.features && (!filters.features || filters.features.length === 0)) {
        filters.features = preset.features;
      }
      break;
    }
  }

  // Deduplicate keywords
  const uniqueKeywords = [...new Set(keywordsUsed)];

  return {
    raw_query: query,
    parsed_filters: filters,
    intent_category: classifyIntent(query, filters),
    keywords_used: uniqueKeywords,
  };
}

/* ------------------------------------------------------------------ */
/*  Query store (for SEO content generation insights)                  */
/* ------------------------------------------------------------------ */

const queryStore: Array<{ query: string; filters: ParsedFilters; timestamp: string; result_count?: number }> = [];

/**
 * Store a raw query for SEO content generation insights.
 */
export function storeQuery(
  query: string,
  filters: ParsedFilters,
  resultCount?: number,
): void {
  queryStore.push({
    query,
    filters,
    timestamp: new Date().toISOString(),
    result_count: resultCount,
  });
}

/**
 * Get stored queries (for analytics brain consumption).
 */
export function getStoredQueries(): typeof queryStore {
  return [...queryStore];
}

/**
 * Get zero-result queries (content gap signals for SEO).
 */
export function getZeroResultQueries(): typeof queryStore {
  return queryStore.filter((q) => q.result_count === 0);
}

/** Clear stored queries (useful for testing). */
export function clearQueryStore(): void {
  queryStore.length = 0;
}
