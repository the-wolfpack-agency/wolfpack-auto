/**
 * AI Background Removal Service
 *
 * Abstracts AI-powered background removal behind a provider interface.
 * Currently supports:
 *  - Replicate (rembg model) — primary, cheap ($0.0023/run), fast (~3s)
 *  - remove.bg API — fallback, higher quality for edge cases
 *
 * The service:
 *  1. Accepts a vehicle photo (URL or buffer)
 *  2. Sends it to the AI provider for background removal
 *  3. Returns a transparent PNG buffer of the vehicle cutout
 *  4. Tracks cost, latency, and quality metrics for the learning system
 *
 * Usage:
 *   import { removeBackground } from "@/lib/background-removal";
 *   const result = await removeBackground({ source_url: "https://..." });
 *   // result.cutout_buffer is a transparent PNG
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AIProvider = "replicate" | "remove_bg";

export interface RemovalRequest {
  /** URL of the source vehicle photo */
  source_url?: string;
  /** Raw image buffer (used instead of source_url when available) */
  source_buffer?: Buffer;
  /** AI provider to use. Default: replicate */
  provider?: AIProvider;
  /** Replicate model version. Default: rembg latest */
  model?: string;
}

export interface RemovalResult {
  /** Transparent PNG buffer of the vehicle with background removed */
  cutout_buffer: Buffer;
  /** Width of the cutout image */
  width: number;
  /** Height of the cutout image */
  height: number;
  /** File size in bytes */
  size: number;
  /** Which AI provider was used */
  provider: AIProvider;
  /** AI model/version used */
  model: string;
  /** Replicate prediction ID (for debugging/tracking) */
  prediction_id: string | null;
  /** Processing time in milliseconds */
  processing_ms: number;
  /** Estimated cost in USD cents */
  cost_cents: number;
}

export interface ProviderHealth {
  provider: AIProvider;
  available: boolean;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const REPLICATE_DEFAULT_MODEL =
  "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46";

/** Cost per Replicate prediction in cents (rembg is ~$0.0023/run) */
const REPLICATE_COST_CENTS = 1;

/** Cost per remove.bg API call in cents (~$0.10 for standard) */
const REMOVEBG_COST_CENTS = 10;

/** Maximum time to wait for AI processing (30 seconds) */
const PROCESSING_TIMEOUT_MS = 30_000;

/** Maximum source image size (15 MB) */
const MAX_SOURCE_SIZE = 15 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/*  Provider: Replicate                                                */
/* ------------------------------------------------------------------ */

async function removeViaReplicate(
  sourceUrl: string,
  model: string,
): Promise<RemovalResult> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "[background-removal] REPLICATE_API_TOKEN not set. " +
        "Get one at https://replicate.com/account/api-tokens",
    );
  }

  const startMs = Date.now();

  // Split model into owner/name and version
  const [modelPath, version] = model.split(":");
  if (!modelPath || !version) {
    throw new Error(`[background-removal] Invalid model format: ${model}. Expected "owner/name:version"`);
  }

  // Create prediction
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",  // synchronous mode — wait for result
    },
    body: JSON.stringify({
      version,
      input: { image: sourceUrl },
    }),
    signal: AbortSignal.timeout(PROCESSING_TIMEOUT_MS),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text().catch(() => "");
    throw new Error(
      `[background-removal] Replicate API error ${createRes.status}: ${errBody}`,
    );
  }

  const prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output: string | null;
    error: string | null;
  };

  // If the prediction wasn't completed synchronously, poll for it
  let result = prediction;
  if (result.status !== "succeeded" && result.status !== "failed") {
    result = await pollReplicatePrediction(result.id, apiToken);
  }

  if (result.status === "failed" || result.error) {
    throw new Error(
      `[background-removal] Replicate prediction failed: ${result.error ?? "unknown error"}`,
    );
  }

  if (!result.output) {
    throw new Error("[background-removal] Replicate returned no output");
  }

  // Download the cutout image
  const cutoutRes = await fetch(result.output);
  if (!cutoutRes.ok) {
    throw new Error(
      `[background-removal] Failed to download cutout: ${cutoutRes.status}`,
    );
  }

  const cutoutBuffer = Buffer.from(await cutoutRes.arrayBuffer());
  const processingMs = Date.now() - startMs;

  // Get dimensions via sharp (lazy import to keep module lightweight)
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(cutoutBuffer).metadata();

  return {
    cutout_buffer: cutoutBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    size: cutoutBuffer.length,
    provider: "replicate",
    model,
    prediction_id: result.id,
    processing_ms: processingMs,
    cost_cents: REPLICATE_COST_CENTS,
  };
}

