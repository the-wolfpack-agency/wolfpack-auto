import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Shadow Hardening tests.
 *
 * Runs against a pre-built production server on the shadow port (3099).
 * The shell script (scripts/shadow-test.sh) manages the server lifecycle,
 * so NO webServer block is defined here.
 */
export default defineConfig({
  testDir: "./tests/shadow-hardening",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,

  timeout: 30_000,

  expect: {
    timeout: 10_000,
  },

  reporter: [
    ["json", { outputFile: "shadow-hardening-results.json" }],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL: process.env.SHADOW_URL || "http://localhost:3099",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "shadow-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "shadow-mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
      },
    },
  ],
});
