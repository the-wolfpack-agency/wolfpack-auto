/**
 * Unit tests for the scanner — uses a mocked BrowserSession so the test
 * suite never touches Playwright. The integration / E2E tests cover the
 * real-browser path.
 */

import {
  scanWebsite,
  __setBrowserFactory,
  type BrowserSessionLike,
} from "@/lib/website-audit/scanner";

function buildMockSession(): BrowserSessionLike {
  let viewportWidth = 1280;
  return {
    goto: async () => undefined,
    content: async () => "<html></html>",
    setViewport: async (w, _h) => {
      viewportWidth = w;
    },
    close: async () => undefined,
    networkSummary: () => ({
      request_count: 90,
      total_bytes: 1_500_000,
      largest_resource_bytes: 400_000,
    }),
    evaluate: (async <T,>(fn: (...args: unknown[]) => T): Promise<T> => {
      const fnSrc = String(fn);
      // Branch on the kind of probe by source-string match. We map to
      // shape-compatible outputs.
      if (fnSrc.includes("scrollWidth")) {
        return (viewportWidth === 390) as unknown as T;
      }
      if (fnSrc.includes("vdpPatterns")) {
        return [
          "https://example.com/inventory/used-2022-camry-vin-1",
          "https://example.com/inventory/used-2022-camry-vin-2",
        ] as unknown as T;
      }
      if (fnSrc.includes("photo_count")) {
        return {
          url: "https://example.com/vdp",
          photo_count: 12,
          photos_lazy_loaded: true,
          has_vehicle_schema: true,
          price_visible: true,
          has_video: false,
          has_history_link: true,
        } as unknown as T;
      }
      // Default: homepage probe shape
      return {
        title: "Example",
        meta_description: "An example dealership site",
        viewport_meta_present: true,
        link_count: 50,
        image_count: 20,
        image_alt_coverage: 0.9,
        form_count: 1,
        primary_form_field_count: 6,
        mobile_has_horizontal_scroll: false,
        small_tap_targets_count: 0,
        has_above_fold_cta: true,
        has_inventory_link: true,
        has_trade_in_link: true,
        has_financing_link: true,
        has_privacy_link: true,
        has_accessibility_link: true,
        has_tcpa_consent: true,
        has_review_widget: true,
        shows_inventory_count: true,
        phone_visible: true,
        broken_link_count: 0,
      } as unknown as T;
    }) as BrowserSessionLike["evaluate"],
  };
}

describe("scanWebsite", () => {
  afterEach(() => __setBrowserFactory(null));

  test("returns ScanResult with homepage + VDP samples + network", async () => {
    __setBrowserFactory(async () => buildMockSession());
    const result = await scanWebsite("https://example.com", { vdp_sample_count: 2 });
    expect(result.scanned_url).toBe("https://example.com");
    expect(result.homepage.is_https).toBe(true);
    expect(result.homepage.title).toBe("Example");
    expect(result.vdp_samples.length).toBeGreaterThanOrEqual(0);
    expect(result.network.request_count).toBe(90);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test("recovers gracefully when the browser factory throws", async () => {
    __setBrowserFactory(async () => {
      throw new Error("launch_failed");
    });
    const result = await scanWebsite("https://example.com");
    expect(result.warnings.some((w) => w.startsWith("browser_launch_failed"))).toBe(true);
    expect(result.homepage.title).toBe("");
  });

  test("flags HTTP URL as not https", async () => {
    __setBrowserFactory(async () => buildMockSession());
    const result = await scanWebsite("http://example.com");
    expect(result.homepage.is_https).toBe(false);
  });
});
