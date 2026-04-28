"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ErrorAggregate {
  fingerprint: string;
  message: string;
  count: number;
  affected_pages: string[];
  affected_sessions: number;
  first_seen: string;
  last_seen: string;
  sample_stack: string | null;
  impact_score: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The error-monitor API runs in shadow mode (resolves return
 * `mode: "shadow"` — they don't persist server-side until the
 * underlying error_monitor table lands). Without client-side
 * memory, a resolve disappears from the UI but reappears on the
 * next page load because GET re-emits the same shadow data.
 *
 * Persist resolved fingerprints in localStorage so clicks stick
 * across reloads inside the same browser. Once the durable backend
 * lands, the server-side resolve will short-circuit this and the
 * localStorage filter becomes a no-op (the fingerprints already
 * won't be returned from GET).
 */
const RESOLVED_LS_KEY = "wolfpack-auto:error-monitor:resolved";

function loadResolvedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(RESOLVED_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveResolvedSet(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESOLVED_LS_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* localStorage unavailable / quota exhausted — silent no-op */
  }
}

export default function ErrorMonitorPage() {
  const [errors, setErrors] = useState<ErrorAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [total24h, setTotal24h] = useState(0);
  const [total7d, setTotal7d] = useState(0);
  const [resolved7d, setResolved7d] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const dismissed = loadResolvedSet();
    fetch("/api/admin/error-monitor")
      .then((r) => r.json())
      .then((data) => {
        const all: ErrorAggregate[] = data.errors ?? [];
        setErrors(all.filter((e) => !dismissed.has(e.fingerprint)));
        setTotal24h(data.total_errors_24h ?? 0);
        setTotal7d(data.total_errors_7d ?? 0);
        setResolved7d((data.resolved_7d ?? 0) + dismissed.size);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleResolve = useCallback(async (fingerprint: string) => {
    await fetch("/api/admin/error-monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint, action: "resolve" }),
    });
    setErrors((prev) => prev.filter((e) => e.fingerprint !== fingerprint));
    setResolved7d((prev) => prev + 1);
    /* Persist the dismissal so a page reload doesn't bring it back
       in shadow mode. */
    const next = loadResolvedSet();
    next.add(fingerprint);
    saveResolvedSet(next);
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Error Monitor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Client-side JS errors ranked by impact, with user behavior correlation.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Errors (24h)" value={String(total24h)} color="text-red-600" />
        <StatCard label="Errors (7d)" value={String(total7d)} />
        <StatCard label="Resolved (7d)" value={String(resolved7d)} color="text-green-600" />
      </div>

      {/* Error List */}
      <div className="space-y-3">
        {errors.map((err) => (
          <div
            key={err.fingerprint}
            className="rounded-lg border border-gray-200 bg-white"
          >
            <div
              className="flex cursor-pointer items-center justify-between px-4 py-3"
              onClick={() => setExpanded(expanded === err.fingerprint ? null : err.fingerprint)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                    {err.count}x
                  </span>
                  <p className="truncate text-sm font-medium text-gray-900">
                    {err.message}
                  </p>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-gray-500">
                  <span>{err.affected_sessions} users affected</span>
                  <span>{err.affected_pages.length} page{err.affected_pages.length !== 1 ? "s" : ""}</span>
                  <span>Impact: {err.impact_score}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResolve(err.fingerprint);
                  }}
                  className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                >
                  Resolve
                </button>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${expanded === err.fingerprint ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>

            {expanded === err.fingerprint && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">First seen:</span>
                    <span className="ml-1 text-gray-900">{new Date(err.first_seen).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Last seen:</span>
                    <span className="ml-1 text-gray-900">{new Date(err.last_seen).toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Affected Pages</p>
                  <div className="flex flex-wrap gap-1">
                    {err.affected_pages.map((page) => (
                      <span key={page} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {page}
                      </span>
                    ))}
                  </div>
                </div>
                {err.sample_stack && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Stack Trace</p>
                    <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                      {err.sample_stack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {errors.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No errors detected. All clear.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}
