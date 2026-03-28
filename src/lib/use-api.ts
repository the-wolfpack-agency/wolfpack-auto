"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useApi — Lightweight data-fetching hook with cache invalidation.
 *
 * Replaces the boilerplate pattern used across admin pages:
 *
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 *   useEffect(() => { fetch(...).then(...) }, []);
 *
 * Migration path for existing pages:
 *   1. Import useApi from "@/lib/use-api"
 *   2. Replace the 4-line boilerplate with:
 *        const { data, error, loading, mutate } = useApi<MyType>("/api/admin/...");
 *   3. After mutations (POST/PUT/DELETE), call mutate() to refetch
 *   4. For real-time pages, pass { refreshInterval: 10_000 } for 10s polling
 *
 * Do NOT refactor existing stable pages all at once — adopt incrementally
 * in new pages or when touching existing ones for other reasons.
 */

interface UseApiOptions {
  /** Auto-refresh interval in milliseconds. 0 = no auto-refresh (default). */
  refreshInterval?: number;
  /** Refetch when the browser tab regains focus. Default: true. */
  revalidateOnFocus?: boolean;
}

interface UseApiResult<T> {
  /** The fetched data, or null if not yet loaded / on error. */
  data: T | null;
  /** Error message string, or null on success. */
  error: string | null;
  /** True during the initial fetch or a manual mutate(). */
  loading: boolean;
  /** Manually trigger a refetch (e.g. after a POST mutation). */
  mutate: () => void;
}

export function useApi<T>(
  url: string,
  options?: UseApiOptions,
): UseApiResult<T> {
  const { refreshInterval = 0, revalidateOnFocus = true } = options ?? {};

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Track the current URL so we can skip stale responses on URL changes
  const urlRef = useRef(url);
  urlRef.current = url;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      // If the URL changed while we were fetching, discard the result
      if (urlRef.current !== url) return;

      // 401 = session expired — return null gracefully, no error banner
      if (res.status === 401) {
        setData(null);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const body = await res.text();
        setError(body || `Request failed with status ${res.status}`);
        setData(null);
        setLoading(false);
        return;
      }

      const json = (await res.json()) as T;
      setData(json);
    } catch (err) {
      if (urlRef.current !== url) return;
      setError(err instanceof Error ? err.message : "Network error");
      setData(null);
    } finally {
      if (urlRef.current === url) {
        setLoading(false);
      }
    }
  }, [url]);

  // Initial fetch on mount + refetch when URL changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  // Revalidate on window focus
  useEffect(() => {
    if (!revalidateOnFocus) return;
    if (typeof window === "undefined") return;

    const onFocus = () => {
      fetchData();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData, revalidateOnFocus]);

  return { data, error, loading, mutate: fetchData };
}
