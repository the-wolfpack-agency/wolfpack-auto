#!/usr/bin/env npx tsx
/**
 * Generate Photorealistic Dealership Backgrounds via AI
 *
 * Uses fal.ai Flux (primary) or Replicate SDXL (fallback) to generate
 * high-quality, photorealistic backgrounds for the vehicle background studio.
 *
 * Usage:
 *   FAL_KEY=your-key npx tsx scripts/generate-backgrounds.ts
 *   FAL_KEY=your-key npx tsx scripts/generate-backgrounds.ts --prompt modern_showroom
 *   FAL_KEY=your-key npx tsx scripts/generate-backgrounds.ts --all
 *   FAL_KEY=your-key npx tsx scripts/generate-backgrounds.ts --all --upload
 *
 * Options:
 *   --prompt <id>   Generate a specific prompt (modern_showroom, luxury_dark, outdoor_lot, glass_pavilion, lifestyle_scenic)
 *   --all           Generate all 5 dealership backgrounds
 *   --upload        Upload results to R2 and save to DB as system backgrounds
 *   --seed <n>      Specific seed for reproducible results
 *   --provider <p>  Force provider: fal or replicate
 */

import {
  generateDealershipBackground,
  DEALERSHIP_PROMPTS,
  isImageGenerationAvailable,
  getImageProviderStatus,
  type DealershipPromptId,
} from "../src/lib/image-generation";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
const all = args.includes("--all");
const upload = args.includes("--upload");
const promptIdx = args.indexOf("--prompt");
const seedIdx = args.indexOf("--seed");
const providerIdx = args.indexOf("--provider");

const specificPrompt = promptIdx !== -1 ? args[promptIdx + 1] as DealershipPromptId : null;
const seed = seedIdx !== -1 ? parseInt(args[seedIdx + 1]) : undefined;
const provider = providerIdx !== -1 ? args[providerIdx + 1] as "fal" | "replicate" : undefined;

const PROMPT_IDS = Object.keys(DEALERSHIP_PROMPTS) as DealershipPromptId[];

async function main() {
  // Check provider availability
  const status = getImageProviderStatus();
  console.log("Provider status:");
  for (const s of status) {
    console.log(`  ${s.available ? "✓" : "✗"} ${s.provider}${s.reason ? ` (${s.reason})` : ""}`);
  }

  if (!isImageGenerationAvailable()) {
    console.error("\n✗ No image generation provider available.");
    console.error("  Set FAL_KEY or REPLICATE_API_TOKEN environment variable.");
    console.error("  Get a fal.ai key at: https://fal.ai/dashboard/keys");
    process.exit(1);
  }

  // Determine which prompts to generate
  let promptsToGenerate: DealershipPromptId[];

  if (all) {
    promptsToGenerate = PROMPT_IDS;
  } else if (specificPrompt) {
    if (!PROMPT_IDS.includes(specificPrompt)) {
      console.error(`✗ Unknown prompt: ${specificPrompt}`);
      console.error(`  Available: ${PROMPT_IDS.join(", ")}`);
      process.exit(1);
    }
    promptsToGenerate = [specificPrompt];
  } else {
    // Default: generate the flagship modern_showroom
    promptsToGenerate = ["modern_showroom"];
  }

  console.log(`\nGenerating ${promptsToGenerate.length} background(s)...\n`);

  const outDir = path.join(process.cwd(), "demo", "ai-backgrounds");
  fs.mkdirSync(outDir, { recursive: true });

  const results: { id: string; file: string; size: number; ms: number; provider: string; cost: number }[] = [];

  for (const promptId of promptsToGenerate) {
    console.log(`  Generating: ${promptId}...`);
    const startMs = Date.now();

    try {
      const result = await generateDealershipBackground(promptId, {
        seed,
        provider,
      });

      // Save original
      const pngPath = path.join(outDir, `${promptId}.png`);
      fs.writeFileSync(pngPath, result.buffer);

      // Generate WebP optimized
      const webpBuffer = await sharp(result.buffer).webp({ quality: 90 }).toBuffer();
      const webpPath = path.join(outDir, `${promptId}.webp`);
      fs.writeFileSync(webpPath, webpBuffer);

      // Generate thumbnail
      const thumbBuffer = await sharp(result.buffer)
        .resize(480, 270, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();
      const thumbPath = path.join(outDir, `${promptId}_thumb.webp`);
      fs.writeFileSync(thumbPath, thumbBuffer);

      const totalMs = Date.now() - startMs;

      console.log(`  ✓ ${promptId}`);
      console.log(`    Provider: ${result.provider} (${result.model})`);
      console.log(`    Size: ${result.width}x${result.height}`);
      console.log(`    PNG: ${(result.size / 1024).toFixed(0)} KB, WebP: ${(webpBuffer.length / 1024).toFixed(0)} KB, Thumb: ${(thumbBuffer.length / 1024).toFixed(0)} KB`);
      console.log(`    Time: ${(totalMs / 1000).toFixed(1)}s, Cost: $${(result.cost_cents / 100).toFixed(3)}`);
      if (result.seed) console.log(`    Seed: ${result.seed} (use --seed ${result.seed} to reproduce)`);
      console.log();

      results.push({
        id: promptId,
        file: pngPath,
        size: result.size,
        ms: totalMs,
        provider: result.provider,
        cost: result.cost_cents,
      });

      // Upload to R2 + DB if requested
      if (upload && process.env.DATABASE_URL) {
        try {
          const { uploadImage } = await import("../src/lib/storage");
          const { query } = await import("../src/lib/db");

          const SYSTEM_DEALER_ID = "00000000-0000-4000-a000-000000000000";
          const timestamp = Date.now();

          const [origResult, optResult, thumbResult] = await Promise.all([
            uploadImage(SYSTEM_DEALER_ID, "system-backgrounds", `ai_${promptId}.png`, result.buffer),
            uploadImage(SYSTEM_DEALER_ID, "system-backgrounds", `ai_${promptId}.webp`, webpBuffer),
            uploadImage(SYSTEM_DEALER_ID, "system-backgrounds", `ai_${promptId}_thumb.webp`, thumbBuffer),
          ]);

          const name = promptId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

          await query(
            `INSERT INTO custom_backgrounds
               (dealer_id, name, description, category, tags,
                original_key, original_url, optimized_key, optimized_url,
                thumbnail_key, thumbnail_url,
                width, height, file_size, mime_type,
                is_system, is_active, sort_order)
             VALUES ($1, $2, $3, $4, $5,
                     $6, $7, $8, $9,
                     $10, $11,
                     $12, $13, $14, 'image/png',
                     true, true, $15)
             ON CONFLICT DO NOTHING`,
            [
              SYSTEM_DEALER_ID,
              `AI: ${name}`,
              `AI-generated photorealistic ${name.toLowerCase()} background via ${result.provider}`,
              "studio",
              ["ai-generated", "photorealistic", promptId],
              origResult.key, origResult.publicUrl,
              optResult.key, optResult.publicUrl,
              thumbResult.key, thumbResult.publicUrl,
              result.width, result.height, result.size,
              100 + results.length,
            ],
          );

          console.log(`    ✓ Uploaded to R2 and saved to DB`);
        } catch (err) {
          console.error(`    ✗ Upload failed:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error(`  ✗ ${promptId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Summary
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  console.log("━".repeat(50));
  console.log(`Generated: ${results.length}/${promptsToGenerate.length}`);
  console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Total cost: $${(totalCost / 100).toFixed(3)}`);
  console.log(`Output: ${outDir}`);
  console.log("━".repeat(50));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
