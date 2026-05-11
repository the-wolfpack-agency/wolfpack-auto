"use client";

/**
 * StatusBadge — small pill that fetches /api/status on mount and shows
 * "All systems operational" / "Partial degradation" / "Major outage".
 *
 * Drop into the homepage hero, footer, or admin shell. Links to /status
 * for full detail.
 */

import { useEffect, useState } from "react";
import type {
  OverallStatus,
  StatusPayload,
} from "@/lib/status/types";

interface BadgeStyle {
  label: string;
  dotClass: string;
  ringClass: string;
}

function styleFor(status: OverallStatus | "loading"): BadgeStyle {
  switch (status) {
    case "operational":
      return {
        label: "All systems operational",
        dotClass: "bg-emerald-500",
        ringClass: "ring-emerald-200",
      };
    case "degraded":
      return {
        label: "Partial degradation",
        dotClass: "bg-amber-500",
        ringClass: "ring-amber-200",
      };
    case "major_outage":
      return {
        label: "Major outage",
        dotClass: "bg-rose-500",
        ringClass: "ring-rose-200",
      };
    case "maintenance":
      return {
        label: "Scheduled maintenance",
        dotClass: "bg-sky-500",
        ringClass: "ring-sky-200",
      };
    case "loading":
      return {
        label: "Checking status",
        dotClass: "bg-slate-300",
        ringClass: "ring-slate-200",
      };
  }
}

export default function StatusBadge() {
  const [status, setStatus] = useState<OverallStatus | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<StatusPayload>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setStatus(data.overall);
      })
      .catch(() => {
        // Stay in "loading" rather than show a false outage signal.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const s = styleFor(status);

  return (
    <a
      href="/status"
      data-testid="status-badge"
      data-status={status}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-slate-300 hover:text-gray-900"
    >
      <span
        className={`h-2 w-2 rounded-full ${s.dotClass} ring-2 ${s.ringClass}`}
        aria-hidden="true"
      />
      <span>{s.label}</span>
    </a>
  );
}
