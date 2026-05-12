"use client";

/**
 * <OntologyTooltip> — progressive-disclosure tooltip backed by literacy_tooltips.
 *
 * Uses the native `<details>` / `<summary>` pattern for the basic open-close
 * so the disclosure works even before JavaScript hydrates (and is keyboard +
 * screen-reader friendly out of the box).
 *
 * Mobile-first per .ai/mobile-first-principle.md.
 *
 * Fetch path: pulls the tooltip for (conceptSlug, role) the first time the
 * component mounts. The role is supplied by the parent — for authenticated
 * dealer surfaces this should come from the server-side session and never
 * from user input.
 *
 * Analytics events (canonical names from src/lib/analytics-hooks.ts):
 *   - tooltip.opened
 *   - tooltip.dismissed
 */

import { useCallback, useEffect, useState } from "react";

export interface TooltipView {
  id: string;
  concept_id: string;
  role: string;
  short_text: string;
  expanded_text: string | null;
}

export interface OntologyTooltipProps {
  /** The ontology concept slug to look up (FK target on literacy_tooltips). */
  conceptSlug: string;
  /** Audience role; should be resolved from the session, not from user input. */
  role: string;
  /** Optional preloaded tooltip (SSR / test render bypass). */
  initial?: TooltipView | null;
  /** Optional fallback short text shown while the fetch is in flight. */
  placeholder?: string;
  onEvent?: (
    event: "tooltip.opened" | "tooltip.dismissed",
    meta: Record<string, string | number | boolean>,
  ) => void;
}

export default function OntologyTooltip({
  conceptSlug,
  role,
  initial = null,
  placeholder = "Loading…",
  onEvent,
}: OntologyTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipView | null>(initial);
  const [error, setError] = useState<string | null>(null);

  // The list endpoint already supports concept_id + role filters via the
  // admin path; for the public surface we use a small dedicated lookup via
  // the public walkthrough route's body shape pattern (fetch by slug+role).
  // Until a dedicated public tooltips route lands, we render whatever the
  // parent injects via `initial`. Tests cover both branches.
  useEffect(() => {
    if (initial || tooltip) return;
    let cancelled = false;
    (async () => {
      try {
        const url =
          `/api/literacy/tooltip/${encodeURIComponent(conceptSlug)}` +
          `?role=${encodeURIComponent(role)}`;
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) {
          if (!cancelled) {
            // Soft-fail: hide the tooltip rather than break the host page.
            setError(`Tooltip unavailable (${res.status})`);
          }
          return;
        }
        const data = (await res.json()) as { tooltip?: TooltipView };
        if (cancelled) return;
        if (data.tooltip) setTooltip(data.tooltip);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conceptSlug, role, initial, tooltip]);

  const handleToggle = useCallback(
    (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      try {
        const wasOpened = (e.currentTarget as HTMLDetailsElement).open;
        const event = wasOpened ? "tooltip.opened" : "tooltip.dismissed";
        onEvent?.(event, { concept_slug: conceptSlug, role });
      } catch {
        /* analytics must never throw */
      }
    },
    [conceptSlug, role, onEvent],
  );

  if (error) {
    return (
      <span
        data-testid="ontology-tooltip-error"
        role="status"
        className="hidden"
      >
        {error}
      </span>
    );
  }

  const shortText = tooltip?.short_text ?? placeholder;
  const expandedText = tooltip?.expanded_text;

  return (
    <details
      data-testid="ontology-tooltip"
      data-concept-slug={conceptSlug}
      data-role={role}
      className="inline-block group"
      onToggle={handleToggle}
    >
      <summary
        data-testid="ontology-tooltip-summary"
        className="cursor-help text-slate-700 underline decoration-dotted underline-offset-2 list-none"
      >
        {shortText}
      </summary>
      {expandedText ? (
        <span
          data-testid="ontology-tooltip-expanded"
          className="mt-2 block text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded p-2"
        >
          {expandedText}
        </span>
      ) : null}
    </details>
  );
}
