#!/usr/bin/env npx tsx
/**
 * Seed the Wolfpack Assistant action registry with 17 starter actions.
 *
 * Idempotent: every entry upserts by slug. Re-running produces the same
 * end state, no duplicates.
 *
 * The seed data is hand-curated from
 * docs/wolfpack-assistant-integration-2026-05-12.md. The starter set
 * spans leads, F&I, service, inventory, marketing/email, notifications,
 * analytics, learning, audit, and general/profile.
 *
 * Usage:
 *   npx tsx scripts/seed-assistant-actions.ts
 *
 * Reads DATABASE_URL from .env.local if present.
 */

import * as fs from "fs";
import * as path from "path";

import {
  seedAssistantActions,
  SEED_ACTIONS,
} from "../src/lib/wolfpack-assistant";

// ---------------------------------------------------------------------------
// Env bootstrap (.env.local) — match the pattern in seed-literacy-ontology.ts
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = require.main === module;
if (isMain) {
  seedAssistantActions()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(
        `[assistant-seed] complete: ${result.actions} actions upserted (declared: ${SEED_ACTIONS.length})`,
      );
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[assistant-seed] failed:", err);
      process.exit(1);
    });
}

// Re-export for tests.
export { seedAssistantActions, SEED_ACTIONS };
