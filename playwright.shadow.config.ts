import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for shadow integration tests.
 *
 * Shadow tests run against a production-identical environment backed by a
 * Neon DB branch. The shadow runner (scripts/shadow_runner.py) creates the
 * branch, seeds test data, starts Next.js on port 3100, then tears everything
 * down after — with or without a real Neon branch (--skip-branch flag).
 *
 * Usage:
 *   # Full run (shadow runner manages lifecycle):
 *   python scripts/shadow_runner.py
 *
 *   # Against already-running shadow server:
 *   SHADOW_URL=http://localhost:3100 npx playwright test --config=playwright.shadow.config.ts
 *
 *   # Local dev iteration (no Neon, no shadow runner needed):
 *   npx playwright test --config=playwright.shadow.config.ts
 *   → Automatically starts `next dev` on port 3100 so ALL routes (including
 *     newly added ones) are reachable without a fresh `next build`.
 *
 * Server priority:
 *   1. SHADOW_URL env var → use that, no webServer started
 *   2. No SHADOW_URL + CI=true → no webServer (CI manages lifecycle via workflow)
 *   3. No SHADOW_URL + local → start `next dev` on port 3100 automatically
 */

// Detect whether an external server is being provided
const externalServer = !!process.env.SHADOW_URL || !!process.env.CI;

export default defineConfig({
  testDir: "./tests/shadow",
  fullyParallel: false, // DB state must be consistent — run tests serially
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries — shadow tests must pass on first run
  workers: 1, // Serial to avoid race conditions on shared shadow DB
  reporter: process.env.CI ? "github" : "html",

  timeout: 60_000, // next dev startup can take up to 30s on first request

  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: process.env.SHADOW_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],

  // Start `next dev` locally when no external server is provided.
  // `next dev` picks up ALL routes at request time — no stale build needed.
  // In CI and when SHADOW_URL is set, the external server is used instead.
  webServer: externalServer
    ? undefined
    : {
        command: "PORT=3100 npm run dev",
        url: "http://localhost:3100",
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
