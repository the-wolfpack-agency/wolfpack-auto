/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for src/lib/form-abandonment-tracker.ts
 *
 * Tests the FormAbandonmentTracker class, field-level tracking,
 * hesitation detection, type-and-delete, hover-no-submit,
 * abandonment detection, and insight aggregation.
 *
 * Run with: npx jest src/lib/__tests__/form-abandonment-tracker.test.ts
 */

import {
  FormAbandonmentTracker,
  getFormInsights,
  clearFormInsights,
  type EventEmitter,
  type FormFieldState,
} from "../form-abandonment-tracker";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Collect emitted events for assertion. */
function createMockEmitter(): {
  emit: EventEmitter;
  events: Array<{ eventType: string; action: string; metadata: Record<string, unknown> }>;
} {
  const events: Array<{ eventType: string; action: string; metadata: Record<string, unknown> }> = [];
  const emit: EventEmitter = (eventType, action, metadata) => {
    events.push({ eventType, action, metadata });
  };
  return { emit, events };
}

/** Create a minimal mock form element with fields. */
function createMockForm(fieldNames: string[]): HTMLFormElement {
  const form = document.createElement("form");
  fieldNames.forEach((name) => {
    const input = document.createElement("input");
    input.type = "text";
    input.name = name;
    form.appendChild(input);
  });

  // Add a submit button
  const btn = document.createElement("button");
  btn.type = "submit";
  form.appendChild(btn);

  document.body.appendChild(form);
  return form;
}

function getInput(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.querySelector(`input[name="${name}"]`)!;
}

function getSubmitButton(form: HTMLFormElement): HTMLButtonElement {
  return form.querySelector('button[type="submit"]')!;
}

beforeEach(() => {
  clearFormInsights();
  document.body.innerHTML = "";
});

/* -------------------------------------------------------------------------- */
/* FormAbandonmentTracker — construction and field discovery                   */
/* -------------------------------------------------------------------------- */

describe("FormAbandonmentTracker — construction", () => {
  it("discovers all form fields on attach", () => {
    const { emit } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name", "email", "phone"]);

    tracker.attach(form);

    const states = tracker.getFieldStates();
    expect(states.size).toBe(3);
    expect(states.has("name")).toBe(true);
    expect(states.has("email")).toBe(true);
    expect(states.has("phone")).toBe(true);

    tracker.detach();
  });

  it("initializes with submitted = false", () => {
    const { emit } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name"]);

    tracker.attach(form);
    expect(tracker.isSubmitted).toBe(false);

    tracker.detach();
  });
});

/* -------------------------------------------------------------------------- */
/* Focus / blur tracking                                                       */
/* -------------------------------------------------------------------------- */

describe("FormAbandonmentTracker — focus and blur", () => {
  it("tracks last focused field on focusin", () => {
    const { emit } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name", "email"]);

    tracker.attach(form);

    const nameInput = getInput(form, "name");
    nameInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    // After focus, the field state should have a focus_time set
    const states = tracker.getFieldStates();
    expect(states.get("name")!.focus_time).not.toBeNull();

    tracker.detach();
  });
});

/* -------------------------------------------------------------------------- */
/* Type-and-delete detection                                                   */
/* -------------------------------------------------------------------------- */

describe("FormAbandonmentTracker — type-and-delete", () => {
  it("fires form.field_typed_deleted when user types then clears", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name", "email"]);

    tracker.attach(form);

    const nameInput = getInput(form, "name");

    // Focus
    nameInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    // Type "John"
    nameInput.value = "John";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Delete all
    nameInput.value = "";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Blur
    nameInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    const typeDeleteEvents = events.filter((e) => e.action === "form.field_typed_deleted");
    expect(typeDeleteEvents.length).toBe(1);
    expect(typeDeleteEvents[0].metadata).toEqual({
      form_id: "test-form",
      field_name: "name",
      typed_length: 4,
      deleted: true,
    });

    tracker.detach();
  });

  it("does not fire type-deleted if field still has value", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name"]);

    tracker.attach(form);

    const nameInput = getInput(form, "name");
    nameInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    nameInput.value = "John";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    nameInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    const typeDeleteEvents = events.filter((e) => e.action === "form.field_typed_deleted");
    expect(typeDeleteEvents.length).toBe(0);

    tracker.detach();
  });
});

/* -------------------------------------------------------------------------- */
/* Submit hover tracking                                                       */
/* -------------------------------------------------------------------------- */

describe("FormAbandonmentTracker — hover-no-submit", () => {
  it("fires form.hover_no_submit when mouse enters and leaves submit button", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name"]);

    tracker.attach(form);

    const btn = getSubmitButton(form);

    // Simulate hover start
    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));

    // Advance time by simulating a delay (we test the >200ms threshold by mocking Date.now)
    const originalNow = Date.now;
    Date.now = () => originalNow() + 500; // 500ms hover

    btn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));

    Date.now = originalNow;

    const hoverEvents = events.filter((e) => e.action === "form.hover_no_submit");
    expect(hoverEvents.length).toBe(1);
    expect(hoverEvents[0].metadata.form_id).toBe("test-form");
    expect((hoverEvents[0].metadata.hover_duration_ms as number)).toBeGreaterThanOrEqual(0);

    tracker.detach();
  });
});

