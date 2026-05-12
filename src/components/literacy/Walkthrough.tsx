"use client";

/**
 * <Walkthrough> — step-by-step overlay for an in-platform literacy walk.
 *
 * Mobile-first per .ai/mobile-first-principle.md. No new UI dependency:
 * the popover is a pure-React positioned card with Tailwind utilities.
 *
 * Fetch path: GET /api/literacy/walkthrough/[concept_slug] (server resolves
 * role from session; the component never trusts a client-provided role).
 *
 * Analytics: emits walkthrough.viewed (server-side on fetch),
 * walkthrough.step_completed (per step advance), walkthrough.dismissed,
 * walkthrough.completed (final step + close). All client-side events use
 * the canonical event names from src/lib/analytics-hooks.ts.
 */

import { useCallback, useEffect, useState } from "react";

export interface WalkthroughStepView {
  selector: string;
  concept_id?: string | null;
  translation_id?: string | null;
  template: string;
  position?: "top" | "bottom" | "left" | "right";
}

export interface WalkthroughView {
  id: string;
  slug: string;
  name: string;
  role: string;
  surface: string | null;
  trigger_condition: string | null;
  steps: WalkthroughStepView[];
}

export interface WalkthroughProps {
  /** Concept slug — keys the GET /api/literacy/walkthrough/[concept_slug] fetch. */
  walkthroughSlug: string;
  /** Optional preloaded walkthrough (SSR / story render bypass for tests). */
  initial?: WalkthroughView | null;
  /** Whether to auto-open. The renderer also honors trigger_condition once loaded. */
  autoOpen?: boolean;
  onComplete?: (slug: string) => void;
  onDismiss?: (slug: string) => void;
  /** Override the analytics emitter (tests use this to assert events). */
  onEvent?: (
    event:
      | "walkthrough.viewed"
      | "walkthrough.step_completed"
      | "walkthrough.dismissed"
      | "walkthrough.completed",
    meta: Record<string, string | number | boolean>,
  ) => void;
}

const POSITION_CLASSES: Record<NonNullable<WalkthroughStepView["position"]>, string> = {
  top: "bottom-full mb-2",
  bottom: "top-full mt-2",
  left: "right-full mr-2",
  right: "left-full ml-2",
};

export default function Walkthrough({
  walkthroughSlug,
  initial = null,
  autoOpen = true,
  onComplete,
  onDismiss,
  onEvent,
}: WalkthroughProps) {
  const [walkthrough, setWalkthrough] = useState<WalkthroughView | null>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [open, setOpen] = useState<boolean>(autoOpen && Boolean(initial));
  const [error, setError] = useState<string | null>(null);

  const emit = useCallback(
    (
      event:
        | "walkthrough.viewed"
        | "walkthrough.step_completed"
        | "walkthrough.dismissed"
        | "walkthrough.completed",
      meta: Record<string, string | number | boolean> = {},
    ) => {
      try {
        onEvent?.(event, { slug: walkthroughSlug, ...meta });
      } catch {
        /* analytics must never throw */
      }
    },
    [onEvent, walkthroughSlug],
  );

  // Fetch the walkthrough (skip when an initial payload was passed in).
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/literacy/walkthrough/${encodeURIComponent(walkthroughSlug)}`,
          { method: "GET" },
        );
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load walkthrough (${res.status})`);
          return;
        }
        const data = (await res.json()) as { walkthrough?: WalkthroughView };
        if (cancelled) return;
        if (!data.walkthrough) {
          setError("Walkthrough not found");
          return;
        }
        setWalkthrough(data.walkthrough);
        setOpen(
          autoOpen ||
            data.walkthrough.trigger_condition === "first_visit" ||
            data.walkthrough.trigger_condition === "first_login",
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walkthroughSlug, initial, autoOpen]);

  const handleNext = useCallback(() => {
    if (!walkthrough) return;
    const nextIndex = stepIndex + 1;
    emit("walkthrough.step_completed", {
      step_index: stepIndex,
      total_steps: walkthrough.steps.length,
    });
    if (nextIndex >= walkthrough.steps.length) {
      emit("walkthrough.completed", { total_steps: walkthrough.steps.length });
      setOpen(false);
      onComplete?.(walkthroughSlug);
      return;
    }
    setStepIndex(nextIndex);
  }, [walkthrough, stepIndex, emit, onComplete, walkthroughSlug]);

  const handlePrev = useCallback(() => {
    setStepIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const handleDismiss = useCallback(() => {
    emit("walkthrough.dismissed", { step_index: stepIndex });
    setOpen(false);
    onDismiss?.(walkthroughSlug);
  }, [emit, onDismiss, stepIndex, walkthroughSlug]);

  if (error) {
    return (
      <div
        data-testid="walkthrough-error"
        role="status"
        className="hidden"
      >
        {error}
      </div>
    );
  }

  if (!walkthrough || !open) {
    return null;
  }

  const step = walkthrough.steps[stepIndex];
  if (!step) return null;
  const positionClass = step.position
    ? POSITION_CLASSES[step.position]
    : POSITION_CLASSES.bottom;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === walkthrough.steps.length - 1;

  return (
    <div
      data-testid="walkthrough-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4"
    >
      <div
        data-testid="walkthrough-card"
        data-walkthrough-position={step.position ?? "bottom"}
        className={`relative max-w-md w-full rounded-lg bg-white shadow-xl border border-slate-200 p-5 ${positionClass}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p
              id="walkthrough-title"
              data-testid="walkthrough-name"
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              {walkthrough.name}
            </p>
            <p
              data-testid="walkthrough-step-counter"
              className="mt-0.5 text-xs text-slate-400"
            >
              Step {stepIndex + 1} of {walkthrough.steps.length}
            </p>
          </div>
          <button
            type="button"
            data-testid="walkthrough-dismiss"
            aria-label="Dismiss walkthrough"
            onClick={handleDismiss}
            className="text-slate-500 hover:text-slate-700 px-2 py-1 text-sm"
          >
            Skip
          </button>
        </div>

        <p
          data-testid="walkthrough-step-body"
          className="mt-3 text-sm leading-relaxed text-slate-800"
        >
          {step.template}
        </p>

        <p
          data-testid="walkthrough-step-selector"
          className="mt-2 text-xs font-mono text-slate-400"
        >
          {step.selector}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="walkthrough-prev"
            disabled={isFirst}
            onClick={handlePrev}
            className="text-sm text-slate-600 hover:text-slate-900 disabled:text-slate-300 px-3 py-1.5"
          >
            Back
          </button>
          <button
            type="button"
            data-testid="walkthrough-next"
            onClick={handleNext}
            className="text-sm font-medium rounded bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-700"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
