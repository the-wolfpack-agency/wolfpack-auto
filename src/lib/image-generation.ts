/**
 * AI Image Generation Provider — Multi-Provider Abstraction
 *
 * Generates images from text prompts via AI APIs. Supports multiple
 * providers with automatic fallback:
 *
 *   1. fal.ai (primary) — Flux Dev, cheapest ($0.025/image), fastest
 *   2. Replicate (fallback) — SDXL, broader model selection
 *
 * Provider is swappable via env var or function argument. The rest of
 * the system (compositing, storage, analytics, UI) doesn't care which
 * provider generated the image.
 *
 * Usage:
 *   import { generateImage } from "@/lib/image-generation";
 *   const result = await generateImage({
 *     prompt: "empty modern car dealership showroom...",
 *     width: 1344,
 *     height: 768,
 *   });
 *   // result.buffer is the image, result.url is the hosted URL
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ImageProvider = "fal" | "replicate";

export interface GenerateImageRequest {
  /** Text prompt describing the image to generate */
  prompt: string;
  /** Negative prompt (things to exclude) */
  negative_prompt?: string;
  /** Image width. Default: 1344 (landscape 16:9 approx) */
  width?: number;
  /** Image height. Default: 768 */
  height?: number;
  /** Number of inference steps. Higher = better quality, slower. Default: 28 */
  steps?: number;
  /** Guidance scale. Higher = more prompt adherence. Default: 3.5 */
  guidance_scale?: number;
  /** Specific seed for reproducible results */
  seed?: number;
  /** Provider override. Default: auto (tries fal first, then replicate) */
  provider?: ImageProvider;
  /** Model override (provider-specific) */
  model?: string;
}

export interface GenerateImageResult {
  /** Generated image buffer */
  buffer: Buffer;
  /** Hosted URL of the generated image (temporary, from provider CDN) */
  url: string;
  /** Image dimensions */
  width: number;
  height: number;
  /** File size in bytes */
  size: number;
  /** Which provider was used */
  provider: ImageProvider;
  /** Model used */
  model: string;
  /** Seed used (for reproducibility) */
  seed: number | null;
  /** Processing time in milliseconds */
  processing_ms: number;
  /** Estimated cost in USD cents */
  cost_cents: number;
}

export interface ProviderStatus {
  provider: ImageProvider;
  available: boolean;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const FAL_DEFAULT_MODEL = "fal-ai/flux/dev";
const REPLICATE_DEFAULT_MODEL = "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";

const FAL_COST_CENTS = 3;        // ~$0.025 per image
const REPLICATE_COST_CENTS = 3;  // ~$0.03 per image

const GENERATION_TIMEOUT_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  Provider: fal.ai                                                   */
/* ------------------------------------------------------------------ */

async function generateViaFal(
  request: GenerateImageRequest,
  model: string,
): Promise<GenerateImageResult> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error(
      "[image-generation] FAL_KEY not set. Get one at https://fal.ai/dashboard/keys",
    );
  }

  const startMs = Date.now();

  // Map width/height to fal.ai image_size enum or custom
  const width = request.width ?? 1344;
  const height = request.height ?? 768;

  // Submit to queue
  const submitRes = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: request.prompt,
      image_size: { width, height },
      num_inference_steps: request.steps ?? 28,
      guidance_scale: request.guidance_scale ?? 3.5,
      seed: request.seed ?? null,
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
      sync_mode: true,
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text().catch(() => "");
    throw new Error(
      `[image-generation] fal.ai API error ${submitRes.status}: ${errBody}`,
    );
  }

  const result = (await submitRes.json()) as {
    images?: { url: string; width: number; height: number; content_type: string }[];
    seed?: number;
    request_id?: string;
  };

  if (!result.images || result.images.length === 0) {
    throw new Error("[image-generation] fal.ai returned no images");
  }

  const imageInfo = result.images[0];

  // Download the generated image
  const imageRes = await fetch(imageInfo.url);
  if (!imageRes.ok) {
    throw new Error(
      `[image-generation] Failed to download image from fal.ai: ${imageRes.status}`,
    );
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const processingMs = Date.now() - startMs;

  return {
    buffer,
    url: imageInfo.url,
    width: imageInfo.width,
    height: imageInfo.height,
    size: buffer.length,
    provider: "fal",
    model,
    seed: result.seed ?? null,
    processing_ms: processingMs,
    cost_cents: FAL_COST_CENTS,
  };
}

