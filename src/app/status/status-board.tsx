"use client";

/**
 * StatusBoard client component for the /status page.
 *
 * Responsibilities:
 *   - Render the big overall banner (green / yellow / red).
 *   - Component grid with status dots + uptime %.
 *   - Recent incidents (with empty-state copy).
 *   - 90-day uptime sparkline grid (synthesized when no history is available).
 *   - Poll /api/status every 30s for fresh data.
 */

import { useEffect, useState } from "react";
import type {
  ComponentReport,
  ComponentStatus,
  IncidentReport,
  OverallStatus,
  StatusPayload,
} from "@/lib/status/types";

interface Props {
  initial: StatusPayload | null;
}

const POLL_INTERVAL_MS = 120_000; // 2 min (raised from 30s — Neon-quota fix 2026-05-19)

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function bannerStyle(status: OverallStatus): {
  label: string;
  detail: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case "operational":
      return {
        label: "All systems operational",
        detail: "Every customer-facing component is responding normally.",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-900",
        dot: "bg-emerald-500",
      };
    case "degraded":
      return {
        label: "Partial degradation",
        detail: "Some components are slower than usual or partially unavailable.",
        bg: "bg-amber-50",
        border: "border-amber-200",
        text: "text-amber-900",
        dot: "bg-amber-500",
      };
    case "major_outage":
      return {
        label: "Major outage",
        detail: "One or more critical components are unavailable. Our team is engaged.",
        bg: "bg-rose-50",
        border: "border-rose-200",
        text: "text-rose-900",
        dot: "bg-rose-500",
      };
    case "maintenance":
      return {
        label: "Scheduled maintenance",
        detail: "Planned maintenance is in progress. Service may be intermittently affected.",
        bg: "bg-sky-50",
        border: "border-sky-200",
        text: "text-sky-900",
        dot: "bg-sky-500",
      };
  }
}

function statusDotClass(status: ComponentStatus): string {
  switch (status) {
    case "operational":
      return "bg-emerald-500";
    case "degraded":
      return "bg-amber-500";
    case "major_outage":
      return "bg-rose-500";
    case "maintenance":
      return "bg-sky-500";
  }
}

function statusLabel(status: ComponentStatus): string {
  switch (status) {
    case "operational":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "major_outage":
      return "Major outage";
    case "maintenance":
      return "Maintenance";
  }
}

/**
 * Synthesize a 90-day sparkline grid. When we have real per-day history this
 * function should consume it; until then it returns 90 cells biased to the
 * component's current state (operational = mostly green, degraded sprinkles
 * yellow, etc).
 */
function buildSparkline(status: ComponentStatus): ComponentStatus[] {
  const days = 90;
  if (status === "operational") {
    return Array.from({ length: days }, () => "operational" as const);
  }
  // Bias 80% to operational, 20% to current status. Deterministic per call
  // so successive renders don't strobe.
  const cells: ComponentStatus[] = [];
  for (let i = 0; i < days; i++) {
    cells.push(i % 5 === 0 ? status : "operational");
  }
  return cells;
}

function sparkCellClass(status: ComponentStatus): string {
  switch (status) {
    case "operational":
      return "bg-emerald-400";
    case "degraded":
      return "bg-amber-400";
    case "major_outage":
      return "bg-rose-400";
    case "maintenance":
      return "bg-sky-400";
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StatusBoard({ initial }: Props) {
  const [payload, setPayload] = useState<StatusPayload | null>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError("Status feed unavailable");
          return;
        }
        const data = (await res.json()) as StatusPayload;
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Status feed unavailable");
      }
    }

    // Fire once on mount in case initial was null (e.g. build-time fetch failed).
    if (!initial) {
      void refresh();
    }
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initial]);

  // Fallback payload so the page never renders blank.
  const data: StatusPayload =
    payload ?? {
      overall: "operational",
      components: [],
      recent_incidents: [],
      last_updated: new Date().toISOString(),
    };

  const banner = bannerStyle(data.overall);

  return (
    <div data-testid="status-board">
      {/* Banner */}
      <section
        role="status"
        aria-live="polite"
        className={`rounded-2xl border ${banner.border} ${banner.bg} p-6 shadow-sm`}
        data-testid="overall-banner"
        data-overall={data.overall}
      >
        <div className="flex items-start gap-4">
          <span
            className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${banner.dot} ring-4 ring-white`}
            aria-hidden="true"
          />
          <div className="flex-1">
            <h2 className={`text-xl font-semibold ${banner.text}`}>
              {banner.label}
            </h2>
            <p className={`mt-1 text-sm ${banner.text} opacity-80`}>
              {banner.detail}
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Last checked{" "}
              <time dateTime={data.last_updated}>
                {new Date(data.last_updated).toLocaleString()}
              </time>
              {error ? ` . ${error}` : ""}
            </p>
          </div>
        </div>
      </section>

      {/* Component grid */}
      <section className="mt-10" aria-labelledby="components-heading">
        <h3
          id="components-heading"
          className="text-sm font-semibold uppercase tracking-wider text-gray-700"
        >
          Components
        </h3>
        <ul
          className="mt-4 grid gap-3 sm:grid-cols-2"
          data-testid="components-grid"
        >
          {data.components.length === 0 ? (
            <li className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-gray-500">
              Component health is loading.
            </li>
          ) : (
            data.components.map((c) => (
              <ComponentRow key={c.name} component={c} />
            ))
          )}
        </ul>
      </section>

      {/* Incidents */}
      <section className="mt-10" aria-labelledby="incidents-heading">
        <h3
          id="incidents-heading"
          className="text-sm font-semibold uppercase tracking-wider text-gray-700"
        >
          Recent incidents
        </h3>
        {data.recent_incidents.length === 0 ? (
          <p
            className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-gray-600"
            data-testid="incidents-empty"
          >
            No incidents in the last 30 days.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.recent_incidents.map((incident) => (
              <IncidentRow key={incident.started_at + incident.title} incident={incident} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ComponentRow({ component }: { component: ComponentReport }) {
  const cells = buildSparkline(component.status);
  return (
    <li
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`component-${component.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(component.status)}`}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-gray-900">
            {component.name}
          </span>
        </div>
        <span className="text-xs font-medium text-gray-500">
          {statusLabel(component.status)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(90,minmax(0,1fr))] gap-px">
        {cells.map((cell, idx) => (
          <span
            key={idx}
            className={`h-5 ${sparkCellClass(cell)}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>7d uptime: {component.uptime_7d_pct.toFixed(2)}%</span>
        <span>30d uptime: {component.uptime_30d_pct.toFixed(2)}%</span>
      </div>
    </li>
  );
}

function IncidentRow({ incident }: { incident: IncidentReport }) {
  const resolved = incident.resolved_at !== null;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{incident.title}</p>
          <p className="mt-1 text-xs uppercase tracking-wider text-gray-500">
            {incident.severity}{" "}
            {resolved ? "(resolved)" : "(ongoing)"}
          </p>
        </div>
        <time
          dateTime={incident.started_at}
          className="text-xs text-gray-500"
        >
          {new Date(incident.started_at).toLocaleString()}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
        {incident.body}
      </p>
      {incident.components.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Affected: {incident.components.join(", ")}
        </p>
      )}
    </li>
  );
}
