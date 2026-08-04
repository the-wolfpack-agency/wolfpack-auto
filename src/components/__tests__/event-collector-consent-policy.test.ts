/**
 * @jest-environment jsdom
 *
 * The pre-consent identity rule, tested against the REAL implementation.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * `event-collector-consent.test.ts` re-implements `hasAnalyticsConsent` inside
 * the test file "to keep the test self-contained". That pins a copy of the
 * rule, so a regression in `EventCollector.tsx` leaves it green. These tests
 * import the actual exported decision instead.
 *
 * WHAT IT GUARDS (found on production 2026-08-04)
 *
 * `page_view` sits in the consent-exempt set next to `heatmap_click` and
 * `heatmap_move`. Those two are built by `anonEvent()` and hard-code their
 * identifiers to "anon", which is the entire justification for exempting them.
 * `page_view` is built by `buildEvent()` and carried a real session id and a
 * persistent fingerprint, so it left the browser attributable before the
 * visitor had agreed to anything. Measured against the live storefront: one
 * `page_view` with `s_…` / `fp_…` alongside five correctly anonymous clicks.
 */
import {
  applyConsentPolicy,
  CONSENT_EXEMPT_EVENT_TYPES,
} from "../EventCollector";

type AnyEvent = Parameters<typeof applyConsentPolicy>[0];

function event(event_type: string): AnyEvent {
  return {
    event_type,
    action: "view",
    session_id: "s_1785857306707_05d7bf7a4b7c",
    user_fingerprint: "fp_1785857306707_be658fe44c87d209",
    metadata: {},
  } as unknown as AnyEvent;
}

describe("consent policy — what may leave the browser before consent", () => {
  test("a non-essential event is dropped entirely without consent", () => {
    expect(applyConsentPolicy(event("rage_click"), false)).toBeNull();
    expect(applyConsentPolicy(event("journey"), false)).toBeNull();
    expect(applyConsentPolicy(event("search_intent"), false)).toBeNull();
  });

  test("a non-essential event passes through untouched once consented", () => {
    const e = event("rage_click");
    const out = applyConsentPolicy(e, true);
    expect(out).not.toBeNull();
    expect(out!.session_id).toBe("s_1785857306707_05d7bf7a4b7c");
    expect(out!.user_fingerprint).toBe("fp_1785857306707_be658fe44c87d209");
  });

  test("page_view is still recorded without consent — the count is not lost", () => {
    const out = applyConsentPolicy(event("page_view"), false);
    expect(out).not.toBeNull();
    expect(out!.event_type).toBe("page_view");
  });

  test("page_view carries NO identity without consent — the regression", () => {
    const out = applyConsentPolicy(event("page_view"), false);
    expect(out!.session_id).toBe("anon");
    expect(out!.user_fingerprint).toBe("anon");
  });

  test("page_view carries real identity once consented", () => {
    const out = applyConsentPolicy(event("page_view"), true);
    expect(out!.session_id).toBe("s_1785857306707_05d7bf7a4b7c");
    expect(out!.user_fingerprint).toBe("fp_1785857306707_be658fe44c87d209");
  });

  /* The rule that matters most: it must hold for whatever gets added to the
     exempt set next, not only for the three types exempt today. */
  test.each([...CONSENT_EXEMPT_EVENT_TYPES])(
    "%s — every consent-exempt type is anonymised without consent",
    (type) => {
      const out = applyConsentPolicy(event(type), false);
      expect(out).not.toBeNull();
      expect(out!.session_id).toBe("anon");
      expect(out!.user_fingerprint).toBe("anon");
    },
  );

  test("the exempt set has not silently grown", () => {
    /* Each addition needs the anonymity argument made deliberately, so changing
       this list should be a conscious edit rather than a quiet one. */
    expect([...CONSENT_EXEMPT_EVENT_TYPES].sort()).toEqual([
      "heatmap_click",
      "heatmap_move",
      "page_view",
    ]);
  });

  test("the original event object is not mutated", () => {
    const e = event("page_view");
    applyConsentPolicy(e, false);
    expect(e.session_id).toBe("s_1785857306707_05d7bf7a4b7c");
  });
});