/* ------------------------------------------------------------------ */
/*  Provider: Replicate                                                */
/* ------------------------------------------------------------------ */

async function generateViaReplicate(
  request: GenerateImageRequest,
  model: string,
): Promise<GenerateImageResult> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "[image-generation] REPLICATE_API_TOKEN not set. Get one at https://replicate.com/account/api-tokens",
    );
  }

  const startMs = Date.now();
  const [, version] = model.split(":");

  if (!version) {
    throw new Error(`[image-generation] Invalid Replicate model format: ${model}. Expected "owner/name:version"`);
  }

  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version,
      input: {
        prompt: request.prompt,
        negative_prompt: request.negative_prompt ?? "",
        width: request.width ?? 1344,
        height: request.height ?? 768,
        num_inference_steps: request.steps ?? 50,
        guidance_scale: request.guidance_scale ?? 7.5,
        seed: request.seed,
      },
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text().catch(() => "");
    throw new Error(
      `[image-generation] Replicate API error ${createRes.status}: ${errBody}`,
    );
  }

  const prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output: string | string[] | null;
    error: string | null;
  };

  // Poll if not done
  let result = prediction;
  if (result.status !== "succeeded" && result.status !== "failed") {
    result = await pollReplicate(result.id, apiToken);
  }

  if (result.status === "failed" || result.error) {
    throw new Error(
      `[image-generation] Replicate prediction failed: ${result.error ?? "unknown"}`,
    );
  }

  const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
  if (!outputUrl) {
    throw new Error("[image-generation] Replicate returned no output");
  }

  const imageRes = await fetch(outputUrl);
  if (!imageRes.ok) {
    throw new Error(`[image-generation] Failed to download from Replicate: ${imageRes.status}`);
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const processingMs = Date.now() - startMs;

  const sharp = (await import("sharp")).default;
  const metadata = await sharp(buffer).metadata();

  return {
    buffer,
    url: outputUrl,
    width: metadata.width ?? (request.width ?? 1344),
    height: metadata.height ?? (request.height ?? 768),
    size: buffer.length,
    provider: "replicate",
    model,
    seed: null,
    processing_ms: processingMs,
    cost_cents: REPLICATE_COST_CENTS,
  };
}

async function pollReplicate(
  id: string,
  token: string,
  maxWaitMs = GENERATION_TIMEOUT_MS,
): Promise<{ id: string; status: string; output: string | string[] | null; error: string | null }> {
  const deadline = Date.now() + maxWaitMs;
  let delay = 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 5000);

    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;

    const data = (await res.json()) as {
      id: string;
      status: string;
      output: string | string[] | null;
      error: string | null;
    };

    if (data.status === "succeeded" || data.status === "failed") return data;
  }

  throw new Error(`[image-generation] Replicate prediction ${id} timed out`);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate an image from a text prompt.
 *
 * Tries the primary provider first, falls back to secondary on failure.
 * Provider priority: fal.ai > Replicate (configurable via env or argument).
 */
