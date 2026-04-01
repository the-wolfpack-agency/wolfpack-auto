/**
 * Form Abandonment Micro-Analytics
 *
 * Tracks exactly where and why users abandon forms:
 *  - Field-level focus/blur/input tracking
 *  - Hesitation detection (>10s on a single field)
 *  - Type-and-delete detection (uncertainty signal)
 *  - Hover-over-submit without clicking
 *  - Field completion rate
 *  - Abandonment trigger (what happened right before leaving)
 *
 * Usage:
 *   const { ref } = useFormAbandonment("contact-form");
 *   <form ref={ref}> ... </form>
 *
 * Privacy-first: no PII captured, only field names and timing.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FieldHesitationEvent {
  form_id: string;
  field_name: string;
  hesitation_ms: number;
}

export interface FieldTypedDeletedEvent {
  form_id: string;
  field_name: string;
  typed_length: number;
  deleted: boolean;
}

export interface HoverNoSubmitEvent {
  form_id: string;
  hover_duration_ms: number;
}

export interface FormAbandonedEvent {
  form_id: string;
  last_focused_field: string | null;
  fields_completed: number;
  fields_total: number;
  time_on_form_ms: number;
}

export interface FormCompletionRateEvent {
  form_id: string;
  rate: number;
  fields_completed: number;
  time_to_complete_ms: number;
}

export interface FormInsight {
  field_name: string;
  abandonment_count: number;
  hesitation_count: number;
  avg_hesitation_ms: number;
  type_delete_count: number;
}

export interface FormFieldState {
  name: string;
  focus_time: number | null;
  had_value: boolean;
  max_typed_length: number;
  current_length: number;
  hesitation_fired: boolean;
}

/* ------------------------------------------------------------------ */
/*  In-memory insight aggregator (per-session, client-side)            */
/* ------------------------------------------------------------------ */

const formInsightsStore = new Map<
  string,
  Map<string, { abandonments: number; hesitations: number; totalHesitationMs: number; typeDeletes: number }>
>();

function recordFieldInsight(
  formId: string,
  fieldName: string,
  type: "abandonment" | "hesitation" | "type_delete",
  hesitationMs?: number,
): void {
  if (!formInsightsStore.has(formId)) {
    formInsightsStore.set(formId, new Map());
  }
  const fields = formInsightsStore.get(formId)!;
  if (!fields.has(fieldName)) {
    fields.set(fieldName, { abandonments: 0, hesitations: 0, totalHesitationMs: 0, typeDeletes: 0 });
  }
  const entry = fields.get(fieldName)!;
  if (type === "abandonment") entry.abandonments++;
  if (type === "hesitation") {
    entry.hesitations++;
    entry.totalHesitationMs += hesitationMs ?? 0;
  }
  if (type === "type_delete") entry.typeDeletes++;
}

/**
 * Get aggregated insights for a form showing which fields cause the most
 * friction. Useful for the analytics brain to surface recommendations.
 */
export function getFormInsights(formId: string): FormInsight[] {
  const fields = formInsightsStore.get(formId);
  if (!fields) return [];

  const insights: FormInsight[] = [];
  for (const [fieldName, data] of fields.entries()) {
    insights.push({
      field_name: fieldName,
      abandonment_count: data.abandonments,
      hesitation_count: data.hesitations,
      avg_hesitation_ms: data.hesitations > 0 ? Math.round(data.totalHesitationMs / data.hesitations) : 0,
      type_delete_count: data.typeDeletes,
    });
  }

  // Sort by abandonment count descending (worst fields first)
  return insights.sort((a, b) => b.abandonment_count - a.abandonment_count);
}

/** Clear stored insights (useful for testing). */
export function clearFormInsights(): void {
  formInsightsStore.clear();
}

/* ------------------------------------------------------------------ */
/*  Core tracker class (framework-agnostic)                            */
/* ------------------------------------------------------------------ */

export type EventEmitter = (eventType: string, action: string, metadata: Record<string, unknown>) => void;

const HESITATION_THRESHOLD_MS = 10_000;

export class FormAbandonmentTracker {
  private formId: string;
  private emit: EventEmitter;
  private formElement: HTMLFormElement | null = null;
  private mountTime: number = 0;
  private submitted = false;
  private lastFocusedField: string | null = null;
  private fieldStates = new Map<string, FormFieldState>();
  private submitHoverStart: number | null = null;
  private hesitationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Bound handlers for cleanup
  private _onFocus: (e: FocusEvent) => void;
  private _onBlur: (e: FocusEvent) => void;
  private _onInput: (e: Event) => void;
  private _onSubmit: (e: Event) => void;
  private _onMouseEnter: (e: MouseEvent) => void;
  private _onMouseLeave: (e: MouseEvent) => void;
  private _onBeforeUnload: () => void;
  private _onVisibilityChange: () => void;

