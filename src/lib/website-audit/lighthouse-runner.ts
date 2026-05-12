/**
 * Lighthouse runner — delegates perf / accessibility / SEO scoring.
 *
 * Lighthouse is NOT in our package.json today. Per the spec we fail-soft
 * when it's missing — the rest of the audit still runs. The
 * `LighthouseResult` shape is shaped so `patterns.ts` rules can check
 * `available === true` before reading metric fields.
 *
 * TODO(lighthouse): once Lighthouse is installed (`npm install --save-dev
 * lighthouse chrome-launcher`), swap the stub branch for a real
 * invocation. Keep the public API stable.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

export type LighthouseUnavailableReason =
  | "lighthouse_not_installed"
  | "lighthouse_invocation_failed"
  | "lighthouse_timed_out";

export interface LighthouseResultAvailable {
  available: true;
  performance_score: number;
  accessibility_score: number;
  seo_score: number;
  best_practices_score: number;
  lcp_seconds: number;
  cls: number;
  tbt_ms: number;
  fcp_seconds: number;
  fetched_at: string;
}

export interface LighthouseResultUnavailable {
  available: false;
  reason: LighthouseUnavailableReason;
  fetched_at: string;
}

export type LighthouseResult =
  | LighthouseResultAvailable
  | LighthouseResultUnavailable;

export interface RunLighthouseOptions {
  /** Hard cap on wall-time (ms). Default 60s. */
  timeout_ms?: number;
  /** Test seam — bypass the real Lighthouse invocation. */
  __testRunner?: (url: string) => Promise<LighthouseResult>;
}

/**
 * Run Lighthouse against `url`. Returns a typed result with `available` so
 * the caller can branch without try/catch. Never throws.
 */
export async function runLighthouse(
  url: string,
  opts: RunLighthouseOptions = {},
): Promise<LighthouseResult> {
  if (opts.__testRunner) {
    try {
      return await opts.__testRunner(url);
    } catch {
      return unavailable("lighthouse_invocation_failed");
    }
  }

  if (!lighthouseAvailable()) {
    console.warn(
      "[website-audit] Lighthouse not installed. Falling back to scan-only audit. " +
        "TODO(lighthouse): run `npm install --save-dev lighthouse chrome-launcher`.",
    );
    return unavailable("lighthouse_not_installed");
  }

  // Real path — only reachable when Lighthouse + chrome-launcher are present.
  try {
    const lighthouse = require("lighthouse") as any;
    const chromeLauncher = require("chrome-launcher") as any;
    const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
    try {
      const lhOpts = { logLevel: "error", output: "json", onlyCategories: ["performance", "accessibility", "seo", "best-practices"], port: chrome.port };
      const runner = lighthouse(url, lhOpts);
      const timeoutMs = opts.timeout_ms ?? 60000;
      const runnerResult = await Promise.race([
        runner,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);
      const lhr = (runnerResult as any)?.lhr;
      if (!lhr) return unavailable("lighthouse_invocation_failed");
      const cat = (k: string) => Math.round((lhr.categories?.[k]?.score ?? 0) * 100);
      const audit = (k: string): number => Number(lhr.audits?.[k]?.numericValue ?? 0);
      return {
        available: true,
        performance_score: cat("performance"),
        accessibility_score: cat("accessibility"),
        seo_score: cat("seo"),
        best_practices_score: cat("best-practices"),
        lcp_seconds: audit("largest-contentful-paint") / 1000,
        cls: Number(lhr.audits?.["cumulative-layout-shift"]?.numericValue ?? 0),
        tbt_ms: audit("total-blocking-time"),
        fcp_seconds: audit("first-contentful-paint") / 1000,
        fetched_at: new Date().toISOString(),
      };
    } finally {
      try { await chrome.kill(); } catch { /* swallow */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "timeout") return unavailable("lighthouse_timed_out");
    return unavailable("lighthouse_invocation_failed");
  }
}

function unavailable(reason: LighthouseUnavailableReason): LighthouseResultUnavailable {
  return { available: false, reason, fetched_at: new Date().toISOString() };
}

function lighthouseAvailable(): boolean {
  try {
    require.resolve("lighthouse");
    require.resolve("chrome-launcher");
    return true;
  } catch {
    return false;
  }
}