export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResult> {
  const preferredProvider = request.provider
    ?? (process.env.IMAGE_GENERATION_PROVIDER as ImageProvider | undefined)
    ?? "fal";

  const providers: { provider: ImageProvider; model: string; fn: typeof generateViaFal }[] = [];

  if (preferredProvider === "fal") {
    providers.push(
      { provider: "fal", model: request.model ?? FAL_DEFAULT_MODEL, fn: generateViaFal },
      { provider: "replicate", model: request.model ?? REPLICATE_DEFAULT_MODEL, fn: generateViaReplicate },
    );
  } else {
    providers.push(
      { provider: "replicate", model: request.model ?? REPLICATE_DEFAULT_MODEL, fn: generateViaReplicate },
      { provider: "fal", model: request.model ?? FAL_DEFAULT_MODEL, fn: generateViaFal },
    );
  }

  let lastError: Error | null = null;

  for (const { provider, model, fn } of providers) {
    try {
      return await fn(request, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[image-generation] ${provider} failed:`,
        lastError.message,
      );
    }
  }

  throw new Error(
    `[image-generation] All providers failed. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

/**
 * Check which image generation providers are available.
 */
export function getImageProviderStatus(): ProviderStatus[] {
  return [
    {
      provider: "fal",
      available: !!process.env.FAL_KEY,
      reason: process.env.FAL_KEY ? undefined : "FAL_KEY not set",
    },
    {
      provider: "replicate",
      available: !!process.env.REPLICATE_API_TOKEN,
      reason: process.env.REPLICATE_API_TOKEN ? undefined : "REPLICATE_API_TOKEN not set",
    },
  ];
}

/**
 * Check if any image generation provider is available.
 */
export function isImageGenerationAvailable(): boolean {
  return getImageProviderStatus().some((p) => p.available);
}

/* ------------------------------------------------------------------ */
/*  Background-specific prompts                                        */
/* ------------------------------------------------------------------ */

/**
 * Pre-built prompts for generating system dealership backgrounds.
 * These are carefully engineered to produce consistent, high-quality results.
 */
export const DEALERSHIP_PROMPTS = {
  modern_showroom: {
    prompt: "Empty modern luxury car dealership showroom interior photograph, no cars, no people, no text, polished light gray epoxy floor with subtle reflections, recessed LED panel ceiling lights in rows, floor to ceiling glass windows on the right wall letting in natural daylight, clean white walls with minimal design, professional automotive photography, ultra realistic, high resolution, wide angle shot at eye level, symmetrical composition, soft even lighting, showroom depth perspective",
    negative_prompt: "cars, vehicles, people, text, watermark, logo, low quality, blurry, distorted, cartoon, illustration, painting, dark, cluttered, furniture, signs, banners, posters",
  },
  luxury_dark: {
    prompt: "Empty premium dark car dealership showroom interior photograph, no cars, no people, no text, polished dark concrete floor with mirror reflections, dramatic blue and purple rim lighting from the sides, dark charcoal walls, recessed ceiling spotlights creating pools of light on the floor, luxury automotive photography studio, ultra realistic, high resolution, wide angle, moody atmospheric lighting, cinematic",
    negative_prompt: "cars, vehicles, people, text, watermark, logo, low quality, blurry, cartoon, illustration, bright, overexposed, furniture, cluttered",
  },
  outdoor_lot: {
    prompt: "Empty car dealership outdoor lot photograph, no cars, no people, no text, clean fresh black asphalt parking lot, painted white parking lines, clear blue sky with a few white clouds, distant tree line on the horizon, bright natural daylight, professional real estate photography, ultra realistic, high resolution, wide angle, eye level shot looking across the empty lot",
    negative_prompt: "cars, vehicles, people, text, watermark, logo, low quality, blurry, cartoon, illustration, rain, dark, night, buildings, signs",
  },
  glass_pavilion: {
    prompt: "Empty modern glass car showroom pavilion photograph, no cars, no people, no text, floor to ceiling glass walls on three sides, polished white terrazzo floor, thin steel structural columns, open airy space flooded with natural light, green landscaping visible through the glass, contemporary architectural photography, ultra realistic, high resolution, wide angle, bright and clean",
    negative_prompt: "cars, vehicles, people, text, watermark, logo, low quality, blurry, cartoon, illustration, dark, cluttered, furniture, old, dirty",
  },
  lifestyle_scenic: {
    prompt: "Empty scenic mountain road photograph for car photography background, no cars, no people, no text, smooth asphalt road curving through green mountains, golden hour warm sunlight from the left, distant mountain peaks, clear sky with warm orange tones near horizon, professional landscape photography, ultra realistic, high resolution, wide angle, shallow depth of field on the background, cinematic color grading",
    negative_prompt: "cars, vehicles, people, text, watermark, logo, low quality, blurry, cartoon, illustration, night, rain, snow, buildings, signs",
  },
} as const;

export type DealershipPromptId = keyof typeof DEALERSHIP_PROMPTS;

/**
 * Generate a specific dealership background using a pre-built prompt.
 */
export async function generateDealershipBackground(
  promptId: DealershipPromptId,
  options?: Partial<GenerateImageRequest>,
): Promise<GenerateImageResult> {
  const promptDef = DEALERSHIP_PROMPTS[promptId];

  return generateImage({
    prompt: promptDef.prompt,
    negative_prompt: promptDef.negative_prompt,
    width: 1344,
    height: 768,
    steps: 28,
    guidance_scale: 3.5,
    ...options,
  });
}