  constructor(formId: string, emit: EventEmitter) {
    this.formId = formId;
    this.emit = emit;

    // Bind all handlers so they can be removed later
    this._onFocus = this.handleFocus.bind(this);
    this._onBlur = this.handleBlur.bind(this);
    this._onInput = this.handleInput.bind(this);
    this._onSubmit = this.handleSubmit.bind(this);
    this._onMouseEnter = this.handleSubmitMouseEnter.bind(this);
    this._onMouseLeave = this.handleSubmitMouseLeave.bind(this);
    this._onBeforeUnload = this.handleBeforeUnload.bind(this);
    this._onVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  attach(form: HTMLFormElement): void {
    this.formElement = form;
    this.mountTime = Date.now();
    this.submitted = false;
    this.fieldStates.clear();

    // Discover all form fields
    const fields = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    );
    fields.forEach((field) => {
      const name = field.name || field.id || field.getAttribute("data-field") || "unknown";
      this.fieldStates.set(name, {
        name,
        focus_time: null,
        had_value: false,
        max_typed_length: 0,
        current_length: 0,
        hesitation_fired: false,
      });
    });

    // Add listeners
    form.addEventListener("focusin", this._onFocus as EventListener);
    form.addEventListener("focusout", this._onBlur as EventListener);
    form.addEventListener("input", this._onInput);
    form.addEventListener("submit", this._onSubmit);

    // Submit button hover tracking
    const submitBtn = form.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], [data-submit]',
    );
    if (submitBtn) {
      submitBtn.addEventListener("mouseenter", this._onMouseEnter as EventListener);
      submitBtn.addEventListener("mouseleave", this._onMouseLeave as EventListener);
    }

    // Page leave detection
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this._onBeforeUnload);
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }
  }

  detach(): void {
    if (!this.submitted) {
      this.fireAbandonmentEvent();
    }

    if (this.formElement) {
      this.formElement.removeEventListener("focusin", this._onFocus as EventListener);
      this.formElement.removeEventListener("focusout", this._onBlur as EventListener);
      this.formElement.removeEventListener("input", this._onInput);
      this.formElement.removeEventListener("submit", this._onSubmit);

      const submitBtn = this.formElement.querySelector<HTMLElement>(
        'button[type="submit"], input[type="submit"], [data-submit]',
      );
      if (submitBtn) {
        submitBtn.removeEventListener("mouseenter", this._onMouseEnter as EventListener);
        submitBtn.removeEventListener("mouseleave", this._onMouseLeave as EventListener);
      }
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this._onBeforeUnload);
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
    }

    // Clear hesitation timers
    for (const timer of this.hesitationTimers.values()) {
      clearTimeout(timer);
    }
    this.hesitationTimers.clear();
  }

  /* ---- Event handlers ------------------------------------------------ */

  private getFieldName(e: Event): string | null {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return null;
    }
    return target.name || target.id || target.getAttribute("data-field") || "unknown";
  }

  private handleFocus(e: FocusEvent): void {
    const name = this.getFieldName(e);
    if (!name) return;

    this.lastFocusedField = name;

    const state = this.fieldStates.get(name);
    if (state) {
      state.focus_time = Date.now();
    }

    // Start hesitation timer
    if (this.hesitationTimers.has(name)) {
      clearTimeout(this.hesitationTimers.get(name)!);
    }
    this.hesitationTimers.set(
      name,
      setTimeout(() => {
        const st = this.fieldStates.get(name);
        if (st && !st.hesitation_fired) {
          st.hesitation_fired = true;
          const hesitationMs = Date.now() - (st.focus_time ?? Date.now());
          this.emit("form_tracking", "form.field_hesitation", {
            form_id: this.formId,
            field_name: name,
            hesitation_ms: hesitationMs,
          });
          recordFieldInsight(this.formId, name, "hesitation", hesitationMs);
        }
      }, HESITATION_THRESHOLD_MS),
    );
  }

  private handleBlur(e: FocusEvent): void {
    const name = this.getFieldName(e);
    if (!name) return;

    // Clear hesitation timer on blur
    if (this.hesitationTimers.has(name)) {
      clearTimeout(this.hesitationTimers.get(name)!);
      this.hesitationTimers.delete(name);
    }

    // Check for type-and-delete
    const state = this.fieldStates.get(name);
    if (state && state.max_typed_length > 0 && state.current_length === 0) {
      this.emit("form_tracking", "form.field_typed_deleted", {
        form_id: this.formId,
        field_name: name,
        typed_length: state.max_typed_length,
        deleted: true,
      });
      recordFieldInsight(this.formId, name, "type_delete");
    }
  }

  private handleInput(e: Event): void {
    const name = this.getFieldName(e);
    if (!name) return;

    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const len = target.value?.length ?? 0;

    const state = this.fieldStates.get(name);
    if (state) {
      if (len > 0) state.had_value = true;
      state.max_typed_length = Math.max(state.max_typed_length, len);
      state.current_length = len;
    }
  }

  private handleSubmit(_e: Event): void {
    this.submitted = true;

    const { completed, total } = this.getCompletionStats();
    const timeOnForm = Date.now() - this.mountTime;

    this.emit("form_tracking", "form.completion_rate", {
      form_id: this.formId,
      rate: total > 0 ? Math.round((completed / total) * 100) / 100 : 1,
      fields_completed: completed,
      time_to_complete_ms: timeOnForm,
    });
  }

  private handleSubmitMouseEnter(_e: MouseEvent): void {
    this.submitHoverStart = Date.now();
  }

  private handleSubmitMouseLeave(_e: MouseEvent): void {
    if (this.submitHoverStart && !this.submitted) {
      const hoverDuration = Date.now() - this.submitHoverStart;
      if (hoverDuration > 200) {
        // Only track meaningful hovers (>200ms)
        this.emit("form_tracking", "form.hover_no_submit", {
          form_id: this.formId,
          hover_duration_ms: hoverDuration,
        });
      }
    }
    this.submitHoverStart = null;
  }

  private handleBeforeUnload(): void {
    if (!this.submitted) {
      this.fireAbandonmentEvent();
    }
  }

  private handleVisibilityChange(): void {
    if (document.visibilityState === "hidden" && !this.submitted) {
      this.fireAbandonmentEvent();
    }
  }

  /* ---- Helpers -------------------------------------------------------- */

  private getCompletionStats(): { completed: number; total: number } {
    let completed = 0;
    let total = 0;
    for (const state of this.fieldStates.values()) {
      total++;
      if (state.had_value || state.current_length > 0) {
        completed++;
      }
    }
    return { completed, total };
  }

  private fireAbandonmentEvent(): void {
    const { completed, total } = this.getCompletionStats();
    const timeOnForm = Date.now() - this.mountTime;

    this.emit("form_tracking", "form.abandoned", {
      form_id: this.formId,
      last_focused_field: this.lastFocusedField,
      fields_completed: completed,
      fields_total: total,
      time_on_form_ms: timeOnForm,
    });

    // Record abandonment for the last focused field
    if (this.lastFocusedField) {
      recordFieldInsight(this.formId, this.lastFocusedField, "abandonment");
    }
  }

  /** Expose submitted state for testing. */
  get isSubmitted(): boolean {
    return this.submitted;
  }

  /** Expose field states for testing. */
  getFieldStates(): Map<string, FormFieldState> {
    return new Map(this.fieldStates);
  }
}

