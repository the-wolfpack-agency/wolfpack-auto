#!/usr/bin/env npx tsx
/**
 * CLI script to index all vehicles into Qdrant.
 *
 * Usage:
 *   npx tsx scripts/index-vehicles.ts
 *
 * Environment:
 *   QDRANT_URL      - Qdrant HTTP endpoint (e.g. http://localhost:6333)
 *   DATABASE_URL    - PostgreSQL connection string (optional; falls back to placeholder data)
 *   OPENAI_API_KEY  - OpenAI key for embeddings (optional; falls back to local trigram)
 *   DEALER_ID       - Dealer UUID (optional; defaults to demo dealer)
 *
 * tsx automatically resolves tsconfig "paths" so @/lib/... works.
 */

/* eslint-disable no-console */

async function main() {
  console.log("=== Wolfpack Auto — Vehicle Indexer ===\n");

  // Step 1: Check environment
  const qdrantUrl = process.env.QDRANT_URL;
  if (!qdrantUrl) {
    console.error(
      "ERROR: QDRANT_URL is not set.\n" +
        "Set it to your Qdrant instance (e.g. http://localhost:6333) and try again.",
    );
    process.exit(1);
  }
  console.log(`Qdrant URL: ${qdrantUrl}`);
  console.log(
    `Database:   ${process.env.DATABASE_URL ? "configured" : "not set (using placeholder data)"}`,
  );
  console.log(
    `Embeddings: ${process.env.OPENAI_API_KEY ? "OpenAI" : "local trigram (zero-cost)"}\n`,
  );

  // Step 2: Health check
  // Dynamic imports so tsx resolves tsconfig paths for transitive @/lib/... imports
  const { healthCheck } = await import("@/lib/qdrant-client");
  const healthy = await healthCheck();
  if (!healthy) {
    console.error(
      `ERROR: Qdrant is not reachable at ${qdrantUrl}.\n` +
        "Make sure Qdrant is running (docker compose up -d qdrant).",
    );
    process.exit(1);
  }
  console.log("Qdrant health check: OK\n");

  // Step 3: Index vehicles
  const { indexAllVehicles } = await import("@/lib/intake/vehicle-indexer");

  const dealerId =
    process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

  console.log(`Indexing vehicles for dealer ${dealerId}...\n`);

  const start = Date.now();
  const result = await indexAllVehicles(dealerId);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Step 4: Summary
  console.log("\n=== Results ===");
  console.log(`Source:   ${result.source}`);
  console.log(`Indexed:  ${result.indexed}`);
  console.log(`Failed:   ${result.failed}`);
  console.log(`Total:    ${result.indexed + result.failed}`);
  console.log(`Time:     ${elapsed}s`);

  if (result.failed > 0) {
    console.warn(
      "\nSome vehicles failed to index. Check logs above for details.",
    );
    process.exit(1);
  }

  if (result.indexed === 0) {
    console.warn("\nNo vehicles were indexed. Is the data source empty?");
    process.exit(1);
  }

  console.log("\nAll vehicles indexed successfully. Vector search is ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
