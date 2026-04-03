/**
 * Session Replay — Structured event-log recording (rrweb-style).
 *
 * Captures DOM mutations, scroll positions, clicks, and input changes as
 * timestamped events. NO video recording — lightweight structured data that
 * can be replayed in the admin UI.
 *
 * Privacy: all input values are masked, PII is stripped, and recording
 * respects cookie consent status.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ReplayEventType =
  | "dom_mutation"
  | "scroll"
  | "click"
  | "input_change"
  | "page_navigation"
  | "resize"
  | "error"
  | "visibility_change";

export interface ReplayEvent {
  /** Monotonic sequence number within the session */
  seq: number;
  /** Unix-ms timestamp */
  ts: number;
  /** Event category */
  type: ReplayEventType;
  /** Serialised payload — shape varies by type */
  data: Record<string, unknown>;
}

export interface ReplaySession {
  session_id: string;
  dealer_id: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  pages_visited: string[];
  event_count: number;
  conversion: boolean;
  user_agent: string;
  viewport: { width: number; height: number };
}

export interface ReplayTimeline {
  session_id: string;
  duration_ms: number;
  key_moments: TimelineMoment[];
}

export interface TimelineMoment {
  ts: number;
  offset_ms: number;
  type: ReplayEventType;
  label: string;
}

export interface CompressedReplayData {
  session_id: string;
  compressed: string;
  original_size: number;
  compressed_size: number;
}

/* -------------------------------------------------------------------------- */
/*  PII masking                                                                */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_RE = /\d{3}-\d{2}-\d{4}/g;
const CREDIT_CARD_RE = /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g;

/**
 * Strip PII patterns from a string value.
 * Returns masked version — never exposes raw PII in replay data.
 */
export function maskPII(value: string): string {
  return value
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(SSN_RE, "[SSN]")
    .replace(CREDIT_CARD_RE, "[CARD]")
    .replace(PHONE_RE, "[PHONE]");
}

/**
 * Mask all input values in an event's data payload.
 * Replaces any string field that looks like user input.
 */