/* ------------------------------------------------------------------ */
/*  React hook                                                         */
/* ------------------------------------------------------------------ */

/**
 * React hook to attach form abandonment tracking to a form element.
 *
 * Usage:
 *   function ContactForm() {
 *     const formRef = useFormAbandonment("contact-form");
 *     return <form ref={formRef}>...</form>;
 *   }
 */
export function useFormAbandonment(formId: string): (node: HTMLFormElement | null) => void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const React = require("react") as typeof import("react");
  const { useRef, useCallback, useEffect } = React;

  const trackerRef = useRef<FormAbandonmentTracker | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Create emit function that tries to use the EventCollector context
  const emit: EventEmitter = useCallback((eventType: string, action: string, metadata: Record<string, unknown>) => {
    // Fire a custom event that EventCollector can pick up
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("wolfpack:analytics", {
          detail: { event_type: eventType, action, metadata },
        }),
      );
    }
  }, []);

  const refCallback = useCallback(
    (node: HTMLFormElement | null) => {
      // Cleanup previous
      if (trackerRef.current) {
        trackerRef.current.detach();
        trackerRef.current = null;
      }

      if (node) {
        formRef.current = node;
        const tracker = new FormAbandonmentTracker(formId, emit);
        tracker.attach(node);
        trackerRef.current = tracker;
      }
    },
    [formId, emit],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (trackerRef.current) {
        trackerRef.current.detach();
        trackerRef.current = null;
      }
    };
  }, []);

  return refCallback;
}
