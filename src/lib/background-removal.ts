/**
 * Background Removal Service
 *
 * Abstracts background removal behind a provider interface.
 * Provider priority:
 *  1. Local (U2-Net via @imgly/background-removal-node) — $0.00/run, no API key
 *  2. fal.ai (birefnet) — $0.01/run, fast (~3s)
 *  3. Replicate (rembg) — $0.0023/run, ~3-10s
 *  4. remove.bg — $0.10/run, highest quality fallback
 *
 * The service:
 *  1. Accepts a vehicle photo (URL or buffer)
 *  2. Runs local U2-Net model first (zero cost, zero network)
 *  3. Falls back to external APIs if local fails
 *  4. Returns a transparent PNG buffer of the vehicle cutout
 *  5. Tracks provider, cost, latency, and quality metrics for the learning system
 *
 * Usage:
 *   import { removeBackground } from "@/lib/background-removal";
 *   const result = await removeBackground({ source_url: "https://..." });
 *   // result.cutout_buffer is a transparent PNG
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AIProvider = "local" | "fal" | "replicate" | "remove_bg";

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

const FAL_REMBG_MODEL = "fal-ai/birefnet/v2";

const REPLICATE_DEFAULT_MODEL =
  "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46";

/** Cost per fal.ai background removal in cents (~$0.01/run) */
const FAL_COST_CENTS = 1;

/** Cost per Replicate prediction in cents (rembg is ~$0.0023/run) */
const REPLICATE_COST_CENTS = 1;

/** Cost per remove.bg API call in cents (~$0.10 for standard) */
const REMOVEBG_COST_CENTS = 10;

/** Maximum time to wait for AI processing (30 seconds) */
const PROCESSING_TIMEOUT_MS = 30_000;

/** Maximum source image size (15 MB) */
const MAX_SOURCE_SIZE = 15 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/*  Provider: Local (U2-Net via @imgly/background-removal-node)        */
/* ------------------------------------------------------------------ */

/** Cost per local removal in cents ($0.00 — runs entirely on CPU) */
const LOCAL_COST_CENTS = 0;

/**
 * Remove background using the local U2-Net ONNX model.
 * No API keys, no network calls, no per-image cost.
 * Model files are downloaded once on first use (~40MB) and cached.
 *
 * Requires @imgly/background-removal-node to be installed.
 * On Vercel (250MB function limit), this package is too large —
 * the provider chain gracefully falls back to fal.ai/Replicate.
 * For self-hosted deployments, install it: npm i @imgly/background-removal-node
 */
async function removeViaLocal(
  sourceUrl: string,
  sourceBuffer?: Buffer,
): Promise<RemovalResult> {
  const startMs = Date.now();

  // Lazy import — gracefully fails on Vercel where the package is excluded
  let localRemove: (blob: Blob, opts: Record<string, unknown>) => Promise<Blob>;
  try {
    const mod = await import("@imgly/background-removal-node");
    localRemove = mod.removeBackground;
  } catch {
    throw new Error(
      "[background-removal] @imgly/background-removal-node not installed. " +
        "Install it for zero-cost local removal: npm i @imgly/background-removal-node",
    );
  }
  const sharp = (await import("sharp")).default;

  // Prepare input: buffer takes priority over URL
  let inputBlob: Blob;
  if (sourceBuffer) {
    inputBlob = new Blob([new Uint8Array(sourceBuffer)], { type: "image/png" });
  } else {
    // Fetch the image and convert to blob
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(PROCESSING_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(
        `[background-removal] Failed to fetch source image: ${res.status}`,
      );
    }
    const arrayBuf = await res.arrayBuffer();
    inputBlob = new Blob([new Uint8Array(arrayBuf)], {
      type: res.headers.get("content-type") ?? "image/jpeg",
    });
  }

  // Run the local U2-Net model
  const resultBlob = await localRemove(inputBlob, {
    output: { format: "image/png", quality: 1.0 },
  });

  // Convert blob to buffer
  const cutoutBuffer = Buffer.from(await resultBlob.arrayBuffer());
  const processingMs = Date.now() - startMs;

  // Get dimensions
  const metadata = await sharp(cutoutBuffer).metadata();

  return {
    cutout_buffer: cutoutBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    size: cutoutBuffer.length,
    provider: "local",
    model: "u2net/imgly-onnx",
    prediction_id: null,
    processing_ms: processingMs,
    cost_cents: LOCAL_COST_CENTS,
  };
}

/* ------------------------------------------------------------------ */
/*  Provider: fal.ai                                                   */
/* ------------------------------------------------------------------ */

