#!/usr/bin/env npx tsx
/**
 * Seed System Backgrounds
 *
 * Generates all 6 photorealistic system backgrounds and:
 *  1. Uploads original + optimized + thumbnail to R2
 *  2. Inserts metadata into custom_backgrounds (is_system=true)
 *  3. Skips any that already exist (idempotent)
 *
 * Usage:
 *   npx tsx scripts/seed-system-backgrounds.ts
 *   npx tsx scripts/seed-system-backgrounds.ts --force  # re-generate even if exists
 *   npx tsx scripts/seed-system-backgrounds.ts --local  # save to disk instead of R2
 *
 * Runs at build time or on first deploy. Safe to re-run.
 */

import {
  generateAllSystemBackgrounds,
  generateOptimizedVariants,
  getSystemBackgroundIds,
} from "../src/lib/system-backgrounds";

const SYSTEM_DEALER_ID = "00000000-0000-4000-a000-000000000000";
const args = process.argv.slice(2);
const force = args.includes("--force");
const localOnly = args.includes("--local");

async function main() {
  console.log("🎨 Generating 6 system backgrounds at 1920x1080...\n");

  const backgrounds = await generateAllSystemBackgrounds(1920, 1080);

  console.log(`Generated ${backgrounds.length} backgrounds:\n`);
  for (const bg of backgrounds) {
    console.log(`  ✓ ${bg.name} — ${bg.width}x${bg.height}, ${(bg.size / 1024).toFixed(0)} KB`);
  }

  if (localOnly) {
    // Save to disk for preview
    const fs = await import("fs");
    const path = await import("path");
    const outDir = path.join(process.cwd(), "demo", "system-backgrounds");
    fs.mkdirSync(outDir, { recursive: true });

    for (const bg of backgrounds) {
      const variants = await generateOptimizedVariants(bg.buffer);

      fs.writeFileSync(path.join(outDir, `${bg.id}.png`), bg.buffer);
      fs.writeFileSync(path.join(outDir, `${bg.id}.webp`), variants.optimized);
      fs.writeFileSync(path.join(outDir, `${bg.id}_thumb.webp`), variants.thumbnail);

      console.log(`  📁 Saved ${bg.id} (PNG: ${(bg.size / 1024).toFixed(0)} KB, WebP: ${(variants.optimizedSize / 1024).toFixed(0)} KB, Thumb: ${(variants.thumbnailSize / 1024).toFixed(0)} KB)`);
    }

    console.log(`\n✅ Saved to ${outDir}`);
    return;
  }

  // Check which already exist in DB
  if (process.env.DATABASE_URL) {
    const { query } = await import("../src/lib/db");

    const existingIds = getSystemBackgroundIds();
    const { rows } = await query(
      `SELECT id FROM custom_backgrounds WHERE id::text = ANY($1) AND is_system = true`,
      [existingIds],
    );
    const existingSet = new Set(rows.map((r: Record<string, unknown>) => r.id as string));

    if (!force && existingSet.size === backgrounds.length) {
      console.log("\n✅ All system backgrounds already exist. Use --force to re-generate.");
      return;
    }

    for (const bg of backgrounds) {
      if (!force && existingSet.has(bg.id)) {
        console.log(`  ⏭ ${bg.name} already exists, skipping`);
        continue;
      }

      const variants = await generateOptimizedVariants(bg.buffer);

      // Upload to R2
      let originalUrl = "";
      let optimizedUrl = "";
      let thumbnailUrl = "";
      let originalKey = "";
      let optimizedKey = "";
      let thumbnailKey = "";

      if (process.env.R2_ACCOUNT_ID) {
        const { uploadImage } = await import("../src/lib/storage");

        const [origResult, optResult, thumbResult] = await Promise.all([
          uploadImage(SYSTEM_DEALER_ID, "system-backgrounds", `${bg.id}.png`, bg.buffer),
          uploadImage(SYSTEM_DEALER_ID, "system-backgrounds", `${bg.id}.webp`, variants.optimized),
          uploadImage(SYSTEM_DEALER_ID, "system-backgrounds", `${bg.id}_thumb.webp`, variants.thumbnail),
        ]);

        originalKey = origResult.key;
        originalUrl = origResult.publicUrl;
        optimizedKey = optResult.key;
        optimizedUrl = optResult.publicUrl;
        thumbnailKey = thumbResult.key;
        thumbnailUrl = thumbResult.publicUrl;
      } else {
        const { getPublicUrl } = await import("../src/lib/storage");
        originalKey = `system/backgrounds/${bg.id}.png`;
        originalUrl = getPublicUrl(originalKey);
        optimizedKey = `system/backgrounds/${bg.id}.webp`;
        optimizedUrl = getPublicUrl(optimizedKey);
        thumbnailKey = `system/backgrounds/${bg.id}_thumb.webp`;
        thumbnailUrl = getPublicUrl(thumbnailKey);
      }

      // Upsert into DB
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
         ON CONFLICT (dealer_id, name) WHERE is_system = true
         DO UPDATE SET
           description = EXCLUDED.description,
           original_key = EXCLUDED.original_key,
           original_url = EXCLUDED.original_url,
           optimized_key = EXCLUDED.optimized_key,
           optimized_url = EXCLUDED.optimized_url,
           thumbnail_key = EXCLUDED.thumbnail_key,
           thumbnail_url = EXCLUDED.thumbnail_url,
           width = EXCLUDED.width,
           height = EXCLUDED.height,
           file_size = EXCLUDED.file_size,
           updated_at = now()`,
        [
          SYSTEM_DEALER_ID, bg.name, bg.description, bg.category, bg.tags,
          originalKey, originalUrl, optimizedKey, optimizedUrl,
          thumbnailKey, thumbnailUrl,
          bg.width, bg.height, bg.size,
          backgrounds.indexOf(bg),
        ],
      );

      console.log(`  ✅ ${bg.name} — uploaded and saved to DB`);
    }
  } else {
    console.log("\n⚠️  No DATABASE_URL set. Use --local to save backgrounds to disk.");
  }

  console.log("\n✅ System backgrounds seeded successfully.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