async function pollReplicatePrediction(
  predictionId: string,
  apiToken: string,
  maxWaitMs: number = PROCESSING_TIMEOUT_MS,
): Promise<{
  id: string;
  status: string;
  output: string | null;
  error: string | null;
}> {
  const deadline = Date.now() + maxWaitMs;
  let delayMs = 500;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 1.5, 5000);

    const res = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );

    if (!res.ok) continue;

    const data = (await res.json()) as {
      id: string;
      status: string;
      output: string | null;
      error: string | null;
    };

    if (data.status === "succeeded" || data.status === "failed") {
      return data;
    }
  }

  throw new Error(
    `[background-removal] Replicate prediction ${predictionId} timed out after ${maxWaitMs}ms`,
  );
}

/* ------------------------------------------------------------------ */
/*  Provider: remove.bg                                                */
/* ------------------------------------------------------------------ */

async function removeViaRemoveBg(
  sourceUrl: string,
): Promise<RemovalResult> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[background-removal] REMOVE_BG_API_KEY not set. " +
        "Get one at https://www.remove.bg/dashboard#api-key",
    );
  }

  const startMs = Date.now();

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      image_url: sourceUrl,
      size: "full",
      type: "car",
      format: "png",
      channels: "rgba",
    }),
    signal: AbortSignal.timeout(PROCESSING_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `[background-removal] remove.bg API error ${res.status}: ${errBody}`,
    );
  }

  const cutoutBuffer = Buffer.from(await res.arrayBuffer());
  const processingMs = Date.now() - startMs;

  const sharp = (await import("sharp")).default;
  const metadata = await sharp(cutoutBuffer).metadata();

  return {
    cutout_buffer: cutoutBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    size: cutoutBuffer.length,
    provider: "remove_bg",
    model: "remove.bg/v1.0",
    prediction_id: null,
    processing_ms: processingMs,
    cost_cents: REMOVEBG_COST_CENTS,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Remove the background from a vehicle photo using AI.
 *
 * Returns a transparent PNG buffer of the vehicle cutout.
 * Automatically falls back to the secondary provider on failure.
 */
export async function removeBackground(
  request: RemovalRequest,
): Promise<RemovalResult> {
  const provider = request.provider ?? "replicate";
  const model = request.model ?? REPLICATE_DEFAULT_MODEL;

  // If we have a buffer but no URL, we need to upload it first or base64-encode
  let sourceUrl = request.source_url;
  if (!sourceUrl && request.source_buffer) {
    // Convert to data URI for Replicate
    const base64 = request.source_buffer.toString("base64");
    const mime = "image/jpeg"; // assume JPEG for vehicle photos
    sourceUrl = `data:${mime};base64,${base64}`;
  }

  if (!sourceUrl) {
    throw new Error("[background-removal] Either source_url or source_buffer is required");
  }

  // Validate source size if buffer provided
  if (request.source_buffer && request.source_buffer.length > MAX_SOURCE_SIZE) {
    throw new Error(
      `[background-removal] Source image too large (${(request.source_buffer.length / 1024 / 1024).toFixed(1)} MB > ${MAX_SOURCE_SIZE / 1024 / 1024} MB)`,
    );
  }

  // Try primary provider, fall back to secondary
  try {
    if (provider === "replicate") {
      return await removeViaReplicate(sourceUrl, model);
    } else {
      return await removeViaRemoveBg(sourceUrl);
    }
  } catch (primaryErr) {
    console.error(
      `[background-removal] Primary provider (${provider}) failed:`,
      primaryErr instanceof Error ? primaryErr.message : primaryErr,
    );

    // Fallback to the other provider
    const fallback: AIProvider = provider === "replicate" ? "remove_bg" : "replicate";
    try {
      console.log(`[background-removal] Falling back to ${fallback}`);
      if (fallback === "replicate") {
        return await removeViaReplicate(sourceUrl, model);
      } else {
        return await removeViaRemoveBg(sourceUrl);
      }
    } catch (fallbackErr) {
      // Both providers failed
      throw new Error(
        `[background-removal] All providers failed. ` +
          `Primary (${provider}): ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}. ` +
          `Fallback (${fallback}): ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}.`,
      );
    }
  }
}

/**
 * Check which AI providers are available (have API keys configured).
 */
export function getProviderHealth(): ProviderHealth[] {
  return [
    {
      provider: "replicate",
      available: !!process.env.REPLICATE_API_TOKEN,
      reason: process.env.REPLICATE_API_TOKEN
        ? undefined
        : "REPLICATE_API_TOKEN not set",
    },
    {
      provider: "remove_bg",
      available: !!process.env.REMOVE_BG_API_KEY,
      reason: process.env.REMOVE_BG_API_KEY
        ? undefined
        : "REMOVE_BG_API_KEY not set",
    },
  ];
}

/**
 * Check if any AI provider is available.
 */
export function isAIAvailable(): boolean {
  return getProviderHealth().some((p) => p.available);
}
