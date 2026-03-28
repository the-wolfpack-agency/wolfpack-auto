/**
 * Safe fetch wrapper with timeout and retry support.
 *
 * Wraps the native fetch() with:
 *   - Configurable timeout via AbortController (default 10 s)
 *   - Automatic retry on network errors (not on 4xx/5xx)
 *   - Clean error typing (TimeoutError vs NetworkError)
 */

export class TimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class NetworkError extends Error {
  constructor(url: string, cause?: unknown) {
    const msg =
      cause instanceof Error
        ? `Network error fetching ${url}: ${cause.message}`
        : `Network error fetching ${url}`;
    super(msg);
    this.name = "NetworkError";
  }
}

export interface SafeFetchOptions extends RequestInit {
  /** Timeout in milliseconds. Default: 10 000 (10 s). */
  timeoutMs?: number;
  /** Number of retries on network error (not on HTTP errors). Default: 1. */
  retries?: number;
}

/**
 * Fetch with timeout and retry.
 *
 * - On timeout → throws TimeoutError
 * - On network error → retries once, then throws NetworkError
 * - On HTTP 4xx/5xx → returns the response (caller decides)
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 10_000, retries = 1, ...fetchInit } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Merge caller's signal with our timeout signal
    if (fetchInit.signal) {
      fetchInit.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return response;
    } catch (err: unknown) {
      clearTimeout(timer);

      // AbortController fires an AbortError on timeout
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(url, timeoutMs);
      }

      // Network error — retry if attempts remain
      lastError = err;
      if (attempt < retries) {
        console.warn(
          `[safe-fetch] Network error on attempt ${attempt + 1}/${retries + 1} for ${url}, retrying...`,
        );
        continue;
      }
    }
  }

  throw new NetworkError(url, lastError);
}