async function removeViaFal(sourceUrl: string): Promise<RemovalResult> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error(
      "[background-removal] FAL_KEY not set. Get one at https://fal.ai/dashboard/keys",
    );
  }

  const startMs = Date.now();

  const res = await fetch(`https://queue.fal.run/${FAL_REMBG_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: sourceUrl,
      model: "General Use (Heavy)",
      operating_resolution: "1024x1024",
      output_format: "png",
      sync_mode: true,
    }),
    signal: AbortSignal.timeout(PROCESSING_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `[background-removal] fal.ai API error ${res.status}: ${errBody}`,
    );
  }

  const result = (await res.json()) as {
    image?: { url: string; width: number; height: number; content_type: string };
  };

  if (!result.image?.url) {
    throw new Error("[background-removal] fal.ai returned no image");
  }

  const cutoutRes = await fetch(result.image.url);
  if (!cutoutRes.ok) {
    throw new Error(`[background-removal] Failed to download fal.ai cutout: ${cutoutRes.status}`);
  }

  const cutoutBuffer = Buffer.from(await cutoutRes.arrayBuffer());
  const processingMs = Date.now() - startMs;

  return {
    cutout_buffer: cutoutBuffer,
    width: result.image.width,
    height: result.image.height,
    size: cutoutBuffer.length,
    provider: "fal",
    model: FAL_REMBG_MODEL,
    prediction_id: null,
    processing_ms: processingMs,
    cost_cents: FAL_COST_CENTS,
  };
}

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
  // Default to local if available, otherwise fal → replicate
  // On Vercel, local is unavailable (250MB function limit), so fal is preferred
  const provider = request.provider ?? (
    process.env.VERCEL ? (process.env.FAL_KEY ? "fal" : "replicate") : "local"
  );
  const model = request.model ?? REPLICATE_DEFAULT_MODEL;

  // If we have a buffer but no URL, we need to upload it first or base64-encode
  let sourceUrl = request.source_url;
  if (!sourceUrl && request.source_buffer) {
    const base64 = request.source_buffer.toString("base64");
    const mime = "image/jpeg";
    sourceUrl = `data:${mime};base64,${base64}`;
  }

  if (!sourceUrl) {
    throw new Error("[background-removal] Either source_url or source_buffer is required");
  }

  if (request.source_buffer && request.source_buffer.length > MAX_SOURCE_SIZE) {
    throw new Error(
      `[background-removal] Source image too large (${(request.source_buffer.length / 1024 / 1024).toFixed(1)} MB > ${MAX_SOURCE_SIZE / 1024 / 1024} MB)`,
    );
  }

  // Build provider chain: preferred first, then fallbacks
  const providerFns: { name: AIProvider; fn: () => Promise<RemovalResult> }[] = [];

  const addProvider = (name: AIProvider) => {
    switch (name) {
      case "local":
        providerFns.push({
          name: "local",
          fn: () => removeViaLocal(sourceUrl!, request.source_buffer),
        });
        break;
      case "fal":
        providerFns.push({ name: "fal", fn: () => removeViaFal(sourceUrl!) });
        break;
      case "replicate":
        providerFns.push({ name: "replicate", fn: () => removeViaReplicate(sourceUrl!, model) });
        break;
      case "remove_bg":
        providerFns.push({ name: "remove_bg", fn: () => removeViaRemoveBg(sourceUrl!) });
        break;
    }
  };

  // Preferred provider first
  addProvider(provider);
  // Then fallbacks in priority order: local → fal → replicate → remove_bg
  for (const fallback of (["local", "fal", "replicate", "remove_bg"] as AIProvider[])) {
    if (fallback !== provider) addProvider(fallback);
  }

  let lastError: Error | null = null;

  for (const { name, fn } of providerFns) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[background-removal] ${name} failed:`, lastError.message);
    }
  }

  throw new Error(
    `[background-removal] All providers failed. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

/**
 * Check which AI providers are available (have API keys configured).
 */
export function getProviderHealth(): ProviderHealth[] {
  return [
    {
      provider: "local",
      available: !process.env.VERCEL, // Available on self-hosted (not Vercel — 250MB limit)
      reason: process.env.VERCEL
        ? "Unavailable on Vercel (250MB function limit). Use self-hosted for zero-cost local removal."
        : undefined,
    },
    {
      provider: "fal",
      available: !!process.env.FAL_KEY,
      reason: process.env.FAL_KEY ? undefined : "FAL_KEY not set",
    },
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
