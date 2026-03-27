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
 */
export default defineConfig({
  testDir: "./tests/shadow",
  fullyParallel: false, // DB state must be consistent — run tests serially
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries — shadow tests must pass on first run
  workers: 1, // Serial to avoid race conditions on shared shadow DB
  reporter: process.env.CI ? "github" : "html",

  timeout: 45_000, // Slightly longer — shadow DB may have cold-start latency

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

  // No webServer block — the shadow runner manages the Next.js server
  // lifecycle externally. Set SHADOW_URL to point at the running instance.
});