export function maskEventData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (key === "value" || key === "input_value" || key === "text") {
      // Always mask input values — never store raw user input
      masked[key] = typeof val === "string" ? "***" : val;
    } else if (typeof val === "string") {
      masked[key] = maskPII(val);
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      masked[key] = maskEventData(val as Record<string, unknown>);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

/* -------------------------------------------------------------------------- */
/*  SessionRecorder                                                            */
/* -------------------------------------------------------------------------- */

export class SessionRecorder {
  private events: ReplayEvent[] = [];
  private seq = 0;
  private sessionId: string | null = null;
  private startTime: number | null = null;
  private recording = false;
  private observer: MutationObserver | null = null;
  private pages: Set<string> = new Set();

  /** Whether the recorder is currently capturing events. */
  get isRecording(): boolean {
    return this.recording;
  }

  /** Current session ID, or null if not recording. */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Begin capturing replay events for the given session.
   * No-op if already recording.
   */
  startRecording(sessionId: string): void {
    if (this.recording) return;

    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.recording = true;
    this.events = [];
    this.seq = 0;
    this.pages = new Set();

    // Record initial page
    if (typeof window !== "undefined") {
      this.pages.add(window.location.pathname);
    }

    this.attachListeners();
  }

  /**
   * Stop recording and return all captured events.
   */
  stopRecording(): ReplayEvent[] {
    if (!this.recording) return [];

    this.recording = false;
    this.detachListeners();

    const captured = [...this.events];
    this.events = [];
    this.sessionId = null;
    this.startTime = null;

    return captured;
  }

  /**
   * Push a single event onto the recording stream.
   * Automatically masks PII and assigns sequence number.
   */
  pushEvent(type: ReplayEventType, data: Record<string, unknown>): void {
    if (!this.recording) return;

    const event: ReplayEvent = {
      seq: this.seq++,
      ts: Date.now(),
      type,
      data: maskEventData(data),
    };

    this.events.push(event);

    // Track page navigations
    if (type === "page_navigation" && typeof data.url === "string") {
      try {
        const url = new URL(data.url, "https://localhost");
        this.pages.add(url.pathname);
      } catch {
        // ignore invalid URLs
      }
    }
  }

  /** Get list of pages visited during this session. */
  getPages(): string[] {
    return [...this.pages];
  }

  /** Get total elapsed time in ms since recording started. */
  getElapsedMs(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  /* -------------------------------- Private -------------------------------- */

  private attachListeners(): void {
    if (typeof window === "undefined") return;

    // DOM mutations via MutationObserver
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        this.pushEvent("dom_mutation", {
          mutation_type: mutation.type,
          target_tag:
            mutation.target instanceof Element
              ? mutation.target.tagName
              : "TEXT",
          added_nodes: mutation.addedNodes.length,
          removed_nodes: mutation.removedNodes.length,
        });
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // Click events
    document.addEventListener("click", this.handleClick);
    // Scroll events (throttled via capture)
    document.addEventListener("scroll", this.handleScroll, { passive: true });
    // Input changes
    document.addEventListener("input", this.handleInput);
    // Resize
    window.addEventListener("resize", this.handleResize);
    // Navigation (popstate)
    window.addEventListener("popstate", this.handleNavigation);
    // Errors
    window.addEventListener("error", this.handleError);
    // Visibility
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private detachListeners(): void {
    if (typeof window === "undefined") return;

    this.observer?.disconnect();
    this.observer = null;

    document.removeEventListener("click", this.handleClick);
    document.removeEventListener("scroll", this.handleScroll);
    document.removeEventListener("input", this.handleInput);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("popstate", this.handleNavigation);
    window.removeEventListener("error", this.handleError);
    document.removeEventListener("visibilitychange", this.handleVisibility);
  }

  private handleClick = (e: MouseEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    this.pushEvent("click", {
      x: e.clientX,
      y: e.clientY,
      target_tag: target?.tagName ?? "UNKNOWN",
      target_id: target?.id ?? "",
      target_class: target?.className ?? "",
    });
  };

  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private handleScroll = (): void => {
    // Throttle scroll events to max 1 per 200ms
    if (this.scrollTimer) return;
    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = null;
    }, 200);

    this.pushEvent("scroll", {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    });
  };

  private handleInput = (e: Event): void => {
    const target = e.target instanceof HTMLInputElement ? e.target : null;
    this.pushEvent("input_change", {
      target_tag: target?.tagName ?? "UNKNOWN",
      input_type: target?.type ?? "text",
      target_name: target?.name ?? "",
      // Value is always masked — never store raw user input
      value: "***",
    });
  };

  private handleResize = (): void => {
    this.pushEvent("resize", {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  private handleNavigation = (): void => {
    this.pushEvent("page_navigation", {
      url: window.location.href,
      pathname: window.location.pathname,
    });
  };

  private handleError = (e: ErrorEvent): void => {
    this.pushEvent("error", {
      message: maskPII(e.message ?? "Unknown error"),
      filename: e.filename ?? "",
      lineno: e.lineno ?? 0,
      colno: e.colno ?? 0,
    });
  };

  private handleVisibility = (): void => {
    this.pushEvent("visibility_change", {
      state: document.visibilityState,
    });
  };
}

/* -------------------------------------------------------------------------- */
/*  Compression                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compress replay data for efficient storage.
 * Uses base64-encoded JSON with key shortening.
 */
export function compressReplayData(
  sessionId: string,
  events: ReplayEvent[],
): CompressedReplayData {
  const original = JSON.stringify(events);

  // Shorten keys for compression
  const shortened = events.map((e) => ({
    s: e.seq,
    t: e.ts,
    y: e.type,
    d: e.data,
  }));

  const compressed = Buffer.from(JSON.stringify(shortened)).toString("base64");

  return {
    session_id: sessionId,
    compressed,
    original_size: original.length,
    compressed_size: compressed.length,
  };
}

/**
 * Decompress replay data back into ReplayEvent[].
 */
export function decompressReplayData(compressed: string): ReplayEvent[] {
  const json = Buffer.from(compressed, "base64").toString("utf-8");
  const shortened = JSON.parse(json) as Array<{
    s: number;
    t: number;
    y: ReplayEventType;
    d: Record<string, unknown>;
  }>;

  return shortened.map((e) => ({
    seq: e.s,
    ts: e.t,
    type: e.y,
    data: e.d,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Timeline extraction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Extract key moments from a replay event stream for timeline display.
 * Filters to navigations, clicks, form interactions, and errors.
 */
export function getReplayTimeline(
  sessionId: string,
  events: ReplayEvent[],
): ReplayTimeline {
  if (events.length === 0) {
    return { session_id: sessionId, duration_ms: 0, key_moments: [] };
  }

  const startTs = events[0].ts;
  const endTs = events[events.length - 1].ts;

  const keyTypes: Set<ReplayEventType> = new Set([
    "page_navigation",
    "click",
    "input_change",
    "error",
  ]);

  const key_moments: TimelineMoment[] = events
    .filter((e) => keyTypes.has(e.type))
    .map((e) => ({
      ts: e.ts,
      offset_ms: e.ts - startTs,
      type: e.type,
      label: getEventLabel(e),
    }));

  return {
    session_id: sessionId,
    duration_ms: endTs - startTs,
    key_moments,
  };
}

function getEventLabel(event: ReplayEvent): string {
  switch (event.type) {
    case "page_navigation":
      return `Navigated to ${event.data.pathname ?? event.data.url ?? "page"}`;
    case "click":
      return `Clicked ${event.data.target_tag ?? "element"}${event.data.target_id ? `#${event.data.target_id}` : ""}`;
    case "input_change":
      return `Interacted with ${event.data.input_type ?? "text"} input${event.data.target_name ? ` (${event.data.target_name})` : ""}`;
    case "error":
      return `Error: ${event.data.message ?? "Unknown"}`;
    default:
      return event.type;
  }
}

/* -------------------------------------------------------------------------- */
/*  Cookie consent check                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Check whether the visitor has given consent for analytics/recording.
 * Returns false if consent has been explicitly denied.
 */
export function hasRecordingConsent(): boolean {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie.split(";").map((c) => c.trim());
  const consentCookie = cookies.find((c) => c.startsWith("cookie_consent="));

  if (!consentCookie) return false; // no consent given yet — do not record

  const value = consentCookie.split("=")[1];
  // Accept if full consent or analytics-specific consent
  return value === "all" || value === "analytics";
}