/* -------------------------------------------------------------------------- */
/* Form submission — completion rate                                           */
/* -------------------------------------------------------------------------- */

describe("FormAbandonmentTracker — submit and completion rate", () => {
  it("fires form.completion_rate on submit", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name", "email", "phone"]);

    tracker.attach(form);

    // Fill 2 of 3 fields
    const nameInput = getInput(form, "name");
    nameInput.value = "John";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    const emailInput = getInput(form, "email");
    emailInput.value = "john@test.com";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Submit
    form.dispatchEvent(new Event("submit", { bubbles: true }));

    const completionEvents = events.filter((e) => e.action === "form.completion_rate");
    expect(completionEvents.length).toBe(1);
    expect(completionEvents[0].metadata.form_id).toBe("test-form");
    expect(completionEvents[0].metadata.fields_completed).toBe(2);
    expect(completionEvents[0].metadata.rate).toBeCloseTo(0.67, 1);

    expect(tracker.isSubmitted).toBe(true);

    tracker.detach();
  });

  it("does not fire abandonment after submit", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name"]);

    tracker.attach(form);

    // Submit first
    form.dispatchEvent(new Event("submit", { bubbles: true }));

    // Then detach (simulates unmount)
    tracker.detach();

    const abandonEvents = events.filter((e) => e.action === "form.abandoned");
    expect(abandonEvents.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Form abandonment                                                            */
/* -------------------------------------------------------------------------- */

describe("FormAbandonmentTracker — abandonment detection", () => {
  it("fires form.abandoned on detach when not submitted", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name", "email"]);

    tracker.attach(form);

    // Focus name but don't submit
    const nameInput = getInput(form, "name");
    nameInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    nameInput.value = "John";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    tracker.detach();

    const abandonEvents = events.filter((e) => e.action === "form.abandoned");
    expect(abandonEvents.length).toBe(1);
    expect(abandonEvents[0].metadata.form_id).toBe("test-form");
    expect(abandonEvents[0].metadata.last_focused_field).toBe("name");
    expect(abandonEvents[0].metadata.fields_completed).toBe(1);
    expect(abandonEvents[0].metadata.fields_total).toBe(2);
  });

  it("fires form.abandoned on visibility change to hidden", () => {
    const { emit, events } = createMockEmitter();
    const tracker = new FormAbandonmentTracker("test-form", emit);
    const form = createMockForm(["name"]);

    tracker.attach(form);

    // Simulate tab switch
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    const abandonEvents = events.filter((e) => e.action === "form.abandoned");
    expect(abandonEvents.length).toBe(1);

    // Reset
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });

    tracker.detach();
  });
});

/* -------------------------------------------------------------------------- */
/* Insight aggregation                                                         */
/* -------------------------------------------------------------------------- */

describe("getFormInsights", () => {
  it("returns empty array for unknown form", () => {
    expect(getFormInsights("nonexistent")).toEqual([]);
  });

  it("aggregates abandonment insights across multiple tracker instances", () => {
    const { emit: emit1 } = createMockEmitter();
    const { emit: emit2 } = createMockEmitter();

    // First user: abandons on email
    const tracker1 = new FormAbandonmentTracker("contact", emit1);
    const form1 = createMockForm(["name", "email"]);
    tracker1.attach(form1);
    const email1 = getInput(form1, "email");
    email1.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    tracker1.detach(); // abandons at email

    // Second user: also abandons on email
    const tracker2 = new FormAbandonmentTracker("contact", emit2);
    const form2 = createMockForm(["name", "email"]);
    tracker2.attach(form2);
    const email2 = getInput(form2, "email");
    email2.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    tracker2.detach(); // abandons at email

    const insights = getFormInsights("contact");
    const emailInsight = insights.find((i) => i.field_name === "email");
    expect(emailInsight).toBeDefined();
    expect(emailInsight!.abandonment_count).toBe(2);
  });

  it("sorts insights by abandonment count descending", () => {
    const { emit } = createMockEmitter();

    // Abandon on "name" once
    const t1 = new FormAbandonmentTracker("signup", emit);
    const f1 = createMockForm(["name", "email", "phone"]);
    t1.attach(f1);
    getInput(f1, "name").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    t1.detach();

    // Abandon on "phone" twice
    const t2 = new FormAbandonmentTracker("signup", emit);
    const f2 = createMockForm(["name", "email", "phone"]);
    t2.attach(f2);
    getInput(f2, "phone").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    t2.detach();

    const t3 = new FormAbandonmentTracker("signup", emit);
    const f3 = createMockForm(["name", "email", "phone"]);
    t3.attach(f3);
    getInput(f3, "phone").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    t3.detach();

    const insights = getFormInsights("signup");
    expect(insights[0].field_name).toBe("phone");
    expect(insights[0].abandonment_count).toBe(2);
  });
});
