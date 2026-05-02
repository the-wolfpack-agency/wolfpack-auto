"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types — kept thin; mirrors the API shape in src/lib/vehicle-provenance.ts  */
/* -------------------------------------------------------------------------- */

type ProvenanceEventType =
  | "title_transfer"
  | "odometer_reading"
  | "service"
  | "damage"
  | "recall"
  | "inspection";

interface ProvenanceEventRow {
  id: string;
  vin: string;
  event_type: ProvenanceEventType;
  occurred_at: string;
  payload: Record<string, unknown>;
  recorded_at: string;
  prev_hash: string | null;
  this_hash: string;
  signature_alg: string;
}

interface ProvenanceAnchorRow {
  id: string;
  vin: string;
  root_hash: string;
  range_count: number;
  anchored_at: string;
  anchor_alg: string;
}

interface VerifyChainResult {
  ok: boolean;
  count: number;
  brokenAtId?: string;
  reason?: string;
}

interface ProvenanceSummary {
  vin: string;
  count: number;
  last_event_at: string | null;
  last_hash: string | null;
  events: ProvenanceEventRow[];
  anchors: ProvenanceAnchorRow[];
  verification: VerifyChainResult;
  warning?: string;
}

const EVENT_TYPE_LABELS: Record<ProvenanceEventType, string> = {
  title_transfer: "Title Transfer",
  odometer_reading: "Odometer Reading",
  service: "Service",
  damage: "Damage",
  recall: "Recall",
  inspection: "Inspection",
};

const EVENT_TYPE_BADGE: Record<ProvenanceEventType, string> = {
  title_transfer: "bg-blue-50 text-blue-700 ring-blue-600/20",
  odometer_reading: "bg-gray-100 text-gray-700 ring-gray-400/20",
  service: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  damage: "bg-red-50 text-red-700 ring-red-600/20",
  recall: "bg-amber-50 text-amber-700 ring-amber-600/20",
  inspection: "bg-purple-50 text-purple-700 ring-purple-600/20",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function shortHash(hex: string | null | undefined): string {
  if (!hex) return "—";
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function VehicleProvenancePage() {
  const [vinInput, setVinInput] = useState("");
  const [activeVin, setActiveVin] = useState<string | null>(null);
  const [summary, setSummary] = useState<ProvenanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorMessage, setAnchorMessage] = useState<string | null>(null);

  async function loadSummary(vin: string) {
    setLoading(true);
    setError(null);
    setAnchorMessage(null);
    try {
      const res = await fetch(
        `/api/admin/vehicle-provenance/${encodeURIComponent(vin)}`,
      );
      if (res.status === 401 || res.status === 403) {
        setError("You are not authorised to view this data.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = (await res.json()) as ProvenanceSummary;
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provenance");
    } finally {
      setLoading(false);
    }
  }

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const vin = vinInput.trim().toUpperCase();
    if (!vin) return;
    setActiveVin(vin);
    loadSummary(vin);
  }

  async function onAnchor() {
    if (!activeVin) return;
    setAnchoring(true);
    setAnchorMessage(null);
    try {
      const res = await fetch(`/api/admin/vehicle-provenance/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: activeVin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error: ${res.status}`);
      }
      setAnchorMessage("Anchor created — merkle root signed and stored.");
      await loadSummary(activeVin);
    } catch (err) {
      setAnchorMessage(
        err instanceof Error ? err.message : "Failed to anchor",
      );
    } finally {
      setAnchoring(false);
    }
  }

  useEffect(() => {
    // Optional: auto-load if a VIN is in the URL hash for shareable links
    if (typeof window === "undefined") return;
    const hashVin = window.location.hash.replace(/^#vin=/, "");
    if (hashVin) {
      setVinInput(hashVin);
      setActiveVin(hashVin.toUpperCase());
      loadSummary(hashVin.toUpperCase());
    }
  }, []);

  const verification = summary?.verification;
  const verifyBadgeClass = verification
    ? verification.ok
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : "bg-red-50 text-red-700 ring-red-600/20"
    : "bg-gray-100 text-gray-600 ring-gray-400/20";
  const verifyLabel = verification
    ? verification.ok
      ? "Chain verified"
      : "Chain INVALID"
    : "—";

  return (
    <div
      className="mx-auto max-w-5xl p-4 sm:p-6"
      data-testid="admin-vehicle-provenance-page"
    >
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Vehicle Provenance
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Cryptographically-signed vehicle history. Every event is hash-chained
          and signed via the platform&apos;s named-algorithm registry.
        </p>
      </header>

      <form onSubmit={onSearch} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={vinInput}
          onChange={(e) => setVinInput(e.target.value)}
          placeholder="Enter VIN (11–17 chars)"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="VIN"
          data-testid="vin-input"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="vin-search-button"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-600/20">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          Loading…
        </div>
      )}

      {summary && !loading && (
        <section data-testid="provenance-summary">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-medium text-gray-500">VIN</p>
              <p className="mt-1 font-mono text-sm font-semibold text-gray-900">
                {summary.vin}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Events</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {summary.count}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Status</p>
              <span
                data-testid="verify-badge"
                className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${verifyBadgeClass}`}
              >
                {verifyLabel}
              </span>
              {verification && !verification.ok && (
                <p className="mt-1 text-xs text-red-700">{verification.reason}</p>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAnchor}
              disabled={anchoring || summary.count === 0}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="anchor-now-button"
            >
              {anchoring ? "Anchoring…" : "Anchor now"}
            </button>
            {anchorMessage && (
              <span
                className="text-xs text-gray-700"
                data-testid="anchor-message"
              >
                {anchorMessage}
              </span>
            )}
          </div>

          {summary.warning && (
            <div className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-amber-600/20">
              {summary.warning}
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold text-gray-700">Timeline</h2>
          {summary.events.length === 0 ? (
            <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-500">
              No provenance events recorded for this VIN yet.
            </p>
          ) : (
            <ol
              data-testid="provenance-timeline"
              className="space-y-3"
            >
              {summary.events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-gray-200 bg-white p-3 shadow-sm"
                  data-testid={`provenance-event-${ev.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${EVENT_TYPE_BADGE[ev.event_type]}`}
                    >
                      {EVENT_TYPE_LABELS[ev.event_type]}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(ev.occurred_at)}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-gray-700">
                    hash {shortHash(ev.this_hash)} · alg {ev.signature_alg}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {summary.anchors.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-semibold text-gray-700">
                Anchors
              </h2>
              <ul className="space-y-2">
                {summary.anchors.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs"
                  >
                    <span className="font-mono">root {shortHash(a.root_hash)}</span>{" "}
                    over {a.range_count} events · {formatDate(a.anchored_at)} ·{" "}
                    {a.anchor_alg}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
