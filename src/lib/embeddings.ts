/**
 * Text embedding for vehicle search — zero external API fallback.
 *
 * Strategy 1: OpenAI text-embedding-3-small (if OPENAI_API_KEY is set)
 * Strategy 2: Local character-trigram bag-of-words (zero tokens, zero cost)
 *
 * The local strategy builds a fixed vocabulary from the automotive domain
 * and produces a 384-dimensional unit vector from character trigrams.
 */

import type { PlaceholderVehicle } from "@/lib/placeholder-data";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const VECTOR_DIM = 384;

/** Automotive vocabulary for the local embedding model. */
const AUTO_VOCABULARY = [
  // Makes
  "honda", "toyota", "ford", "chevrolet", "chevy", "bmw", "tesla", "mazda",
  "hyundai", "kia", "nissan", "subaru", "volkswagen", "audi", "mercedes",
  "lexus", "acura", "jeep", "ram", "dodge", "gmc", "cadillac", "lincoln",
  "volvo", "porsche", "rivian", "lucid", "genesis",
  // Body styles
  "suv", "truck", "sedan", "coupe", "convertible", "van", "minivan",
  "wagon", "hatchback", "crossover", "pickup",
  // Fuel types
  "gasoline", "diesel", "electric", "hybrid", "plug-in", "ev",
  // Drivetrains
  "awd", "fwd", "rwd", "4wd", "4x4", "all-wheel", "front-wheel",
  "rear-wheel", "four-wheel",
  // Transmissions
  "automatic", "manual", "cvt", "dct",
  // Features
  "leather", "sunroof", "moonroof", "panoramic", "heated", "cooled",
  "ventilated", "navigation", "carplay", "android", "auto", "bluetooth",
  "camera", "360", "backup", "parking", "sensor", "blind", "spot",
  "cruise", "adaptive", "lane", "assist", "departure", "collision",
  "avoidance", "autopilot", "safety", "airbag", "abs", "traction",
  "stability", "led", "headlight", "fog", "alloy", "wheel", "chrome",
  "tow", "trailer", "roof", "rack", "running", "board", "remote",
  "start", "keyless", "push", "button", "wireless", "charging",
  "sound", "system", "bose", "harman", "kardon", "premium", "audio",
  "touchscreen", "display", "cockpit", "head-up", "hud",
  // Colors
  "white", "black", "silver", "gray", "grey", "red", "blue", "green",
  "brown", "beige", "tan", "cognac", "ivory", "pearl", "metallic",
  // Conditions
  "new", "used", "certified", "pre-owned", "cpo",
  // Price-related
  "cheap", "affordable", "budget", "luxury", "premium", "expensive",
  // Descriptors
  "fast", "powerful", "efficient", "spacious", "compact", "reliable",
  "sporty", "family", "commuter", "off-road", "towing",
];

/* ------------------------------------------------------------------ */
/*  Vehicle → text                                                     */
/* ------------------------------------------------------------------ */

/**
 * Convert a placeholder vehicle into a searchable text string.
 */
export function vehicleToText(vehicle: PlaceholderVehicle): string {
  const parts = [
    String(vehicle.year),
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.bodyStyle,
    vehicle.fuel,
    vehicle.transmission,
    vehicle.drivetrain,
    vehicle.exteriorColor,
    vehicle.interiorColor,
    vehicle.condition,
    `${vehicle.mileage} miles`,
    `$${vehicle.price}`,
    vehicle.engine,
    ...vehicle.features,
  ];
  return parts.join(" ").toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  OpenAI embedding (Strategy 1)                                      */
/* ------------------------------------------------------------------ */

async function openaiEmbed(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: VECTOR_DIM,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      data: { embedding: number[] }[];
    };

    return data.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Local trigram embedding (Strategy 2 — zero tokens)                 */
/* ------------------------------------------------------------------ */

/**
 * Generate character trigrams from text.
 */
function trigrams(text: string): string[] {
  const clean = text.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const result: string[] = [];
  for (let i = 0; i <= clean.length - 3; i++) {
    result.push(clean.substring(i, i + 3));
  }
  return result;
}

/**
 * Build a stable hash index for a trigram into the vector space.
 * Uses a simple string hash to distribute trigrams across dimensions.
 */
function trigramIndex(tri: string): number {
  let hash = 0;
  for (let i = 0; i < tri.length; i++) {
    hash = (hash * 31 + tri.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % VECTOR_DIM;
}

/**
 * Local embedding using character trigrams mapped to a fixed-size vector.
 * Also incorporates vocabulary term matching for better semantic signal.
 */
function localEmbed(text: string): number[] {
  const vec = new Float64Array(VECTOR_DIM);
  const lower = text.toLowerCase();

  // 1. Character trigram signal
  const tris = trigrams(lower);
  for (const tri of tris) {
    const idx = trigramIndex(tri);
    vec[idx] += 1.0;
  }

  // 2. Vocabulary term matching — boost dimensions for known auto terms
  for (let i = 0; i < AUTO_VOCABULARY.length; i++) {
    const term = AUTO_VOCABULARY[i];
    if (lower.includes(term)) {
      // Map vocabulary terms to the upper half of the vector space
      const idx = (VECTOR_DIM / 2 + i) % VECTOR_DIM;
      vec[idx] += 3.0; // Stronger signal than raw trigrams
    }
  }

  // 3. Normalize to unit length
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);

  const result: number[] = new Array(VECTOR_DIM);
  if (norm === 0) {
    // All zeros — return a uniform tiny vector
    for (let i = 0; i < VECTOR_DIM; i++) {
      result[i] = 1.0 / Math.sqrt(VECTOR_DIM);
    }
  } else {
    for (let i = 0; i < VECTOR_DIM; i++) {
      result[i] = vec[i] / norm;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate a vector embedding for the given text.
 *
 * Tries OpenAI first (if OPENAI_API_KEY is set), then falls back
 * to the local trigram-based embedding (zero external calls).
 */
export async function embedText(text: string): Promise<number[]> {
  // Strategy 1: OpenAI
  const openaiResult = await openaiEmbed(text);
  if (openaiResult) return openaiResult;

  // Strategy 2: Local trigram embedding
  return localEmbed(text);
}

/**
 * Returns the vector dimension used by this module.
 */
export function getVectorDimension(): number {
  return VECTOR_DIM;
}
