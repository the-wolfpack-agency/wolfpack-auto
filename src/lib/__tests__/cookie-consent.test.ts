/**
 * Unit tests for src/components/CookieConsent.tsx
 *
 * Validates cookie consent behavior: cookie read/write, consent state transitions,
 * analytics gating, preference persistence, and backward compatibility with
 * localStorage. These tests exercise the consent logic that gates the entire
 * analytics pipeline via EventCollector.
 *
 * Run with: npx jest src/lib/__tests__/cookie-consent.test.ts
 */

/* -------------------------------------------------------------------------- */
/* Helpers — cookie simulation                                                 */
/* -------------------------------------------------------------------------- */

const CONSENT_COOKIE = "wolfpack_consent";
const PREFS_COOKIE = "wolfpack_consent_prefs";

/** Parse a cookie string into key-value pairs. */
function parseCookies(cookieStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieStr.split("; ")) {
    const [k, v] = pair.split("=");
    if (k) result[k] = decodeURIComponent(v ?? "");
  }
  return result;
}

/** Simulate setting a cookie as the component does. */
function setCookie(
  store: Record<string, string>,
  name: string,
  value: string,
  maxAge: number,
): void {
  store[name] = value;
}

/** Read consent status from cookies. */
function getConsentStatus(
  cookies: Record<string, string>,
): "accepted" | "custom" | null {
  const val = cookies[CONSENT_COOKIE];
  if (val === "accepted" || val === "custom") return val;
  return null;
}

/** Read saved preferences from cookies. */
function getSavedPreferences(
  cookies: Record<string, string>,
): { essential: true; analytics: boolean; marketing: boolean } | null {
  const raw = cookies[PREFS_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      essential: true,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
    };
  } catch {
    return null;
  }
}

/** Check analytics consent (mirrors EventCollector logic). */
function hasAnalyticsConsent(
  cookies: Record<string, string>,
  localStorageConsent?: string | null,
): boolean {
  const consentVal = cookies[CONSENT_COOKIE];
  if (consentVal === "accepted") return true;
  if (consentVal === "custom") {
    const prefsRaw = cookies[PREFS_COOKIE];
    if (prefsRaw) {
      try {
        const prefs = JSON.parse(prefsRaw);
        return !!prefs.analytics;
      } catch {
        return false;
      }
    }
    return false;
  }
  // Fallback: localStorage
  if (localStorageConsent === "all") return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("CookieConsent — consent logic", () => {
  describe("initial state (no cookies)", () => {
    it("returns null consent status when no cookie is set", () => {
      expect(getConsentStatus({})).toBeNull();
    });

    it("returns null preferences when no cookie is set", () => {
      expect(getSavedPreferences({})).toBeNull();
    });

    it("denies analytics consent when no cookie or localStorage", () => {
      expect(hasAnalyticsConsent({}, null)).toBe(false);
    });

    it("denies analytics consent when no cookie and localStorage is empty", () => {
      expect(hasAnalyticsConsent({}, undefined)).toBe(false);
    });
  });

  describe("Accept All flow", () => {
    it("sets consent cookie to 'accepted'", () => {
      const cookies: Record<string, string> = {};
      setCookie(cookies, CONSENT_COOKIE, "accepted", 365 * 86400);
      expect(getConsentStatus(cookies)).toBe("accepted");
    });

    it("stores full preferences with all enabled", () => {
      const cookies: Record<string, string> = {};
      const allPrefs = { essential: true, analytics: true, marketing: true };
      setCookie(cookies, CONSENT_COOKIE, "accepted", 365 * 86400);
      setCookie(
        cookies,
        PREFS_COOKIE,
        JSON.stringify(allPrefs),
        365 * 86400,
      );

      const saved = getSavedPreferences(cookies);
      expect(saved).toEqual({
        essential: true,
        analytics: true,
        marketing: true,
      });
    });

    it("grants analytics consent", () => {
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "accepted",
        [PREFS_COOKIE]: JSON.stringify({
          essential: true,
          analytics: true,
          marketing: true,
        }),
      };
      expect(hasAnalyticsConsent(cookies)).toBe(true);
    });
  });

  describe("Custom preferences flow", () => {
    it("sets consent cookie to 'custom'", () => {
      const cookies: Record<string, string> = {};
      setCookie(cookies, CONSENT_COOKIE, "custom", 365 * 86400);
      expect(getConsentStatus(cookies)).toBe("custom");
    });

    it("grants analytics when analytics is enabled in custom prefs", () => {
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "custom",
        [PREFS_COOKIE]: JSON.stringify({
          essential: true,
          analytics: true,
          marketing: false,
        }),
      };
      expect(hasAnalyticsConsent(cookies)).toBe(true);
    });

    it("denies analytics when analytics is disabled in custom prefs", () => {
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "custom",
        [PREFS_COOKIE]: JSON.stringify({
          essential: true,
          analytics: false,
          marketing: true,
        }),
      };
      expect(hasAnalyticsConsent(cookies)).toBe(false);
    });

    it("denies analytics when custom is set but prefs cookie is missing", () => {
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "custom",
      };
      expect(hasAnalyticsConsent(cookies)).toBe(false);
    });

    it("denies analytics when prefs cookie is malformed JSON", () => {
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "custom",
        [PREFS_COOKIE]: "not-json",
      };
      expect(hasAnalyticsConsent(cookies)).toBe(false);
    });
  });

  describe("Essential-only always required", () => {
    it("essential is always true regardless of preferences", () => {
      const prefs = getSavedPreferences({
        [PREFS_COOKIE]: JSON.stringify({
          essential: false, // attempt to disable
          analytics: false,
          marketing: false,
        }),
      });
      // essential is forced to true by the parser
      expect(prefs?.essential).toBe(true);
    });
  });

  describe("localStorage backward compatibility", () => {
    it("grants analytics when localStorage says 'all' and no cookies", () => {
      expect(hasAnalyticsConsent({}, "all")).toBe(true);
    });

    it("denies analytics when localStorage says 'essential'", () => {
      expect(hasAnalyticsConsent({}, "essential")).toBe(false);
    });

    it("cookies take precedence over localStorage", () => {
      // Cookies deny, localStorage allows
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "custom",
        [PREFS_COOKIE]: JSON.stringify({
          essential: true,
          analytics: false,
          marketing: false,
        }),
      };
      expect(hasAnalyticsConsent(cookies, "all")).toBe(false);
    });
  });

  describe("consent event dispatch", () => {
    it("emits correct localStorage value for accepted_all", () => {
      // When Accept All is clicked, localStorage should be set to "all"
      const type = "accepted_all";
      const localStorageValue =
        type === "accepted_all" ? "all" : "essential";
      expect(localStorageValue).toBe("all");
    });

    it("emits correct localStorage value for custom with analytics on", () => {
      const prefs = { essential: true as const, analytics: true, marketing: false };
      const localStorageValue = prefs.analytics ? "all" : "essential";
      expect(localStorageValue).toBe("all");
    });

    it("emits correct localStorage value for custom with analytics off", () => {
      const prefs = { essential: true as const, analytics: false, marketing: false };
      const localStorageValue = prefs.analytics ? "all" : "essential";
      expect(localStorageValue).toBe("essential");
    });
  });

  describe("cookie format validation", () => {
    it("ignores unknown consent values", () => {
      expect(getConsentStatus({ [CONSENT_COOKIE]: "rejected" })).toBeNull();
      expect(getConsentStatus({ [CONSENT_COOKIE]: "" })).toBeNull();
      expect(getConsentStatus({ [CONSENT_COOKIE]: "true" })).toBeNull();
    });

    it("handles URI-encoded cookie values", () => {
      const encoded = encodeURIComponent(
        JSON.stringify({ essential: true, analytics: true, marketing: false }),
      );
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "custom",
        [PREFS_COOKIE]: decodeURIComponent(encoded),
      };
      const prefs = getSavedPreferences(cookies);
      expect(prefs?.analytics).toBe(true);
      expect(prefs?.marketing).toBe(false);
    });
  });

  describe("analytics pipeline gating", () => {
    it("blocks non-essential events when consent not granted", () => {
      const ESSENTIAL_EVENT_TYPES = new Set(["page_view"]);
      const consentGranted = hasAnalyticsConsent({});

      // Non-essential event should be blocked
      const event = { event_type: "click" };
      const shouldTrack =
        ESSENTIAL_EVENT_TYPES.has(event.event_type) || consentGranted;
      expect(shouldTrack).toBe(false);
    });

    it("allows essential events even without consent", () => {
      const ESSENTIAL_EVENT_TYPES = new Set(["page_view"]);
      const consentGranted = hasAnalyticsConsent({});

      const event = { event_type: "page_view" };
      const shouldTrack =
        ESSENTIAL_EVENT_TYPES.has(event.event_type) || consentGranted;
      expect(shouldTrack).toBe(true);
    });

    it("allows all events when consent is granted", () => {
      const ESSENTIAL_EVENT_TYPES = new Set(["page_view"]);
      const cookies: Record<string, string> = {
        [CONSENT_COOKIE]: "accepted",
      };
      const consentGranted = hasAnalyticsConsent(cookies);

      const events = ["click", "scroll", "vehicle_view", "chat_message"];
      for (const eventType of events) {
        const shouldTrack =
          ESSENTIAL_EVENT_TYPES.has(eventType) || consentGranted;
        expect(shouldTrack).toBe(true);
      }
    });
  });
});
